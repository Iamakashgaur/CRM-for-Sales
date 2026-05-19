"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { toast } from "sonner"
import { FileText, Printer, Copy, Sparkles, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { formatCurrency } from "@/lib/utils"

interface MonthlyNarrativeResult {
  month: string
  narrative: string
  sections: { wins: string; losses: string; outlook: string }
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

function lastCompletedMonth(): string {
  const d = new Date()
  d.setDate(1)
  d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
}

export function ReportsClient() {
  const [month, setMonth] = React.useState(lastCompletedMonth())
  const [submitted, setSubmitted] = React.useState(lastCompletedMonth())

  const q = useQuery<MonthlyNarrativeResult>({
    queryKey: ["monthly-narrative", submitted],
    queryFn: async () => {
      const res = await fetch(`/api/ai/monthly-narrative?month=${submitted}`)
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed")
      return data as MonthlyNarrativeResult
    },
  })

  function handleGenerate() {
    setSubmitted(month)
  }

  function handlePrint() {
    window.print()
  }

  async function handleCopy() {
    if (!q.data) return
    const text = `Monthly Report — ${q.data.month}

${q.data.narrative}

Wins: ${q.data.sections.wins}
Losses: ${q.data.sections.losses}
Outlook: ${q.data.sections.outlook}

Metrics:
- Revenue won: ${formatCurrency(q.data.metrics.revenueWon)}
- Deals won: ${q.data.metrics.dealsWonCount}
- Deals lost: ${q.data.metrics.dealsLostCount}
- Win rate: ${q.data.metrics.winRate.toFixed(1)}%
- Pipeline at month-end: ${formatCurrency(q.data.metrics.pipelineEndValue)}
- Avg deal size: ${formatCurrency(q.data.metrics.avgDealSize)}`
    await navigator.clipboard.writeText(text)
    toast.success("Report copied to clipboard")
  }

  return (
    <div className="space-y-6 print:bg-white">
      <div className="flex items-center justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Reports</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">AI-generated executive narrative for monthly performance</p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1.5">
            <Label className="text-xs">Month</Label>
            <Input
              type="month"
              value={month}
              onChange={(e) => setMonth(e.target.value)}
              className="w-44 h-9 text-sm"
            />
          </div>
          <Button size="sm" onClick={handleGenerate} disabled={q.isLoading || q.isFetching || month === submitted}>
            <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Generate
          </Button>
          <Button size="sm" variant="outline" onClick={handlePrint} disabled={!q.data}>
            <Printer className="h-3.5 w-3.5 mr-1.5" /> Print
          </Button>
          <Button size="sm" variant="outline" onClick={handleCopy} disabled={!q.data}>
            <Copy className="h-3.5 w-3.5 mr-1.5" /> Copy
          </Button>
        </div>
      </div>

      {q.isLoading || q.isFetching ? (
        <div className="space-y-4">
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-48 w-full" />
          <div className="grid grid-cols-3 gap-4">
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
            <Skeleton className="h-32" />
          </div>
        </div>
      ) : q.error ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-destructive">
            {(q.error as Error).message}
          </CardContent>
        </Card>
      ) : q.data ? (
        <div className="space-y-6 print:space-y-4">
          {/* Header for print */}
          <div className="hidden print:block">
            <h1 className="text-2xl font-bold">Monthly Sales Report — {q.data.month}</h1>
            <p className="text-sm text-muted-foreground">Generated {new Date(q.data.generatedAt).toLocaleString()}</p>
          </div>

          {/* Key metrics */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Metric label="Revenue won" value={formatCurrency(q.data.metrics.revenueWon)} />
            <Metric label="Deals won" value={q.data.metrics.dealsWonCount.toString()} />
            <Metric label="Deals lost" value={q.data.metrics.dealsLostCount.toString()} />
            <Metric label="Win rate" value={`${q.data.metrics.winRate.toFixed(1)}%`} />
            <Metric label="Pipeline" value={formatCurrency(q.data.metrics.pipelineEndValue)} />
            <Metric label="Avg deal" value={formatCurrency(q.data.metrics.avgDealSize)} />
          </div>

          {/* Narrative */}
          <Card>
            <CardHeader className="flex flex-row items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2"><FileText className="h-5 w-5 text-violet-500" /> Executive Narrative</CardTitle>
                <CardDescription>{q.data.month}</CardDescription>
              </div>
              {q.data.cached && <Badge variant="outline" className="text-[10px]">Cached</Badge>}
            </CardHeader>
            <CardContent>
              <div className="prose prose-sm max-w-none whitespace-pre-wrap leading-relaxed text-sm">
                {q.data.narrative}
              </div>
            </CardContent>
          </Card>

          {/* Sections */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <SectionCard title="Wins" tone="emerald" body={q.data.sections.wins} />
            <SectionCard title="Losses" tone="rose" body={q.data.sections.losses} />
            <SectionCard title="Outlook" tone="violet" body={q.data.sections.outlook} />
          </div>

          {/* Tables */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Top performers</CardTitle>
              </CardHeader>
              <CardContent>
                {q.data.topPerformers.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No wins in this period.</p>
                ) : (
                  <ul className="space-y-2">
                    {q.data.topPerformers.map((p, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex items-center gap-2">
                          <span className="text-xs text-muted-foreground tabular-nums w-5">{i + 1}.</span>
                          <span className="font-medium">{p.name}</span>
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums">
                          {formatCurrency(p.wonValue)} ({p.wonCount} won)
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle className="text-sm">Top loss reasons</CardTitle>
              </CardHeader>
              <CardContent>
                {q.data.topLossReasons.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No lost deals in this period.</p>
                ) : (
                  <ul className="space-y-2">
                    {q.data.topLossReasons.map((r, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 text-sm">
                        <span className="truncate">{r.reason}</span>
                        <Badge variant="outline" className="text-[10px] tabular-nums shrink-0">{r.count}</Badge>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      ) : null}

      <style jsx global>{`
        @media print {
          aside, header, nav, [data-cmdk-root], .print\\:hidden { display: none !important; }
          body { background: #fff !important; }
          main { overflow: visible !important; }
        }
      `}</style>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold tabular-nums tracking-tight mt-1">{value}</div>
    </div>
  )
}

function SectionCard({ title, tone, body }: { title: string; tone: "emerald" | "rose" | "violet"; body: string }) {
  const toneClass =
    tone === "emerald" ? "border-emerald-200 bg-emerald-50/40"
    : tone === "rose" ? "border-rose-200 bg-rose-50/40"
    : "border-violet-200 bg-violet-50/40"
  const titleColor =
    tone === "emerald" ? "text-emerald-800"
    : tone === "rose" ? "text-rose-800"
    : "text-violet-800"
  return (
    <Card className={toneClass}>
      <CardHeader className="pb-2">
        <CardTitle className={`text-sm ${titleColor}`}>{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{body || "—"}</p>
      </CardContent>
    </Card>
  )
}
