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
}

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
    expectedCloseDate: "", notes: "", tagsInput: "",
  })
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  const stagesQ = useQuery<{ stages: Stage[] }>({
    queryKey: ["stages"],
    queryFn: async () => (await fetch("/api/stages")).json(),
    enabled: open,
  })
  const contactsQ = useQuery<{ contacts: Contact[] }>({
    queryKey: ["contacts-options"],
    queryFn: async () => (await fetch("/api/contacts?limit=200")).json(),
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
      })
    } else {
      setForm({ title: "", value: "0", currency: "USD", stageId: "", contactId: "", expectedCloseDate: "", notes: "", tagsInput: "" })
    }
    setErrors({})
  }, [initial, open])

  const m = useMutation({
    mutationFn: async () => {
      const data = {
        title: form.title,
        value: parseFloat(form.value) || 0,
        currency: form.currency,
        stageId: form.stageId,
        contactId: form.contactId,
        expectedCloseDate: form.expectedCloseDate || undefined,
        notes: form.notes || undefined,
        tagsInput: form.tagsInput,
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
            <Label>Title</Label>
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
            <Label>Stage</Label>
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
            <Label>Contact</Label>
            <Select value={form.contactId} onValueChange={(v) => set("contactId", v)}>
              <SelectTrigger><SelectValue placeholder="Select contact" /></SelectTrigger>
              <SelectContent>
                {(contactsQ.data?.contacts ?? []).map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}{c.company ? ` · ${c.company}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
