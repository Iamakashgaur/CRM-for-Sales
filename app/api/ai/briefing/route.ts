import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { callLLM } from "@/lib/ai-provider"
import { extractJson } from "@/lib/ai"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"
import { getClosedStageIds } from "@/lib/stage-helpers"

export const dynamic = "force-dynamic"

interface BriefingAction { label: string; link: string }
interface BriefingStats {
  todayFollowUps: number
  overdue: number
  hotLeads: number
  atRisk: number
  recentWins: number
}
interface BriefingResult {
  briefing: string
  actions: BriefingAction[]
  stats: BriefingStats
  topContact?: { id: string; name: string; company: string | null }
  _generatedAt?: string
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!rateLimit(`ai:${session.user.id}`, 20, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1"
    const isRep = session.user.role === "REP"
    const ownerFilter = isRep ? { ownerId: session.user.id } : {}

    if (!forceRefresh) {
      const cached = await prisma.aIInsight.findFirst({
        where: {
          type: "BRIEFING",
          userId: session.user.id,
          createdAt: { gte: new Date(Date.now() - 12 * 3_600_000) },
        },
        orderBy: { createdAt: "desc" },
      })
      if (cached) {
        try { return NextResponse.json(JSON.parse(cached.payload) as BriefingResult) } catch { /* recompute */ }
      }
    }

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)

    const closed = await getClosedStageIds()

    const [todayFollowUps, overdue, hotLeads, atRisk, recentWins, topContact] = await Promise.all([
      prisma.contact.count({
        where: { ...ownerFilter, nextFollowUpDate: { gte: today, lt: tomorrow } },
      }),
      prisma.contact.count({
        where: { ...ownerFilter, nextFollowUpDate: { lt: today, not: null } },
      }),
      prisma.contact.count({
        where: { ...ownerFilter, category: "Hot Lead" },
      }),
      prisma.deal.count({
        where: {
          ...ownerFilter,
          stage: { notIn: closed.closedNames },
          probability: { lt: 40 },
          stageEnteredAt: { lt: new Date(Date.now() - 14 * 86_400_000) },
        },
      }),
      prisma.deal.count({
        where: {
          ...ownerFilter,
          stage: closed.wonName ?? "Closed Won",
          updatedAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
        },
      }),
      prisma.contact.findFirst({
        where: { ...ownerFilter, category: "Hot Lead" },
        orderBy: { updatedAt: "desc" },
        select: { id: true, name: true, company: true },
      }),
    ])

    const stats: BriefingStats = { todayFollowUps, overdue, hotLeads, atRisk, recentWins }

    const prompt = `You are a sales coach giving a daily briefing. Write a single short paragraph (~2-3 sentences) for the rep, then list 3 concrete actions. Reply ONLY with JSON.

Stats:
- Today's follow-ups: ${todayFollowUps}
- Overdue follow-ups: ${overdue}
- Hot leads: ${hotLeads}
- Deals at risk: ${atRisk}
- Won this week: ${recentWins}
- Top contact to call: ${topContact?.name ?? "n/a"}${topContact?.company ? ` (${topContact.company})` : ""}

Output JSON: {"briefing":"<2-3 sentence paragraph>","actions":[{"label":"<imperative action>","link":"/dashboard"|"/contacts"|"/deals"|"/pipeline"}]}

Use plain language, no salutation. Reference the numbers concretely.`

    const llm = await callLLM({ prompt, maxTokens: 600, task: "suggest" })
    const fallback: BriefingResult = {
      briefing: `You have ${todayFollowUps} follow-up${todayFollowUps === 1 ? "" : "s"} today, ${overdue} overdue, and ${atRisk} deal${atRisk === 1 ? "" : "s"} at risk. ${hotLeads} hot leads await your attention.`,
      actions: [
        { label: "Review today's follow-ups", link: "/contacts" },
        { label: "Check at-risk deals", link: "/dashboard" },
        { label: "Open pipeline", link: "/pipeline" },
      ],
      stats,
      topContact: topContact ?? undefined,
      _generatedAt: new Date().toISOString(),
    }
    if (!llm.ok) return NextResponse.json(fallback)

    const parsed = extractJson<{ briefing: string; actions: BriefingAction[] }>(llm.text, { briefing: fallback.briefing, actions: fallback.actions })
    const result: BriefingResult = {
      briefing: parsed.briefing || fallback.briefing,
      actions: Array.isArray(parsed.actions) && parsed.actions.length > 0 ? parsed.actions.slice(0, 4) : fallback.actions,
      stats,
      topContact: topContact ?? undefined,
      _generatedAt: new Date().toISOString(),
    }

    await prisma.aIInsight.create({
      data: { type: "BRIEFING", payload: JSON.stringify(result), userId: session.user.id },
    })

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
