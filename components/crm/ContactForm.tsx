"use client"

import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { z } from "zod"
import { toast } from "sonner"
import { Loader2, Sparkles } from "lucide-react"
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

interface UserOption { id: string; name: string }

const CATEGORIES = ["Hot Lead", "Warm Lead", "Cold Lead", "Existing Client", "Inactive", "Prospect", "Not Relevant"]

const Schema = z.object({
  name: z.string().min(1, "Name is required"),
  email: z.string().email("Valid email required"),
  phone: z.string().regex(/^[+\d\s\-().]{6,20}$/, "Invalid phone").optional().or(z.literal("")),
  phoneSecondary: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  source: z.string().optional(),
  notes: z.string().optional(),
  linkedinUrl: z.string().optional(),
  socialUrl: z.string().optional(),
  website: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pinCode: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  zone: z.string().optional(),
  type: z.string().optional(),
  category: z.string().optional(),
  tagsInput: z.string().optional(),
})

interface ContactInitial {
  id?: string
  name?: string
  email?: string
  phone?: string | null
  phoneSecondary?: string | null
  company?: string | null
  title?: string | null
  source?: string | null
  notes?: string | null
  linkedinUrl?: string | null
  socialUrl?: string | null
  website?: string | null
  city?: string | null
  state?: string | null
  pinCode?: string | null
  addressLine1?: string | null
  addressLine2?: string | null
  zone?: string | null
  type?: string | null
  category?: string | null
  tags?: string[]
  ownerId?: string | null
}

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  initial?: ContactInitial | null
}

const NONE = "__NONE__"

const EMPTY_FORM = {
  name: "", email: "", phone: "", phoneSecondary: "", company: "", title: "", source: "",
  notes: "", linkedinUrl: "", socialUrl: "", website: "",
  city: "", state: "", pinCode: "", addressLine1: "", addressLine2: "",
  zone: "", type: "", category: NONE,
  tagsInput: "", ownerId: "",
}

export function ContactForm({ open, onOpenChange, initial }: Props) {
  const qc = useQueryClient()
  const [form, setForm] = React.useState(EMPTY_FORM)
  const [errors, setErrors] = React.useState<Record<string, string>>({})

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
    if (initial && open) {
      setForm({
        name: initial.name ?? "",
        email: initial.email ?? "",
        phone: initial.phone ?? "",
        phoneSecondary: initial.phoneSecondary ?? "",
        company: initial.company ?? "",
        title: initial.title ?? "",
        source: initial.source ?? "",
        notes: initial.notes ?? "",
        linkedinUrl: initial.linkedinUrl ?? "",
        socialUrl: initial.socialUrl ?? "",
        website: initial.website ?? "",
        city: initial.city ?? "",
        state: initial.state ?? "",
        pinCode: initial.pinCode ?? "",
        addressLine1: initial.addressLine1 ?? "",
        addressLine2: initial.addressLine2 ?? "",
        zone: initial.zone ?? "",
        type: initial.type ?? "",
        category: initial.category ?? NONE,
        tagsInput: (initial.tags ?? []).join(", "),
        ownerId: initial.ownerId ?? "",
      })
    } else if (open && !initial) {
      setForm(EMPTY_FORM)
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
      const payload: Record<string, unknown> = {
        name: form.name,
        email: form.email,
        phone: form.phone || undefined,
        phoneSecondary: form.phoneSecondary || undefined,
        company: form.company || undefined,
        title: form.title || undefined,
        source: form.source || undefined,
        notes: form.notes || undefined,
        linkedinUrl: form.linkedinUrl || undefined,
        socialUrl: form.socialUrl || undefined,
        website: form.website || undefined,
        city: form.city || undefined,
        state: form.state || undefined,
        pinCode: form.pinCode || undefined,
        addressLine1: form.addressLine1 || undefined,
        addressLine2: form.addressLine2 || undefined,
        zone: form.zone || undefined,
        type: form.type || undefined,
        category: form.category === NONE ? undefined : form.category,
        tags,
        ownerId: form.ownerId || undefined,
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
      qc.invalidateQueries({ queryKey: ["contacts-meta"] })
      onOpenChange(false)
    },
    onError: (e: Error) => {
      if (e.message !== "Invalid") toast.error(e.message)
    },
  })

  function set<K extends keyof typeof form>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }))
  }

  const tagsMut = useMutation<{ tags: string[] }, Error>({
    mutationFn: async () => {
      const res = await fetch("/api/ai/suggest-tags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: form.company || null,
          notes: form.notes || null,
          type: form.type || null,
          zone: form.zone || null,
          city: form.city || null,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed")
      return data
    },
    onSuccess: (d) => {
      if (!d.tags || d.tags.length === 0) {
        toast.info("No tag suggestions")
        return
      }
      const existing = (form.tagsInput || "").split(",").map((t) => t.trim()).filter(Boolean)
      const merged = Array.from(new Set([...existing, ...d.tags]))
      set("tagsInput", merged.join(", "))
      toast.success(`Added ${d.tags.length} tag${d.tags.length === 1 ? "" : "s"}`)
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{initial?.id ? "Edit Contact" : "New Contact"}</DialogTitle>
          <DialogDescription>Contact details and metadata.</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[65vh] overflow-y-auto pr-2">
          <div className="space-y-2 col-span-1 md:col-span-2">
            <Label>Name <span className="text-destructive">*</span></Label>
            <Input value={form.name} onChange={(e) => set("name", e.target.value)} />
            {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
          </div>
          <div className="space-y-2">
            <Label>Email <span className="text-destructive">*</span></Label>
            <Input value={form.email} onChange={(e) => set("email", e.target.value)} />
            {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
          </div>
          <div className="space-y-2">
            <Label>Phone (Mobile)</Label>
            <Input value={form.phone} onChange={(e) => set("phone", e.target.value)} />
            {errors.phone && <p className="text-xs text-destructive">{errors.phone}</p>}
          </div>
          <div className="space-y-2">
            <Label>Phone No (secondary)</Label>
            <Input value={form.phoneSecondary} onChange={(e) => set("phoneSecondary", e.target.value)} />
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
            <Label>City</Label>
            <Input value={form.city} onChange={(e) => set("city", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>State</Label>
            <Input value={form.state} onChange={(e) => set("state", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>PIN Code</Label>
            <Input value={form.pinCode} onChange={(e) => set("pinCode", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Zone</Label>
            <Input value={form.zone} onChange={(e) => set("zone", e.target.value)} placeholder="North, South..." />
          </div>
          <div className="space-y-2">
            <Label>Type</Label>
            <Input value={form.type} onChange={(e) => set("type", e.target.value)} placeholder="Distributor, Retailer..." />
          </div>
          <div className="space-y-2 col-span-1 md:col-span-2">
            <Label>Address Line 1</Label>
            <Input value={form.addressLine1} onChange={(e) => set("addressLine1", e.target.value)} />
          </div>
          <div className="space-y-2 col-span-1 md:col-span-2">
            <Label>Address Line 2</Label>
            <Input value={form.addressLine2} onChange={(e) => set("addressLine2", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Website</Label>
            <Input value={form.website} onChange={(e) => set("website", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Social URL</Label>
            <Input value={form.socialUrl} onChange={(e) => set("socialUrl", e.target.value)} placeholder="LinkedIn, Twitter, Facebook..." />
          </div>
          <div className="space-y-2">
            <Label>LinkedIn URL (legacy)</Label>
            <Input value={form.linkedinUrl} onChange={(e) => set("linkedinUrl", e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Category</Label>
            <Select value={form.category} onValueChange={(v) => set("category", v)}>
              <SelectTrigger><SelectValue placeholder="Select" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>None</SelectItem>
                {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 col-span-1 md:col-span-2">
            <div className="flex items-center justify-between">
              <Label>Tags (comma-separated)</Label>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-6 text-[11px] text-violet-700 hover:bg-violet-50 hover:text-violet-700"
                onClick={() => tagsMut.mutate()}
                disabled={tagsMut.isPending || (!form.company && !form.notes && !form.type)}
              >
                {tagsMut.isPending ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                Suggest with AI
              </Button>
            </div>
            <Input value={form.tagsInput} onChange={(e) => set("tagsInput", e.target.value)} placeholder="enterprise, hot" />
          </div>
          <div className="space-y-2 col-span-1 md:col-span-2">
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
          <div className="space-y-2 col-span-1 md:col-span-2">
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
