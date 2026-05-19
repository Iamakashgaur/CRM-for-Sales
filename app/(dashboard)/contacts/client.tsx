"use client"

import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Plus, Search, MoreHorizontal, Pencil, Trash2, Upload, Loader2, Users, Filter, X, Columns3, ScanLine, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Checkbox } from "@/components/ui/checkbox"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
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
import { ContactForm } from "@/components/crm/ContactForm"
import { ContactDetailSheet } from "@/components/crm/ContactDetailSheet"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { useDebounce } from "@/hooks/use-debounce"
import { getInitials, avatarColor, cn, formatDate } from "@/lib/utils"
import { isPrivileged } from "@/lib/constants"

interface ContactRow {
  id: string
  name: string
  email: string
  phone: string | null
  phoneSecondary: string | null
  altPhone: string | null
  company: string | null
  title: string | null
  source: string | null
  notes: string | null
  linkedinUrl: string | null
  socialUrl: string | null
  website: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  pinCode: string | null
  zone: string | null
  type: string | null
  tags: string[]
  ownerId: string
  dnc: boolean
  category: string | null
  callStatus: string | null
  followUpStatus: string | null
  lastContactDate: string | null
  nextFollowUpDate: string | null
  nextFollowUpTime: string | null
  createdAt: string
  updatedAt: string
}

type ColumnKey =
  | "company" | "email" | "phone" | "phoneSecondary" | "title" | "source"
  | "owner" | "tags" | "category" | "callStatus" | "followUpStatus"
  | "lastContact" | "nextFollowUp" | "dnc" | "city" | "state" | "pinCode"
  | "address" | "zone" | "type" | "website" | "social"
  | "updated" | "created"

interface ColumnDef {
  key: ColumnKey
  label: string
  width?: string
}

const ALL_COLUMNS: ColumnDef[] = [
  { key: "company", label: "Company" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Mobile" },
  { key: "phoneSecondary", label: "Phone No" },
  { key: "title", label: "Person Name / Title" },
  { key: "city", label: "City" },
  { key: "state", label: "State" },
  { key: "pinCode", label: "PIN Code" },
  { key: "address", label: "Address" },
  { key: "zone", label: "Zone" },
  { key: "type", label: "Type" },
  { key: "website", label: "Website" },
  { key: "social", label: "Social" },
  { key: "owner", label: "Owner" },
  { key: "source", label: "Source" },
  { key: "tags", label: "Tags" },
  { key: "category", label: "Category" },
  { key: "callStatus", label: "Call Status" },
  { key: "followUpStatus", label: "Follow-Up Status" },
  { key: "lastContact", label: "Last Contact" },
  { key: "nextFollowUp", label: "Next Follow-Up" },
  { key: "dnc", label: "DNC" },
  { key: "updated", label: "Updated" },
  { key: "created", label: "Created" },
]

const DEFAULT_COLUMNS: ColumnKey[] = ["company", "phone", "city", "state", "zone", "type", "owner", "updated"]
const STORAGE_KEY = "crm.contacts.cols.v3"

interface UserRow { id: string; name: string; email: string; role: string }

export function ContactsClient({ role }: { role: string }) {
  const privileged = isPrivileged(role)
  const qc = useQueryClient()
  const [q, setQ] = React.useState("")
  const [page, setPage] = React.useState(1)
  const [ownerFilter, setOwnerFilter] = React.useState<string>("ALL")
  const [tagFilter, setTagFilter] = React.useState<string>("ALL")
  const [sourceFilter, setSourceFilter] = React.useState<string>("ALL")
  const [categoryFilter, setCategoryFilter] = React.useState<string>("ALL")
  const [followUpFilter, setFollowUpFilter] = React.useState<string>("ALL")
  const [dncFilter, setDncFilter] = React.useState<string>("ALL")
  const [zoneFilter, setZoneFilter] = React.useState<string>("ALL")
  const [stateFilter, setStateFilter] = React.useState<string>("ALL")
  const [open, setOpen] = React.useState(false)
  const [editContact, setEditContact] = React.useState<ContactRow | null>(null)
  const [importOpen, setImportOpen] = React.useState(false)
  const [importFile, setImportFile] = React.useState<File | null>(null)
  const [scanOpen, setScanOpen] = React.useState(false)
  const [confirmDelete, setConfirmDelete] = React.useState<ContactRow | null>(null)
  const [detailId, setDetailId] = React.useState<string | null>(null)
  const [selectedIds, setSelectedIds] = React.useState<Set<string>>(new Set())
  const [bulkAssignOpen, setBulkAssignOpen] = React.useState(false)
  const [bulkAssignTarget, setBulkAssignTarget] = React.useState<string>("")
  const [bulkDeleteOpen, setBulkDeleteOpen] = React.useState(false)

  const [visibleCols, setVisibleCols] = React.useState<Set<ColumnKey>>(() => new Set(DEFAULT_COLUMNS))
  React.useEffect(() => {
    try {
      localStorage.removeItem("crm.contacts.cols.v1")
      localStorage.removeItem("crm.contacts.cols.v2")
      const raw = localStorage.getItem(STORAGE_KEY)
      if (raw) {
        const arr = JSON.parse(raw) as ColumnKey[]
        if (Array.isArray(arr) && arr.length > 0) setVisibleCols(new Set(arr))
        else setVisibleCols(new Set(DEFAULT_COLUMNS))
      }
    } catch {
      setVisibleCols(new Set(DEFAULT_COLUMNS))
    }
  }, [])
  React.useEffect(() => {
    const t = setTimeout(() => {
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(Array.from(visibleCols))) } catch {}
    }, 300)
    return () => clearTimeout(t)
  }, [visibleCols])

  function toggleCol(k: ColumnKey) {
    setVisibleCols((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k); else next.add(k)
      return next
    })
  }

  const debouncedQ = useDebounce(q, 250)

  const usersQ = useQuery<{ users: UserRow[] }>({
    queryKey: ["users"],
    queryFn: async () => (await fetch("/api/users")).json(),
    enabled: privileged,
  })

  const metaQ = useQuery<{
    sources: Array<{ name: string; count: number }>
    tags: Array<{ name: string; count: number }>
    zones: Array<{ name: string; count: number }>
    types: Array<{ name: string; count: number }>
    cities: Array<{ name: string; count: number }>
    states: Array<{ name: string; count: number }>
  }>({
    queryKey: ["contacts-meta"],
    queryFn: async () => (await fetch("/api/contacts/meta")).json(),
  })

  const query = useQuery<{ contacts: ContactRow[]; total: number; pages: number; page: number }>({
    queryKey: ["contacts", debouncedQ, page, ownerFilter, tagFilter, sourceFilter, categoryFilter, followUpFilter, dncFilter, zoneFilter, stateFilter],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (debouncedQ) params.set("q", debouncedQ)
      if (ownerFilter !== "ALL") params.set("ownerId", ownerFilter)
      if (tagFilter !== "ALL") params.set("tag", tagFilter)
      if (sourceFilter !== "ALL") params.set("source", sourceFilter)
      if (categoryFilter !== "ALL") params.set("category", categoryFilter)
      if (followUpFilter !== "ALL") params.set("followUpStatus", followUpFilter)
      if (dncFilter !== "ALL") params.set("dnc", dncFilter)
      if (zoneFilter !== "ALL") params.set("zone", zoneFilter)
      if (stateFilter !== "ALL") params.set("state", stateFilter)
      params.set("page", String(page))
      const res = await fetch(`/api/contacts?${params.toString()}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  // Reset selection when contacts page reloads
  React.useEffect(() => { setSelectedIds(new Set()) }, [page, debouncedQ, ownerFilter, tagFilter, sourceFilter, categoryFilter, followUpFilter, dncFilter, zoneFilter, stateFilter])

  const deleteMut = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/contacts/${id}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed")
      return res.json()
    },
    onSuccess: () => {
      toast.success("Contact deleted")
      qc.invalidateQueries({ queryKey: ["contacts"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const bulkAssignMut = useMutation({
    mutationFn: async (vars: { ids: string[]; ownerId: string }) => {
      const res = await fetch("/api/contacts/bulk", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: vars.ids, patch: { ownerId: vars.ownerId } }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed")
      return res.json() as Promise<{ updated: number }>
    },
    onSuccess: (data) => {
      toast.success(`Reassigned ${data.updated} contact${data.updated === 1 ? "" : "s"}`)
      setSelectedIds(new Set())
      setBulkAssignOpen(false)
      setBulkAssignTarget("")
      qc.invalidateQueries({ queryKey: ["contacts"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const bulkDeleteMut = useMutation({
    mutationFn: async (ids: string[]) => {
      const res = await fetch("/api/contacts/bulk", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed")
      return res.json() as Promise<{ deleted: number }>
    },
    onSuccess: (data) => {
      toast.success(`Deleted ${data.deleted} contact${data.deleted === 1 ? "" : "s"}`)
      setSelectedIds(new Set())
      setBulkDeleteOpen(false)
      qc.invalidateQueries({ queryKey: ["contacts"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const importMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/contacts/import", { method: "POST", body: fd })
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed")
      return res.json() as Promise<{ imported: number; skipped: number; duplicates?: number; total: number }>
    },
    onSuccess: (data) => {
      const dup = data.duplicates ?? 0
      toast.success(`Imported ${data.imported} of ${data.total} (${data.skipped} skipped, ${dup} duplicates)`)
      qc.invalidateQueries({ queryKey: ["contacts"] })
      setImportOpen(false)
      setImportFile(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function handleEdit(c: ContactRow) {
    setEditContact(c)
    setOpen(true)
  }

  function handleDelete(c: ContactRow) {
    setConfirmDelete(c)
  }

  function handleNew() {
    setEditContact(null)
    setOpen(true)
  }

  function handleDialogChange(o: boolean) {
    setOpen(o)
    if (!o) setEditContact(null)
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAll() {
    const rows = query.data?.contacts ?? []
    if (selectedIds.size === rows.length && rows.length > 0) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(rows.map((c) => c.id)))
    }
  }

  function clearFilters() {
    setQ(""); setOwnerFilter("ALL"); setTagFilter("ALL"); setSourceFilter("ALL")
    setCategoryFilter("ALL"); setFollowUpFilter("ALL"); setDncFilter("ALL")
    setZoneFilter("ALL"); setStateFilter("ALL"); setPage(1)
  }

  const allTags = metaQ.data?.tags ?? []
  const allSources = metaQ.data?.sources ?? []

  const users = usersQ.data?.users ?? []
  const reps = users.filter((u) => u.role === "REP")
  const allZones = metaQ.data?.zones ?? []
  const allStates = metaQ.data?.states ?? []
  const filtersActive = debouncedQ.length > 0 || ownerFilter !== "ALL" || tagFilter !== "ALL" || sourceFilter !== "ALL" || categoryFilter !== "ALL" || followUpFilter !== "ALL" || dncFilter !== "ALL" || zoneFilter !== "ALL" || stateFilter !== "ALL"
  const contacts = query.data?.contacts ?? []
  const allSelected = contacts.length > 0 && contacts.every((c) => selectedIds.has(c.id))

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-sm text-muted-foreground">All your B2B contacts in one place</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setScanOpen(true)}>
            <ScanLine className="h-4 w-4 mr-2" />Scan Card
          </Button>
          <Button variant="outline" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-2" />Import CSV
          </Button>
          <Button onClick={handleNew}><Plus className="h-4 w-4 mr-2" />New Contact</Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[240px] max-w-md">
              <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, email, company..."
                value={q}
                onChange={(e) => { setQ(e.target.value); setPage(1) }}
                className="pl-9"
              />
            </div>

            {privileged && (
              <Select value={ownerFilter} onValueChange={(v) => { setOwnerFilter(v); setPage(1) }}>
                <SelectTrigger className="w-44">
                  <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Owner" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All owners</SelectItem>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>{u.name} <span className="text-xs text-muted-foreground ml-1">({u.role})</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {allTags.length > 0 && (
              <Select value={tagFilter} onValueChange={(v) => { setTagFilter(v); setPage(1) }}>
                <SelectTrigger className="w-44">
                  <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Tag" />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectItem value="ALL">All tags</SelectItem>
                  {allTags.slice(0, 100).map((t) => (
                    <SelectItem key={t.name} value={t.name}>
                      {t.name} <span className="text-xs text-muted-foreground ml-1">({t.count})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {allSources.length > 0 && (
              <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v); setPage(1) }}>
                <SelectTrigger className="w-44">
                  <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectItem value="ALL">All sources</SelectItem>
                  {allSources.map((s) => (
                    <SelectItem key={s.name} value={s.name}>
                      {s.name} <span className="text-xs text-muted-foreground ml-1">({s.count})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {allZones.length > 0 && (
              <Select value={zoneFilter} onValueChange={(v) => { setZoneFilter(v); setPage(1) }}>
                <SelectTrigger className="w-32">
                  <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="Zone" />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectItem value="ALL">All zones</SelectItem>
                  {allZones.map((z) => (
                    <SelectItem key={z.name} value={z.name}>{z.name} <span className="text-xs text-muted-foreground ml-1">({z.count})</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            {allStates.length > 0 && (
              <Select value={stateFilter} onValueChange={(v) => { setStateFilter(v); setPage(1) }}>
                <SelectTrigger className="w-40">
                  <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                  <SelectValue placeholder="State" />
                </SelectTrigger>
                <SelectContent className="max-h-80">
                  <SelectItem value="ALL">All states</SelectItem>
                  {allStates.slice(0, 100).map((s) => (
                    <SelectItem key={s.name} value={s.name}>{s.name} <span className="text-xs text-muted-foreground ml-1">({s.count})</span></SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}

            <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1) }}>
              <SelectTrigger className="w-40">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Category" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All categories</SelectItem>
                {["Hot Lead", "Warm Lead", "Cold Lead", "Existing Client", "Inactive", "Prospect", "Not Relevant"].map((c) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={followUpFilter} onValueChange={(v) => { setFollowUpFilter(v); setPage(1) }}>
              <SelectTrigger className="w-40">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="Follow-Up" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All follow-ups</SelectItem>
                {["Overdue", "Follow Up", "Interested", "Called", "No Response", "Completed"].map((s) => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={dncFilter} onValueChange={(v) => { setDncFilter(v); setPage(1) }}>
              <SelectTrigger className="w-32">
                <Filter className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
                <SelectValue placeholder="DNC" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All</SelectItem>
                <SelectItem value="0">Active only</SelectItem>
                <SelectItem value="1">DNC only</SelectItem>
              </SelectContent>
            </Select>

            {filtersActive && (
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-3.5 w-3.5 mr-1" /> Clear
              </Button>
            )}

            <div className="ml-auto">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Columns3 className="h-3.5 w-3.5 mr-1.5" /> Columns
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56 max-h-96 overflow-y-auto">
                  <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {ALL_COLUMNS.map((c) => (
                    <DropdownMenuItem
                      key={c.key}
                      onSelect={(e) => { e.preventDefault(); toggleCol(c.key) }}
                      className="gap-2"
                    >
                      <Checkbox checked={visibleCols.has(c.key)} className="pointer-events-none" />
                      <span>{c.label}</span>
                    </DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={(e) => { e.preventDefault(); setVisibleCols(new Set(DEFAULT_COLUMNS)) }}
                  >
                    Reset to default
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Bulk action toolbar */}
      {privileged && selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-2 rounded-lg border bg-accent/40 px-4 py-2 text-sm">
          <span className="font-medium">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button size="sm" variant="outline">
                  <Users className="h-3.5 w-3.5 mr-1.5" /> Assign to...
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuLabel>Sales Reps</DropdownMenuLabel>
                {reps.length === 0 ? (
                  <DropdownMenuItem disabled>No reps available</DropdownMenuItem>
                ) : (
                  reps.map((u) => (
                    <DropdownMenuItem
                      key={u.id}
                      onClick={() => {
                        setBulkAssignTarget(u.id)
                        setBulkAssignOpen(true)
                      }}
                    >
                      <Avatar className="h-5 w-5 mr-2">
                        <AvatarFallback className="text-white text-[10px]" style={{ backgroundColor: avatarColor(u.name) }}>{getInitials(u.name)}</AvatarFallback>
                      </Avatar>
                      {u.name}
                    </DropdownMenuItem>
                  ))
                )}
                <DropdownMenuSeparator />
                <DropdownMenuLabel>Managers / Admins</DropdownMenuLabel>
                {users.filter((u) => u.role !== "REP").map((u) => (
                  <DropdownMenuItem
                    key={u.id}
                    onClick={() => {
                      setBulkAssignTarget(u.id)
                      setBulkAssignOpen(true)
                    }}
                  >
                    <Avatar className="h-5 w-5 mr-2">
                      <AvatarFallback className="text-white text-[10px]" style={{ backgroundColor: avatarColor(u.name) }}>{getInitials(u.name)}</AvatarFallback>
                    </Avatar>
                    {u.name} <span className="text-xs text-muted-foreground ml-1">({u.role})</span>
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
            <Button size="sm" variant="destructive" onClick={() => setBulkDeleteOpen(true)}>
              <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelectedIds(new Set())}>
              <X className="h-3.5 w-3.5 mr-1" /> Clear
            </Button>
          </div>
        </div>
      )}

      <Card>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="p-4 space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {privileged && (
                    <TableHead className="w-10">
                      <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} aria-label="Select all" />
                    </TableHead>
                  )}
                  <TableHead>Name</TableHead>
                  {ALL_COLUMNS.filter((c) => visibleCols.has(c.key)).map((c) => (
                    <TableHead key={c.key}>{c.label}</TableHead>
                  ))}
                  <TableHead className="w-12"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {contacts.map((c) => {
                  const owner = users.find((u) => u.id === c.ownerId)
                  const cityVal = c.city ?? null
                  const stateVal = c.state ?? null
                  return (
                    <TableRow key={c.id} className="cursor-pointer hover:bg-accent/40" onClick={() => setDetailId(c.id)}>
                      {privileged && (
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          <Checkbox checked={selectedIds.has(c.id)} onCheckedChange={() => toggleSelect(c.id)} aria-label={`Select ${c.name}`} />
                        </TableCell>
                      )}
                      <TableCell>
                        <div className="flex items-center gap-3">
                          <Avatar className="h-8 w-8">
                            <AvatarFallback className="text-white text-xs" style={{ backgroundColor: avatarColor(c.name) }}>{getInitials(c.name)}</AvatarFallback>
                          </Avatar>
                          <div>
                            <div className="font-medium">{c.name}</div>
                            {c.title && <div className="text-xs text-muted-foreground">{c.title}</div>}
                          </div>
                        </div>
                      </TableCell>
                      {ALL_COLUMNS.filter((col) => visibleCols.has(col.key)).map((col) => {
                        switch (col.key) {
                          case "company":
                            return <TableCell key={col.key} className="text-sm">{c.company ?? "—"}</TableCell>
                          case "email":
                            return <TableCell key={col.key} className="text-sm truncate max-w-[220px]">{c.email}</TableCell>
                          case "phone":
                            return <TableCell key={col.key} className="text-sm tabular-nums whitespace-nowrap">{c.phone ?? "—"}</TableCell>
                          case "phoneSecondary":
                            return <TableCell key={col.key} className="text-sm tabular-nums whitespace-nowrap">{c.phoneSecondary ?? "—"}</TableCell>
                          case "title":
                            return <TableCell key={col.key} className="text-sm">{c.title ?? "—"}</TableCell>
                          case "source":
                            return <TableCell key={col.key} className="text-sm whitespace-nowrap">{c.source ?? "—"}</TableCell>
                          case "pinCode":
                            return <TableCell key={col.key} className="text-xs tabular-nums">{c.pinCode ?? <span className="text-muted-foreground">—</span>}</TableCell>
                          case "address":
                            return <TableCell key={col.key} className="text-xs max-w-[260px] truncate">{[c.addressLine1, c.addressLine2].filter(Boolean).join(", ") || <span className="text-muted-foreground">—</span>}</TableCell>
                          case "website":
                            return <TableCell key={col.key} className="text-xs truncate max-w-[180px]">{c.website ? <a href={c.website} target="_blank" rel="noreferrer noopener" onClick={(e) => e.stopPropagation()} className="text-primary hover:underline">{c.website.replace(/^https?:\/\//, "")}</a> : <span className="text-muted-foreground">—</span>}</TableCell>
                          case "social":
                            return <TableCell key={col.key} className="text-xs truncate max-w-[180px]">{c.socialUrl ?? c.linkedinUrl ?? <span className="text-muted-foreground">—</span>}</TableCell>
                          case "owner":
                            return (
                              <TableCell key={col.key} className="text-sm whitespace-nowrap">
                                {owner ? (
                                  <div className="flex items-center gap-1.5">
                                    <Avatar className="h-5 w-5 shrink-0">
                                      <AvatarFallback className="text-white text-[10px]" style={{ backgroundColor: avatarColor(owner.name) }}>{getInitials(owner.name)}</AvatarFallback>
                                    </Avatar>
                                    <span className="text-xs">{owner.name}</span>
                                  </div>
                                ) : <span className="text-xs text-muted-foreground">—</span>}
                              </TableCell>
                            )
                          case "tags":
                            return (
                              <TableCell key={col.key}>
                                <div className="flex gap-1 flex-wrap">
                                  {c.tags.slice(0, 2).map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                                </div>
                              </TableCell>
                            )
                          case "category":
                            return <TableCell key={col.key}>{c.category ? <Badge variant="outline" className="text-[10px]">{c.category}</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                          case "callStatus":
                            return <TableCell key={col.key} className="text-xs">{c.callStatus ?? <span className="text-muted-foreground">—</span>}</TableCell>
                          case "followUpStatus":
                            return <TableCell key={col.key} className="text-xs">{c.followUpStatus ?? <span className="text-muted-foreground">—</span>}</TableCell>
                          case "lastContact":
                            return <TableCell key={col.key} className="text-xs text-muted-foreground tabular-nums">{c.lastContactDate ? formatDate(c.lastContactDate) : "—"}</TableCell>
                          case "nextFollowUp":
                            return <TableCell key={col.key} className="text-xs text-muted-foreground tabular-nums">{c.nextFollowUpDate ? formatDate(c.nextFollowUpDate) : "—"}</TableCell>
                          case "dnc":
                            return <TableCell key={col.key}>{c.dnc ? <Badge className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-50 text-[10px]">DNC</Badge> : <span className="text-xs text-muted-foreground">—</span>}</TableCell>
                          case "city":
                            return <TableCell key={col.key} className="text-xs whitespace-nowrap">{cityVal || <span className="text-muted-foreground">—</span>}</TableCell>
                          case "state":
                            return <TableCell key={col.key} className="text-xs whitespace-nowrap">{stateVal || <span className="text-muted-foreground">—</span>}</TableCell>
                          case "zone":
                            return <TableCell key={col.key} className="text-xs">{c.zone ? <Badge variant="outline" className="text-[10px]">{c.zone}</Badge> : <span className="text-muted-foreground">—</span>}</TableCell>
                          case "type":
                            return <TableCell key={col.key} className="text-xs whitespace-nowrap">{c.type ?? c.tags[1] ?? <span className="text-muted-foreground">—</span>}</TableCell>
                          case "updated":
                            return <TableCell key={col.key} className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{formatDate(c.updatedAt)}</TableCell>
                          case "created":
                            return <TableCell key={col.key} className="text-xs text-muted-foreground tabular-nums whitespace-nowrap">{formatDate(c.createdAt)}</TableCell>
                          default:
                            return null
                        }
                      })}
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(c)}>
                              <Pencil className="h-4 w-4 mr-2" /> Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              onClick={() => handleDelete(c)}
                              className="text-destructive focus:text-destructive"
                            >
                              <Trash2 className="h-4 w-4 mr-2" /> Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  )
                })}
                {contacts.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={(privileged ? 1 : 0) + 1 + visibleCols.size + 1} className="text-center text-muted-foreground py-8">
                      {filtersActive ? (
                        <div className="space-y-2">
                          <div>No contacts match your filter</div>
                          <Button variant="outline" size="sm" onClick={clearFilters}>Clear filters</Button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <div>No contacts yet</div>
                          <Button variant="outline" size="sm" onClick={handleNew}>Create your first contact</Button>
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

      {query.data && query.data.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {query.data.page} of {query.data.pages} · {query.data.total} contacts</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= query.data.pages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}

      <ContactDetailSheet contactId={detailId} onOpenChange={(o) => { if (!o) setDetailId(null) }} role={role} />

      <ContactForm open={open} onOpenChange={handleDialogChange} initial={editContact} />

      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null) }}
        title="Delete contact?"
        description={confirmDelete ? `Delete contact "${confirmDelete.name}"? This cannot be undone.` : undefined}
        confirmText="Delete"
        destructive
        onConfirm={() => {
          if (confirmDelete) {
            deleteMut.mutate(confirmDelete.id)
            setConfirmDelete(null)
          }
        }}
      />

      <ConfirmDialog
        open={bulkAssignOpen}
        onOpenChange={(o) => { if (!o) { setBulkAssignOpen(false); setBulkAssignTarget("") } }}
        title="Reassign contacts?"
        description={`Reassign ${selectedIds.size} contact${selectedIds.size === 1 ? "" : "s"} to ${users.find((u) => u.id === bulkAssignTarget)?.name ?? ""}.`}
        confirmText="Reassign"
        onConfirm={() => {
          if (bulkAssignTarget) {
            bulkAssignMut.mutate({ ids: Array.from(selectedIds), ownerId: bulkAssignTarget })
          }
        }}
      />

      <ConfirmDialog
        open={bulkDeleteOpen}
        onOpenChange={setBulkDeleteOpen}
        title="Delete selected contacts?"
        description={`Delete ${selectedIds.size} contact${selectedIds.size === 1 ? "" : "s"}? This cannot be undone.`}
        confirmText="Delete all"
        destructive
        onConfirm={() => bulkDeleteMut.mutate(Array.from(selectedIds))}
      />

      <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) setImportFile(null) }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Contacts</DialogTitle>
            <DialogDescription>
              Upload a CSV or Excel file. Expected columns: name, email (required), phone, company, title, notes.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>File</Label>
            <Input
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => setImportFile(e.target.files?.[0] ?? null)}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button
              disabled={!importFile || importMut.isPending}
              onClick={() => { if (importFile) importMut.mutate(importFile) }}
            >
              {importMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ScanCardDialog open={scanOpen} onOpenChange={setScanOpen} onCreated={() => qc.invalidateQueries({ queryKey: ["contacts"] })} />
    </div>
  )
}

interface CardFields {
  name?: string | null
  title?: string | null
  company?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  address?: string | null
  social?: string | null
}

function ScanCardDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  onCreated: () => void
}) {
  const [file, setFile] = React.useState<File | null>(null)
  const [preview, setPreview] = React.useState<string | null>(null)
  const [fields, setFields] = React.useState<CardFields | null>(null)
  const [scanning, setScanning] = React.useState(false)
  const [creating, setCreating] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    if (!open) {
      setFile(null); setPreview(null); setFields(null); setError(null)
    }
  }, [open])

  function pickFile(f: File | null) {
    setFile(f); setFields(null); setError(null)
    if (f) {
      const url = URL.createObjectURL(f)
      setPreview(url)
    } else {
      setPreview(null)
    }
  }

  async function scan() {
    if (!file) return
    setScanning(true); setError(null)
    try {
      const fd = new FormData()
      fd.append("image", file)
      const r = await fetch("/api/ai/scan-business-card", { method: "POST", body: fd })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? "Scan failed")
      setFields(data.fields as CardFields)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setScanning(false)
    }
  }

  async function create() {
    if (!fields) return
    if (!fields.name || !fields.email) {
      setError("Name and email are required to create a contact")
      return
    }
    setCreating(true); setError(null)
    try {
      const r = await fetch("/api/contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: fields.name,
          email: fields.email,
          phone: fields.phone ?? "",
          company: fields.company ?? "",
          title: fields.title ?? "",
          website: fields.website ?? "",
          socialUrl: fields.social ?? "",
          notes: fields.address ? `Address (from card): ${fields.address}` : "",
          source: "Business card scan",
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? "Create failed")
      toast.success("Contact created from card")
      onCreated()
      onOpenChange(false)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ScanLine className="h-5 w-5 text-violet-500" /> Scan Business Card
          </DialogTitle>
          <DialogDescription>
            Upload a photo of a business card. AI will extract the contact details.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>Card image</Label>
            <Input
              type="file"
              accept="image/*"
              capture="environment"
              onChange={(e) => pickFile(e.target.files?.[0] ?? null)}
            />
            {preview && (
              <div className="rounded-md border overflow-hidden bg-muted/30 max-h-48 flex items-center justify-center">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={preview} alt="card preview" className="max-h-48 object-contain" />
              </div>
            )}
          </div>

          {file && !fields && (
            <Button size="sm" onClick={scan} disabled={scanning}>
              {scanning ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Scanning...</> : <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Extract details</>}
            </Button>
          )}

          {fields && (
            <div className="space-y-2">
              <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Extracted fields</div>
              <div className="grid grid-cols-2 gap-2">
                <FieldInput label="Name *" value={fields.name ?? ""} onChange={(v) => setFields({ ...fields, name: v })} />
                <FieldInput label="Email *" value={fields.email ?? ""} onChange={(v) => setFields({ ...fields, email: v.toLowerCase() })} />
                <FieldInput label="Phone" value={fields.phone ?? ""} onChange={(v) => setFields({ ...fields, phone: v })} />
                <FieldInput label="Company" value={fields.company ?? ""} onChange={(v) => setFields({ ...fields, company: v })} />
                <FieldInput label="Title" value={fields.title ?? ""} onChange={(v) => setFields({ ...fields, title: v })} />
                <FieldInput label="Website" value={fields.website ?? ""} onChange={(v) => setFields({ ...fields, website: v })} />
                <FieldInput label="Social" value={fields.social ?? ""} onChange={(v) => setFields({ ...fields, social: v })} />
                <FieldInput label="Address" value={fields.address ?? ""} onChange={(v) => setFields({ ...fields, address: v })} />
              </div>
            </div>
          )}

          {error && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-md p-2">{error}</p>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          {fields && (
            <Button disabled={creating || !fields.name || !fields.email} onClick={create}>
              {creating ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
              Create contact
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function FieldInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</Label>
      <Input value={value} onChange={(e) => onChange(e.target.value)} className="h-8 text-xs" />
    </div>
  )
}
