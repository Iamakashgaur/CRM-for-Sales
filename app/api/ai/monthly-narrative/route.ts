import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { safeError } from "@/lib/api-errors"
import { isPrivileged } from "@/lib/constants"
import { rateLimit } from "@/lib/rate-limit"
import { callLLM } from "@/lib/ai-provider"
import { extractJson } from "@/lib/ai"
import { getClosedStageIds } from "@/lib/stage-helpers"
import { startOfMonth, endOfMonth, subMonths, format, parse } from "date-fns"

export const dynamic = "force-dynamic"

const CACHE_TYPE = "MONTHLY_NARRATIVE"
const CACHE_TTL_MS = 24 * 60 * 60 * 1000 // 24h

export interface MonthlyNarrativeResult {
  month: string
  narrative: string
  sections: {
    wins: string
    losses: string
    outlook: string
  }
  metrics: {
    revenueWon: number
    dealsWonCount: number
    dealsLostCount: number
    winRate: number
    pipelineEndValue: number
    avgDealSize: number
  }
  topPerformers: Array<{ name: string; wonValue: number; wonCount: number }>
  topLossReasons: Array<{ reason: string; count: number }>
  generatedAt: string
  cached?: boolean
}

function parseMonth(input: string | null): Date {
  if (!input) {
    // Default last completed month
    return startOfMonth(subMonths(new Date(), 1))
  }
  try {
    const parsed = parse(input + "-01", "yyyy-MM-dd", new Date())
    if (isNaN(parsed.getTime())) return startOfMonth(subMonths(new Date(), 1))
    return startOfMonth(parsed)
  } catch {
    return startOfMonth(subMonths(new Date(), 1))
  }
}

function fallback(month: string, m: MonthlyNarrativeResult["metrics"], top: MonthlyNarrativeResult["topPerformers"], losses: MonthlyNarrativeResult["topLossReasons"]): MonthlyNarrativeResult {
  return {
    month,
    narrative: `In ${month}, the team closed ${m.dealsWonCount} deals for $${Math.round(m.revenueWon)} in revenue. ${m.dealsLostCount} deals were lost. AI not configured for richer narrative — configure a provider in Settings.`,
    sections: {
      wins: top.length ? `Top performer: ${top[0].name} ($${Math.round(top[0].wonValue)}).` : "No wins recorded.",
      losses: losses.length ? `Top loss reason: ${losses[0].reason}.` : "No lost deals recorded.",
      outlook: `Pipeline carrying forward: $${Math.round(m.pipelineEndValue)}.`,
    },
    metrics: m,
    topPerformers: top,
    topLossReasons: losses,
    generatedAt: new Date().toISOString(),
  }
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isPrivileged(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    if (!rateLimit(`ai-narrative:${session.user.id}`, 10, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const monthParam = req.nextUrl.searchParams.get("month")
    const monthStart = parseMonth(monthParam)
    const monthEnd = endOfMonth(monthStart)
    const monthLabel = format(monthStart, "yyyy-MM")
    const monthHuman = format(monthStart, "MMMM yyyy")

    // Check cache
    const cached = await prisma.aIInsight.findFirst({
      where: {
        type: CACHE_TYPE,
        createdAt: { gte: new Date(Date.now() - CACHE_TTL_MS) },
      },
      orderBy: { createdAt: "desc" },
    })
    if (cached) {
      try {
        const data = JSON.parse(cached.payload) as MonthlyNarrativeResult
        if (data.month === monthLabel) {
          return NextResponse.json({ ...data, cached: true })
        }
      } catch {
        // fall through
      }
    }

    const closed = await getClosedStageIds()
    const wonId = closed.wonId
    const lostId = closed.lostId

    // Won deals in month
    const wonDeals = wonId
      ? await prisma.deal.findMany({
          where: {
            stageId: wonId,
            OR: [
              { actualCloseDate: { gte: monthStart, lte: monthEnd } },
              { AND: [{ actualCloseDate: null }, { updatedAt: { gte: monthStart, lte: monthEnd } }] },
            ],
          },
          select: { value: true, ownerId: true, title: true, contactId: true },
        })
      : []

    const lostDeals = lostId
      ? await prisma.deal.findMany({
          where: {
            stageId: lostId,
            OR: [
              { actualCloseDate: { gte: monthStart, lte: monthEnd } },
              { AND: [{ actualCloseDate: null }, { updatedAt: { gte: monthStart, lte: monthEnd } }] },
            ],
          },
          select: { value: true, lostReason: true, title: true },
        })
      : []

    const revenueWon = wonDeals.reduce((s, d) => s + d.value, 0)
    const dealsWonCount = wonDeals.length
    const dealsLostCount = lostDeals.length
    const closedTotal = dealsWonCount + dealsLostCount
    const winRate = closedTotal > 0 ? (dealsWonCount / closedTotal) * 100 : 0
    const avgDealSize = dealsWonCount > 0 ? revenueWon / dealsWonCount : 0

    // pipeline end-of-month: open deals as of monthEnd (approximation: open now)
    const closedIds = [wonId, lostId].filter((s): s is string => !!s)
    const openDeals = await prisma.deal.findMany({
      where: { stageId: { notIn: closedIds }, createdAt: { lte: monthEnd } },
      select: { value: true },
    })
    const pipelineEndValue = openDeals.reduce((s, d) => s + d.value, 0)

    // Top performers
    const wonByOwner = new Map<string, { value: number; count: number }>()
    for (const d of wonDeals) {
      const prev = wonByOwner.get(d.ownerId) ?? { value: 0, count: 0 }
      wonByOwner.set(d.ownerId, { value: prev.value + d.value, count: prev.count + 1 })
    }
    const users = await prisma.user.findMany({
      where: { id: { in: [...wonByOwner.keys()] } },
      select: { id: true, name: true },
    })
    const userById = new Map(users.map((u) => [u.id, u.name]))
    const topPerformers = [...wonByOwner.entries()]
      .map(([uid, s]) => ({ name: userById.get(uid) ?? "Unknown", wonValue: s.value, wonCount: s.count }))
      .sort((a, b) => b.wonValue - a.wonValue)
      .slice(0, 5)

    // Top loss reasons
    const reasonCounts = new Map<string, number>()
    for (const d of lostDeals) {
      const reason = (d.lostReason ?? "").trim() || "No reason given"
      reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1)
    }
    const topLossReasons = [...reasonCounts.entries()]
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5)

    const metrics = { revenueWon, dealsWonCount, dealsLostCount, winRate, pipelineEndValue, avgDealSize }

    // Previous month comparison
    const prevStart = startOfMonth(subMonths(monthStart, 1))
    const prevEnd = endOfMonth(prevStart)
    const prevWonValue = wonId
      ? (await prisma.deal.aggregate({
          where: {
            stageId: wonId,
            OR: [
              { actualCloseDate: { gte: prevStart, lte: prevEnd } },
              { AND: [{ actualCloseDate: null }, { updatedAt: { gte: prevStart, lte: prevEnd } }] },
            ],
          },
          _sum: { value: true },
          _count: { _all: true },
        }))
      : { _sum: { value: 0 }, _count: { _all: 0 } }
    const prevRevenue = prevWonValue._sum.value ?? 0
    const prevCount = prevWonValue._count._all ?? 0
    const momChange = prevRevenue > 0 ? ((revenueWon - prevRevenue) / prevRevenue) * 100 : null

    const prompt = `You are a Chief Revenue Officer writing the monthly business review narrative for the executive team. Tone: confident, analytical, candid. Use specific numbers.

MONTH: ${monthHuman}

METRICS:
- Revenue won: $${Math.round(revenueWon)} (${dealsWonCount} deals)
- Lost: ${dealsLostCount} deals
- Win rate: ${winRate.toFixed(1)}%
- Avg deal size: $${Math.round(avgDealSize)}
- Pipeline at month-end: $${Math.round(pipelineEndValue)}
- MoM revenue change: ${momChange !== null ? `${momChange.toFixed(1)}%` : "N/A (no prior month data)"}
- Previous month revenue: $${Math.round(prevRevenue)} (${prevCount} deals)

TOP PERFORMERS:
${topPerformers.length ? topPerformers.map((p) => `- ${p.name}: $${Math.round(p.wonValue)} (${p.wonCount} won)`).join("\n") : "- None"}

TOP LOSS REASONS:
${topLossReasons.length ? topLossReasons.map((r) => `- ${r.reason} (${r.count}x)`).join("\n") : "- None"}

Write a ~500 word executive narrative covering wins, losses, and outlook. Then split into three sections.

Return JSON:
{
  "narrative": "<full 500-word executive narrative paragraph(s)>",
  "sections": {
    "wins": "<2-3 sentences on what drove revenue>",
    "losses": "<2-3 sentences on patterns in losses and what to fix>",
    "outlook": "<2-3 sentences on next month's pipeline, risks, and recommendations>"
  }
}`

    const llmResult = await callLLM({ prompt, maxTokens: 1500, task: "reasoning" })
    let finalResult: MonthlyNarrativeResult
    if (!llmResult.ok) {
      finalResult = fallback(monthLabel, metrics, topPerformers, topLossReasons)
    } else {
      const parsedOut = extractJson<{ narrative?: string; sections?: { wins?: string; losses?: string; outlook?: string } }>(
        llmResult.text,
        {}
      )
      if (!parsedOut.narrative || !parsedOut.sections) {
        finalResult = fallback(monthLabel, metrics, topPerformers, topLossReasons)
      } else {
        finalResult = {
          month: monthLabel,
          narrative: parsedOut.narrative,
          sections: {
            wins: parsedOut.sections.wins ?? "",
            losses: parsedOut.sections.losses ?? "",
            outlook: parsedOut.sections.outlook ?? "",
          },
          metrics,
          topPerformers,
          topLossReasons,
          generatedAt: new Date().toISOString(),
        }
      }
    }

    // Store cache (delete previous for same key)
    await prisma.aIInsight.deleteMany({ where: { type: CACHE_TYPE } })
    await prisma.aIInsight.create({
      data: {
        type: CACHE_TYPE,
        payload: JSON.stringify(finalResult),
        userId: session.user.id,
      },
    })

    return NextResponse.json({ ...finalResult, cached: false })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
