import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { callLLM } from "@/lib/ai-provider"
import { extractJson } from "@/lib/ai"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"
import { ROLES } from "@/lib/constants"

export const dynamic = "force-dynamic"

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
] as const

type CallStatus = (typeof CALL_STATUSES)[number]

const Body = z.object({
  contactId: z.string().min(1),
  transcript: z.string().min(2).max(20000),
})

interface ExtractedCall {
  status: CallStatus
  notes: string
  sentiment: "positive" | "neutral" | "negative"
  nextStep: string | null
}

function defaultExtract(transcript: string): ExtractedCall {
  return {
    status: "Connected - Neutral",
    notes: transcript.slice(0, 1000),
    sentiment: "neutral",
    nextStep: null,
  }
}

function clampStatus(s: unknown): CallStatus {
  if (typeof s === "string" && (CALL_STATUSES as readonly string[]).includes(s)) {
    return s as CallStatus
  }
  return "Connected - Neutral"
}

function clampSentiment(s: unknown): "positive" | "neutral" | "negative" {
  if (s === "positive" || s === "negative" || s === "neutral") return s
  return "neutral"
}

function clampNextStep(s: unknown): string | null {
  if (typeof s !== "string") return null
  const trimmed = s.trim()
  if (!trimmed) return null
  // Accept either ISO date string or YYYY-MM-DD
  const d = new Date(trimmed)
  if (Number.isNaN(d.getTime())) return null
  // Must be plausible (between today-1y and today+5y)
  const now = Date.now()
  if (d.getTime() < now - 365 * 86400_000 || d.getTime() > now + 5 * 365 * 86400_000) return null
  return d.toISOString()
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!rateLimit(`ai-voice2call:${session.user.id}`, 20, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const parsed = Body.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    const { contactId, transcript } = parsed.data

    const contact = await prisma.contact.findUnique({ where: { id: contactId } })
    if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (session.user.role === ROLES.REP && contact.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    let extracted = defaultExtract(transcript)
    const prompt = `You are summarising a phone call a sales rep just made. Read the transcript and respond ONLY with JSON, no markdown.

Allowed status values (pick the closest one): ${CALL_STATUSES.join(" | ")}

Transcript:
"""
${transcript.slice(0, 8000)}
"""

Output JSON shape:
{"status": <one of the allowed values>, "notes": "<2-4 sentence summary of what was discussed and any commitments>", "sentiment": "positive"|"neutral"|"negative", "nextStep": <ISO 8601 datetime for the next agreed follow-up, or null>}`

    const llm = await callLLM({ prompt, maxTokens: 400, task: "classify" })
    if (llm.ok) {
      const raw = extractJson<Partial<ExtractedCall>>(llm.text, {})
      extracted = {
        status: clampStatus(raw.status),
        notes: typeof raw.notes === "string" && raw.notes.trim() ? raw.notes.trim() : transcript.slice(0, 1000),
        sentiment: clampSentiment(raw.sentiment),
        nextStep: clampNextStep(raw.nextStep),
      }
    }

    const now = new Date()
    const notesWithTranscript = `${extracted.notes}\n\n— Transcript —\n${transcript.slice(0, 4000)}`

    const updateData: Record<string, unknown> = {
      callStatus: extracted.status,
      lastContactDate: now,
    }
    if (extracted.nextStep) {
      updateData.nextFollowUpDate = new Date(extracted.nextStep)
    }

    const [log] = await prisma.$transaction([
      prisma.callLog.create({
        data: {
          contactId,
          status: extracted.status,
          notes: notesWithTranscript,
          userId: session.user.id,
          at: now,
        },
      }),
      prisma.contact.update({
        where: { id: contactId },
        data: updateData,
      }),
      prisma.activity.create({
        data: {
          type: "CALL",
          subject: extracted.status,
          body: notesWithTranscript,
          contactId,
          userId: session.user.id,
          completedAt: now,
        },
      }),
    ])

    return NextResponse.json({
      log,
      extracted,
    })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
