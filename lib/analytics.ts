import { prisma } from "@/lib/prisma"
import { getClosedStageIds } from "@/lib/stage-helpers"
import { startOfMonth, endOfMonth, subMonths, eachMonthOfInterval, format } from "date-fns"

export interface StageBreakdownItem {
  stageId: string
  stage: string
  color: string
  count: number
  value: number
}

export interface ActivityBreakdownItem {
  type: string
  count: number
}

export interface MonthlyPoint {
  month: string
  value: number
  count: number
}

export interface LeaderboardItem {
  userId: string
  name: string
  avatar: string | null
  wonValue: number
  wonCount: number
  pipelineValue: number
}

export interface AnalyticsData {
  forecastedRevenue: number
  totalPipelineValue: number
  revenueThisMonth: number
  wonThisMonth: number
  avgDealSize: number
  winRate: number
  stageBreakdown: StageBreakdownItem[]
  activityBreakdown: ActivityBreakdownItem[]
  wonByMonth: MonthlyPoint[]
  leaderboard: LeaderboardItem[]
}

export async function getAnalytics(ownerId?: string): Promise<AnalyticsData> {
  const ownerFilter = ownerId ? { ownerId } : {}

  const [stages, users, closed] = await Promise.all([
    prisma.stage.findMany({ orderBy: { order: "asc" } }),
    prisma.user.findMany(),
    getClosedStageIds(),
  ])

  const wonId = closed.wonId
  const lostId = closed.lostId
  const closedIds = [wonId, lostId].filter((n): n is string => !!n)

  // Stage breakdown via groupBy (count + sum per stageId)
  const stageGroups = await prisma.deal.groupBy({
    by: ["stageId"],
    where: ownerFilter,
    _count: { _all: true },
    _sum: { value: true },
  })
  const stageById = new Map(stageGroups.map((g) => [g.stageId, g]))

  const stageBreakdown: StageBreakdownItem[] = stages.map((s) => {
    const g = stageById.get(s.id)
    return {
      stageId: s.id,
      stage: s.name,
      color: s.color,
      count: g?._count._all ?? 0,
      value: g?._sum.value ?? 0,
    }
  })

  // Open deals: total + forecasted (need probability — pull thin set)
  const openDeals = await prisma.deal.findMany({
    where: { ...ownerFilter, stageId: { notIn: closedIds } },
    select: { value: true, probability: true },
  })
  const forecastedRevenue = openDeals.reduce((sum, d) => sum + d.value * (d.probability / 100), 0)
  const totalPipelineValue = openDeals.reduce((sum, d) => sum + d.value, 0)

  // Won aggregations
  const wonAgg = wonId
    ? await prisma.deal.aggregate({
        where: { ...ownerFilter, stageId: wonId },
        _sum: { value: true },
        _count: { _all: true },
      })
    : { _sum: { value: 0 }, _count: { _all: 0 } }

  const wonCount = wonAgg._count._all ?? 0
  const wonTotalValue = wonAgg._sum.value ?? 0

  const lostCount = lostId
    ? (await prisma.deal.count({ where: { ...ownerFilter, stageId: lostId } }))
    : 0

  const closedTotal = wonCount + lostCount
  const winRate = closedTotal > 0 ? (wonCount / closedTotal) * 100 : 0
  const avgDealSize = wonCount > 0 ? wonTotalValue / wonCount : 0

  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)

  // Won this month
  const wonThisMonthAgg = wonId
    ? await prisma.deal.aggregate({
        where: {
          ...ownerFilter,
          stageId: wonId,
          OR: [
            { actualCloseDate: { gte: monthStart, lte: monthEnd } },
            { AND: [{ actualCloseDate: null }, { updatedAt: { gte: monthStart, lte: monthEnd } }] },
          ],
        },
        _sum: { value: true },
        _count: { _all: true },
      })
    : { _sum: { value: 0 }, _count: { _all: 0 } }

  const revenueThisMonth = wonThisMonthAgg._sum.value ?? 0
  const wonThisMonth = wonThisMonthAgg._count._all ?? 0

  // Activity breakdown via groupBy
  const activityGroups = await prisma.activity.groupBy({
    by: ["type"],
    where: ownerId ? { userId: ownerId } : {},
    _count: { _all: true },
  })
  const activityBreakdown: ActivityBreakdownItem[] = activityGroups
    .map((g) => ({ type: g.type, count: g._count._all }))
    .sort((a, b) => b.count - a.count)

  // Won by month: one pass over won deals with date
  const sixMonthsAgo = startOfMonth(subMonths(now, 5))
  const wonDealsForChart = wonId
    ? await prisma.deal.findMany({
        where: { ...ownerFilter, stageId: wonId },
        select: { value: true, actualCloseDate: true, updatedAt: true },
      })
    : []
  const months = eachMonthOfInterval({ start: sixMonthsAgo, end: now })
  const wonByMonth: MonthlyPoint[] = months.map((m) => {
    const ms = startOfMonth(m)
    const me = endOfMonth(m)
    const matched = wonDealsForChart.filter((d) => {
      const c = d.actualCloseDate ?? d.updatedAt
      return c >= ms && c <= me
    })
    return {
      month: format(m, "MMM yyyy"),
      value: matched.reduce((s, d) => s + d.value, 0),
      count: matched.length,
    }
  })

  // Leaderboard via per-user groupBy (only when not scoping to one user)
  const wonByOwner = wonId
    ? await prisma.deal.groupBy({
        by: ["ownerId"],
        where: { stageId: wonId },
        _sum: { value: true },
        _count: { _all: true },
      })
    : []
  const openByOwner = await prisma.deal.groupBy({
    by: ["ownerId"],
    where: { stageId: { notIn: closedIds } },
    _sum: { value: true },
  })
  const wonMap = new Map(wonByOwner.map((g) => [g.ownerId, g]))
  const openMap = new Map(openByOwner.map((g) => [g.ownerId, g]))

  const leaderboard: LeaderboardItem[] = users
    .map((u) => {
      const w = wonMap.get(u.id)
      const o = openMap.get(u.id)
      return {
        userId: u.id,
        name: u.name,
        avatar: u.avatar,
        wonValue: w?._sum.value ?? 0,
        wonCount: w?._count._all ?? 0,
        pipelineValue: o?._sum.value ?? 0,
      }
    })
    .sort((a, b) => b.wonValue - a.wonValue)

  return {
    forecastedRevenue,
    totalPipelineValue,
    revenueThisMonth,
    wonThisMonth,
    avgDealSize,
    winRate,
    stageBreakdown,
    activityBreakdown,
    wonByMonth,
    leaderboard,
  }
}
