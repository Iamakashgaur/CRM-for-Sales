import { PrismaClient } from "@prisma/client"

const p = new PrismaClient()

async function main(): Promise<void> {
  const contacts = await p.contact.findMany({
    where: { source: "Zone Data Import", notes: { not: null } },
    select: { id: true, notes: true },
  })
  let cleaned = 0
  for (const c of contacts) {
    if (!c.notes) continue
    const stripped = c.notes
      .split("\n")
      .filter((l) => !/^(City|State|PIN|Address|Alt phone|Social):/i.test(l.trim()))
      .join("\n")
      .trim()
    if (stripped !== c.notes) {
      await p.contact.update({ where: { id: c.id }, data: { notes: stripped || null } })
      cleaned++
    }
  }
  console.log(`Cleaned ${cleaned} contact notes`)
  await p.$disconnect()
}

main().catch(async (err) => {
  console.error(err)
  await p.$disconnect()
  process.exit(1)
})
