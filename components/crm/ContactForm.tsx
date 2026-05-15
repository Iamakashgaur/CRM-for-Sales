"use client"

import * as React from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const Schema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required"),
  phone: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  linkedinUrl: z.string().optional(),
  website: z.string().optional(),
  tagsInput: z.string().optional(),
})

interface ContactInitial {
  id?: string
  name?: string
  email?: string
  phone?: string | null
  company?: string | null
  title?: string | null
  source?: string | null
  notes?: string | null
  linkedinUrl?: string | null
  website?: string | null
  tags?: string[]
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  initial?: ContactInitial | null
}

export function ContactForm({ open, onOpenChange, initial }: Props) {
  const qc = useQueryClient()
  const [form, setForm] = React.useState({
    name: "", email: "", phone: "", company: "", title: "", source: "",
    notes: "", linkedinUrl: "", website: "", tagsInput: "",
  })
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  React.useEffect(() => {
    if (initial && open) {
      setForm({
        name: initial.name ?? "",
        email: initial.email ?? "",
        phone: initial.phone ?? "",
        company: initial.company ?? "",
        title: initial.title ?? "",
        source: initial.source ?? "",
        notes: initial.notes ?? "",
        linkedinUrl: initial.linkedinUrl ?? "",
        website: initial.website ?? "",
        tagsInput: (initial.tags ?? []).join(", "),
      })
    } else if (open && !initial) {
      setForm({ name: "", email: "", phone: "", company: "", title: "", source: "", notes: "", linkedinUrl: "", website: "", tagsInput: "" })
    }
    setErrors({})
  }, [initial, open])

  const m = useMutation({
    mutationFn: async () => {
      const parsed = Schema.safeParse(form)
      if (!parsed.success) {
        const f: Record<string, string> = {}
        for (const e of parsed.error.errors) f[String(e.path[0])] = e.message
        setErrors(f)
        throw new Error("Invalid")
      }
      const tags = (form.tagsInput || "").split(",").map((t) => t.trim()).filter(Boolean)
      const payload = {
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        company: form.company || undefined,
        title: form.title || undefined,
        source: form.source || undefined,
        notes: form.notes || undefined,
        linkedinUrl: form.linkedinUrl || undefined,
        website: form.website || undefined,
        tags,
      }
      const url = initial?.id ? `/api/contacts/${initial.id}` : "/api/contacts"
      const method = initial?.id ? "PUT" : "POST"
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed")
      return res.json()
    },
    onSuccess: () => {
      toast.success(initial?.id ? "Contact updated" : "Contact created")
      qc.invalidateQueries({ queryKey: ["contacts"] })
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
          <DialogTitle>{initial?.id ? "Edit Contact" : "New Contact"}</DialogTitle>
          <DialogDescription>Contact details and metadata.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4 max-h-[60vh] overflow-y-auto pr-2">
          <div className="space-y-2 col-span-2">
            <Label>Name</Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>
          <div className="space-y-2">
            <Label>Phone</Label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Company</Label>
            <Input value={form.company} onChange={(e) => set("company", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Title</Label>
            <Input value={form.title} onChange={(e) => set("title", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Source</Label>
            <Input value={form.source} onChange={(e) => set("source", e.target.value)} placeholder="Inbound, Referral, LinkedIn..." />
          </div>
          <div className="space-y-2">
            <Label>Tags (comma-separated)</Label>
            <Input value={form.tagsInput} onChange={(e) => set("tagsInput", e.target.value)} placeholder="enterprise, hot" />
          </div>
          <div className="space-y-2">
            <Label>LinkedIn URL</Label>
            <Input value={form.linkedinUrl} onChange={(e) => set("linkedinUrl", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Website</Label>
            <Input value={form.website} onChange={(e) => set("website", e.target.value)} />
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
