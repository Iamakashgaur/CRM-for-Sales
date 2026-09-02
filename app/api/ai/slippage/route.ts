import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"
import { callLLM } from "@/lib/ai-provider"
import { extractJson } from "@/lib/ai"
import { daysBetween } from "@/lib/utils"
import { isPrivileged } from "@/lib/constants"

export const dynamic = "force-dynamic"

interface SlippageFactor {
  key: string
  label: string
  weight: number
}

interface SlippageItem {
  dealId: string
  dealTitle: string
  value: number
  stage: string
  probability: number
  contactName: string | null
  ownerName: string | null
  slipScore: number
  daysOff: number | null // positive = days past expected close
  factors: SlippageFactor[]
  explanation?: string
}

/** Build a per-stage median for daysInStage from existing deal data. */
async function buildStageMedians(): Promise<Map<string, number>> {
  const closed = await prisma.deal.findMany({
    where: { actualCloseDate: { not: null } },
    select: { stage: true, stageEnteredAt: true, actualCloseDate: true },
    take: 2000,
  })
  const buckets = new Map<string, number[]>()
  for (const d of closed) {
    if (!d.actualCloseDate) continue
    const days = Math.max(0, daysBetween(d.stageEnteredAt, d.actualCloseDate))
    if (!buckets.has(d.stage)) buckets.set(d.stage, [])
    buckets.get(d.stage)!.push(days)
  }
  const medians = new Map<string, number>()
  for (const [stage, list] of buckets) {
    list.sort((a, b) => a - b)
    const mid = list[Math.floor(list.length / 2)]
    medians.set(stage, mid ?? 14)
  }
  return medians
}

function rankSlippage(
  deal: {
    id: string
    title: string
    value: number
    stage: string
    probability: number
    expectedCloseDate: Date | null
    stageEnteredAt: Date
    contact: { name: string; company: string | null } | null
    owner: { name: string } | null
    activities: Array<{ createdAt: Date; type: string }>
  },
  stageMedians: Map<string, number>,
  now: Date
): SlippageItem {
  const factors: SlippageFactor[] = []

  const daysInStage = daysBetween(deal.stageEnteredAt, now)
  const median = stageMedians.get(deal.stage) ?? 14
  if (daysInStage > median * 1.5) {
    factors.push({
      key: "stage_overrun",
      label: `In ${deal.stage} ${daysInStage}d (median ${median}d)`,
      weight: 25,
    })
  }

  const lastAct = deal.activities[0]
  const daysSinceLastActivity = lastAct ? daysBetween(lastAct.createdAt, now) : daysBetween(deal.stageEnteredAt, now)
  if (daysSinceLastActivity > 14) {
    factors.push({
      key: "stale",
      label: `${daysSinceLastActivity}d since last touch`,
      weight: 20,
    })
  }

  if (deal.probability < 40) {
    factors.push({
      key: "low_probability",
      label: `Win prob ${deal.probability}%`,
      weight: 15,
    })
  }

  let daysOff: number | null = null
  if (deal.expectedCloseDate) {
    const diff = daysBetween(deal.expectedCloseDate, now)
    if (deal.expectedCloseDate.getTime() < now.getTime()) {
      daysOff = diff
      factors.push({
        key: "past_close",
        label: `${diff}d past expected close`,
        weight: 25,
      })
    } else {
      daysOff = -diff
    }
  } else {
    factors.push({
      key: "no_close_date",
      label: "No expected close date",
      weight: 10,
    })
  }

  // Recent contact engagement (CALL or EMAIL in last 21d?)
  const hasRecentEngagement = deal.activities.some(
    (a) => (a.type === "CALL" || a.type === "EMAIL") && daysBetween(a.createdAt, now) <= 21
  )
  if (!hasRecentEngagement) {
    factors.push({
      key: "no_engagement",
      label: "No call/email in 21d",
      weight: 15,
    })
  }

  const rawScore = factors.reduce((sum, f) => sum + f.weight, 0)
  const slipScore = Math.min(100, rawScore)

  return {
    dealId: deal.id,
    dealTitle: deal.title,
    value: deal.value,
    stage: deal.stage,
    probability: deal.probability,
    contactName: deal.contact?.name ?? null,
    ownerName: deal.owner?.name ?? null,
    slipScore,
    daysOff,
    factors,
  }
}

async function enrichWithLLM(item: SlippageItem): Promise<string | undefined> {
  if (item.slipScore < 50) return undefined
  try {
    const factorList = item.factors.map((f) => f.label).join("; ")
    const r = await callLLM({
      prompt: `Deal "${item.dealTitle}" (value $${item.value}) at stage "${item.stage}" is at slip risk ${item.slipScore}/100. Risk factors: ${factorList}. In ONE concise sentence (max 25 words), explain why this deal is likely to slip and what action to take. Respond with JSON: {"explanation": "..."}`,
      maxTokens: 100,
      task: "suggest",
    })
    if (!r.ok) return undefined
    const parsed = extractJson<{ explanation?: string }>(r.text, {})
    return parsed.explanation
  } catch {
    return undefined
  }
}

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!rateLimit(`slippage:${session.user.id}`, 30, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const sp = req.nextUrl.searchParams
    const dealId = sp.get("dealId") || undefined
    const includeExplanation = sp.get("explain") !== "0"

    const isRep = session.user.role === "REP"
    const ownerFilter = isRep ? { ownerId: session.user.id } : isPrivileged(session.user.role) ? {} : { ownerId: session.user.id }

    const stageMedians = await buildStageMedians()
    const now = new Date()

    const where: Record<string, unknown> = {
      ...ownerFilter,
      actualCloseDate: null,
    }
    if (dealId) where.id = dealId

    const deals = await prisma.deal.findMany({
      where,
      include: {
        contact: { select: { name: true, company: true } },
        owner: { select: { name: true } },
        activities: { orderBy: { createdAt: "desc" }, take: 10 },
      },
      take: 500,
    })

    const items = deals.map((d) => rankSlippage(d, stageMedians, now))
    items.sort((a, b) => b.slipScore - a.slipScore)

    // Enrich top 5 with LLM explanation
    if (includeExplanation) {
      const topToEnrich = items.filter((i) => i.slipScore >= 50).slice(0, 5)
      await Promise.all(
        topToEnrich.map(async (item) => {
          const explanation = await enrichWithLLM(item)
          if (explanation) item.explanation = explanation
        })
      )
    }

    return NextResponse.json({ deals: items })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
