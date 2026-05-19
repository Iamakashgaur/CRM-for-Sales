"use client"

import * as React from "react"
import Link from "next/link"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { useQuery } from "@tanstack/react-query"
import { ActivityFeed } from "@/components/crm/ActivityFeed"
import { DashboardGreeting } from "@/components/crm/DashboardGreeting"
import { WinProbabilityBadge } from "@/components/crm/WinProbabilityBadge"
import { Skeleton } from "@/components/ui/skeleton"
import {
  TrendingUp,
  DollarSign,
  Target,
  Briefcase,
  ArrowUpRight,
  ArrowDownRight,
  CalendarClock,
  Plus,
  CheckCircle2,
  ChevronRight,
  Trophy,
  Sparkles,
  RefreshCw,
} from "lucide-react"
import {
  LineChart,
  Line,
  ResponsiveContainer,
  BarChart,
  Bar,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts"
import { formatCurrency, formatDate, getInitials, avatarColor, cn } from "@/lib/utils"

interface UpcomingTask {
  id: string
  subject: string
  dueAt: string | null
  deal: { id: string; title: string } | null
}

interface AtRiskDeal {
  id: string
  title: string
  value: number
  stage: string
  probability: number
  contact: { name: string; company: string | null }
}

interface StageBreakdown {
  stageId: string
  stage: string
  color: string
  count: number
  value: number
}

interface LeaderboardItem {
  userId: string
  name: string
  avatar: string | null
  wonValue: number
  wonCount: number
  pipelineValue: number
}

interface MonthlyPoint {
  month: string
  value: number
  count: number
}

interface DashboardClientProps {
  userName: string
  showLeaderboard: boolean
  stats: {
    forecastedRevenue: number
    totalPipelineValue: number
    revenueThisMonth: number
    winRate: number
    avgDealSize: number
  }
  stageBreakdown: StageBreakdown[]
  upcoming: UpcomingTask[]
  atRisk: AtRiskDeal[]
  leaderboard: LeaderboardItem[]
  wonByMonth: MonthlyPoint[]
}

interface StatCardProps {
  icon: React.ElementType
  iconClass: string
  label: string
  value: string
  trendValue?: number | null
  trendDirection?: "up" | "down"
  spark?: number[]
  comparison?: string
}

function Sparkline({ data, color }: { data: number[]; color: string }) {
  const points = data.map((v, i) => ({ i, v }))
  return (
    <ResponsiveContainer width={64} height={28}>
      <LineChart data={points} margin={{ top: 2, right: 0, left: 0, bottom: 2 }}>
        <Line type="monotone" dataKey="v" stroke={color} strokeWidth={1.5} dot={false} isAnimationActive={false} />
      </LineChart>
    </ResponsiveContainer>
  )
}

function StatCard({ icon: Icon, iconClass, label, value, trendValue, trendDirection, spark, comparison }: StatCardProps) {
  const showTrend = trendValue != null && trendDirection != null
  const isUp = trendDirection === "up"
  const TrendIcon = isUp ? ArrowUpRight : ArrowDownRight
  const trendColor = isUp ? "text-emerald-600 bg-emerald-50" : "text-rose-600 bg-rose-50"
  const sparkColor = isUp ? "hsl(142 71% 41%)" : "hsl(0 84% 60%)"
  const showSpark = spark && spark.length >= 2 && spark.some((v) => v !== spark[0])

  return (
    <Card className="p-5 hover:shadow-elevated hover:-translate-y-px hover:border-accent/40 cursor-default">
      <div className="flex items-start justify-between">
        <div className={cn("h-10 w-10 rounded-full flex items-center justify-center", iconClass)}>
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </div>
        {(showSpark || showTrend) && (
          <div className="flex items-center gap-2">
            {showSpark && <Sparkline data={spark!} color={sparkColor} />}
            {showTrend && (
              <span className={cn("inline-flex items-center gap-0.5 text-[10px] font-semibold px-1.5 py-0.5 rounded-full tabular-nums", trendColor)}>
                <TrendIcon className="h-3 w-3" strokeWidth={2} />
                {Math.abs(trendValue!)}%
              </span>
            )}
          </div>
        )}
      </div>
      <div className="mt-4">
        <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground font-medium">{label}</div>
        <div className="text-[28px] font-medium tabular-nums tracking-[-0.025em] mt-1.5 leading-none">
          {value}
        </div>
        {comparison && <div className="text-[11px] text-muted-foreground mt-2">{comparison}</div>}
      </div>
    </Card>
  )
}

function PipelineOverview({ stages }: { stages: StageBreakdown[] }) {
  const total = stages.reduce((s, st) => s + st.value, 0)
  const totalCount = stages.reduce((s, st) => s + st.count, 0)
  const activeStages = stages.filter((s) => s.value > 0 || s.count > 0)
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <div>
          <CardTitle>Pipeline overview</CardTitle>
          <p className="text-[11px] text-muted-foreground mt-1 tabular-nums">
            {totalCount} deals · {formatCurrency(total)} total
          </p>
        </div>
        <Link href="/pipeline" className="inline-flex items-center gap-0.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors">
          View pipeline <ChevronRight className="h-3.5 w-3.5" strokeWidth={1.75} />
        </Link>
      </CardHeader>
      <CardContent>
        {total === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-2">
              <Briefcase className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
            </div>
            <p className="text-[13px] font-medium">No pipeline data</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Start adding deals to see breakdown</p>
          </div>
        ) : (
          <>
            <div className="flex h-2.5 w-full rounded-full overflow-hidden bg-muted">
              {activeStages.map((s) => {
                const pct = total > 0 ? (s.value / total) * 100 : 0
                if (pct === 0) return null
                return (
                  <div
                    key={s.stageId}
                    style={{ width: `${pct}%`, background: s.color }}
                    className="transition-all duration-180"
                    title={`${s.stage}: ${formatCurrency(s.value)} (${s.count})`}
                  />
                )
              })}
            </div>
            <ul className="mt-4 grid grid-cols-2 md:grid-cols-3 gap-x-4 gap-y-2.5">
              {stages.map((s) => (
                <li key={s.stageId} className="flex items-center gap-2 min-w-0">
                  <span className="h-2 w-2 rounded-full shrink-0" style={{ background: s.color }} />
                  <span className="text-[12px] font-medium truncate">{s.stage}</span>
                  <span className="text-[11px] text-muted-foreground tabular-nums ml-auto shrink-0">{s.count}</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  )
}

const DATE_RANGES = ["Today", "Week", "Month", "Quarter"] as const

export function DashboardClient({
  userName,
  showLeaderboard,
  stats,
  stageBreakdown,
  upcoming,
  atRisk,
  leaderboard,
  wonByMonth,
}: DashboardClientProps) {
  const [range, setRange] = React.useState<(typeof DATE_RANGES)[number]>("Month")
  const [completedTaskIds, setCompletedTaskIds] = React.useState<Set<string>>(() => new Set())

  // Real series from wonByMonth (no fake fallbacks)
  const wonSeries = wonByMonth.map((m) => m.value)
  const avgSpark = wonByMonth.map((m) => (m.count > 0 ? m.value / m.count : 0))

  // Real trend: compare last vs prior period in wonByMonth
  function computeTrend(series: number[]): { value: number; dir: "up" | "down" } | null {
    if (series.length < 2) return null
    const last = series[series.length - 1]
    const prev = series[series.length - 2]
    if (prev === 0 && last === 0) return null
    if (prev === 0) return { value: 100, dir: "up" }
    const pct = Math.round(((last - prev) / prev) * 100)
    if (pct === 0) return null
    return { value: pct, dir: pct >= 0 ? "up" : "down" }
  }
  const wonTrend = computeTrend(wonSeries)
  const avgTrend = computeTrend(avgSpark)

  return (
    <div className="space-y-6">
      <DailyBriefingCard />

      {/* Greeting hero */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <DashboardGreeting name={userName} workspace="Karat Workspace" />
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center bg-muted/60 rounded-full p-0.5 border border-border/70">
            {DATE_RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  "px-3 py-1 text-[11px] font-medium rounded-full transition-all duration-180",
                  range === r
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {r}
              </button>
            ))}
          </div>
          <Button asChild size="sm" variant="accent">
            <Link href="/deals">
              <Plus className="h-3.5 w-3.5 mr-1.5" strokeWidth={2} /> Quick add
            </Link>
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          icon={TrendingUp}
          iconClass="bg-blue-50 text-blue-600"
          label="Forecast Revenue"
          value={formatCurrency(stats.forecastedRevenue)}
          trendValue={wonTrend?.value}
          trendDirection={wonTrend?.dir}
          spark={wonSeries.length > 1 ? wonSeries : undefined}
          comparison="weighted pipeline"
        />
        <StatCard
          icon={Briefcase}
          iconClass="bg-violet-50 text-violet-600"
          label="Active Pipeline"
          value={formatCurrency(stats.totalPipelineValue)}
          comparison="open deals"
        />
        <StatCard
          icon={Target}
          iconClass="bg-amber-50 text-amber-600"
          label="Win Rate"
          value={`${Math.round(stats.winRate)}%`}
          comparison="closed deals"
        />
        <StatCard
          icon={DollarSign}
          iconClass="bg-emerald-50 text-emerald-600"
          label="Avg Deal Size"
          value={formatCurrency(stats.avgDealSize)}
          trendValue={avgTrend?.value}
          trendDirection={avgTrend?.dir}
          spark={avgSpark.length > 1 ? avgSpark : undefined}
          comparison="won deals"
        />
      </div>

      {/* Two-column main */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Left: 2/3 */}
        <div className="lg:col-span-2 space-y-4">
          <PipelineOverview stages={stageBreakdown} />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle>Recent activity</CardTitle>
              <Trophy className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
            </CardHeader>
            <CardContent>
              <ActivityFeed limit={8} />
            </CardContent>
          </Card>
        </div>

        {/* Right: 1/3 */}
        <div className="space-y-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle>Today&apos;s tasks</CardTitle>
              <CalendarClock className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
            </CardHeader>
            <CardContent>
              {upcoming.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-center">
                  <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-2">
                    <CheckCircle2 className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
                  </div>
                  <p className="text-[13px] font-medium">All caught up</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">No upcoming tasks</p>
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {upcoming.slice(0, 6).map((a) => {
                    const done = completedTaskIds.has(a.id)
                    return (
                      <li key={a.id} className="flex items-start gap-2.5 group">
                        <button
                          onClick={() => {
                            setCompletedTaskIds((s) => {
                              const n = new Set(s)
                              if (n.has(a.id)) n.delete(a.id)
                              else n.add(a.id)
                              return n
                            })
                          }}
                          className={cn(
                            "mt-0.5 h-4 w-4 rounded-full border-[1.5px] flex items-center justify-center shrink-0 transition-all duration-180",
                            done ? "bg-accent border-accent" : "border-border hover:border-accent/60"
                          )}
                          aria-label={done ? "Mark incomplete" : "Mark complete"}
                        >
                          {done && <CheckCircle2 className="h-3 w-3 text-accent-foreground" strokeWidth={2.5} />}
                        </button>
                        <div className="flex-1 min-w-0">
                          <div className={cn(
                            "text-[13px] font-medium truncate leading-snug",
                            done && "line-through text-muted-foreground"
                          )}>{a.subject}</div>
                          {a.deal && (
                            <Link
                              href={`/deals/${a.deal.id}`}
                              className="text-[11px] text-muted-foreground hover:text-accent-strong transition-colors truncate block mt-0.5"
                            >
                              {a.deal.title}
                            </Link>
                          )}
                        </div>
                        {a.dueAt && (
                          <Badge variant="outline" className="shrink-0 text-[10px] tabular-nums px-1.5">
                            {formatDate(a.dueAt)}
                          </Badge>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </CardContent>
          </Card>

          <StalledDealsCard fallback={atRisk} />

          <SlippageCard />

        </div>
      </div>

      {/* Bottom row */}
      <div className={cn("grid gap-4", showLeaderboard ? "grid-cols-1 lg:grid-cols-2" : "grid-cols-1")}>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-3">
            <div>
              <CardTitle>Won this month</CardTitle>
              <p className="text-[20px] font-medium tabular-nums tracking-[-0.025em] mt-2 leading-none">
                {formatCurrency(stats.revenueThisMonth)}
              </p>
            </div>
            <DollarSign className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
          </CardHeader>
          <CardContent>
            <div className="h-[160px] -mx-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={wonByMonth} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    tickFormatter={(v: string) => v.split(" ")[0]}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                    tickFormatter={(v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v))}
                  />
                  <RTooltip
                    cursor={{ fill: "hsl(var(--muted))", opacity: 0.5 }}
                    contentStyle={{
                      background: "hsl(var(--popover))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                    formatter={(value: number) => [formatCurrency(value), "Won"]}
                  />
                  <Bar dataKey="value" fill="hsl(var(--accent))" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {showLeaderboard && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-3">
              <CardTitle>Team leaderboard</CardTitle>
              <Trophy className="h-4 w-4 text-muted-foreground" strokeWidth={1.75} />
            </CardHeader>
            <CardContent>
              {leaderboard.length === 0 ? (
                <p className="text-[12px] text-muted-foreground py-6 text-center">No team data yet</p>
              ) : (
                <ul className="space-y-2">
                  {leaderboard.slice(0, 5).map((m, idx) => (
                    <li key={m.userId} className="flex items-center gap-2.5">
                      <span className="w-5 text-[11px] font-semibold tabular-nums text-muted-foreground text-center">
                        {idx + 1}
                      </span>
                      <Avatar className="h-7 w-7">
                        <AvatarFallback
                          className="text-white text-[10px]"
                          style={{ backgroundColor: avatarColor(m.name) }}
                        >
                          {getInitials(m.name)}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1 min-w-0">
                        <div className="text-[13px] font-medium truncate leading-tight">{m.name}</div>
                        <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                          {m.wonCount} won · {formatCurrency(m.pipelineValue)} pipeline
                        </div>
                      </div>
                      <div className="text-[13px] font-semibold tabular-nums tracking-tight">
                        {formatCurrency(m.wonValue)}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

interface StalledItem {
  dealId: string
  dealTitle: string
  value: number
  daysStuck: number
  stage: string
  contactName: string
  insight: string
  action: string
}

function StalledDealsCard({ fallback }: { fallback: AtRiskDeal[] }) {
  const q = useQuery<{ items: StalledItem[] }>({
    queryKey: ["ai-stalled-deals"],
    queryFn: async () => {
      const r = await fetch("/api/ai/stalled-deals")
      if (!r.ok) throw new Error("Failed")
      return r.json()
    },
    refetchOnWindowFocus: false,
  })

  const items = q.data?.items ?? []

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-1.5">
          Stalled deals
          <Sparkles className="h-3.5 w-3.5 text-violet-500" />
        </CardTitle>
        <button
          onClick={() => q.refetch()}
          disabled={q.isFetching}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", q.isFetching && "animate-spin")} strokeWidth={1.75} />
        </button>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-16 w-full" />
          </div>
        ) : items.length === 0 && fallback.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-2">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
            </div>
            <p className="text-[13px] font-medium">No stalled deals</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Pipeline is moving</p>
          </div>
        ) : items.length === 0 ? (
          // fallback: simpler list
          <ul className="space-y-1">
            {fallback.slice(0, 5).map((d) => (
              <li key={d.id}>
                <Link href={`/deals/${d.id}`} className="flex items-center gap-2.5 hover:bg-muted/60 rounded-md p-2 -mx-2 transition-colors">
                  <Avatar className="h-7 w-7">
                    <AvatarFallback className="text-white text-[10px]" style={{ backgroundColor: avatarColor(d.contact.name) }}>
                      {getInitials(d.contact.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-[13px] font-medium truncate">{d.title}</div>
                    <div className="text-[11px] text-muted-foreground truncate tabular-nums mt-0.5">
                      {formatCurrency(d.value)} · {d.stage}
                    </div>
                  </div>
                  <WinProbabilityBadge probability={d.probability} />
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="space-y-2">
            {items.slice(0, 5).map((d) => (
              <li key={d.dealId} className="rounded-md border bg-card p-2.5 hover:border-violet-200 transition-colors">
                <Link href={`/deals/${d.dealId}`} className="block">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[13px] font-medium truncate flex-1">{d.dealTitle}</span>
                    <span className="text-[10px] text-rose-600 font-medium tabular-nums shrink-0">{d.daysStuck}d stuck</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                    {formatCurrency(d.value)} · {d.contactName}
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug line-clamp-2">
                    <Sparkles className="inline h-2.5 w-2.5 mr-1 text-violet-500" />
                    {d.insight}
                  </p>
                  <div className="mt-1.5">
                    <span className="inline-block text-[10px] bg-violet-50 text-violet-700 border border-violet-200 rounded-full px-2 py-0.5 font-medium">
                      → {d.action}
                    </span>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

interface SlippageFactor { key: string; label: string; weight: number }
interface SlippageDeal {
  dealId: string
  dealTitle: string
  value: number
  stage: string
  probability: number
  contactName: string | null
  ownerName: string | null
  slipScore: number
  daysOff: number | null
  factors: SlippageFactor[]
  explanation?: string
}

function SlippageCard() {
  const q = useQuery<{ deals: SlippageDeal[] }>({
    queryKey: ["ai-slippage"],
    queryFn: async () => {
      const r = await fetch("/api/ai/slippage")
      if (!r.ok) throw new Error("Failed")
      return r.json()
    },
    refetchOnWindowFocus: false,
  })

  const items = (q.data?.deals ?? []).filter((d) => d.slipScore >= 50).slice(0, 5)

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-3">
        <CardTitle className="flex items-center gap-1.5">
          Deals likely to slip
          <Sparkles className="h-3.5 w-3.5 text-amber-500" />
        </CardTitle>
        <button
          onClick={() => q.refetch()}
          disabled={q.isFetching}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Refresh"
        >
          <RefreshCw className={cn("h-3.5 w-3.5", q.isFetching && "animate-spin")} strokeWidth={1.75} />
        </button>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="space-y-2">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-20 w-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-2">
              <CheckCircle2 className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
            </div>
            <p className="text-[13px] font-medium">No deals at risk</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Forecast looks solid</p>
          </div>
        ) : (
          <ul className="space-y-2">
            {items.map((d) => {
              const tone = d.slipScore >= 75 ? "bg-rose-50 text-rose-700 border-rose-200" : "bg-amber-50 text-amber-700 border-amber-200"
              return (
                <li key={d.dealId} className="rounded-md border bg-card p-2.5 hover:border-amber-200 transition-colors">
                  <Link href={`/deals/${d.dealId}`} className="block">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[13px] font-medium truncate flex-1">{d.dealTitle}</span>
                      <span className={cn("text-[10px] border rounded-full px-1.5 py-0.5 font-medium tabular-nums shrink-0", tone)}>
                        {d.slipScore}/100
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground tabular-nums mt-0.5">
                      {formatCurrency(d.value)} · {d.stage}{d.contactName ? ` · ${d.contactName}` : ""}
                    </div>
                    {d.factors.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {d.factors.slice(0, 3).map((f) => (
                          <span key={f.key} className="text-[10px] bg-muted text-muted-foreground rounded-full px-1.5 py-0.5">
                            {f.label}
                          </span>
                        ))}
                      </div>
                    )}
                    {d.explanation && (
                      <p className="text-[11px] text-muted-foreground mt-1.5 leading-snug line-clamp-2">
                        <Sparkles className="inline h-2.5 w-2.5 mr-1 text-amber-500" />
                        {d.explanation}
                      </p>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

interface BriefingAction { label: string; link: string }
interface BriefingStats { todayFollowUps: number; overdue: number; hotLeads: number; atRisk: number; recentWins: number }
interface BriefingResult { briefing: string; actions: BriefingAction[]; stats: BriefingStats }

function DailyBriefingCard() {
  const q = useQuery<BriefingResult>({
    queryKey: ["ai-briefing"],
    queryFn: async () => {
      const r = await fetch("/api/ai/briefing")
      if (!r.ok) throw new Error("Failed")
      return r.json()
    },
    refetchOnWindowFocus: false,
  })

  async function refresh() {
    await fetch("/api/ai/briefing?refresh=1")
    q.refetch()
  }

  if (q.isLoading) {
    return (
      <Card className="border-violet-200/60 bg-gradient-to-r from-violet-50/50 to-blue-50/30">
        <CardContent className="p-5 space-y-2">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-3/4" />
        </CardContent>
      </Card>
    )
  }
  if (!q.data) return null

  return (
    <Card className="border-violet-200/60 bg-gradient-to-r from-violet-50/50 to-blue-50/30">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-2.5">
          <div className="inline-flex items-center gap-1.5 text-[11px] uppercase tracking-wider font-medium text-violet-700">
            <Sparkles className="h-3 w-3" /> Daily Briefing
          </div>
          <button
            onClick={refresh}
            disabled={q.isFetching}
            className="text-muted-foreground hover:text-foreground"
            aria-label="Refresh"
          >
            <RefreshCw className={cn("h-3.5 w-3.5", q.isFetching && "animate-spin")} />
          </button>
        </div>
        <p className="text-[13px] leading-relaxed text-foreground">{q.data.briefing}</p>
        {q.data.actions.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {q.data.actions.map((a, i) => (
              <Link
                key={i}
                href={a.link}
                className="inline-flex items-center gap-1 text-[11px] bg-white/70 border border-violet-200 text-violet-700 rounded-full px-2.5 py-1 hover:bg-violet-100 transition-colors font-medium"
              >
                {a.label}
                <ChevronRight className="h-3 w-3" />
              </Link>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
