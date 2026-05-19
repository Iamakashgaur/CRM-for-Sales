"use client"

import * as React from "react"
import { useQuery } from "@tanstack/react-query"
import { Phone, Calendar as CalIcon, Flame, ThermometerSun, ClipboardCheck, MessageSquare, ListChecks, Inbox } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Button } from "@/components/ui/button"
import { ContactDetailSheet } from "@/components/crm/ContactDetailSheet"
import { avatarColor, formatDate, formatRelativeDate, getInitials, cn } from "@/lib/utils"
import { isPrivileged } from "@/lib/constants"

interface Contact {
  id: string
  name: string
  company: string | null
  phone: string | null
  city: string | null
  state: string | null
  category: string | null
  callStatus: string | null
  followUpStatus: string | null
  lastContactDate: string | null
  nextFollowUpDate: string | null
  nextFollowUpTime: string | null
  dnc: boolean
  tags: string[]
  owner: { id: string; name: string }
  updatedAt: string
}

interface Counts {
  today: number
  overdue: number
  hot: number
  warm: number
  interested: number
  recentCalls: number
}

const BUCKETS: Array<{ key: string; label: string; icon: React.ElementType; tint: string; countKey?: keyof Counts }> = [
  { key: "all", label: "All my work", icon: Inbox, tint: "text-slate-600" },
  { key: "today", label: "Due today", icon: CalIcon, tint: "text-blue-600", countKey: "today" },
  { key: "overdue", label: "Overdue", icon: ClipboardCheck, tint: "text-rose-600", countKey: "overdue" },
  { key: "hot", label: "Hot leads", icon: Flame, tint: "text-red-600", countKey: "hot" },
  { key: "warm", label: "Warm leads", icon: ThermometerSun, tint: "text-amber-600", countKey: "warm" },
  { key: "interested", label: "Interested", icon: MessageSquare, tint: "text-emerald-600", countKey: "interested" },
  { key: "recent-calls", label: "Recent calls (7d)", icon: Phone, tint: "text-violet-600", countKey: "recentCalls" },
  { key: "no-followup", label: "No follow-up set", icon: ListChecks, tint: "text-slate-500" },
]

const CATEGORY_TONE: Record<string, string> = {
  "Hot Lead": "bg-red-50 text-red-700 border-red-200",
  "Warm Lead": "bg-amber-50 text-amber-700 border-amber-200",
  "Cold Lead": "bg-blue-50 text-blue-700 border-blue-200",
  "Existing Client": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Prospect": "bg-violet-50 text-violet-700 border-violet-200",
}

export function MyWorkClient({ role, userName }: { role: string; userName: string }) {
  const [bucket, setBucket] = React.useState<string>("all")
  const [scope, setScope] = React.useState<"mine" | "team">("mine")
  const [detailId, setDetailId] = React.useState<string | null>(null)

  const privileged = isPrivileged(role)

  const q = useQuery<{ contacts: Contact[]; counts: Counts }>({
    queryKey: ["my-work", bucket, scope],
    queryFn: async () => {
      const params = new URLSearchParams({ bucket, scope })
      const res = await fetch(`/api/my-work?${params}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const contacts = q.data?.contacts ?? []
  const counts = q.data?.counts

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">My Work</h1>
          <p className="text-[13px] text-muted-foreground mt-1">
            Contacts you&apos;re actively engaging with — categorized leads, follow-ups, recent calls.
          </p>
        </div>
        {privileged && (
          <div className="inline-flex items-center bg-muted/60 rounded-full p-0.5 border border-border/70">
            <button
              onClick={() => setScope("mine")}
              className={cn(
                "px-3 py-1 text-[11px] font-medium rounded-full transition-all",
                scope === "mine" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
              )}
            >
              Mine
            </button>
            <button
              onClick={() => setScope("team")}
              className={cn(
                "px-3 py-1 text-[11px] font-medium rounded-full transition-all",
                scope === "team" ? "bg-background text-foreground shadow-xs" : "text-muted-foreground"
              )}
            >
              Team
            </button>
          </div>
        )}
      </div>

      {/* Bucket chips */}
      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-8 gap-2">
        {BUCKETS.map((b) => {
          const Icon = b.icon
          const count = b.countKey && counts ? counts[b.countKey] : null
          const active = bucket === b.key
          return (
            <button
              key={b.key}
              onClick={() => setBucket(b.key)}
              className={cn(
                "flex flex-col items-start gap-1.5 rounded-lg border p-3 text-left transition-all duration-180",
                active
                  ? "bg-foreground/[0.04] border-foreground/20 shadow-soft"
                  : "bg-card hover:bg-muted/40 hover:border-border/60 border-border/70"
              )}
            >
              <div className="flex items-center gap-2 w-full">
                <Icon className={cn("h-4 w-4 shrink-0", b.tint)} strokeWidth={1.75} />
                <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground truncate">{b.label}</span>
              </div>
              <div className="flex items-baseline gap-1">
                <span className="text-xl font-medium tabular-nums tracking-tight">{count ?? "—"}</span>
              </div>
            </button>
          )
        })}
      </div>

      {/* Contact list */}
      <Card>
        <CardContent className="p-0">
          {q.isLoading ? (
            <div className="p-4 space-y-2">
              {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-14" />)}
            </div>
          ) : contacts.length === 0 ? (
            <div className="text-center py-14">
              <div className="h-12 w-12 rounded-full bg-muted mx-auto mb-3 flex items-center justify-center">
                <Inbox className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="text-sm font-medium">All clear</p>
              <p className="text-xs text-muted-foreground mt-1">No contacts in this bucket</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/70">
              {contacts.map((c) => {
                const overdueDate = c.nextFollowUpDate && new Date(c.nextFollowUpDate) < new Date(new Date().setHours(0, 0, 0, 0))
                return (
                  <li key={c.id}>
                    <button
                      onClick={() => setDetailId(c.id)}
                      className="w-full flex items-start gap-3 px-4 py-3 hover:bg-muted/40 transition-colors text-left"
                    >
                      <span
                        className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white text-xs font-semibold"
                        style={{ backgroundColor: avatarColor(c.name) }}
                      >
                        {getInitials(c.name)}
                      </span>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2 flex-wrap">
                          <span className="text-sm font-medium truncate">{c.name}</span>
                          {c.company && c.company !== c.name && (
                            <span className="text-xs text-muted-foreground truncate">· {c.company}</span>
                          )}
                          {c.category && (
                            <Badge className={cn("text-[10px] font-medium", CATEGORY_TONE[c.category] ?? "")}>
                              {c.category}
                            </Badge>
                          )}
                          {c.followUpStatus && c.followUpStatus !== c.category && (
                            <Badge variant="outline" className="text-[10px]">{c.followUpStatus}</Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-[11px] text-muted-foreground mt-1 flex-wrap">
                          {c.phone && <span>{c.phone}</span>}
                          {c.city && <span>{c.city}{c.state ? `, ${c.state}` : ""}</span>}
                          {c.callStatus && <span>Last call: {c.callStatus}</span>}
                          {c.lastContactDate && <span>Contacted {formatRelativeDate(c.lastContactDate)}</span>}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        {c.nextFollowUpDate ? (
                          <div className={cn("text-xs font-medium tabular-nums", overdueDate ? "text-rose-600" : "text-foreground")}>
                            {formatDate(c.nextFollowUpDate)}
                            {c.nextFollowUpTime && <span className="text-muted-foreground"> · {c.nextFollowUpTime}</span>}
                          </div>
                        ) : (
                          <span className="text-[11px] text-muted-foreground">No follow-up</span>
                        )}
                        {privileged && scope === "team" && (
                          <div className="text-[10px] text-muted-foreground mt-0.5">{c.owner.name}</div>
                        )}
                      </div>
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>

      {contacts.length >= 200 && (
        <p className="text-[11px] text-muted-foreground text-center">Showing first 200. Use bucket filters to narrow.</p>
      )}

      <ContactDetailSheet
        contactId={detailId}
        onOpenChange={(o) => { if (!o) setDetailId(null) }}
        role={role}
      />
    </div>
  )
}
