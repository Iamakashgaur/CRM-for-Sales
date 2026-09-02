import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { callLLM } from "@/lib/ai-provider"
import { extractJson } from "@/lib/ai"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"

export const dynamic = "force-dynamic"

const schema = z.object({ messageId: z.string().min(1) })

interface Reply { tone: string; subject: string; body: string }
interface ReplyResult { replies: Reply[] }

const FALLBACK: ReplyResult = {
  replies: [
    { tone: "concise", subject: "Re: Following up", body: "Thanks for your message. Will revert shortly with details." },
    { tone: "detailed", subject: "Re: Your inquiry", body: "Thank you for reaching out. I'll review the details and get back to you with a thorough response by tomorrow." },
    { tone: "friendly", subject: "Re: Quick reply", body: "Hi! Thanks for the email — much appreciated. I'll be in touch soon with more info." },
  ],
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

    const msg = await prisma.emailSyncMessage.findUnique({
      where: { id: parsed.data.messageId },
      include: { contact: true, sync: true },
    })
    if (!msg) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (session.user.role === "REP" && msg.sync.userId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Cache 24h
    const cached = await prisma.aIInsight.findFirst({
      where: {
        type: "EMAIL_REPLY",
        userId: session.user.id,
        createdAt: { gte: new Date(Date.now() - 86_400_000) },
        payload: { contains: msg.id },
      },
      orderBy: { createdAt: "desc" },
    })
    if (cached) {
      try {
        const c = JSON.parse(cached.payload) as ReplyResult & { _messageId?: string }
        if (c._messageId === msg.id) return NextResponse.json(c)
      } catch { /* fall through */ }
    }

    const bodyTrunc = (msg.body ?? "").slice(0, 2000)
    const prompt = `You are drafting 3 reply variants for this email. Reply ONLY with JSON.

From: ${msg.from}
Subject: ${msg.subject}
Body:
${bodyTrunc}

Contact: ${msg.contact?.name ?? "Unknown"}${msg.contact?.company ? ` at ${msg.contact.company}` : ""}

Produce three reply variants:
- "concise" — under 60 words
- "detailed" — 80-150 words, professional
- "friendly" — warm, casual, under 80 words

Output JSON: {"replies":[{"tone":"concise","subject":"<re subject>","body":"<reply body>"},{"tone":"detailed",...},{"tone":"friendly",...}]}`

    const llm = await callLLM({ prompt, maxTokens: 1200, task: "draft" })
    if (!llm.ok) return NextResponse.json(FALLBACK)
    const out = extractJson<ReplyResult>(llm.text, FALLBACK)
    if (!Array.isArray(out.replies) || out.replies.length === 0) return NextResponse.json(FALLBACK)

    const stored = { ...out, _messageId: msg.id }
    await prisma.aIInsight.create({
      data: {
        type: "EMAIL_REPLY",
        payload: JSON.stringify(stored),
        userId: session.user.id,
        contactId: msg.contactId ?? undefined,
      },
    })
    return NextResponse.json(stored)
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
