import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { callLLM } from "@/lib/ai-provider"
import { extractJson } from "@/lib/ai"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"

export const dynamic = "force-dynamic"

const schema = z.object({ contactId: z.string().min(1) })

interface CallSuggest {
  suggestion: string
  reasoning: string
}

const CALL_STATUSES = [
  "Connected - Positive",
  "Connected - Neutral",
  "Connected - Negative",
  "Not Reachable",
  "Ringing No Answer",
  "Switched Off",
  "Call Back Requested",
  "Sent to Voicemail",
  "DND / Refused",
]

interface CacheEntry { data: CallSuggest; expires: number }
const cache = new Map<string, CacheEntry>()
const TTL = 5 * 60 * 1000

const FALLBACK: CallSuggest = { suggestion: "", reasoning: "" }

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

    const contact = await prisma.contact.findUnique({
      where: { id: parsed.data.contactId },
      include: { callLogs: { orderBy: { at: "desc" }, take: 5 } },
    })
    if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (session.user.role === "REP" && contact.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (contact.callLogs.length < 2) {
      return NextResponse.json({ suggestion: "", reasoning: "Not enough call history" })
    }

    const cacheKey = `${contact.id}:${contact.callLogs[0]?.id ?? "none"}`
    const cached = cache.get(cacheKey)
    if (cached && cached.expires > Date.now()) return NextResponse.json(cached.data)

    const recent = contact.callLogs
      .map((c) => `- ${c.at.toISOString().slice(0, 10)}: ${c.status}${c.notes ? ` (${c.notes.slice(0, 50)})` : ""}`)
      .join("\n")

    const prompt = `Given the last 5 call attempts, predict the next likely call status. Reply ONLY with JSON.

Allowed statuses: ${CALL_STATUSES.join(", ")}

Recent calls:
${recent}

Output JSON: {"suggestion": "<one of allowed statuses>", "reasoning": "<one short sentence>"}`

    const result = await callLLM({ prompt, maxTokens: 256, task: "classify" })
    if (!result.ok) {
      cache.set(cacheKey, { data: FALLBACK, expires: Date.now() + TTL })
      return NextResponse.json(FALLBACK)
    }
    const out = extractJson<CallSuggest>(result.text, FALLBACK)
    if (!CALL_STATUSES.includes(out.suggestion)) {
      cache.set(cacheKey, { data: FALLBACK, expires: Date.now() + TTL })
      return NextResponse.json(FALLBACK)
    }
    cache.set(cacheKey, { data: out, expires: Date.now() + TTL })
    return NextResponse.json(out)
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
