"use client"

import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Phone, Mail, Calendar, FileText, CheckSquare, Plus, MoreHorizontal, Check, Pencil, Trash2 } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu"
import { ActivityForm, type ActivityInitial } from "./ActivityForm"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
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
  const qc = useQueryClient()
  const [filter, setFilter] = React.useState<(typeof TYPES)[number]>("ALL")
  const [open, setOpen] = React.useState(false)
  const [editing, setEditing] = React.useState<ActivityInitial | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState<ActivityWire | null>(null)

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

  const updateMut = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const res = await fetch(`/api/activities/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed")
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["activities"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/activities/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed")
      return res.json()
    },
    onSuccess: () => {
      toast.success("Activity deleted")
      qc.invalidateQueries({ queryKey: ["activities"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function handleComplete(a: ActivityWire) {
    updateMut.mutate(
      { id: a.id, patch: { completedAt: new Date().toISOString() } },
      { onSuccess: () => toast.success("Marked complete") }
    )
  }

  function handleEdit(a: ActivityWire) {
    setEditing({
      id: a.id,
      type: (a.type as ActivityInitial["type"]),
      subject: a.subject,
      body: a.body,
      dueAt: a.dueAt,
      completedAt: a.completedAt,
    })
    setOpen(true)
  }

  function handleDelete(a: ActivityWire) {
    setConfirmDelete(a)
  }

  function handleNew() {
    setEditing(null)
    setOpen(true)
  }

  function handleOpenChange(o: boolean) {
    setOpen(o)
    if (!o) setEditing(null)
  }

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
        <Button size="sm" onClick={handleNew}>
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
            const isComplete = !!a.completedAt
            return (
              <li key={a.id} className="flex gap-3 rounded-md border bg-card p-3">
                <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                  <Icon className="h-4 w-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="text-sm font-medium truncate">{a.subject}</div>
                    <div className="flex items-center gap-2 shrink-0">
                      <div className="text-xs text-muted-foreground">{formatRelativeDate(a.createdAt)}</div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          {!isComplete && (
                            <DropdownMenuItem onClick={() => handleComplete(a)}>
                              <Check className="h-4 w-4 mr-2" /> Mark complete
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem onClick={() => handleEdit(a)}>
                            <Pencil className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            onClick={() => handleDelete(a)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  {a.body && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{a.body}</div>}
                  <div className="flex items-center gap-2 mt-2">
                    <Avatar className="h-5 w-5">
                      <AvatarFallback className="text-white text-[9px]" style={{ backgroundColor: avatarColor(a.user.name) }}>
                        {getInitials(a.user.name)}
                      </AvatarFallback>
                    </Avatar>
                    <span className="text-xs text-muted-foreground">{a.user.name}</span>
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      {a.type}
                    </Badge>
                    {isComplete && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 bg-green-100 text-green-800">
                        <Check className="h-3 w-3 mr-1" /> Completed
                      </Badge>
                    )}
                  </div>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <ActivityForm
        open={open}
        onOpenChange={handleOpenChange}
        dealId={dealId}
        contactId={contactId}
        initial={editing}
      />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null) }}
        title="Delete activity?"
        description={confirmDelete ? `Delete activity "${confirmDelete.subject}"?` : undefined}
        confirmText="Delete"
        destructive
        onConfirm={() => {
          if (confirmDelete) {
            deleteMut.mutate(confirmDelete.id)
            setConfirmDelete(null)
          }
        }}
      />
    </div>
  )
}
