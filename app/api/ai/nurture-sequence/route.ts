import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"
import { callLLM } from "@/lib/ai-provider"
import { extractJson } from "@/lib/ai"

export const dynamic = "force-dynamic"

const Intents = ["new-lead", "warmup", "re-engage", "post-demo"] as const
type Intent = (typeof Intents)[number]

const Body = z.object({
  contactId: z.string().min(1),
  intent: z.enum(Intents),
})

interface NurtureTouch {
  dayOffset: number
  channel: "email" | "whatsapp" | "call"
  purpose: string
  subject?: string | null
  body?: string | null
}

interface NurtureResponse {
  touches: NurtureTouch[]
  strategy: string
}

function fallbackSequence(intent: Intent, name: string): NurtureResponse {
  const first = name.split(" ")[0] ?? name
  switch (intent) {
    case "new-lead":
      return {
        strategy: "Quick intro, value teaser, social proof, soft ask.",
        touches: [
          { dayOffset: 0, channel: "email", purpose: "Intro + value prop", subject: `Quick intro from us, ${first}`, body: `Hi ${first}, thanks for connecting. I wanted to briefly share what we do and how it might help your team. Open to a quick chat next week?` },
          { dayOffset: 3, channel: "whatsapp", purpose: "Light nudge", body: `Hi ${first}, just checking if my note landed. Happy to share a 2-min walkthrough if useful.` },
          { dayOffset: 7, channel: "call", purpose: "Discovery call attempt" },
          { dayOffset: 14, channel: "email", purpose: "Case study + soft close", subject: "One last note", body: `Hi ${first}, sharing a quick case study from a similar customer. If now isn't the right time, no worries — happy to revisit later.` },
        ],
      }
    case "warmup":
      return {
        strategy: "Educate, build trust, invite engagement.",
        touches: [
          { dayOffset: 0, channel: "email", purpose: "Educational content", subject: "Thought you'd find this useful", body: `Hi ${first}, sharing a quick read on a trend we're seeing — keen to hear your take.` },
          { dayOffset: 4, channel: "whatsapp", purpose: "Casual check-in", body: `Hi ${first}, did you get a chance to look at the note? Curious what stood out.` },
          { dayOffset: 10, channel: "email", purpose: "Invite to event/webinar", subject: "Open invite", body: `${first}, we're hosting a small session next week — happy to add you if you'd like.` },
          { dayOffset: 21, channel: "call", purpose: "Schedule a chat" },
        ],
      }
    case "re-engage":
      return {
        strategy: "Acknowledge silence, offer fresh value, low-friction reply ask.",
        touches: [
          { dayOffset: 0, channel: "email", purpose: "Reconnect with new value", subject: "Quick reconnect", body: `Hi ${first}, it's been a while. Things have changed on our side — keen to share what's new if relevant for you.` },
          { dayOffset: 5, channel: "whatsapp", purpose: "Soft nudge", body: `Hi ${first}, still keen to reconnect — no pressure either way.` },
          { dayOffset: 12, channel: "call", purpose: "Direct call attempt" },
          { dayOffset: 20, channel: "email", purpose: "Final close-the-loop", subject: "Closing the loop", body: `${first}, I'll stop reaching out for now — let me know if priorities shift.` },
        ],
      }
    case "post-demo":
    default:
      return {
        strategy: "Recap, address objections, propose next step, urgency.",
        touches: [
          { dayOffset: 0, channel: "email", purpose: "Demo recap + next step", subject: "Following up on our demo", body: `Hi ${first}, great talking earlier. Recap attached — happy to set up a follow-up to dig into next steps.` },
          { dayOffset: 3, channel: "call", purpose: "Address questions" },
          { dayOffset: 7, channel: "whatsapp", purpose: "Move toward decision", body: `Hi ${first}, any thoughts after the demo? Happy to share a proposal if helpful.` },
          { dayOffset: 14, channel: "email", purpose: "Proposal + deadline", subject: "Proposal", body: `${first}, sharing a proposal — let me know if anything needs to change.` },
        ],
      }
  }
}

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!rateLimit(`nurture:${session.user.id}`, 20, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const parsed = Body.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const { contactId, intent } = parsed.data
    const contact = await prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        activities: { orderBy: { createdAt: "desc" }, take: 5 },
        callLogs: { orderBy: { at: "desc" }, take: 3 },
      },
    })
    if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 })
    if (session.user.role === "REP" && contact.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // Cache lookup
    const cached = await prisma.aIInsight.findFirst({
      where: {
        contactId,
        type: "NURTURE_SEQUENCE",
        createdAt: { gte: new Date(Date.now() - CACHE_TTL_MS) },
      },
      orderBy: { createdAt: "desc" },
    })
    if (cached) {
      try {
        const p = JSON.parse(cached.payload) as { intent?: string } & NurtureResponse
        if (p.intent === intent && Array.isArray(p.touches)) {
          return NextResponse.json(p)
        }
      } catch {
        // fall through
      }
    }

    const recentActs = contact.activities.map((a) => `${a.type}: ${a.subject}`).join("; ") || "none"
    const lastCall = contact.callLogs[0]
    const lastCallStr = lastCall ? `${lastCall.status} (${new Date(lastCall.at).toISOString().slice(0, 10)})` : "none"

    const prompt = `You are a B2B sales coach. Generate a 4-touch nurture sequence. Respond ONLY with JSON.

Contact: ${contact.name}
Company: ${contact.company ?? "Unknown"}
Category: ${contact.category ?? "Unknown"}
Last call status: ${lastCallStr}
Recent activities: ${recentActs}
Intent: ${intent}

JSON shape (4 touches):
{"strategy": "<1-sentence strategy>", "touches": [{"dayOffset": <0-30>, "channel": "email"|"whatsapp"|"call", "purpose": "<short>", "subject": "<email subject or null>", "body": "<message body or null>"}]}
Rules:
- dayOffset starts at 0 and increases.
- Personalize with the contact's first name in email/whatsapp bodies.
- Channels should mix; calls have null subject/body.
- Keep messages short (max 3 sentences each).`

    const fallback = fallbackSequence(intent, contact.name)
    let result: NurtureResponse = fallback
    try {
      const r = await callLLM({ prompt, maxTokens: 1024, task: "draft" })
      if (r.ok) {
        const parsedResp = extractJson<NurtureResponse>(r.text, fallback)
        if (Array.isArray(parsedResp.touches) && parsedResp.touches.length > 0) {
          result = {
            strategy: parsedResp.strategy ?? fallback.strategy,
            touches: parsedResp.touches.slice(0, 6).map((t) => ({
              dayOffset: Math.max(0, Math.min(60, Number(t.dayOffset) || 0)),
              channel: (["email", "whatsapp", "call"] as const).includes(t.channel) ? t.channel : "email",
              purpose: String(t.purpose ?? "").slice(0, 200) || "Touch",
              subject: t.subject ?? null,
              body: t.body ?? null,
            })),
          }
        }
      }
    } catch {
      // keep fallback
    }

    await prisma.aIInsight.create({
      data: {
        type: "NURTURE_SEQUENCE",
        payload: JSON.stringify({ ...result, intent }),
        contactId,
        userId: session.user.id,
      },
    })

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
