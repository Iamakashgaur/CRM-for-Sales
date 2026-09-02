import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { callLLM } from "@/lib/ai-provider"
import { extractJson } from "@/lib/ai"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"

export const dynamic = "force-dynamic"

const Body = z.object({
  contactId: z.string().min(1),
  refresh: z.boolean().optional(),
})

export interface ThreadSummary {
  summary: string
  bullets: string[]
  lastSentiment: "positive" | "neutral" | "negative"
  notEnough?: boolean
  generatedAt?: string
  cached?: boolean
}

const CACHE_TYPE = "EMAIL_THREAD_SUMMARY"

function fallback(): ThreadSummary {
  return {
    summary: "AI not configured. Configure an AI provider in Settings to summarize email threads.",
    bullets: [],
    lastSentiment: "neutral",
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!rateLimit(`ai-email-summary:${session.user.id}`, 20, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const parsed = Body.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const contact = await prisma.contact.findUnique({ where: { id: parsed.data.contactId } })
    if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (session.user.role === "REP" && contact.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const messages = await prisma.emailSyncMessage.findMany({
      where: { contactId: contact.id },
      orderBy: { receivedAt: "desc" },
      take: 30,
      select: { id: true, subject: true, from: true, to: true, body: true, receivedAt: true },
    })

    if (messages.length < 2) {
      const result: ThreadSummary = {
        summary: "Not enough emails to summarize. Need at least 2 messages.",
        bullets: [],
        lastSentiment: "neutral",
        notEnough: true,
      }
      return NextResponse.json(result)
    }

    const latestMessageId = messages[0].id
    const cacheKey = `${contact.id}:${latestMessageId}`

    // Try cache (unless refresh)
    if (!parsed.data.refresh) {
      const cached = await prisma.aIInsight.findFirst({
        where: {
          type: CACHE_TYPE,
          contactId: contact.id,
        },
        orderBy: { createdAt: "desc" },
      })
      if (cached) {
        try {
          const data = JSON.parse(cached.payload) as { key: string; result: ThreadSummary }
          if (data.key === cacheKey && data.result) {
            return NextResponse.json({ ...data.result, cached: true, generatedAt: cached.createdAt.toISOString() })
          }
        } catch {
          // continue
        }
      }
    }

    const chronological = [...messages].reverse()
    const lines = chronological
      .map((m, i) => {
        const dt = m.receivedAt.toISOString().slice(0, 10)
        const body = (m.body ?? "").slice(0, 300).replace(/\s+/g, " ").trim()
        return `${i + 1}. [${dt}] From: ${m.from}\n   Subject: ${m.subject}\n   Body: ${body}`
      })
      .join("\n\n")

    const prompt = `You are summarizing an email thread between a sales rep and a contact in a B2B CRM.

CONTACT: ${contact.name}${contact.company ? ` at ${contact.company}` : ""}

EMAILS (chronological, oldest first):
${lines}

Produce a JSON object with:
- "summary": 2-3 sentences describing what's been discussed and the current state
- "bullets": exactly 5 short bullet points covering key topics, decisions made, open questions, action items, and sentiment trajectory
- "lastSentiment": "positive" | "neutral" | "negative" based on the most recent email tone

Reply ONLY with valid JSON, no markdown fences.`

    const result = await callLLM({ prompt, maxTokens: 800, task: "reasoning" })
    if (!result.ok) return NextResponse.json(fallback())

    const parsedOut = extractJson<ThreadSummary>(result.text, fallback())
    if (!parsedOut.summary || !Array.isArray(parsedOut.bullets)) {
      return NextResponse.json(fallback())
    }

    const finalResult: ThreadSummary = {
      summary: parsedOut.summary,
      bullets: parsedOut.bullets.slice(0, 5),
      lastSentiment:
        parsedOut.lastSentiment === "positive" || parsedOut.lastSentiment === "negative"
          ? parsedOut.lastSentiment
          : "neutral",
    }

    // Invalidate previous cache for this contact
    await prisma.aIInsight.deleteMany({ where: { type: CACHE_TYPE, contactId: contact.id } })
    const stored = await prisma.aIInsight.create({
      data: {
        type: CACHE_TYPE,
        payload: JSON.stringify({ key: cacheKey, result: finalResult }),
        contactId: contact.id,
        userId: session.user.id,
      },
    })

    return NextResponse.json({ ...finalResult, cached: false, generatedAt: stored.createdAt.toISOString() })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
