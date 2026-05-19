import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { safeError } from "@/lib/api-errors"
import { isAdmin } from "@/lib/constants"

export const dynamic = "force-dynamic"

const INCLUDED_TYPES = [
  "SCORE",
  "CONTACT_SCORE",
  "SUGGESTION",
  "DRAFT",
  "DRAFT_EMAIL",
  "DRAFT_WHATSAPP",
  "BRIEFING",
  "SEMANTIC_SEARCH",
  "EMAIL_REPLY",
  "EMAIL_THREAD_SUMMARY",
  "FOLLOWUP_SUGGEST",
  "STAGE_SUGGEST",
  "STALLED_DEAL",
  "LOST_ANALYSIS",
  "TERRITORY_INSIGHT",
  "ROUTE_LEAD",
  "PARSE_QUERY",
  "IMPORT_MAP",
  "TAGS",
  "CALIBRATE_PROBABILITY",
  "NURTURE_SEQUENCE",
] as const

const SYSTEM_PROMPTS: Record<string, string> = {
  SCORE: "You are a B2B sales analyst. Score the deal health from 0-100 and respond ONLY with a JSON object.",
  CONTACT_SCORE: "You are a B2B sales analyst. Score the contact's engagement quality 0-100.",
  SUGGESTION: "You are a B2B sales coach. Suggest 3 next best actions for this deal.",
  DRAFT: "Draft a B2B sales email. Respond ONLY with JSON.",
  DRAFT_EMAIL: "Draft a B2B sales email. Respond ONLY with JSON.",
  DRAFT_WHATSAPP: "Draft a short B2B WhatsApp message in the buyer's preferred language.",
  BRIEFING: "Generate a 2-sentence daily briefing for a sales rep based on their pipeline state.",
  SEMANTIC_SEARCH: "Rank CRM contacts/deals by relevance to the user's natural-language query.",
  EMAIL_REPLY: "Draft a reply to the incoming email, matching tone and intent.",
  EMAIL_THREAD_SUMMARY: "Summarize this email thread in 1-2 sentences.",
  FOLLOWUP_SUGGEST: "Suggest the next follow-up date and channel for this contact.",
  STAGE_SUGGEST: "Should this deal move to a new stage given this activity?",
  STALLED_DEAL: "Diagnose why this deal is stalled and recommend a specific next step.",
  LOST_ANALYSIS: "Analyze patterns across recent lost deals; surface the top 3 reasons.",
  TERRITORY_INSIGHT: "Describe this territory's pipeline characteristics in plain English.",
  ROUTE_LEAD: "Pick the best rep to own this new lead based on territory and load.",
  PARSE_QUERY: "Convert this natural-language search to structured filters.",
  IMPORT_MAP: "Map these CSV column headers to our contact schema fields.",
  TAGS: "Suggest 3-7 short tags for this contact based on their profile.",
  CALIBRATE_PROBABILITY: "Calibrate the win probability for this deal based on stage and history.",
  NURTURE_SEQUENCE: "Generate a 4-touch nurture sequence for this contact.",
}

interface TrainingPair {
  type: string
  prompt: string
  completion: string
  createdAt: string
}

function pickPromptHint(type: string, payload: unknown): string {
  const sys = SYSTEM_PROMPTS[type] ?? `Task: ${type}`
  let context = ""
  if (payload && typeof payload === "object") {
    const p = payload as Record<string, unknown>
    if ("query" in p && typeof p.query === "string") context = `Query: ${p.query}`
    else if ("_contentHash" in p) {
      const trimmed: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(p)) if (!k.startsWith("_")) trimmed[k] = v
      context = `Input context: ${JSON.stringify(trimmed).slice(0, 400)}`
    }
  }
  return context ? `${sys}\n\n${context}` : sys
}

function isLowConfidencePayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return true
  const p = payload as Record<string, unknown>
  if (p.confidence === "low") return true
  if (p.error) return true
  if (typeof p.reasoning === "string" && /AI .* unavailable/i.test(p.reasoning)) return true
  return false
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isAdmin(session.user.role)) return NextResponse.json({ error: "Admin only" }, { status: 403 })

    const sp = req.nextUrl.searchParams
    const format = sp.get("format") === "json" ? "json" : "jsonl"
    const countOnly = sp.get("count") === "1"

    if (countOnly) {
      const total = await prisma.aIInsight.count({
        where: { type: { in: INCLUDED_TYPES as unknown as string[] } },
      })
      return NextResponse.json({ total, includedTypes: INCLUDED_TYPES })
    }

    const rows = await prisma.aIInsight.findMany({
      where: { type: { in: INCLUDED_TYPES as unknown as string[] } },
      orderBy: { createdAt: "asc" },
      take: 50_000,
    })

    const pairs: TrainingPair[] = []
    for (const r of rows) {
      let parsed: unknown
      try {
        parsed = JSON.parse(r.payload)
      } catch {
        continue
      }
      if (isLowConfidencePayload(parsed)) continue
      const prompt = pickPromptHint(r.type, parsed)
      const completion = JSON.stringify(parsed)
      pairs.push({ type: r.type, prompt, completion, createdAt: r.createdAt.toISOString() })
    }

    const datestamp = new Date().toISOString().slice(0, 10)
    const filename = `karat-training-${datestamp}.${format === "json" ? "json" : "jsonl"}`

    if (format === "json") {
      return new NextResponse(JSON.stringify(pairs, null, 2), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Content-Disposition": `attachment; filename="${filename}"`,
        },
      })
    }
    // JSONL — each line is {"messages": [...]} compatible with OpenAI / Groq fine-tune format
    const lines = pairs
      .map((p) =>
        JSON.stringify({
          messages: [
            { role: "system", content: p.prompt },
            { role: "assistant", content: p.completion },
          ],
          meta: { type: p.type, createdAt: p.createdAt },
        })
      )
      .join("\n")
    return new NextResponse(lines, {
      status: 200,
      headers: {
        "Content-Type": "application/jsonl",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
