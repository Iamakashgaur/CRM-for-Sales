"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { WinProbabilityBadge } from "./WinProbabilityBadge"
import { formatCurrency, getInitials, avatarColor, cn, daysBetween } from "@/lib/utils"

export interface DealCardData {
  id: string
  title: string
  value: number
  currency: string
  probability: number
  updatedAt: string | Date
  stageEnteredAt: string | Date
  actualCloseDate?: string | null
  contact?: { id: string; name: string; company: string | null } | null
  owner?: { id: string; name: string; avatar: string | null } | null
}

interface Props {
  deal: DealCardData
}

function ageColor(days: number): string {
  if (days <= 7) return "bg-emerald-400"
  if (days <= 14) return "bg-amber-400"
  if (days <= 30) return "bg-orange-400"
  return "bg-rose-400"
}

export function DealCard({ deal }: Props) {
  const router = useRouter()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deal.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const days = daysBetween(deal.stageEnteredAt)
  const contactName = deal.contact?.name ?? "—"
  const ownerName = deal.owner?.name ?? ""

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      onClick={(e) => {
        if (isDragging) return
        e.stopPropagation()
        router.push(`/deals/${deal.id}`)
      }}
      className={cn(
        "group relative cursor-grab active:cursor-grabbing rounded-lg border border-border/80 bg-card p-3 shadow-xs hover:shadow-elevated hover:-translate-y-px hover:border-accent/40 transition-all duration-180 ease-out-soft",
        isDragging && "scale-[1.02] shadow-elevated"
      )}
    >
      {/* Age indicator bar */}
      <div className="absolute top-0 left-3 right-3 h-[2px] rounded-b-full overflow-hidden flex">
        <div className={cn("h-full transition-colors", ageColor(days))} style={{ width: `${Math.min(100, (days / 30) * 100)}%` }} />
      </div>

      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-[13px] leading-snug line-clamp-2 tracking-tight">{deal.title}</div>
        <WinProbabilityBadge probability={deal.probability} className="shrink-0" />
      </div>
      <div className="mt-1.5 text-[16px] font-semibold tabular-nums tracking-tight">
        {formatCurrency(deal.value, deal.currency)}
      </div>
      <div className="mt-2.5 flex items-center justify-between gap-2 text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          {deal.contact && (
            <Avatar className="h-5 w-5 shrink-0">
              <AvatarFallback className="text-white text-[9px]" style={{ backgroundColor: avatarColor(contactName) }}>
                {getInitials(contactName)}
              </AvatarFallback>
            </Avatar>
          )}
          <span className="truncate text-muted-foreground text-[11px]">{contactName}</span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-muted-foreground tabular-nums">{days}d</span>
          {ownerName && (
            <Avatar className="h-5 w-5">
              <AvatarFallback className="text-white text-[9px]" style={{ backgroundColor: avatarColor(ownerName) }}>
                {getInitials(ownerName)}
              </AvatarFallback>
            </Avatar>
          )}
        </div>
      </div>
    </div>
  )
}
