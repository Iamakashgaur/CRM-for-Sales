"use client"

import { Badge } from "@/components/ui/badge"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

interface Props {
  probability: number
  reasoning?: string | null
  className?: string
}

export function WinProbabilityBadge({ probability, reasoning, className }: Props) {
  const color =
    probability >= 75
      ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30"
      : probability >= 40
      ? "bg-amber-500/15 text-amber-400 border-amber-500/30"
      : "bg-red-500/15 text-red-400 border-red-500/30"

  const badge = (
    <Badge variant="outline" className={cn("font-mono", color, className)}>
      {probability}%
    </Badge>
  )
  if (!reasoning) return badge
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span>{badge}</span>
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">
        <div className="text-xs">{reasoning}</div>
      </TooltipContent>
    </Tooltip>
  )
}
