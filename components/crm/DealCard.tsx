"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useSortable } from "@dnd-kit/sortable"
import { CSS } from "@dnd-kit/utilities"
import { Calendar } from "lucide-react"
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
  contact?: { id: string; name: string; company: string | null } | null
  owner?: { id: string; name: string; avatar: string | null } | null
}

interface Props {
  deal: DealCardData
}

export function DealCard({ deal }: Props) {
  const router = useRouter()
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: deal.id })

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.4 : 1,
  }

  const days = daysBetween(deal.updatedAt)
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
        "group cursor-grab active:cursor-grabbing rounded-lg border border-border bg-card p-3 shadow-soft hover:border-accent/40 hover:shadow-elevated transition-all duration-150",
        isDragging && "scale-[1.02] shadow-elevated"
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="font-medium text-[14px] leading-snug line-clamp-2">{deal.title}</div>
        <WinProbabilityBadge probability={deal.probability} className="shrink-0" />
      </div>
      <div className="mt-2 text-[16px] font-semibold tabular-nums tracking-tight">
        {formatCurrency(deal.value, deal.currency)}
      </div>
      <div className="mt-3 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 min-w-0">
          {deal.contact && (
            <Avatar className="h-5 w-5 shrink-0">
              <AvatarFallback className={cn("text-white text-[9px]", avatarColor(contactName))}>
                {getInitials(contactName)}
              </AvatarFallback>
            </Avatar>
          )}
          <span className="truncate text-muted-foreground">{contactName}</span>
        </div>
        {ownerName && (
          <Avatar className="h-5 w-5">
            <AvatarFallback className={cn("text-white text-[9px]", avatarColor(ownerName))}>
              {getInitials(ownerName)}
            </AvatarFallback>
          </Avatar>
        )}
      </div>
      <div className="mt-2 flex items-center gap-1 text-[10px] text-muted-foreground">
        <Calendar className="h-3 w-3" strokeWidth={1.75} />
        <span>{days}d in stage</span>
      </div>
    </div>
  )
}
