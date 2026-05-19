import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { callLLM } from "@/lib/ai-provider"
import { extractJson } from "@/lib/ai"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"

export const dynamic = "force-dynamic"

const schema = z.object({ q: z.string().min(1).max(300) })

interface ParsedQuery {
  category?: string
  state?: string
  city?: string
  zone?: string
  type?: string
  source?: string
  followUpStatus?: string
  dnc?: boolean
  ownerId?: string
  search?: string
}

const ALLOWED_KEYS: (keyof ParsedQuery)[] = ["category", "state", "city", "zone", "type", "source", "followUpStatus", "dnc", "ownerId", "search"]

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!rateLimit(`ai:${session.user.id}`, 20, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const prompt = `Parse this natural-language CRM search into structured filters. Reply ONLY with JSON.

Valid filter fields (all optional, omit if not implied):
- category: "Hot Lead" | "Warm Lead" | "Cold Lead" | "Existing Client" | "Inactive" | "Prospect" | "Not Relevant"
- state: <Indian state name, full>
- city: <city name>
- zone: "North" | "South" | "East" | "West" | "Central"
- type: <free text like "Jeweller", "Distributor", "Retailer">
- source: <e.g. "Referral", "Inbound">
- followUpStatus: "Overdue" | "Follow Up" | "Interested" | "Called" | "No Response" | "Completed"
- dnc: true | false
- search: <residual free-text for name/company match>

Query: "${parsed.data.q}"

Output JSON with only the keys that the query implies. Example: {"category":"Hot Lead","state":"Maharashtra","type":"Jeweller"}`

    const llm = await callLLM({ prompt, maxTokens: 256, task: "classify" })
    if (!llm.ok) return NextResponse.json({ filters: { search: parsed.data.q }, fallback: true })

    const out = extractJson<ParsedQuery>(llm.text, { search: parsed.data.q })
    const cleaned: ParsedQuery = {}
    for (const k of ALLOWED_KEYS) {
      const v = out[k]
      if (v !== undefined && v !== null && v !== "") {
        // @ts-expect-error narrowing across union
        cleaned[k] = v
      }
    }
    if (Object.keys(cleaned).length === 0) cleaned.search = parsed.data.q
    return NextResponse.json({ filters: cleaned })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
