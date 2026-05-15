"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Phone, Mail, Calendar, FileText, CheckSquare, Plus } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { ActivityForm } from "./ActivityForm"
import { formatRelativeDate, getInitials, avatarColor, cn } from "@/lib/utils"

interface ActivityWire {
  id: string
  type: string
  subject: string
  body: string | null
  dueAt: string | null
  completedAt: string | null
  createdAt: string
  user: { id: string; name: string; avatar: string | null }
}

const ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  CALL: Phone,
  EMAIL: Mail,
  MEETING: Calendar,
  NOTE: FileText,
  TASK: CheckSquare,
}

const TYPES = ["ALL", "CALL", "EMAIL", "MEETING", "NOTE", "TASK"] as const

interface Props {
  dealId?: string
  contactId?: string
  limit?: number
}

export function ActivityFeed({ dealId, contactId, limit = 50 }: Props) {
  const [filter, setFilter] = React.useState<(typeof TYPES)[number]>("ALL")
  const [open, setOpen] = React.useState(false)

  const params = new URLSearchParams()
  if (dealId) params.set("dealId", dealId)
  if (contactId) params.set("contactId", contactId)
  params.set("limit", String(limit))

  const q = useQuery<{ activities: ActivityWire[] }>({
    queryKey: ["activities", dealId ?? null, contactId ?? null, limit],
    queryFn: async () => {
      const res = await fetch(`/api/activities?${params.toString()}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const activities = (q.data?.activities ?? []).filter((a) => filter === "ALL" || a.type === filter)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1">
          {TYPES.map((t) => (
            <Badge
              key={t}
              variant={filter === t ? "default" : "outline"}
              onClick={() => setFilter(t)}
              className="cursor-pointer"
            >
              {t}
            </Badge>
          ))}
        </div>
        <Button size="sm" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5 mr-1" /> Log activity
        </Button>
      </div>

      {q.isLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : activities.length === 0 ? (
        <div className="text-sm text-muted-foreground py-8 text-center border rounded-md">No activities yet</div>
      ) : (
        <ul className="space-y-2">
          {activities.map((a) => {
            const Icon = ICON[a.type] ?? FileText
            return (
              <li key={a.id} className="flex gap-3 rounded-md border bg-card p-3">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium truncate">{a.subject}</div>
                    <div className="text-xs text-muted-foreground shrink-0">{formatRelativeDate(a.createdAt)}</div>
                  </div>
                  {a.body && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.body}</div>}
                  <div className="flex items-center gap-2 mt-2">
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className={cn("text-white text-[9px]", avatarColor(a.user.name))}>
                        {getInitials(a.user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground">{a.user.name}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {a.type}
                    </Badge>
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <ActivityForm open={open} onOpenChange={setOpen} dealId={dealId} contactId={contactId} />
    </div>
  )
}
