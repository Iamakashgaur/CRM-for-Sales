import { NextRequest, NextResponse } from "next/server"
import * as XLSX from "xlsx"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { stringifyTags, normalizePhone } from "@/lib/utils"
import { safeError } from "@/lib/api-errors"
import { invalidateMetaCache } from "@/lib/meta-cache"

const RowSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
})

export const dynamic = "force-dynamic"
export const maxDuration = 60

const MAX_BYTES = 10 * 1024 * 1024
const MAX_ROWS = 50_000

interface ContactInsert {
  name: string
  email: string
  phone: string | null
  phoneSecondary: string | null
  company: string | null
  title: string | null
  source: string
  tags: string
  notes: string | null
  city: string | null
  state: string | null
  zone: string | null
  type: string | null
  pinCode: string | null
  addressLine1: string | null
  addressLine2: string | null
  website: string | null
  socialUrl: string | null
  ownerId: string
}

function pick(row: Record<string, unknown>, keys: string[]): string {
  for (const k of keys) {
    const v = row[k]
    if (v !== undefined && v !== null && String(v).trim().length > 0) return String(v).trim()
  }
  // case-insensitive fallback
  const lowerMap: Record<string, unknown> = {}
  for (const rk of Object.keys(row)) lowerMap[rk.toLowerCase()] = row[rk]
  for (const k of keys) {
    const v = lowerMap[k.toLowerCase()]
    if (v !== undefined && v !== null && String(v).trim().length > 0) return String(v).trim()
  }
  return ""
}

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const form = await req.formData()
  const file = form.get("file") as File | null
  if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 })

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 413 })
  }

  if (!file.name.match(/\.(csv|xlsx|xls)$/i)) {
    return NextResponse.json({ error: "Unsupported file type. Use CSV, XLSX or XLS." }, { status: 415 })
  }

  const isPrivileged = ["ADMIN", "MANAGER"].includes(session.user.role)
  const requestedOwner = form.get("ownerId")
  const ownerId =
    isPrivileged && typeof requestedOwner === "string" && requestedOwner.length > 0
      ? requestedOwner
      : session.user.id

  const buffer = Buffer.from(await file.arrayBuffer())
  let rows: Array<Record<string, unknown>> = []
  try {
    const wb = XLSX.read(buffer, { type: "buffer" })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    // Defense-in-depth: bound column count by reading header row first
    const header = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, range: 0 })[0] ?? []
    if (Array.isArray(header) && header.length > 100) {
      return NextResponse.json({ error: "Too many columns (max 100)" }, { status: 413 })
    }
    rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet)
  } catch (err) {
    const msg = safeError(err)
    if (/heap|memory|allocation/i.test(msg)) {
      return NextResponse.json({ error: "File exceeds memory limits" }, { status: 413 })
    }
    return NextResponse.json({ error: `Failed to parse file: ${msg}` }, { status: 400 })
  }

  if (rows.length > MAX_ROWS) {
    return NextResponse.json({ error: `Too many rows (max ${MAX_ROWS})` }, { status: 413 })
  }

  // Pre-fetch existing emails to detect duplicates
  const existingEmails = new Set(
    (await prisma.contact.findMany({ where: { ownerId }, select: { email: true } })).map((c) =>
      c.email.toLowerCase()
    )
  )

  let skipped = 0
  let duplicates = 0
  const seenInBatch = new Set<string>()
  const batch: ContactInsert[] = []

  for (const row of rows) {
    const name = pick(row, ["name", "Name", "NAME", "Full Name", "person name", "Person Name"])
    const email = pick(row, ["email", "Email", "EMAIL"]).toLowerCase()
    const parsed = RowSchema.safeParse({ name, email })
    if (!parsed.success) {
      skipped++
      continue
    }
    if (existingEmails.has(email) || seenInBatch.has(email)) {
      duplicates++
      continue
    }
    seenInBatch.add(email)
    const rawPhone = pick(row, ["phone", "Phone", "PHONE", "mobile", "Mobile"])
    const rawPhone2 = pick(row, ["phoneSecondary", "phone secondary", "phone no", "Phone No", "phoneNo", "alt phone", "Alt Phone"])
    batch.push({
      name: parsed.data.name,
      email: parsed.data.email,
      phone: rawPhone ? normalizePhone(rawPhone) : null,
      phoneSecondary: rawPhone2 ? normalizePhone(rawPhone2) : null,
      company: pick(row, ["company", "Company", "COMPANY"]) || null,
      title: pick(row, ["title", "Title", "TITLE"]) || null,
      source: "CSV Import",
      tags: stringifyTags([]),
      notes: pick(row, ["notes", "Notes"]) || null,
      city: pick(row, ["city", "City"]) || null,
      state: pick(row, ["state", "State"]) || null,
      zone: pick(row, ["zone", "Zone"]) || null,
      type: pick(row, ["type", "Type"]) || null,
      pinCode: pick(row, ["pinCode", "pin code", "Pin Code", "PIN", "pincode"]) || null,
      addressLine1: pick(row, ["addressLine1", "address line 1", "Address Line 1", "address1", "Address"]) || null,
      addressLine2: pick(row, ["addressLine2", "address line 2", "Address Line 2", "address2"]) || null,
      website: pick(row, ["website", "Website", "WEBSITE"]) || null,
      socialUrl: pick(row, ["socialUrl", "social", "Social", "social media", "Social Media"]) || null,
      ownerId,
    })
  }

  // Global dedupe check: detect emails already owned by other users
  const candidateEmails = batch.map((b) => b.email)
  let globalDuplicates = 0
  if (candidateEmails.length > 0) {
    const otherOwned = await prisma.contact.findMany({
      where: { email: { in: candidateEmails }, ownerId: { not: ownerId } },
      select: { email: true },
    })
    globalDuplicates = otherOwned.length
  }

  // Insert in chunks of 500 via createMany.
  // Note: SQLite Prisma adapter does not support skipDuplicates; we already pre-filter
  // duplicates above against existing emails and within-batch seen set.
  let imported = 0
  for (let i = 0; i < batch.length; i += 500) {
    const chunk = batch.slice(i, i + 500)
    const result = await prisma.contact.createMany({ data: chunk })
    imported += result.count
  }

  if (imported > 0) invalidateMetaCache()

  return NextResponse.json({
    imported,
    skipped,
    duplicates,
    globalDuplicates,
    total: rows.length,
  })
}
