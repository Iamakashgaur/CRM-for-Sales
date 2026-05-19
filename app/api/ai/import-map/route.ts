import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { callLLM } from "@/lib/ai-provider"
import { extractJson } from "@/lib/ai"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"
import { isPrivileged } from "@/lib/constants"

export const dynamic = "force-dynamic"

const schema = z.object({
  headers: z.array(z.string()).min(1).max(100),
  samples: z.array(z.record(z.unknown())).max(10).optional(),
})

const TARGET_FIELDS = [
  "name", "email", "phone", "phoneSecondary", "company", "title",
  "city", "state", "zone", "type", "pinCode", "addressLine1", "addressLine2",
  "website", "social", "source", "notes",
] as const

type TargetField = typeof TARGET_FIELDS[number]
type FieldMap = Partial<Record<TargetField, string | null>>

interface ImportMapResult {
  map: FieldMap
  confidence: number
}

function ruleBasedMap(headers: string[]): FieldMap {
  const lower = headers.map((h) => h.toLowerCase().trim())
  const find = (...keys: string[]): string | null => {
    for (const k of keys) {
      const idx = lower.findIndex((h) => h === k || h === k.replace(/\s/g, "") || h.includes(k))
      if (idx !== -1) return headers[idx]
    }
    return null
  }
  return {
    name: find("name", "full name", "person name", "contact name"),
    email: find("email", "e-mail", "mail"),
    phone: find("mobile", "phone", "cell"),
    phoneSecondary: find("phone no", "phone secondary", "alt phone", "secondary"),
    company: find("company", "business", "firm", "organization"),
    title: find("title", "designation", "role", "position"),
    city: find("city", "town"),
    state: find("state"),
    zone: find("zone", "region"),
    type: find("type", "category", "industry"),
    pinCode: find("pin", "zip", "postal", "pincode"),
    addressLine1: find("address1", "address line 1", "address"),
    addressLine2: find("address2", "address line 2"),
    website: find("website", "url", "site"),
    social: find("social", "linkedin", "facebook", "twitter", "instagram"),
    source: find("source", "channel"),
    notes: find("notes", "comments", "remarks"),
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isPrivileged(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (!rateLimit(`ai:${session.user.id}`, 20, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const ruleMap = ruleBasedMap(parsed.data.headers)
    const ruleScore = Object.values(ruleMap).filter(Boolean).length / TARGET_FIELDS.length

    // If rule-based got most fields, skip the LLM call
    if (ruleScore >= 0.5) {
      return NextResponse.json({ map: ruleMap, confidence: Math.min(0.95, 0.5 + ruleScore / 2) } as ImportMapResult)
    }

    const sampleRows = (parsed.data.samples ?? []).slice(0, 3)
    const samplesText = sampleRows.length > 0
      ? "Sample rows:\n" + sampleRows.map((r, i) => `${i + 1}. ${JSON.stringify(r).slice(0, 500)}`).join("\n")
      : ""

    const prompt = `Map these spreadsheet column headers to CRM contact fields. Reply ONLY with JSON.

Headers: ${JSON.stringify(parsed.data.headers)}

${samplesText}

Target fields: ${TARGET_FIELDS.join(", ")}

For each target field, identify the matching header (exact original header string) or null if none matches.

Output JSON: {"map":{"name":"<header or null>","email":"<header or null>",...},"confidence":<0-1>}`

    const llm = await callLLM({ prompt, maxTokens: 700, task: "classify" })
    if (!llm.ok) {
      return NextResponse.json({ map: ruleMap, confidence: ruleScore } as ImportMapResult)
    }
    const out = extractJson<ImportMapResult>(llm.text, { map: ruleMap, confidence: ruleScore })

    // Validate AI returned headers actually exist
    const headerSet = new Set(parsed.data.headers)
    const cleaned: FieldMap = {}
    for (const f of TARGET_FIELDS) {
      const v = out.map?.[f]
      cleaned[f] = typeof v === "string" && headerSet.has(v) ? v : (ruleMap[f] ?? null)
    }
    const confidence = typeof out.confidence === "number" ? Math.max(0, Math.min(1, out.confidence)) : ruleScore
    return NextResponse.json({ map: cleaned, confidence } as ImportMapResult)
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
