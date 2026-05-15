import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ActivityFeed } from "@/components/crm/ActivityFeed"
import { WinProbabilityBadge } from "@/components/crm/WinProbabilityBadge"
import { getServerSession } from "@/lib/auth"
import { getAnalytics } from "@/lib/analytics"
import { prisma } from "@/lib/prisma"
import { formatCurrency, formatDate, getInitials, avatarColor, cn } from "@/lib/utils"
import {
  TrendingUp,
  DollarSign,
  Trophy,
  Target,
  Briefcase,
  ArrowUpRight,
  AlertCircle,
  CalendarClock,
} from "lucide-react"
import Link from "next/link"

export const dynamic = "force-dynamic"

function greeting() {
  const h = new Date().getHours()
  if (h < 12) return "Good morning"
  if (h < 18) return "Good afternoon"
  return "Good evening"
}

interface StatCardProps {
  icon: React.ElementType
  iconClass: string
  label: string
  value: string
  hint?: string
}

function StatCard({ icon: Icon, iconClass, label, value, hint }: StatCardProps) {
  return (
    <Card className="p-6 hover:shadow-elevated">
      <div className="flex items-start justify-between">
        <div
          className={cn(
            "h-10 w-10 rounded-full flex items-center justify-center",
            iconClass
          )}
        >
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </div>
        {hint && (
          <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-emerald-600">
            <ArrowUpRight className="h-3 w-3" /> {hint}
          </span>
        )}
      </div>
      <div className="mt-4">
        <div className="text-[13px] text-muted-foreground">{label}</div>
        <div className="text-[28px] font-bold tracking-tight tabular-nums mt-1 leading-none">
          {value}
        </div>
      </div>
    </Card>
  )
}

export default async function DashboardPage() {
  const session = await getServerSession()
  const userName = session?.user?.name ?? "there"
  const analytics = await getAnalytics()
  const [upcoming, atRisk] = await Promise.all([
    prisma.activity.findMany({
      where: { dueAt: { not: null, gte: new Date() }, completedAt: null },
      orderBy: { dueAt: "asc" },
      take: 5,
      include: { user: { select: { name: true } }, deal: { select: { id: true, title: true } } },
    }),
    prisma.deal.findMany({
      where: { stage: { notIn: ["Closed Won", "Closed Lost"] }, probability: { lt: 50 } },
      orderBy: { value: "desc" },
      take: 5,
      include: { contact: { select: { name: true, company: true } } },
    }),
  ])

  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  })

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">
          {greeting()}, {userName.split(" ")[0]}
        </h1>
        <p className="text-sm text-muted-foreground mt-1">{today}</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          icon={TrendingUp}
          iconClass="bg-blue-50 text-blue-600"
          label="Forecasted revenue"
          value={formatCurrency(analytics.forecastedRevenue)}
        />
        <StatCard
          icon={Briefcase}
          iconClass="bg-violet-50 text-violet-600"
          label="Pipeline value"
          value={formatCurrency(analytics.totalPipelineValue)}
        />
        <StatCard
          icon={DollarSign}
          iconClass="bg-emerald-50 text-emerald-600"
          label="Won this month"
          value={formatCurrency(analytics.revenueThisMonth)}
        />
        <StatCard
          icon={Target}
          iconClass="bg-amber-50 text-amber-600"
          label="Win rate"
          value={`${Math.round(analytics.winRate)}%`}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Recent activity</CardTitle>
            <Trophy className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <ActivityFeed limit={10} />
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Upcoming tasks</CardTitle>
              <CalendarClock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-2">
                    <CalendarClock className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">All caught up</p>
                  <p className="text-xs text-muted-foreground mt-0.5">No upcoming tasks</p>
                </div>
              ) : (
                <ul className="space-y-3">
                  {upcoming.map((a) => (
                    <li key={a.id} className="text-sm flex justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-medium truncate text-[13px]">{a.subject}</div>
                        {a.deal && (
                          <Link
                            href={`/deals/${a.deal.id}`}
                            className="text-xs text-muted-foreground hover:text-accent transition-colors truncate block mt-0.5"
                          >
                            {a.deal.title}
                          </Link>
                        )}
                      </div>
                      <Badge variant="outline" className="shrink-0 text-[10px] tabular-nums">
                        {formatDate(a.dueAt)}
                      </Badge>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Deals at risk</CardTitle>
              <AlertCircle className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {atRisk.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-2">
                    <AlertCircle className="h-5 w-5 text-muted-foreground" />
                  </div>
                  <p className="text-sm font-medium">No deals at risk</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Everything looks healthy</p>
                </div>
              ) : (
                <ul className="space-y-1">
                  {atRisk.map((d) => (
                    <li key={d.id}>
                      <Link
                        href={`/deals/${d.id}`}
                        className="flex items-center gap-2.5 hover:bg-muted/50 rounded-md p-2 -mx-2 transition-colors"
                      >
                        <Avatar className="h-7 w-7">
                          <AvatarFallback
                            className={cn("text-white text-[10px]", avatarColor(d.contact.name))}
                          >
                            {getInitials(d.contact.name)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                          <div className="text-[13px] font-medium truncate">{d.title}</div>
                          <div className="text-[11px] text-muted-foreground truncate tabular-nums">
                            {formatCurrency(d.value)} · {d.stage}
                          </div>
                        </div>
                        <WinProbabilityBadge probability={d.probability} />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
