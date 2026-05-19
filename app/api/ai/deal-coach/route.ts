import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { callLLM } from "@/lib/ai-provider"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"
import { parseTags, formatDate, daysBetween } from "@/lib/utils"

export const dynamic = "force-dynamic"

const Body = z.object({
  dealId: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(4000),
      })
    )
    .min(1)
    .max(40),
})

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!rateLimit(`ai-coach:${session.user.id}`, 30, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const parsed = Body.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const { dealId, messages } = parsed.data

    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: {
        contact: true,
        stageRef: true,
        owner: { select: { id: true, name: true } },
        activities: { orderBy: { createdAt: "desc" }, take: 20 },
        aiInsights: { orderBy: { createdAt: "desc" }, take: 5 },
      },
    })
    if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (session.user.role === "REP" && deal.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const tags = parseTags(deal.tags)
    const ageDays = daysBetween(deal.createdAt)
    const stageDays = daysBetween(deal.stageEnteredAt)
    const lastActivity = deal.activities[0]
    const lastActivityAt = lastActivity?.createdAt ?? deal.updatedAt

    const insightSummaries: string[] = []
    for (const i of deal.aiInsights) {
      try {
        const p = JSON.parse(i.payload) as Record<string, unknown>
        const score = typeof p.score === "number" ? p.score : null
        const reasoning = typeof p.reasoning === "string" ? p.reasoning : null
        if (score != null || reasoning) {
          insightSummaries.push(`- ${i.type}${score != null ? ` (${score})` : ""}: ${reasoning ?? ""}`.trim())
        }
      } catch {
        // skip
      }
    }

    const activityLines = deal.activities
      .slice(0, 20)
      .map((a) => `- ${formatDate(a.createdAt)} [${a.type}] ${a.subject}${a.body ? ": " + a.body.slice(0, 200) : ""}`)
      .join("\n")

    const system = `You are an expert B2B sales coach helping a sales rep close a specific deal. Be concise, concrete, and tactical. When relevant, suggest exact next actions or even draft short emails. Cite specific details from the deal context. Never invent facts.

DEAL CONTEXT
- Title: ${deal.title}
- Value: ${deal.value} ${deal.currency}
- Stage: ${deal.stage} (${deal.probability}% probability)
- Stage age: ${stageDays}d  |  Deal age: ${ageDays}d
- Expected close: ${deal.expectedCloseDate ? formatDate(deal.expectedCloseDate) : "not set"}
- Owner: ${deal.owner.name}
- Tags: ${tags.length ? tags.join(", ") : "—"}
- Notes: ${deal.notes ?? "—"}
- Lost reason (if any): ${deal.lostReason ?? "—"}

CONTACT
- Name: ${deal.contact.name}
- Company: ${deal.contact.company ?? "—"}
- Title: ${deal.contact.title ?? "—"}
- City/Zone: ${[deal.contact.city, deal.contact.state, deal.contact.zone].filter(Boolean).join(", ") || "—"}
- Email: ${deal.contact.email}
- Last contact: ${deal.contact.lastContactDate ? formatDate(deal.contact.lastContactDate) : "—"}

LAST ACTIVITY (${formatDate(lastActivityAt)})
${lastActivity ? `${lastActivity.type}: ${lastActivity.subject}${lastActivity.body ? "\n" + lastActivity.body.slice(0, 400) : ""}` : "No activity yet"}

RECENT ACTIVITIES (oldest last)
${activityLines || "—"}

AI INSIGHTS
${insightSummaries.length ? insightSummaries.join("\n") : "—"}`

    const transcript = messages
      .map((m) => `${m.role === "user" ? "Rep" : "Coach"}: ${m.content}`)
      .join("\n\n")

    const prompt = `Conversation so far:

${transcript}

Reply as the coach. Keep replies under 200 words unless the rep specifically asks for more. Use markdown bullets for lists.`

    const result = await callLLM({ system, prompt, maxTokens: 700, task: "coach" })
    if (!result.ok) {
      return NextResponse.json({
        reply: "AI is not configured. Configure an AI provider in Settings to use the deal coach.",
        provider: result.provider,
        error: result.error,
      })
    }
    return NextResponse.json({ reply: result.text.trim(), provider: result.provider, model: result.model })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
