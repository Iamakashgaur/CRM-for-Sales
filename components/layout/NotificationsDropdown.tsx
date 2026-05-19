"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Bell, AlertTriangle, CheckCircle2, Activity as ActivityIcon, CalendarClock } from "lucide-react"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn, formatRelativeDate } from "@/lib/utils"

interface NotificationItem {
  id: string
  kind: "task" | "deal-risk" | "activity"
  title: string
  subtitle: string
  href: string
  time: string
  unread: boolean
  severity?: "info" | "warning" | "danger"
}

const KIND_ICON: Record<NotificationItem["kind"], React.ElementType> = {
  task: CalendarClock,
  "deal-risk": AlertTriangle,
  activity: ActivityIcon,
}

const SEVERITY_CLASS: Record<NonNullable<NotificationItem["severity"]>, string> = {
  info: "bg-blue-50 text-blue-600",
  warning: "bg-amber-50 text-amber-600",
  danger: "bg-rose-50 text-rose-600",
}

export function NotificationsDropdown() {
  const [open, setOpen] = React.useState(false)
  const [readIds, setReadIds] = React.useState<Set<string>>(() => new Set())

  const q = useQuery<{ items: NotificationItem[]; unreadCount: number }>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  })

  const items = q.data?.items ?? []
  const effectiveUnread = items.filter((i) => i.unread && !readIds.has(i.id)).length

  function markAllRead() {
    setReadIds(new Set(items.map((i) => i.id)))
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative h-8 w-8 rounded-full flex items-center justify-center text-muted-foreground hover:bg-muted/70 hover:text-foreground transition-colors duration-180"
          aria-label="Notifications"
        >
          <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
          {effectiveUnread > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-accent text-[10px] font-semibold text-accent-foreground flex items-center justify-center tabular-nums shadow-sm">
              {effectiveUnread > 9 ? "9+" : effectiveUnread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/70">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold">Notifications</span>
            {effectiveUnread > 0 && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-accent/15 text-accent-strong">
                {effectiveUnread} new
              </span>
            )}
          </div>
          {effectiveUnread > 0 && (
            <button
              onClick={markAllRead}
              className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              Mark all read
            </button>
          )}
        </div>

        <div className="max-h-[420px] overflow-y-auto scrollbar-thin">
          {q.isLoading ? (
            <div className="p-6 text-center text-xs text-muted-foreground">Loading...</div>
          ) : items.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
              <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center mb-2">
                <CheckCircle2 className="h-5 w-5 text-muted-foreground" strokeWidth={1.75} />
              </div>
              <p className="text-[13px] font-medium">You're all caught up</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Nothing pressing right now</p>
            </div>
          ) : (
            <ul>
              {items.map((n) => {
                const Icon = KIND_ICON[n.kind]
                const sevClass = SEVERITY_CLASS[n.severity ?? "info"]
                const isUnread = n.unread && !readIds.has(n.id)
                return (
                  <li key={n.id} className="border-b border-border/40 last:border-b-0">
                    <Link
                      href={n.href}
                      onClick={() => {
                        setOpen(false)
                        setReadIds((s) => new Set(s).add(n.id))
                      }}
                      className="flex gap-3 px-4 py-3 hover:bg-muted/50 transition-colors duration-180"
                    >
                      <div className={cn("h-8 w-8 rounded-full flex items-center justify-center shrink-0", sevClass)}>
                        <Icon className="h-4 w-4" strokeWidth={1.75} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <div className={cn("text-[13px] leading-snug truncate", isUnread ? "font-semibold" : "font-medium")}>{n.title}</div>
                          {isUnread && <span className="h-1.5 w-1.5 rounded-full bg-accent shrink-0 mt-1.5" />}
                        </div>
                        <div className="text-[11px] text-muted-foreground truncate mt-0.5">{n.subtitle}</div>
                        <div className="text-[10px] text-muted-foreground mt-1 tabular-nums">{formatRelativeDate(n.time)}</div>
                      </div>
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  )
}
