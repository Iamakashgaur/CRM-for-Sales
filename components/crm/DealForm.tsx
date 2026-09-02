"use client"

import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Command, CommandEmpty, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { useDebounce } from "@/hooks/use-debounce"
import { ChevronsUpDown, X } from "lucide-react"
import { cn } from "@/lib/utils"
import { isLostStage } from "@/lib/stage-helpers"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const Schema = z.object({
  title: z.string().min(1, "Title is required"),
  value: z.number().min(0),
  currency: z.string(),
  stageId: z.string().min(1, "Stage is required"),
  contactId: z.string().min(1, "Contact is required"),
  expectedCloseDate: z.string().optional(),
  notes: z.string().optional(),
  tagsInput: z.string().optional(),
  ownerId: z.string().optional(),
  probability: z.number().min(0).max(100).optional(),
  lostReason: z.string().optional(),
})

interface DealInitial {
  id?: string
  title?: string
  value?: number
  currency?: string
  stageId?: string
  contactId?: string
  expectedCloseDate?: string | null
  notes?: string | null
  tags?: string[]
  ownerId?: string | null
  probability?: number | null
  lostReason?: string | null
}

interface UserOption { id: string; name: string }

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  initial?: DealInitial | null
}

interface Stage { id: string; name: string }
interface Contact { id: string; name: string; company: string | null }

export function DealForm({ open, onOpenChange, initial }: Props) {
  const qc = useQueryClient()
  const [form, setForm] = React.useState({
    title: "", value: "0", currency: "USD", stageId: "", contactId: "",
    expectedCloseDate: "", notes: "", tagsInput: "", ownerId: "",
    probability: "", lostReason: "",
  })
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  const stagesQ = useQuery<{ stages: Stage[] }>({
    queryKey: ["stages"],
    queryFn: async () => (await fetch("/api/stages")).json(),
    enabled: open,
  })
  const [contactSearch, setContactSearch] = React.useState("")
  const [contactPickerOpen, setContactPickerOpen] = React.useState(false)
  const [selectedContact, setSelectedContact] = React.useState<Contact | null>(null)
  const debouncedContactSearch = useDebounce(contactSearch, 250)

  const contactSearchQ = useQuery<{ contacts: Contact[] }>({
    queryKey: ["contact-search", debouncedContactSearch],
    queryFn: async () => {
      const res = await fetch(`/api/search?q=${encodeURIComponent(debouncedContactSearch)}`)
      if (!res.ok) return { contacts: [] }
      return res.json()
    },
    enabled: open && debouncedContactSearch.length >= 2,
  })

  const initialContactQ = useQuery<Contact>({
    queryKey: ["contact", form.contactId],
    queryFn: async () => {
      const res = await fetch(`/api/contacts/${form.contactId}`)
      if (!res.ok) throw new Error("Failed to load contact")
      return res.json()
    },
    enabled: open && !!form.contactId && !selectedContact,
  })

  React.useEffect(() => {
    if (initialContactQ.data && !selectedContact) {
      setSelectedContact({
        id: initialContactQ.data.id,
        name: initialContactQ.data.name,
        company: initialContactQ.data.company,
      })
    }
  }, [initialContactQ.data, selectedContact])
  const usersQ = useQuery<{ users: UserOption[] }>({
    queryKey: ["users"],
    queryFn: async () => {
      const res = await fetch("/api/users")
      if (!res.ok) return { users: [] }
      return res.json()
    },
    enabled: open,
  })

  React.useEffect(() => {
    if (!open) return
    if (initial) {
      setForm({
        title: initial.title ?? "",
        value: String(initial.value ?? 0),
        currency: initial.currency ?? "USD",
        stageId: initial.stageId ?? "",
        contactId: initial.contactId ?? "",
        expectedCloseDate: initial.expectedCloseDate ? new Date(initial.expectedCloseDate).toISOString().slice(0, 10) : "",
        notes: initial.notes ?? "",
        tagsInput: (initial.tags ?? []).join(", "),
        ownerId: initial.ownerId ?? "",
        probability: initial.probability != null ? String(initial.probability) : "",
        lostReason: initial.lostReason ?? "",
      })
    } else {
      setForm({ title: "", value: "0", currency: "USD", stageId: "", contactId: "", expectedCloseDate: "", notes: "", tagsInput: "", ownerId: "", probability: "", lostReason: "" })
    }
    setErrors({})
    setSelectedContact(null)
    setContactSearch("")
  }, [initial, open])

  const m = useMutation({
    mutationFn: async () => {
      const probabilityNum = form.probability.trim() === "" ? undefined : Number(form.probability)
      const data = {
        title: form.title,
        value: parseFloat(form.value) || 0,
        currency: form.currency,
        stageId: form.stageId,
        contactId: form.contactId,
        expectedCloseDate: form.expectedCloseDate || undefined,
        notes: form.notes || undefined,
        tagsInput: form.tagsInput,
        ownerId: form.ownerId || undefined,
        probability: probabilityNum,
        lostReason: form.lostReason.trim() ? form.lostReason : undefined,
      }
      const parsed = Schema.safeParse(data)
      if (!parsed.success) {
        const f: Record<string, string> = {}
        for (const e of parsed.error.errors) f[String(e.path[0])] = e.message
        setErrors(f)
        throw new Error("Invalid")
      }
      const tags = (form.tagsInput || "").split(",").map((t) => t.trim()).filter(Boolean)
      const payload = { ...parsed.data, tags }
      // remove tagsInput
      const { tagsInput: _, ...clean } = payload as typeof payload & { tagsInput?: string }
      const url = initial?.id ? `/api/deals/${initial.id}` : "/api/deals"
      const method = initial?.id ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(clean),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed")
      return res.json()
    },
    onSuccess: () => {
      toast.success(initial?.id ? "Deal updated" : "Deal created")
      qc.invalidateQueries({ queryKey: ["deals"] })
      onOpenChange(false)
    },
    onError: (e: Error) => {
      if (e.message !== "Invalid") toast.error(e.message)
    },
  })

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit Deal" : "New Deal"}</DialogTitle>
          <DialogDescription>Deal details, stage, and related contact.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2 col-span-2">
            <Label>Title <span className="text-destructive">*</span></Label>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} />
            {errors.title && <p className="text-xs text-destructive">{errors.title}</p>}
          </div>
          <div className="space-y-2">
            <Label>Value</Label>
            <Input type="number" min="0" step="100" value={form.value} onChange={(e) => set("value", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Currency</Label>
            <Select value={form.currency} onValueChange={(v) => set("currency", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="USD">USD</SelectItem>
                <SelectItem value="EUR">EUR</SelectItem>
                <SelectItem value="GBP">GBP</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Stage <span className="text-destructive">*</span></Label>
            <Select value={form.stageId} onValueChange={(v) => set("stageId", v)}>
              <SelectTrigger><SelectValue placeholder="Select stage" /></SelectTrigger>
              <SelectContent>
                {(stagesQ.data?.stages ?? []).map((s) => (
                  <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.stageId && <p className="text-xs text-destructive">{errors.stageId}</p>}
          </div>
          <div className="space-y-2">
            <Label>Contact <span className="text-destructive">*</span></Label>
            <Popover open={contactPickerOpen} onOpenChange={setContactPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  role="combobox"
                  className={cn("w-full justify-between font-normal", !selectedContact && "text-muted-foreground")}
                >
                  {selectedContact ? (
                    <span className="flex items-center gap-2 min-w-0">
                      <span className="truncate">
                        {selectedContact.name}
                        {selectedContact.company ? ` · ${selectedContact.company}` : ""}
                      </span>
                      <button
                        type="button"
                        aria-label="Clear contact"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedContact(null)
                          set("contactId", "")
                        }}
                        className="p-0.5 rounded hover:bg-muted"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </span>
                  ) : (
                    <span>Search contact...</span>
                  )}
                  <ChevronsUpDown className="h-4 w-4 opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
                <Command shouldFilter={false}>
                  <CommandInput
                    placeholder="Type at least 2 characters..."
                    value={contactSearch}
                    onValueChange={setContactSearch}
                  />
                  <CommandList>
                    {contactSearch.length < 2 ? (
                      <CommandEmpty>Type to search contacts</CommandEmpty>
                    ) : contactSearchQ.isLoading ? (
                      <CommandEmpty>Searching...</CommandEmpty>
                    ) : (contactSearchQ.data?.contacts ?? []).length === 0 ? (
                      <CommandEmpty>No matches</CommandEmpty>
                    ) : (
                      (contactSearchQ.data?.contacts ?? []).map((c) => (
                        <CommandItem
                          key={c.id}
                          value={c.id}
                          onSelect={() => {
                            setSelectedContact(c)
                            set("contactId", c.id)
                            setContactPickerOpen(false)
                            setContactSearch("")
                          }}
                        >
                          <div className="flex flex-col">
                            <span className="font-medium">{c.name}</span>
                            {c.company && <span className="text-xs text-muted-foreground">{c.company}</span>}
                          </div>
                        </CommandItem>
                      ))
                    )}
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
            {errors.contactId && <p className="text-xs text-destructive">{errors.contactId}</p>}
          </div>
          <div className="space-y-2">
            <Label>Expected Close Date</Label>
            <Input type="date" value={form.expectedCloseDate} onChange={(e) => set("expectedCloseDate", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Tags</Label>
            <Input value={form.tagsInput} onChange={(e) => set("tagsInput", e.target.value)} placeholder="enterprise, hot" />
          </div>
          <div className="space-y-2">
            <Label>Owner</Label>
            <Select value={form.ownerId} onValueChange={(v) => set("ownerId", v)}>
              <SelectTrigger><SelectValue placeholder="Default to current user" /></SelectTrigger>
              <SelectContent>
                {(usersQ.data?.users ?? []).map((u) => (
                  <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Probability (%)</Label>
            <Input
              type="number"
              min="0"
              max="100"
              step="1"
              value={form.probability}
              onChange={(e) => set("probability", e.target.value)}
              placeholder="Defaults to stage probability"
            />
          </div>
          {(() => {
            const selectedStage = (stagesQ.data?.stages ?? []).find((s) => s.id === form.stageId)
            const isLost = selectedStage ? isLostStage(selectedStage.name) : false
            if (!isLost) return null
            return (
              <div className="space-y-2 col-span-2">
                <Label>Lost Reason</Label>
                <Textarea rows={2} value={form.lostReason} onChange={(e) => set("lostReason", e.target.value)} placeholder="Why was this deal lost?" />
              </div>
            )
          })()}
          <div className="space-y-2 col-span-2">
            <Label>Notes</Label>
            <Textarea rows={3} value={form.notes} onChange={(e) => set("notes", e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : initial?.id ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
