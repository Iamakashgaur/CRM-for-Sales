import { getServerSession } from "@/lib/auth"
import { getAnalytics } from "@/lib/analytics"
import { prisma } from "@/lib/prisma"
import { getClosedStageIds } from "@/lib/stage-helpers"
import { redirect } from "next/navigation"
import { DashboardClient } from "./DashboardClient"

export const dynamic = "force-dynamic"

export default async function DashboardPage() {
  const session = await getServerSession()
  if (!session?.user) redirect("/login")
  const userName = session.user.name ?? "There"
  const isRep = session.user.role === "REP"
  const showLeaderboard = session.user.role === "ADMIN" || session.user.role === "MANAGER"
  const ownerScope = isRep ? session.user.id : undefined
  const analytics = await getAnalytics(ownerScope)
  const closed = await getClosedStageIds()
  const closedStageNames = closed.closedNames

  const activityWhere: Record<string, unknown> = {
    dueAt: { not: null, gte: new Date() },
    completedAt: null,
  }
  if (isRep) activityWhere.userId = session.user.id

  const dealWhere: Record<string, unknown> = {
    stage: { notIn: closedStageNames },
    probability: { lt: 50 },
    stageEnteredAt: { lt: new Date(Date.now() - 14 * 86400000) },
  }
  if (isRep) dealWhere.ownerId = session.user.id

  const [upcoming, atRisk] = await Promise.all([
    prisma.activity.findMany({
      where: activityWhere,
      orderBy: { dueAt: "asc" },
      take: 6,
      include: { deal: { select: { id: true, title: true } } },
    }),
    prisma.deal.findMany({
      where: dealWhere,
      orderBy: { value: "desc" },
      take: 5,
      include: { contact: { select: { name: true, company: true } } },
    }),
  ])

  return (
    <DashboardClient
      userName={userName}
      showLeaderboard={showLeaderboard}
      stats={{
        forecastedRevenue: analytics.forecastedRevenue,
        totalPipelineValue: analytics.totalPipelineValue,
        revenueThisMonth: analytics.revenueThisMonth,
        winRate: analytics.winRate,
        avgDealSize: analytics.avgDealSize,
      }}
      stageBreakdown={analytics.stageBreakdown}
      upcoming={upcoming.map((u) => ({
        id: u.id,
        subject: u.subject,
        dueAt: u.dueAt ? u.dueAt.toISOString() : null,
        deal: u.deal ? { id: u.deal.id, title: u.deal.title } : null,
      }))}
      atRisk={atRisk.map((d) => ({
        id: d.id,
        title: d.title,
        value: d.value,
        stage: d.stage,
        probability: d.probability,
        contact: { name: d.contact.name, company: d.contact.company },
      }))}
      leaderboard={analytics.leaderboard}
      wonByMonth={analytics.wonByMonth}
    />
  )
}
