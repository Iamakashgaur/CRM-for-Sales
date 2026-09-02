import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { callLLM } from "@/lib/ai-provider"
import { extractJson } from "@/lib/ai"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"

export const dynamic = "force-dynamic"

const PURPOSES = ["follow-up", "intro", "checkin", "reminder", "thank-you"] as const

const schema = z.object({
  contactId: z.string().min(1),
  purpose: z.enum(PURPOSES),
  language: z.enum(["en", "hi", "hinglish"]).optional(),
})

interface DraftResult { text: string }

function fallbackFor(purpose: typeof PURPOSES[number], firstName: string): DraftResult {
  switch (purpose) {
    case "follow-up":
      return { text: `Hi ${firstName}, just following up on our last conversation. Any updates from your side?` }
    case "intro":
      return { text: `Hi ${firstName}, hope you're doing well. Wanted to introduce myself and see if we can connect briefly this week.` }
    case "checkin":
      return { text: `Hi ${firstName}, hope all good at your end. Just checking in — anything I can help with?` }
    case "reminder":
      return { text: `Hi ${firstName}, gentle reminder about our pending discussion. Let me know a convenient time.` }
    case "thank-you":
      return { text: `Hi ${firstName}, thanks for your time today. Will share the details shortly.` }
  }
}

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
      include: { callLogs: { orderBy: { at: "desc" }, take: 1 } },
    })
    if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (session.user.role === "REP" && contact.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const firstName = contact.name.split(" ")[0] || contact.name
    const lastCall = contact.callLogs[0]
    const language = parsed.data.language ?? "hinglish"
    const langLine =
      language === "hi"
        ? "Write the message in Hindi (Devanagari script). Keep it short and natural."
        : language === "en"
        ? "Write the message in clear professional English only."
        : "Write in Hinglish — natural Hindi/English mix as Indian professionals chat."

    const prompt = `Draft a WhatsApp business message for an Indian B2B sales context. Keep it under 240 characters.
Style: casual professional, no emoji overuse (max 1).
Avoid greetings like "Dear Sir" — use first name. No long signatures.
${langLine}

Recipient: ${firstName} at ${contact.company ?? "their company"}
Category: ${contact.category ?? "—"}
Type/Industry: ${contact.type ?? "—"}
Last call: ${lastCall ? `${lastCall.status} on ${lastCall.at.toISOString().slice(0, 10)}` : "none"}
Purpose: ${parsed.data.purpose}

Reply ONLY with JSON: {"text": "<the message, plain text>"}`

    const result = await callLLM({ prompt, maxTokens: 300, task: "draft" })
    if (!result.ok) return NextResponse.json(fallbackFor(parsed.data.purpose, firstName))

    const draft = extractJson<DraftResult>(result.text, fallbackFor(parsed.data.purpose, firstName))
    if (!draft.text || draft.text.length > 400) return NextResponse.json(fallbackFor(parsed.data.purpose, firstName))
    return NextResponse.json({ text: draft.text.slice(0, 320) })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
