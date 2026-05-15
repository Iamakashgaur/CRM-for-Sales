import { PrismaClient } from "@prisma/client"
import * as XLSX from "xlsx"
import path from "path"

const prisma = new PrismaClient()

const SOURCE_FILE = process.env.IMPORT_FILE ?? "C:\\Users\\Back Office\\Downloads\\Data\\Zone Data Dummy.xlsx"

const STATE_FIXES: Record<string, string> = {
  "MAHARASHT RA": "Maharashtra",
  TAMILNADU: "Tamil Nadu",
  "WEST BENGAL": "West Bengal",
  TELANGANA: "Telangana",
  KARNATAKA: "Karnataka",
  GUJARAT: "Gujarat",
  DELHI: "Delhi",
  RAJASTHAN: "Rajasthan",
  PUNJAB: "Punjab",
  HARYANA: "Haryana",
  KERALA: "Kerala",
  "UTTAR PRADESH": "Uttar Pradesh",
  "MADHYA PRADESH": "Madhya Pradesh",
  "ANDHRA PRADESH": "Andhra Pradesh",
  ODISHA: "Odisha",
  CHHATTISGARH: "Chhattisgarh",
  JHARKHAND: "Jharkhand",
  BIHAR: "Bihar",
  ASSAM: "Assam",
  GOA: "Goa",
  "HIMACHAL PRADESH": "Himachal Pradesh",
  UTTARAKHAND: "Uttarakhand",
  "JAMMU AND KASHMIR": "Jammu and Kashmir",
}

function clean(v: unknown): string | null {
  if (v == null) return null
  const s = String(v).trim()
  if (!s || s === "-" || s.toLowerCase() === "n/a" || s.toLowerCase() === "na") return null
  return s
}

function titleCaseCity(s: string): string {
  if (/^[A-Z]+$/.test(s.replace(/\s/g, ""))) {
    return s
      .toLowerCase()
      .split(/\s+/)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ")
  }
  return s.replace(/([a-z])([A-Z])/g, "$1 $2")
}

function fixState(s: string | null): string | null {
  if (!s) return null
  const upper = s.toUpperCase().trim().replace(/\s+/g, " ")
  return STATE_FIXES[upper] ?? s.trim()
}

function fixType(s: string | null): string | null {
  if (!s) return null
  return s.trim().replace(/\s+/g, " ")
}

interface Row {
  "S.No": number
  "COMPANY NAME"?: string
  "PERSON NAME"?: string
  MOBILE?: string | number
  "Phone No"?: string | number
  Email?: string
  CITY?: string
  Type?: string
  "ADDRESS LINE 1"?: string
  "ADDRESS LINE 2"?: string
  State?: string
  "PIN CODE"?: string | number
  ZONE?: string
  Website?: string
  "Social Media Profile"?: string
}

async function main() {
  console.log(`Reading: ${SOURCE_FILE}`)
  const wb = XLSX.readFile(SOURCE_FILE)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows: Row[] = XLSX.utils.sheet_to_json(sheet)
  console.log(`Loaded ${rows.length} rows from spreadsheet`)

  const admin = await prisma.user.findUnique({ where: { email: "admin@crm.com" } })
  if (!admin) throw new Error("Admin user not found. Run seed first.")

  console.log("Wiping existing contacts + dependent deals/activities/insights...")
  await prisma.aIInsight.deleteMany({})
  await prisma.activity.deleteMany({})
  await prisma.deal.deleteMany({})
  await prisma.emailSyncMessage.deleteMany({})
  await prisma.contact.deleteMany({})
  console.log("Wiped.")

  let imported = 0
  let skipped = 0
  let placeholders = 0
  const seenKeys = new Set<string>()
  const batch: Array<Parameters<typeof prisma.contact.create>[0]["data"]> = []
  const BATCH_SIZE = 500

  for (const row of rows) {
    const company = clean(row["COMPANY NAME"])
    const personRaw = clean(row["PERSON NAME"])
    const mobile = clean(row.MOBILE)
    const altPhone = clean(row["Phone No"])
    const emailRaw = clean(row.Email)
    const cityRaw = clean(row.CITY)
    const typeRaw = clean(row.Type)
    const addr1 = clean(row["ADDRESS LINE 1"])
    const addr2 = clean(row["ADDRESS LINE 2"])
    const stateRaw = clean(row.State)
    const pin = clean(row["PIN CODE"])
    const zone = clean(row.ZONE)
    const website = clean(row.Website)
    const social = clean(row["Social Media Profile"])

    if (!company && !personRaw) { skipped++; continue }

    const name = personRaw ?? company ?? "Unnamed"
    const city = cityRaw ? titleCaseCity(cityRaw) : null
    const state = fixState(stateRaw)
    const type = fixType(typeRaw)

    let email = emailRaw
    if (!email || !email.includes("@")) {
      email = `import-${mobile ?? row["S.No"]}@noemail.local`
      placeholders++
    }
    email = email.toLowerCase()

    const dedupeKey = `${company ?? ""}|${mobile ?? ""}|${email}`.toLowerCase()
    if (seenKeys.has(dedupeKey)) { skipped++; continue }
    seenKeys.add(dedupeKey)

    const tags: string[] = []
    if (zone) tags.push(zone)
    if (type) tags.push(type)

    const notesParts: string[] = []
    if (city) notesParts.push(`City: ${city}`)
    if (state) notesParts.push(`State: ${state}`)
    if (pin) notesParts.push(`PIN: ${pin}`)
    if (addr1 || addr2) notesParts.push(`Address: ${[addr1, addr2].filter(Boolean).join(", ")}`)
    if (altPhone) notesParts.push(`Alt phone: ${altPhone}`)
    if (social) notesParts.push(`Social: ${social}`)

    batch.push({
      name,
      email,
      phone: mobile,
      company,
      title: personRaw && company ? "Primary contact" : null,
      source: "Zone Data Import",
      tags: JSON.stringify(tags),
      notes: notesParts.join("\n") || null,
      website: website && !website.startsWith("http") ? `https://${website}` : website,
      linkedinUrl: social && social.includes("linkedin") ? social : null,
      ownerId: admin.id,
    })

    if (batch.length >= BATCH_SIZE) {
      await prisma.contact.createMany({ data: batch })
      imported += batch.length
      batch.length = 0
      if (imported % 2000 === 0) console.log(`  imported ${imported} contacts...`)
    }
  }

  if (batch.length > 0) {
    await prisma.contact.createMany({ data: batch })
    imported += batch.length
  }

  console.log(`\nDONE.`)
  console.log(`  Imported:        ${imported}`)
  console.log(`  Skipped:         ${skipped} (no company+person OR duplicate)`)
  console.log(`  Email placeholders: ${placeholders}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
