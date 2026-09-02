import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

function extract(notes: string | null, key: string): string | null {
  if (!notes) return null
  const m = notes.match(new RegExp(`^${key}:\\s*(.+)$`, "im"))
  return m ? m[1].trim() : null
}

function parseTags(raw: string): string[] {
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v : [] } catch { return [] }
}

async function main() {
  const contacts = await prisma.contact.findMany({
    where: { source: "Zone Data Import" },
    select: { id: true, notes: true, tags: true, city: true, state: true, zone: true, type: true },
  })
  console.log(`Found ${contacts.length} Zone-imported contacts to backfill`)

  let updated = 0
  const BATCH = 500
  for (let i = 0; i < contacts.length; i += BATCH) {
    const chunk = contacts.slice(i, i + BATCH)
    const ops = chunk.map((c) => {
      const tags = parseTags(c.tags)
      const city = c.city ?? extract(c.notes, "City")
      const state = c.state ?? extract(c.notes, "State")
      const pinCode = extract(c.notes, "PIN")
      const addr = extract(c.notes, "Address")
      const [addressLine1, addressLine2] = addr ? addr.split(",").map((s) => s.trim()).reduce<[string | null, string | null]>(
        ([a, b], part) => a === null ? [part, b] : [a, b ? `${b}, ${part}` : part],
        [null, null]
      ) : [null, null]
      const altPhone = extract(c.notes, "Alt phone")
      const social = extract(c.notes, "Social")
      const zone = c.zone ?? tags[0] ?? null
      const type = c.type ?? tags[1] ?? null

      return prisma.contact.update({
        where: { id: c.id },
        data: {
          city, state, pinCode,
          addressLine1, addressLine2,
          phoneSecondary: altPhone,
          socialUrl: social && !social.toLowerCase().includes("linkedin") ? social : null,
          zone, type,
        },
      })
    })
    await prisma.$transaction(ops)
    updated += chunk.length
    if (updated % 2000 === 0) console.log(`  backfilled ${updated} of ${contacts.length}`)
  }

  console.log(`DONE. Backfilled ${updated} contacts.`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
