"use client"

import * as React from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Search, MoreHorizontal, Pencil, Trash2, CheckCircle2, XCircle } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
  DropdownMenuPortal,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { DealForm } from "@/components/crm/DealForm"
import { WinProbabilityBadge } from "@/components/crm/WinProbabilityBadge"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useDebounce } from "@/hooks/use-debounce"
import { formatCurrency, formatDate, getInitials, avatarColor, cn } from "@/lib/utils"

interface DealRow {
  id: string
  title: string
  value: number
  currency: string
  stage: string
  stageId: string
  probability: number
  expectedCloseDate: string | null
  notes: string | null
  tags: string[]
  ownerId: string
  contactId: string
  contact: { id: string; name: string; company: string | null } | null
  owner: { id: string; name: string; avatar: string | null } | null
}

interface StageOpt { id: string; name: string; probability: number }
interface UserOpt { id: string; name: string }

export function DealsClient() {
  const qc = useQueryClient()
  const [q, setQ] = React.useState("")
  const [stage, setStage] = React.useState<string>("")
  const [open, setOpen] = React.useState(false)
  const [editDeal, setEditDeal] = React.useState<DealRow | null>(null)
  const [selected, setSelected] = React.useState<Set<string>>(new Set())
  const [lostDealId, setLostDealId] = React.useState<string | null>(null)
  const [lostReason, setLostReason] = React.useState("")
  const [confirmDelete, setConfirmDelete] = React.useState<DealRow | null>(null)
  const [confirmBulkDelete, setConfirmBulkDelete] = React.useState(false)

  const debouncedQ = useDebounce(q, 250)

  const query = useQuery<{ deals: DealRow[]; total: number }>({
    queryKey: ["deals", "list", debouncedQ, stage],
    queryFn: async () => {
      const p = new URLSearchParams()
      if (debouncedQ) p.set("q", debouncedQ)
      if (stage) p.set("stage", stage)
      p.set("limit", "200")
      const res = await fetch(`/api/deals?${p.toString()}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const stagesQ = useQuery<{ stages: StageOpt[] }>({
    queryKey: ["stages"],
    queryFn: async () => (await fetch("/api/stages")).json(),
  })

  const usersQ = useQuery<{ users: UserOpt[] }>({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users")
      if (!res.ok) return { users: [] }
      return res.json()
    },
  })

  const stages = stagesQ.data?.stages ?? []
  const wonStage = stages.find((s) => s.probability === 100) ?? stages.find((s) => s.name.toLowerCase().includes("won"))
  const lostStage =
    stages.find((s) => s.probability === 0 && s.name.toLowerCase().includes("lost"))
    ?? stages.find((s) => s.name.toLowerCase().includes("lost"))

  const updateDealMut = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const res = await fetch(`/api/deals/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed")
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deals"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/deals/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed")
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deals"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const bulkMut = useMutation({
    mutationFn: async ({ ids, patch }: { ids: string[]; patch: Record<string, unknown> }) => {
      const res = await fetch(`/api/deals/bulk`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids, patch }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed")
      return res.json() as Promise<{ updated: number }>
    },
    onSuccess: (data) => {
      toast.success(`Updated ${data.updated} deals`)
      qc.invalidateQueries({ queryKey: ["deals"] })
      setSelected(new Set())
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deals = query.data?.deals ?? []
  const allSelected = deals.length > 0 && deals.every((d) => selected.has(d.id))
  const someSelected = selected.size > 0 && !allSelected

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set())
    } else {
      setSelected(new Set(deals.map((d) => d.id)))
    }
  }

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleEdit(d: DealRow) {
    setEditDeal(d)
    setOpen(true)
  }

  function handleNew() {
    setEditDeal(null)
    setOpen(true)
  }

  function handleDialogChange(o: boolean) {
    setOpen(o)
    if (!o) setEditDeal(null)
  }

  function handleDelete(d: DealRow) {
    setConfirmDelete(d)
  }

  function confirmDeleteOne() {
    if (!confirmDelete) return
    const d = confirmDelete
    setConfirmDelete(null)
    deleteMut.mutate(d.id, { onSuccess: () => toast.success("Deal deleted") })
  }

  function handleMarkWon(d: DealRow) {
    if (!wonStage) {
      toast.error("Closed Won stage not configured")
      return
    }
    updateDealMut.mutate(
      { id: d.id, patch: { stageId: wonStage.id } },
      { onSuccess: () => toast.success("Marked as won") }
    )
  }

  function openMarkLost(d: DealRow) {
    setLostDealId(d.id)
    setLostReason("")
  }

  function confirmMarkLost() {
    if (!lostDealId || !lostStage) {
      toast.error("Closed Lost stage not configured")
      return
    }
    updateDealMut.mutate(
      { id: lostDealId, patch: { stageId: lostStage.id, lostReason: lostReason || null } },
      {
        onSuccess: () => {
          toast.success("Marked as lost")
          setLostDealId(null)
          setLostReason("")
        },
      }
    )
  }

  function bulkDelete() {
    if (selected.size === 0) return
    setConfirmBulkDelete(true)
  }

  async function performBulkDelete() {
    const ids = Array.from(selected)
    setConfirmBulkDelete(false)
    try {
      const res = await fetch(`/api/deals/bulk`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      const data = (await res.json()) as { deleted: number; failed: number; total: number; error?: string }
      if (!res.ok) {
        throw new Error(data.error ?? "Bulk delete failed")
      }
      if (data.failed > 0) {
        toast.warning(`Deleted ${data.deleted} of ${data.total} deals; ${data.failed} failed`)
      } else {
        toast.success(`Deleted ${data.deleted} deals`)
      }
      qc.invalidateQueries({ queryKey: ["deals"] })
      setSelected(new Set())
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Deals</h1>
          <p className="text-sm text-muted-foreground">All opportunities, sortable and filterable</p>
        </div>
        <Button onClick={handleNew}><Plus className="h-4 w-4 mr-2" />New Deal</Button>
      </div>

      <Card>
        <CardContent className="p-3 flex gap-3 flex-wrap items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search deals..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-1 flex-wrap">
            <Badge variant={stage === "" ? "default" : "outline"} onClick={() => setStage("")} className="cursor-pointer">All</Badge>
            {(stagesQ.data?.stages ?? []).map((s) => (
              <Badge key={s.id} variant={stage === s.name ? "default" : "outline"} onClick={() => setStage(s.name)} className="cursor-pointer">
                {s.name}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      {selected.size > 0 && (
        <Card>
          <CardContent className="p-3 flex items-center justify-between gap-3">
            <span className="text-sm">{selected.size} selected</span>
            <div className="flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">Bulk actions</Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Move to stage</DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent>
                        {(stagesQ.data?.stages ?? []).map((s) => (
                          <DropdownMenuItem
                            key={s.id}
                            onClick={() => bulkMut.mutate({ ids: Array.from(selected), patch: { stageId: s.id } })}
                          >
                            {s.name}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>
                  <DropdownMenuSub>
                    <DropdownMenuSubTrigger>Reassign owner</DropdownMenuSubTrigger>
                    <DropdownMenuPortal>
                      <DropdownMenuSubContent>
                        {(usersQ.data?.users ?? []).map((u) => (
                          <DropdownMenuItem
                            key={u.id}
                            onClick={() => bulkMut.mutate({ ids: Array.from(selected), patch: { ownerId: u.id } })}
                          >
                            {u.name}
                          </DropdownMenuItem>
                        ))}
                        {(usersQ.data?.users ?? []).length === 0 && (
                          <DropdownMenuItem disabled>No users available</DropdownMenuItem>
                        )}
                      </DropdownMenuSubContent>
                    </DropdownMenuPortal>
                  </DropdownMenuSub>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={bulkDelete}
                    className="text-destructive focus:text-destructive"
                  >
                    <Trash2 className="h-4 w-4 mr-2" /> Delete all
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="p-4 space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? "indeterminate" : false}
                      onCheckedChange={toggleAll}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Probability</TableHead>
                  <TableHead>Close Date</TableHead>
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deals.map((d) => (
                  <TableRow key={d.id}>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        checked={selected.has(d.id)}
                        onCheckedChange={() => toggleOne(d.id)}
                        aria-label={`Select ${d.title}`}
                      />
                    </TableCell>
                    <TableCell><Link href={`/deals/${d.id}`} className="font-medium hover:underline">{d.title}</Link></TableCell>
                    <TableCell className="font-semibold">{formatCurrency(d.value, d.currency)}</TableCell>
                    <TableCell><Badge variant="outline">{d.stage}</Badge></TableCell>
                    <TableCell className="text-sm">{d.contact?.name ?? "—"}</TableCell>
                    <TableCell>
                      {d.owner && (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6"><AvatarFallback className="text-white text-[10px]" style={{ backgroundColor: avatarColor(d.owner.name) }}>{getInitials(d.owner.name)}</AvatarFallback></Avatar>
                          <span className="text-sm">{d.owner.name}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell><WinProbabilityBadge probability={d.probability} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(d.expectedCloseDate)}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleEdit(d)}>
                            <Pencil className="h-4 w-4 mr-2" /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => handleMarkWon(d)}>
                            <CheckCircle2 className="h-4 w-4 mr-2 text-green-600" /> Mark Won
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => openMarkLost(d)}>
                            <XCircle className="h-4 w-4 mr-2 text-red-600" /> Mark Lost
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onClick={() => handleDelete(d)}
                            className="text-destructive focus:text-destructive"
                          >
                            <Trash2 className="h-4 w-4 mr-2" /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
                {deals.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                      {(debouncedQ || stage) ? (
                        <div className="space-y-2">
                          <div>No deals match your filter</div>
                          <Button variant="outline" size="sm" onClick={() => { setQ(""); setStage("") }}>Clear filters</Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div>No deals yet</div>
                          <Button variant="outline" size="sm" onClick={handleNew}>Create your first deal</Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <DealForm open={open} onOpenChange={handleDialogChange} initial={editDeal} />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null) }}
        title="Delete deal?"
        description={confirmDelete ? `Delete deal "${confirmDelete.title}"? This cannot be undone.` : undefined}
        confirmText="Delete"
        destructive
        onConfirm={confirmDeleteOne}
      />

      <ConfirmDialog
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={`Delete ${selected.size} deal(s)?`}
        description="This cannot be undone."
        confirmText="Delete all"
        destructive
        onConfirm={performBulkDelete}
      />

      <Dialog open={lostDealId !== null} onOpenChange={(o) => { if (!o) { setLostDealId(null); setLostReason("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark deal as lost</DialogTitle>
            <DialogDescription>Provide a reason this deal was lost.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Lost reason</Label>
            <Textarea
              value={lostReason}
              onChange={(e) => setLostReason(e.target.value)}
              rows={3}
              placeholder="Price, competitor, no decision, ..."
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setLostDealId(null); setLostReason("") }}>Cancel</Button>
            <Button variant="destructive" onClick={confirmMarkLost} disabled={!lostReason.trim()}>
              Mark Lost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
