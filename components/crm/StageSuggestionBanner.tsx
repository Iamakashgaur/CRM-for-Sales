"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { Sparkles, X, ArrowRight, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"

interface PendingSuggestion {
  suggestedStageId: string
  suggestedStageName: string
  reasoning: string
  triggerActivityId?: string | null
  triggerSubject?: string | null
  status: "pending" | "accepted" | "dismissed"
  _generatedAt: string
}

interface BannerProps {
  dealId: string
  currentStageId: string
}

export function StageSuggestionBanner({ dealId, currentStageId }: BannerProps) {
  const router = useRouter()
  const qc = useQueryClient()

  const q = useQuery<{ suggestion: PendingSuggestion | null }>({
    queryKey: ["stage-suggestion", dealId],
    queryFn: async () => {
      const res = await fetch(`/api/ai/stage-suggest?dealId=${encodeURIComponent(dealId)}`)
      if (!res.ok) return { suggestion: null }
      return res.json()
    },
    refetchInterval: 30_000,
  })

  const actMut = useMutation({
    mutationFn: async (action: "accept" | "dismiss") => {
      const res = await fetch("/api/ai/stage-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, action }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed")
      return res.json() as Promise<{ ok: true; applied: boolean; stageName?: string }>
    },
    onSuccess: (data, action) => {
      if (action === "accept") {
        toast.success(`Moved to ${data.stageName}`)
      } else {
        toast.success("Suggestion dismissed")
      }
      qc.invalidateQueries({ queryKey: ["stage-suggestion", dealId] })
      qc.invalidateQueries({ queryKey: ["deals"] })
      router.refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const suggestion = q.data?.suggestion
  if (!suggestion) return null
  if (suggestion.suggestedStageId === currentStageId) return null

  return (
    <div className="rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 flex items-start gap-3">
      <Sparkles className="h-4 w-4 text-violet-600 mt-0.5 shrink-0" />
      <div className="flex-1 min-w-0 text-sm">
        <div className="text-violet-900">
          AI suggests moving to{" "}
          <span className="font-semibold">{suggestion.suggestedStageName}</span>
          {suggestion.triggerSubject && (
            <>
              {" "}based on activity{" "}
              <span className="italic">&ldquo;{suggestion.triggerSubject}&rdquo;</span>
            </>
          )}
          .
        </div>
        {suggestion.reasoning && (
          <div className="text-xs text-violet-700 mt-0.5">{suggestion.reasoning}</div>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <Button
          size="sm"
          onClick={() => actMut.mutate("accept")}
          disabled={actMut.isPending}
          className="bg-violet-600 hover:bg-violet-700 text-white"
        >
          {actMut.isPending && actMut.variables === "accept" ? (
            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
          ) : (
            <ArrowRight className="h-3.5 w-3.5 mr-1.5" />
          )}
          Apply
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => actMut.mutate("dismiss")}
          disabled={actMut.isPending}
          className="text-violet-700 hover:bg-violet-100"
        >
          <X className="h-3.5 w-3.5 mr-1" /> Dismiss
        </Button>
      </div>
    </div>
  )
}
