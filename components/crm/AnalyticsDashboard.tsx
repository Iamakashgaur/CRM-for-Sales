"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ReTooltip,
  XAxis,
  YAxis,
} from "recharts"
import {
  TrendingUp,
  DollarSign,
  Briefcase,
  Target,
  Award,
  PieChart as PieIcon,
  Activity as ActivityIcon,
} from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Skeleton } from "@/components/ui/skeleton"
import { formatCurrency, getInitials, avatarColor, cn } from "@/lib/utils"
import type { AnalyticsData } from "@/types"

const CHART_COLORS = [
  "#6366f1",
  "#10b981",
  "#f59e0b",
  "#ef4444",
  "#8b5cf6",
  "#06b6d4",
  "#ec4899",
  "#f97316",
]

const STAGE_COLORS: Record<string, string> = {
  Prospect: "#64748b",
  Qualified: "#3b82f6",
  Proposal: "#8b5cf6",
  Negotiation: "#f59e0b",
  "Closed Won": "#10b981",
  "Closed Lost": "#ef4444",
}

const ACTIVITY_COLORS: Record<string, string> = {
  CALL: "#6366f1",
  EMAIL: "#06b6d4",
  MEETING: "#8b5cf6",
  NOTE: "#f59e0b",
  TASK: "#10b981",
}

type AccentTone = "blue" | "violet" | "emerald" | "amber" | "rose"

const ACCENT_TONES: Record<AccentTone, { icon: string; bg: string; ring: string }> = {
  blue: { icon: "text-blue-600", bg: "bg-blue-50", ring: "ring-blue-100" },
  violet: { icon: "text-violet-600", bg: "bg-violet-50", ring: "ring-violet-100" },
  emerald: { icon: "text-emerald-600", bg: "bg-emerald-50", ring: "ring-emerald-100" },
  amber: { icon: "text-amber-600", bg: "bg-amber-50", ring: "ring-amber-100" },
  rose: { icon: "text-rose-600", bg: "bg-rose-50", ring: "ring-rose-100" },
}

interface StatProps {
  icon: React.ComponentType<{ className?: string }>
  label: string
  value: string
  hint?: string
  tone: AccentTone
}

function Stat({ icon: Icon, label, value, hint, tone }: StatProps) {
  const t = ACCENT_TONES[tone]
  return (
    <div className="p-5 rounded-xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md">
      <div
        className={cn(
          "h-12 w-12 rounded-full flex items-center justify-center ring-1",
          t.bg,
          t.ring,
        )}
      >
        <Icon className={cn("h-5 w-5", t.icon)} />
      </div>
      <div className="mt-3 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tabular-nums tracking-tight">{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </div>
  )
}

interface ChartCardProps {
  icon: React.ComponentType<{ className?: string }>
  title: string
  children: React.ReactNode
  className?: string
}

function ChartCard({ icon: Icon, title, children, className }: ChartCardProps) {
  return (
    <div className={cn("p-6 rounded-xl border border-border bg-card shadow-sm", className)}>
      <div className="flex items-center gap-2 mb-6">
        <div className="h-8 w-8 rounded-md bg-muted flex items-center justify-center">
          <Icon className="h-4 w-4 text-muted-foreground" />
        </div>
        <div className="text-sm font-semibold">{title}</div>
      </div>
      {children}
    </div>
  )
}

const tooltipStyle: React.CSSProperties = {
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--popover))",
  fontSize: 12,
}

const axisTick = { fontSize: 12, fill: "hsl(var(--muted-foreground))" }

interface RankStyle {
  bg: string
  text: string
}

function rankStyle(index: number): RankStyle {
  if (index === 0) return { bg: "bg-amber-100", text: "text-amber-700" }
  if (index === 1) return { bg: "bg-slate-100", text: "text-slate-700" }
  if (index === 2) return { bg: "bg-orange-100", text: "text-orange-700" }
  return { bg: "bg-muted", text: "text-muted-foreground" }
}

export function AnalyticsDashboard() {
  const q = useQuery<AnalyticsData>({
    queryKey: ["analytics"],
    queryFn: async () => {
      const res = await fetch("/api/analytics")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  if (q.isLoading || !q.data) {
    return (
      <div className="space-y-6">
        <div>
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-72 mt-2" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-32 rounded-xl" />
          ))}
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
          <Skeleton className="h-80 rounded-xl" />
        </div>
      </div>
    )
  }
  const d = q.data

  const totalPipelineCount = d.stageBreakdown.reduce((sum, s) => sum + s.count, 0)

  return (
    <div className="space-y-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Pipeline performance, revenue trends, and team leaderboard.
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Stat
          icon={TrendingUp}
          label="Forecast"
          value={formatCurrency(d.forecastedRevenue)}
          tone="blue"
        />
        <Stat
          icon={Briefcase}
          label="Pipeline value"
          value={formatCurrency(d.totalPipelineValue)}
          tone="violet"
        />
        <Stat
          icon={DollarSign}
          label="Won this month"
          value={formatCurrency(d.revenueThisMonth)}
          hint={`${d.wonThisMonth} ${d.wonThisMonth === 1 ? "deal" : "deals"}`}
          tone="emerald"
        />
        <Stat
          icon={Target}
          label="Win rate"
          value={`${Math.round(d.winRate)}%`}
          tone="amber"
        />
        <Stat
          icon={Award}
          label="Avg deal size"
          value={formatCurrency(d.avgDealSize)}
          tone="rose"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <ChartCard icon={TrendingUp} title="Won by month">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={d.wonByMonth} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="month" tick={axisTick} axisLine={false} tickLine={false} />
                <YAxis
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  tickFormatter={(v: number) => `$${Math.round(v / 1000)}k`}
                />
                <ReTooltip
                  formatter={(v: number) => formatCurrency(v)}
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                />
                <Bar dataKey="value" fill="#6366f1" radius={[6, 6, 0, 0]} barSize={28} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard icon={PieIcon} title="Pipeline by stage">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
            <div className="relative h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={d.stageBreakdown}
                    dataKey="value"
                    nameKey="stage"
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={90}
                    paddingAngle={2}
                    stroke="hsl(var(--background))"
                    strokeWidth={2}
                  >
                    {d.stageBreakdown.map((s, i) => (
                      <Cell
                        key={s.stageId ?? i}
                        fill={STAGE_COLORS[s.stage] ?? s.color ?? CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <ReTooltip
                    formatter={(v: number) => formatCurrency(v)}
                    contentStyle={tooltipStyle}
                  />
                </PieChart>
              </ResponsiveContainer>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                <div className="text-2xl font-semibold tabular-nums tracking-tight">
                  {totalPipelineCount}
                </div>
                <div className="text-xs text-muted-foreground">deals</div>
              </div>
            </div>
            <ul className="space-y-2">
              {d.stageBreakdown.map((s, i) => {
                const color =
                  STAGE_COLORS[s.stage] ?? s.color ?? CHART_COLORS[i % CHART_COLORS.length]
                return (
                  <li
                    key={s.stageId ?? i}
                    className="flex items-center gap-2.5 text-sm"
                  >
                    <span
                      className="h-2.5 w-2.5 rounded-full shrink-0"
                      style={{ background: color }}
                    />
                    <span className="flex-1 truncate text-foreground">{s.stage}</span>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {s.count}
                    </span>
                  </li>
                )
              })}
              {d.stageBreakdown.length === 0 && (
                <li className="text-sm text-muted-foreground">No pipeline data</li>
              )}
            </ul>
          </div>
        </ChartCard>

        <ChartCard icon={ActivityIcon} title="Activity breakdown">
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={d.activityBreakdown}
                layout="vertical"
                margin={{ top: 4, right: 32, left: 8, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  stroke="hsl(var(--border))"
                  horizontal={false}
                />
                <XAxis type="number" tick={axisTick} axisLine={false} tickLine={false} hide />
                <YAxis
                  dataKey="type"
                  type="category"
                  tick={axisTick}
                  axisLine={false}
                  tickLine={false}
                  width={80}
                />
                <ReTooltip
                  contentStyle={tooltipStyle}
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                />
                <Bar dataKey="count" radius={[0, 6, 6, 0]} barSize={18}>
                  {d.activityBreakdown.map((entry, i) => (
                    <Cell
                      key={entry.type ?? i}
                      fill={ACTIVITY_COLORS[entry.type] ?? CHART_COLORS[i % CHART_COLORS.length]}
                    />
                  ))}
                  <LabelList
                    dataKey="count"
                    position="right"
                    style={{
                      fontSize: 12,
                      fill: "hsl(var(--muted-foreground))",
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </ChartCard>

        <ChartCard icon={Award} title="Leaderboard">
          <ul className="space-y-1">
            {d.leaderboard.map((u, i) => {
              const r = rankStyle(i)
              return (
                <li
                  key={u.userId}
                  className="flex items-center gap-4 p-3 rounded-lg hover:bg-muted/40 transition-colors"
                >
                  <div
                    className={cn(
                      "h-8 w-8 rounded-full flex items-center justify-center text-sm font-bold shrink-0",
                      r.bg,
                      r.text,
                    )}
                  >
                    {i + 1}
                  </div>
                  <Avatar className="h-9 w-9">
                    <AvatarFallback
                      className={cn("text-white text-xs", avatarColor(u.name))}
                    >
                      {getInitials(u.name)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium truncate">{u.name}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {u.wonCount} won &middot; {formatCurrency(u.pipelineValue)} pipeline
                    </div>
                  </div>
                  <div className="text-base font-semibold tabular-nums">
                    {formatCurrency(u.wonValue)}
                  </div>
                </li>
              )
            })}
            {d.leaderboard.length === 0 && (
              <li className="text-sm text-muted-foreground text-center py-6">No data</li>
            )}
          </ul>
        </ChartCard>
      </div>
    </div>
  )
}
