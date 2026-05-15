import { prisma } from "@/lib/prisma"
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

const WON_STAGE = "Closed Won"
const LOST_STAGE = "Closed Lost"

export async function getAnalytics(ownerId?: string): Promise<AnalyticsData> {
  const ownerFilter = ownerId ? { ownerId } : {}

  const [deals, stages, activities, users] = await Promise.all([
    prisma.deal.findMany({ where: ownerFilter }),
    prisma.stage.findMany({ orderBy: { order: "asc" } }),
    prisma.activity.findMany({ where: ownerId ? { userId: ownerId } : {} }),
    prisma.user.findMany(),
  ])

  const openDeals = deals.filter((d) => d.stage !== WON_STAGE && d.stage !== LOST_STAGE)
  const wonDeals = deals.filter((d) => d.stage === WON_STAGE)
  const lostDeals = deals.filter((d) => d.stage === LOST_STAGE)

  const forecastedRevenue = openDeals.reduce((sum, d) => sum + d.value * (d.probability / 100), 0)
  const totalPipelineValue = openDeals.reduce((sum, d) => sum + d.value, 0)

  const now = new Date()
  const monthStart = startOfMonth(now)
  const monthEnd = endOfMonth(now)

  const wonThisMonthDeals = wonDeals.filter((d) => {
    const closed = d.actualCloseDate ?? d.updatedAt
    return closed >= monthStart && closed <= monthEnd
  })
  const revenueThisMonth = wonThisMonthDeals.reduce((sum, d) => sum + d.value, 0)
  const wonThisMonth = wonThisMonthDeals.length

  const closedTotal = wonDeals.length + lostDeals.length
  const winRate = closedTotal > 0 ? (wonDeals.length / closedTotal) * 100 : 0
  const avgDealSize = wonDeals.length > 0 ? wonDeals.reduce((s, d) => s + d.value, 0) / wonDeals.length : 0

  const stageBreakdown: StageBreakdownItem[] = stages.map((s) => {
    const stageDeals = deals.filter((d) => d.stageId === s.id)
    return {
      stageId: s.id,
      stage: s.name,
      color: s.color,
      count: stageDeals.length,
      value: stageDeals.reduce((sum, d) => sum + d.value, 0),
    }
  })

  const activityCounts = new Map<string, number>()
  for (const a of activities) activityCounts.set(a.type, (activityCounts.get(a.type) ?? 0) + 1)
  const activityBreakdown: ActivityBreakdownItem[] = Array.from(activityCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)

  const sixMonthsAgo = startOfMonth(subMonths(now, 5))
  const months = eachMonthOfInterval({ start: sixMonthsAgo, end: now })
  const wonByMonth: MonthlyPoint[] = months.map((m) => {
    const ms = startOfMonth(m)
    const me = endOfMonth(m)
    const matched = wonDeals.filter((d) => {
      const closed = d.actualCloseDate ?? d.updatedAt
      return closed >= ms && closed <= me
    })
    return {
      month: format(m, "MMM yyyy"),
      value: matched.reduce((s, d) => s + d.value, 0),
      count: matched.length,
    }
  })

  const leaderboard: LeaderboardItem[] = users
    .map((u) => {
      const userDeals = deals.filter((d) => d.ownerId === u.id)
      const userWon = userDeals.filter((d) => d.stage === WON_STAGE)
      const userOpen = userDeals.filter((d) => d.stage !== WON_STAGE && d.stage !== LOST_STAGE)
      return {
        userId: u.id,
        name: u.name,
        avatar: u.avatar,
        wonValue: userWon.reduce((s, d) => s + d.value, 0),
        wonCount: userWon.length,
        pipelineValue: userOpen.reduce((s, d) => s + d.value, 0),
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
