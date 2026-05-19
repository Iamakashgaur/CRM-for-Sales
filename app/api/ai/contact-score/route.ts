import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import crypto from "crypto"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { callLLM } from "@/lib/ai-provider"
import { extractJson } from "@/lib/ai"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"

export const dynamic = "force-dynamic"

const schema = z.object({ contactId: z.string().min(1) })

export interface ContactScoreResult {
  score: number
  intent: "low" | "med" | "high"
  fit: "low" | "med" | "high"
  reasoning: string
  topSignals: string[]
  _contentHash?: string
  _generatedAt?: string
}

const FALLBACK: ContactScoreResult = {
  score: 50,
  intent: "med",
  fit: "med",
  reasoning: "AI scoring unavailable — showing neutral baseline.",
  topSignals: [],
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!rateLimit(`ai:${session.user.id}`, 20, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1"
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

    const contentHash = crypto
      .createHash("sha1")
      .update(`${contact.category}|${contact.callStatus}|${contact.followUpStatus}|${contact.callLogs.length}|${contact.lastContactDate?.toISOString() ?? ""}|${contact.dnc}`)
      .digest("hex")

    if (!forceRefresh) {
      const recent = await prisma.aIInsight.findFirst({
        where: {
          contactId: contact.id,
          type: "CONTACT_SCORE",
          createdAt: { gte: new Date(Date.now() - 86_400_000) },
        },
        orderBy: { createdAt: "desc" },
      })
      if (recent) {
        try {
          const cached = JSON.parse(recent.payload) as ContactScoreResult
          if (cached._contentHash === contentHash) return NextResponse.json(cached)
        } catch { /* fall through */ }
      }
    }

    const prompt = `You are a B2B sales analyst. Score this contact for sales priority. Reply ONLY with JSON, no markdown.

Contact:
- Name: ${contact.name}
- Company: ${contact.company ?? "—"}
- Type: ${contact.type ?? "—"}
- Zone/Location: ${[contact.zone, contact.city, contact.state].filter(Boolean).join(", ") || "—"}
- Source: ${contact.source ?? "—"}
- Category: ${contact.category ?? "Uncategorized"}
- Call Status: ${contact.callStatus ?? "—"}
- Follow-up Status: ${contact.followUpStatus ?? "—"}
- Last Contact: ${contact.lastContactDate?.toISOString().slice(0, 10) ?? "Never"}
- Next Follow-up: ${contact.nextFollowUpDate?.toISOString().slice(0, 10) ?? "—"}
- DNC: ${contact.dnc}
- Call logs (count): ${contact.callLogs.length}
- Recent call statuses: ${contact.callLogs.map((c) => c.status).join("; ") || "—"}

Output JSON shape (strict):
{"score": <0-100 integer>, "intent": "low"|"med"|"high", "fit": "low"|"med"|"high", "reasoning": "<one sentence>", "topSignals": ["<short signal>", "<short signal>"]}`

    const result = await callLLM({ prompt, maxTokens: 512, task: "score" })
    if (!result.ok) {
      return NextResponse.json({ ...FALLBACK, _contentHash: contentHash, _generatedAt: new Date().toISOString() })
    }
    const parsedResult = extractJson<ContactScoreResult>(result.text, FALLBACK)
    if (typeof parsedResult.score !== "number") {
      return NextResponse.json({ ...FALLBACK, _contentHash: contentHash, _generatedAt: new Date().toISOString() })
    }
    parsedResult.score = Math.max(0, Math.min(100, Math.round(parsedResult.score)))
    parsedResult._contentHash = contentHash
    parsedResult._generatedAt = new Date().toISOString()

    await prisma.aIInsight.create({
      data: {
        type: "CONTACT_SCORE",
        payload: JSON.stringify(parsedResult),
        contactId: contact.id,
        userId: session.user.id,
      },
    })

    return NextResponse.json(parsedResult)
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const contactId = req.nextUrl.searchParams.get("contactId")
    if (!contactId) return NextResponse.json({ error: "contactId required" }, { status: 400 })
    const recent = await prisma.aIInsight.findFirst({
      where: { contactId, type: "CONTACT_SCORE" },
      orderBy: { createdAt: "desc" },
    })
    if (!recent) return NextResponse.json(null)
    try {
      const cached = JSON.parse(recent.payload) as ContactScoreResult
      return NextResponse.json({ ...cached, _generatedAt: cached._generatedAt ?? recent.createdAt.toISOString() })
    } catch {
      return NextResponse.json(null)
    }
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
