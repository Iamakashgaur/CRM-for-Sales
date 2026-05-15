"use client"

import * as React from "react"
import { useMutation } from "@tanstack/react-query"
import { Sparkles, RefreshCw, Mail, AlertTriangle, TrendingUp, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Badge } from "@/components/ui/badge"
import { EmailComposer } from "./EmailComposer"
import { toast } from "sonner"

interface ScoreResult {
  score: number
  confidence: "low" | "medium" | "high"
  reasoning: string
  risks: string[]
  opportunities: string[]
}
interface SuggestionResult {
  actions: Array<{ title: string; description: string; priority: "low" | "medium" | "high"; type: string }>
}

export function AIAssistantPanel({ dealId }: { dealId: string }) {
  const [score, setScore] = React.useState<ScoreResult | null>(null)
  const [suggestions, setSuggestions] = React.useState<SuggestionResult | null>(null)
  const [composeOpen, setComposeOpen] = React.useState(false)

  const scoreM = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ai/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId }),
      })
      if (!res.ok) throw new Error("Score failed")
      return res.json() as Promise<ScoreResult>
    },
    onSuccess: (d) => setScore(d),
    onError: (e: Error) => toast.error(e.message),
  })

  const suggestM = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ai/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId }),
      })
      if (!res.ok) throw new Error("Suggest failed")
      return res.json() as Promise<SuggestionResult>
    },
    onSuccess: (d) => setSuggestions(d),
    onError: (e: Error) => toast.error(e.message),
  })

  React.useEffect(() => {
    scoreM.mutate()
    suggestM.mutate()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dealId])

  function refresh() {
    scoreM.mutate()
    suggestM.mutate()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" /> AI Assistant
        </h3>
        <Button size="sm" variant="ghost" onClick={refresh} disabled={scoreM.isPending || suggestM.isPending}>
          <RefreshCw className={`h-3.5 w-3.5 ${scoreM.isPending ? "animate-spin" : ""}`} />
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Deal Score</CardTitle>
        </CardHeader>
        <CardContent>
          {scoreM.isPending && !score ? (
            <Skeleton className="h-24 w-full" />
          ) : score ? (
            <div className="space-y-3">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold">{score.score}</span>
                <span className="text-sm text-muted-foreground">/100</span>
                <Badge variant="outline" className="ml-auto capitalize text-xs">
                  {score.confidence} confidence
                </Badge>
              </div>
              <Progress value={score.score} />
              <p className="text-xs text-muted-foreground">{score.reasoning}</p>
              {score.risks.length > 0 && (
                <div>
                  <div className="text-xs font-medium mb-1 flex items-center gap-1">
                    <AlertTriangle className="h-3 w-3 text-amber-400" /> Risks
                  </div>
                  <ul className="text-xs space-y-0.5 list-disc list-inside text-muted-foreground">
                    {score.risks.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
              {score.opportunities.length > 0 && (
                <div>
                  <div className="text-xs font-medium mb-1 flex items-center gap-1">
                    <TrendingUp className="h-3 w-3 text-emerald-400" /> Opportunities
                  </div>
                  <ul className="text-xs space-y-0.5 list-disc list-inside text-muted-foreground">
                    {score.opportunities.map((r, i) => <li key={i}>{r}</li>)}
                  </ul>
                </div>
              )}
            </div>
          ) : (
            <div className="text-sm text-muted-foreground">No score available</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Suggested actions</CardTitle>
        </CardHeader>
        <CardContent>
          {suggestM.isPending && !suggestions ? (
            <Skeleton className="h-24 w-full" />
          ) : suggestions ? (
            <ul className="space-y-2">
              {suggestions.actions.map((a, i) => (
                <li key={i} className="rounded-md border p-2 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{a.title}</span>
                    <Badge
                      variant={a.priority === "high" ? "destructive" : a.priority === "medium" ? "warning" : "secondary"}
                      className="text-[10px]"
                    >
                      {a.priority}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{a.description}</p>
                </li>
              ))}
            </ul>
          ) : (
            <div className="text-sm text-muted-foreground">No suggestions</div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Email</CardTitle>
        </CardHeader>
        <CardContent>
          <Button className="w-full" variant="secondary" onClick={() => setComposeOpen(true)}>
            <Mail className="h-4 w-4 mr-2" /> Draft email
          </Button>
        </CardContent>
      </Card>

      <EmailComposer open={composeOpen} onOpenChange={setComposeOpen} dealId={dealId} />
    </div>
  )
}
