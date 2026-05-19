"use client"

import * as React from "react"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import {
  Phone, MessageCircle, Save, Loader2, MapPin, Building2,
  CheckCircle2, AlertCircle, Sparkles, RefreshCw, Mail, Send,
} from "lucide-react"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { formatRelativeDate, getInitials, avatarColor } from "@/lib/utils"
import { VoiceRecorder } from "./VoiceRecorder"

const CATEGORIES = ["Hot Lead", "Warm Lead", "Cold Lead", "Existing Client", "Inactive", "Prospect", "Not Relevant"]
const CALL_STATUSES = ["Connected - Positive", "Connected - Neutral", "Connected - Negative", "Not Reachable", "Ringing No Answer", "Switched Off", "Call Back Requested", "Sent to Voicemail", "DND / Refused"]
const FOLLOW_UP_STATUSES = ["Overdue", "Follow Up", "Interested", "Called", "No Response", "Completed"]

const CATEGORY_TONE: Record<string, string> = {
  "Hot Lead": "bg-red-50 text-red-700 border-red-200",
  "Warm Lead": "bg-amber-50 text-amber-700 border-amber-200",
  "Cold Lead": "bg-blue-50 text-blue-700 border-blue-200",
  "Existing Client": "bg-emerald-50 text-emerald-700 border-emerald-200",
  "Prospect": "bg-violet-50 text-violet-700 border-violet-200",
  "Inactive": "bg-slate-100 text-slate-700 border-slate-200",
  "Not Relevant": "bg-slate-100 text-slate-500 border-slate-200",
}

interface CallLog {
  id: string
  status: string
  notes: string | null
  userId: string | null
  user?: { id: string; name: string } | null
  at: string
}

interface UserRow { id: string; name: string; role: string }

interface EmailMessage {
  id: string
  subject: string
  from: string
  to: string
  body: string | null
  receivedAt: string
}

interface WhatsAppMessageItem {
  id: string
  direction: string
  fromNumber: string
  toNumber: string
  body: string | null
  status: string | null
  receivedAt: string
}

interface ContactDetail {
  id: string
  name: string
  email: string
  phone: string | null
  phoneSecondary: string | null
  altPhone: string | null
  company: string | null
  title: string | null
  source: string | null
  tags: string[]
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
  ownerId: string
  dnc: boolean
  category: string | null
  callStatus: string | null
  followUpStatus: string | null
  lastContactDate: string | null
  nextFollowUpDate: string | null
  nextFollowUpTime: string | null
  callLogs: CallLog[]
  emailMsgs?: EmailMessage[]
  whatsappMessages?: WhatsAppMessageItem[]
  owner: { id: string; name: string }
}

interface ContactScore {
  score: number
  intent: "low" | "med" | "high"
  fit: "low" | "med" | "high"
  reasoning: string
  topSignals: string[]
  _generatedAt?: string
}

interface CallSuggest { suggestion: string; reasoning: string }
interface FollowUpSuggest { suggestedDate: string; reasoning: string; days: number }
interface EmailReplyVariant { tone: string; subject: string; body: string }
interface EmailReplyResult { replies: EmailReplyVariant[] }

interface Props {
  contactId: string | null
  onOpenChange: (open: boolean) => void
  role?: string
}

export function ContactDetailSheet({ contactId, onOpenChange, role }: Props) {
  const open = contactId !== null
  const qc = useQueryClient()

  const q = useQuery<ContactDetail>({
    queryKey: ["contact", contactId],
    queryFn: async () => {
      const res = await fetch(`/api/contacts/${contactId}`)
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed")
      return res.json()
    },
    enabled: open,
  })

  const usersQ = useQuery<{ users: UserRow[] }>({
    queryKey: ["users"],
    queryFn: async () => (await fetch("/api/users")).json(),
    enabled: open,
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl p-0 overflow-hidden gap-0 max-h-[92vh] border-border">
        {q.isLoading || !q.data ? (
          <div className="p-6 space-y-4">
            <Skeleton className="h-20 w-full" />
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-40 w-full" />
          </div>
        ) : (
          <Panel
            key={q.data.id}
            contact={q.data}
            users={usersQ.data?.users ?? []}
            role={role}
            onClose={() => onOpenChange(false)}
            onSaved={() => {
              qc.invalidateQueries({ queryKey: ["contact", contactId] })
              qc.invalidateQueries({ queryKey: ["contacts"] })
              qc.invalidateQueries({ queryKey: ["contacts-meta"] })
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

const NONE = "__NONE__"

interface SaveResponse {
  warnings?: string[]
}

function Panel({
  contact,
  users,
  role,
  onClose,
  onSaved,
}: {
  contact: ContactDetail
  users: UserRow[]
  role?: string
  onClose: () => void
  onSaved: () => void
}) {
  const qc = useQueryClient()
  const [notes, setNotes] = React.useState(contact.notes ?? "")
  const [category, setCategory] = React.useState(contact.category ?? NONE)
  const [callStatus, setCallStatus] = React.useState(contact.callStatus ?? NONE)
  const [followUpStatus, setFollowUpStatus] = React.useState(contact.followUpStatus ?? NONE)
  const [altPhone, setAltPhone] = React.useState(contact.altPhone ?? "")
  const [lastContactDate, setLastContactDate] = React.useState(toDateInput(contact.lastContactDate))
  const [nextFollowUpDate, setNextFollowUpDate] = React.useState(toDateInput(contact.nextFollowUpDate))
  const [nextFollowUpTime, setNextFollowUpTime] = React.useState(contact.nextFollowUpTime ?? "")
  const [dnc, setDnc] = React.useState(contact.dnc)
  const [assignee, setAssignee] = React.useState(contact.ownerId)
  const [waOpen, setWaOpen] = React.useState(false)
  const [replyEmail, setReplyEmail] = React.useState<EmailMessage | null>(null)
  const [followUpHintDismissed, setFollowUpHintDismissed] = React.useState(false)
  const [threadSummaryOpen, setThreadSummaryOpen] = React.useState(false)

  // AI Triage Score (Feature 1) — load cached on mount
  const triageQ = useQuery<ContactScore | null>({
    queryKey: ["ai-contact-score", contact.id],
    queryFn: async () => {
      const res = await fetch(`/api/ai/contact-score?contactId=${contact.id}`)
      if (!res.ok) return null
      return res.json()
    },
  })

  const triageMut = useMutation<ContactScore, Error, { refresh?: boolean }>({
    mutationFn: async ({ refresh }) => {
      const url = `/api/ai/contact-score${refresh ? "?refresh=1" : ""}`
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "AI scoring failed")
      return data as ContactScore
    },
    onSuccess: (data) => {
      qc.setQueryData(["ai-contact-score", contact.id], data)
      toast.success("AI triage updated")
    },
    onError: (e: Error) => toast.error(e.message),
  })

  // Call status suggestion (Feature 2) — silent auto-load
  const callSuggestQ = useQuery<CallSuggest>({
    queryKey: ["ai-call-suggest", contact.id, contact.callLogs[0]?.id],
    queryFn: async () => {
      const res = await fetch(`/api/ai/call-status-suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id }),
      })
      if (!res.ok) return { suggestion: "", reasoning: "" }
      return res.json()
    },
    enabled: contact.callLogs.length >= 2,
    retry: false,
    staleTime: 5 * 60 * 1000,
  })

  // Follow-up suggestion (Feature 6)
  const [followUpSuggest, setFollowUpSuggest] = React.useState<FollowUpSuggest | null>(null)
  const followUpMut = useMutation<FollowUpSuggest, Error, string>({
    mutationFn: async (status) => {
      const res = await fetch(`/api/ai/followup-suggest`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id, status }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed")
      return res.json()
    },
    onSuccess: (data) => {
      setFollowUpSuggest(data)
      setFollowUpHintDismissed(false)
    },
  })

  function onFollowUpStatusChange(v: string) {
    setFollowUpStatus(v)
    if (v && v !== NONE) followUpMut.mutate(v)
    else setFollowUpSuggest(null)
  }

  const rawDial = (altPhone || contact.phone || "").replace(/[^\d+]/g, "")
  const phoneToCall = rawDial
  // WhatsApp: normalize Indian numbers; handle leading + and 11-digit-with-leading-0
  const waNumber = (() => {
    if (rawDial.startsWith("+")) return rawDial.replace(/[^\d]/g, "")
    const digits = rawDial.replace(/[^\d]/g, "")
    if (digits.length === 10) return "91" + digits
    if (digits.length === 11 && digits.startsWith("0")) return "91" + digits.slice(1)
    // Other lengths: assume already includes country code
    return digits
  })()

  const saveMut = useMutation<SaveResponse, Error>({
    mutationFn: async () => {
      const res = await fetch(`/api/contacts/${contact.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          notes: notes.trim() || null,
          category: category === NONE ? null : category,
          callStatus: callStatus === NONE ? null : callStatus,
          followUpStatus: followUpStatus === NONE ? null : followUpStatus,
          altPhone: altPhone || null,
          lastContactDate: lastContactDate || null,
          nextFollowUpDate: nextFollowUpDate || null,
          nextFollowUpTime: nextFollowUpTime || null,
          dnc,
          ownerId: assignee,
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Save failed")
      return data as SaveResponse
    },
    onSuccess: (data) => {
      toast.success("Saved")
      if (data.warnings && data.warnings.length > 0) {
        for (const w of data.warnings) toast.warning(w)
      }
      onSaved()
      onClose()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const logCallMut = useMutation({
    mutationFn: async () => {
      if (!callStatus || callStatus === NONE) throw new Error("Select a call status before logging")
      const res = await fetch(`/api/contacts/${contact.id}/calls`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: callStatus, notes }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed")
      return res.json()
    },
    onSuccess: () => {
      toast.success("Call logged")
      setLastContactDate(toDateInput(new Date().toISOString()))
      qc.invalidateQueries({ queryKey: ["contact", contact.id] })
      onSaved()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function openWhatsApp() {
    if (!waNumber) { toast.error("No phone number"); return }
    window.open(`https://wa.me/${waNumber}`, "_blank", "noopener,noreferrer")
  }

  function quickFollowUp(days: number) {
    const d = new Date()
    d.setDate(d.getDate() + days)
    setNextFollowUpDate(d.toISOString().slice(0, 10))
  }

  const zone = contact.zone ?? ""
  const type = contact.type ?? ""
  const city = contact.city ?? ""
  const state = contact.state ?? ""
  const owner = users.find((u) => u.id === assignee)

  return (
    <div className="flex flex-col max-h-[92vh] bg-background">
      {/* Header */}
      <div className="px-6 py-5 border-b shrink-0 flex items-start justify-between gap-4">
        <div className="flex items-start gap-3 min-w-0">
          <Avatar className="h-12 w-12 shrink-0">
            <AvatarFallback className="text-white text-sm font-semibold" style={{ backgroundColor: avatarColor(contact.name) }}>
              {getInitials(contact.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 space-y-1.5">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-lg font-semibold tracking-tight truncate">{contact.name}</h2>
              {dnc && <Badge className="bg-red-50 text-red-700 border border-red-200 hover:bg-red-50">Do Not Call</Badge>}
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
              {contact.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{contact.phone}</span>}
              {city && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{city}{state ? `, ${state}` : ""}</span>}
              {type && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{type}</span>}
              {zone && <Badge variant="outline" className="text-[10px] font-medium">{zone}</Badge>}
            </div>
          </div>
        </div>
      </div>

      {/* All imported fields */}
      <div className="px-6 py-4 bg-muted/30 border-b shrink-0">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-3 text-xs">
          <InfoField label="Company" value={contact.company} />
          <InfoField label="Person Name" value={contact.name} />
          <InfoField label="Mobile" value={contact.phone} tabular />
          <InfoField label="Phone No" value={contact.phoneSecondary} tabular />
          <InfoField label="Email" value={contact.email} link={`mailto:${contact.email}`} />
          <InfoField label="City" value={contact.city} />
          <InfoField label="Type" value={contact.type} />
          <InfoField label="State" value={contact.state} />
          <InfoField label="PIN Code" value={contact.pinCode} tabular />
          <InfoField label="Zone" value={contact.zone} />
          <InfoField label="Website" value={contact.website} link={contact.website ?? undefined} />
          <InfoField label="Social Media" value={contact.socialUrl ?? contact.linkedinUrl} link={contact.socialUrl ?? contact.linkedinUrl ?? undefined} />
        </div>
        {(contact.addressLine1 || contact.addressLine2) && (
          <div className="mt-3 pt-3 border-t border-border/60">
            <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Address</div>
            <div className="text-sm">
              {[contact.addressLine1, contact.addressLine2].filter(Boolean).join(", ")}
            </div>
          </div>
        )}
      </div>

      {/* Body */}
      <div className="overflow-y-auto px-6 py-5 flex-1">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
          {/* Left column */}
          <div className="space-y-5">
            <Section title="AI Triage">
              <AITriageCard
                data={triageQ.data ?? null}
                loading={triageQ.isLoading || triageMut.isPending}
                onRun={() => triageMut.mutate({})}
                onRefresh={() => triageMut.mutate({ refresh: true })}
              />
            </Section>

            <Section title="Notes" hint={`${notes.length}/500`}>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                maxLength={500}
                rows={4}
                placeholder="Call summary, key discussion points, objections..."
                className="resize-none text-sm"
              />
            </Section>

            <Section title="Engagement">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Category">
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {CATEGORIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
                <Field label="Call Status">
                  <Select value={callStatus} onValueChange={setCallStatus}>
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>None</SelectItem>
                      {CALL_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </Field>
              </div>

              {callSuggestQ.data?.suggestion && callSuggestQ.data.suggestion !== callStatus && (
                <div className="flex items-start gap-1.5 mt-2 text-[11px] text-muted-foreground">
                  <Sparkles className="h-3 w-3 mt-0.5 text-violet-500 shrink-0" />
                  <span className="flex-1">
                    AI suggests: <span className="text-foreground font-medium">{callSuggestQ.data.suggestion}</span>
                    {callSuggestQ.data.reasoning && <span className="text-muted-foreground"> — {callSuggestQ.data.reasoning}</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => setCallStatus(callSuggestQ.data!.suggestion)}
                    className="text-violet-600 hover:text-violet-700 font-medium shrink-0"
                  >
                    Apply
                  </button>
                </div>
              )}

              {category && category !== NONE && (
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs text-muted-foreground">Current:</span>
                  <Badge className={`${CATEGORY_TONE[category] ?? "bg-muted text-foreground border"} font-medium`}>{category}</Badge>
                </div>
              )}

              <div className="mt-3">
                <NurtureSequenceTrigger contactId={contact.id} />
              </div>
            </Section>

            <Section title="Alternate Phone">
              <div className="flex gap-2">
                <Input
                  value={altPhone}
                  onChange={(e) => setAltPhone(e.target.value)}
                  placeholder={contact.phone || "Alternate number"}
                  className="flex-1 h-9 text-sm"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={openWhatsApp}
                  className="h-9 shrink-0 border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-700"
                  disabled={!phoneToCall}
                >
                  <MessageCircle className="h-3.5 w-3.5 mr-1.5" /> WhatsApp
                </Button>
              </div>
            </Section>

            <Section title="Do Not Call">
              <div className="flex items-center justify-between rounded-md border bg-card px-3 py-2.5">
                <div className="flex items-center gap-2 text-sm">
                  {dnc ? (
                    <>
                      <AlertCircle className="h-4 w-4 text-red-500" />
                      <span className="text-red-700 font-medium">Marked DNC — do not contact</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                      <span className="text-muted-foreground">Active contact</span>
                    </>
                  )}
                </div>
                <Switch checked={dnc} onCheckedChange={setDnc} />
              </div>
            </Section>
          </div>

          {/* Right column */}
          <div className="space-y-5">
            <Section title="Last Contact">
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={lastContactDate}
                  onChange={(e) => setLastContactDate(e.target.value)}
                  className="flex-1 h-9 text-sm"
                />
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setLastContactDate(new Date().toISOString().slice(0, 10))}
                  className="h-9 shrink-0"
                >
                  Today
                </Button>
              </div>
              {lastContactDate && (
                <p className="text-[11px] text-muted-foreground mt-1.5">{formatRelativeDate(lastContactDate)}</p>
              )}
            </Section>

            <Section title="Next Follow-Up">
              <div className="flex gap-2">
                <Input
                  type="date"
                  value={nextFollowUpDate}
                  onChange={(e) => setNextFollowUpDate(e.target.value)}
                  className="flex-1 h-9 text-sm"
                />
                <Input
                  type="time"
                  value={nextFollowUpTime}
                  onChange={(e) => setNextFollowUpTime(e.target.value)}
                  className="w-28 h-9 text-sm shrink-0"
                />
              </div>
              <div className="flex gap-1.5 mt-2">
                {[
                  { label: "Tomorrow", days: 1 },
                  { label: "+3d", days: 3 },
                  { label: "+1w", days: 7 },
                  { label: "+1mo", days: 30 },
                ].map((c) => (
                  <Button
                    key={c.label}
                    size="sm"
                    variant="ghost"
                    className="h-7 text-[11px] px-2.5 font-medium text-muted-foreground hover:text-foreground hover:bg-accent"
                    onClick={() => quickFollowUp(c.days)}
                  >
                    {c.label}
                  </Button>
                ))}
              </div>
            </Section>

            <Section title="Follow-Up Status">
              <Select value={followUpStatus} onValueChange={onFollowUpStatusChange}>
                <SelectTrigger className="h-9 text-sm"><SelectValue placeholder="Select" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>None</SelectItem>
                  {FOLLOW_UP_STATUSES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
              {followUpSuggest && !followUpHintDismissed && (
                <div className="flex items-start gap-1.5 mt-2 text-[11px] text-muted-foreground">
                  <Sparkles className="h-3 w-3 mt-0.5 text-violet-500 shrink-0" />
                  <span className="flex-1">
                    AI suggests next follow-up: <span className="text-foreground font-medium">{followUpSuggest.suggestedDate}</span>
                    {" "}({followUpSuggest.days}d)
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setNextFollowUpDate(followUpSuggest.suggestedDate)
                      setFollowUpHintDismissed(true)
                    }}
                    className="text-violet-600 hover:text-violet-700 font-medium shrink-0"
                  >
                    Apply
                  </button>
                  <button
                    type="button"
                    onClick={() => setFollowUpHintDismissed(true)}
                    className="text-muted-foreground/70 hover:text-foreground shrink-0"
                  >
                    ×
                  </button>
                </div>
              )}
            </Section>

            <Section title="Owner">
              {(role === "ADMIN" || role === "MANAGER") && (
                <AISuggestOwner
                  contactId={contact.id}
                  currentOwnerId={assignee}
                  users={users}
                  onApply={(ownerId) => setAssignee(ownerId)}
                />
              )}
              <Select value={assignee} onValueChange={setAssignee} disabled={role === "REP"}>
                <SelectTrigger className="h-9 text-sm">
                  {owner ? (
                    <span className="flex items-center min-w-0 w-full">
                      <span
                        className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-white text-[9px] font-medium leading-none mr-2"
                        style={{ backgroundColor: avatarColor(owner.name) }}
                      >
                        {getInitials(owner.name)}
                      </span>
                      <span className="truncate font-medium mr-2">{owner.name}</span>
                      <span className="text-[10px] text-muted-foreground uppercase tracking-wider shrink-0">{owner.role}</span>
                    </span>
                  ) : <SelectValue placeholder="Assign" />}
                </SelectTrigger>
                <SelectContent>
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id}>
                      <span className="inline-flex items-center gap-2">
                        <span className="truncate">{u.name}</span>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">{u.role}</span>
                      </span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Section>
          </div>
        </div>

        {/* Emails section */}
        {contact.emailMsgs && contact.emailMsgs.length > 0 && (
          <div className="mt-6 pt-5 border-t">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Recent Emails</h3>
              <div className="flex items-center gap-2">
                {contact.emailMsgs.length >= 2 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-[11px] border-violet-200 text-violet-700 hover:bg-violet-50 hover:text-violet-700"
                    onClick={() => setThreadSummaryOpen(true)}
                  >
                    <Sparkles className="h-3 w-3 mr-1" /> Summarize thread
                  </Button>
                )}
                <span className="text-xs text-muted-foreground">{contact.emailMsgs.length} message{contact.emailMsgs.length === 1 ? "" : "s"}</span>
              </div>
            </div>
            <ul className="space-y-2 max-h-60 overflow-y-auto">
              {contact.emailMsgs.map((m) => (
                <li key={m.id} className="rounded-md border bg-card p-3">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-medium truncate flex-1">{m.subject}</span>
                    <span className="text-[11px] text-muted-foreground shrink-0">{formatRelativeDate(m.receivedAt)}</span>
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5 truncate">From: {m.from}</div>
                  {m.body && <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2">{m.body.slice(0, 200)}</p>}
                  <div className="mt-2">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-[11px] border-violet-200 text-violet-700 hover:bg-violet-50 hover:text-violet-700"
                      onClick={() => setReplyEmail(m)}
                    >
                      <Sparkles className="h-3 w-3 mr-1" /> Suggest replies
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* WhatsApp messages section */}
        {contact.whatsappMessages && contact.whatsappMessages.length > 0 && (
          <div className="mt-6 pt-5 border-t">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                <MessageCircle className="h-3.5 w-3.5 text-emerald-600" /> WhatsApp
              </h3>
              <span className="text-xs text-muted-foreground">{contact.whatsappMessages.length} message{contact.whatsappMessages.length === 1 ? "" : "s"}</span>
            </div>
            <ul className="space-y-2 max-h-60 overflow-y-auto">
              {contact.whatsappMessages.map((m) => (
                <li key={m.id} className={`rounded-md border p-3 ${m.direction === "outbound" ? "bg-emerald-50/40 border-emerald-200/60" : "bg-card"}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <Badge variant="outline" className="text-[10px]">
                      {m.direction === "outbound" ? "Sent" : "Received"}
                    </Badge>
                    <span className="text-[11px] text-muted-foreground">{formatRelativeDate(m.receivedAt)}</span>
                  </div>
                  {m.body && <p className="text-xs text-foreground mt-1.5 whitespace-pre-wrap leading-snug">{m.body}</p>}
                  {m.status && (
                    <div className="text-[10px] text-muted-foreground mt-1">Status: {m.status}</div>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Call history full-width */}
        <div className="mt-6 pt-5 border-t">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Call History</h3>
            <span className="text-xs text-muted-foreground">{contact.callLogs.length} call{contact.callLogs.length === 1 ? "" : "s"}</span>
          </div>
          {contact.callLogs.length === 0 ? (
            <div className="text-center text-xs text-muted-foreground py-8 border rounded-md bg-muted/20">
              No calls logged yet. Select a call status and click <span className="font-medium text-foreground">Log Call</span> below.
            </div>
          ) : (
            <ul className="space-y-2 max-h-48 overflow-y-auto">
              {contact.callLogs.map((c) => (
                <li key={c.id} className="flex items-start gap-3 rounded-md border bg-card p-3">
                  <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                    <Phone className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="text-sm font-medium truncate">{c.status}</span>
                      <span className="text-[11px] text-muted-foreground shrink-0">{formatRelativeDate(c.at)}</span>
                    </div>
                    {c.notes && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{c.notes}</p>}
                    {c.user?.name && <p className="text-[10px] text-muted-foreground mt-1">by {c.user.name}</p>}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="px-6 py-3.5 border-t bg-card shrink-0 flex items-center gap-2">
        <Button
          size="sm"
          onClick={() => logCallMut.mutate()}
          disabled={logCallMut.isPending || !callStatus || callStatus === NONE}
          variant="outline"
          className="border-rose-200 text-rose-700 hover:bg-rose-50 hover:text-rose-700"
        >
          <Phone className="h-3.5 w-3.5 mr-1.5" />
          {logCallMut.isPending ? "Logging..." : "Log Call"}
        </Button>
        <VoiceRecorder
          contactId={contact.id}
          onLogged={() => {
            setLastContactDate(toDateInput(new Date().toISOString()))
            qc.invalidateQueries({ queryKey: ["contact", contact.id] })
            onSaved()
          }}
        />
        <Button
          size="sm"
          onClick={openWhatsApp}
          variant="outline"
          className="border-emerald-200 text-emerald-700 hover:bg-emerald-50 hover:text-emerald-700"
          disabled={!phoneToCall}
        >
          <MessageCircle className="h-3.5 w-3.5 mr-1.5" /> WhatsApp
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="border-violet-200 text-violet-700 hover:bg-violet-50 hover:text-violet-700"
          onClick={() => setWaOpen(true)}
          disabled={!phoneToCall}
        >
          <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Draft Message
        </Button>
        <div className="flex-1" />
        <Button size="sm" variant="ghost" onClick={onClose}>Cancel</Button>
        <Button size="sm" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1.5" />}
          {saveMut.isPending ? "Saving..." : "Save"}
        </Button>
      </div>

      <WhatsAppDraftDialog
        open={waOpen}
        onOpenChange={setWaOpen}
        contactId={contact.id}
        waNumber={waNumber}
      />

      <EmailReplyDialog
        message={replyEmail}
        contactEmail={contact.email}
        onOpenChange={(o) => { if (!o) setReplyEmail(null) }}
      />

      <EmailThreadSummaryDialog
        open={threadSummaryOpen}
        onOpenChange={setThreadSummaryOpen}
        contactId={contact.id}
        contactName={contact.name}
      />
    </div>
  )
}

interface ThreadSummaryResult {
  summary: string
  bullets: string[]
  lastSentiment: "positive" | "neutral" | "negative"
  notEnough?: boolean
  cached?: boolean
  generatedAt?: string
}

function EmailThreadSummaryDialog({
  open,
  onOpenChange,
  contactId,
  contactName,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  contactId: string
  contactName: string
}) {
  const [data, setData] = React.useState<ThreadSummaryResult | null>(null)

  const mut = useMutation<ThreadSummaryResult, Error, { refresh?: boolean }>({
    mutationFn: async ({ refresh }) => {
      const res = await fetch("/api/ai/email-thread-summary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, refresh: !!refresh }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Failed")
      return json as ThreadSummaryResult
    },
    onSuccess: (d) => setData(d),
    onError: (e) => toast.error(e.message),
  })

  React.useEffect(() => {
    if (open && !data && !mut.isPending) {
      mut.mutate({})
    }
    if (!open) setData(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const sentimentColor =
    data?.lastSentiment === "positive"
      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
      : data?.lastSentiment === "negative"
      ? "bg-rose-50 text-rose-700 border-rose-200"
      : "bg-slate-100 text-slate-700 border-slate-200"

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-violet-500" /> Email Thread Summary
          </DialogTitle>
          <DialogDescription>AI summary of your conversation with {contactName}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {mut.isPending && !data && (
            <>
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-32 w-full" />
            </>
          )}
          {data?.notEnough && (
            <div className="text-sm text-muted-foreground py-6 text-center">{data.summary}</div>
          )}
          {data && !data.notEnough && (
            <>
              <div className="rounded-md border bg-card p-3">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Summary</span>
                  <Badge className={`${sentimentColor} text-[10px] font-medium`} variant="outline">
                    Sentiment: {data.lastSentiment}
                  </Badge>
                </div>
                <p className="text-sm leading-relaxed">{data.summary}</p>
              </div>
              {data.bullets.length > 0 && (
                <div className="rounded-md border bg-card p-3 space-y-1.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Key points</div>
                  <ul className="space-y-1">
                    {data.bullets.map((b, i) => (
                      <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                        <span className="text-violet-500 shrink-0">•</span>
                        <span className="leading-snug">{b}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {data.cached && (
                <p className="text-[10px] text-muted-foreground text-center">Cached result. Click Refresh to regenerate.</p>
              )}
            </>
          )}
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => mut.mutate({ refresh: true })}
            disabled={mut.isPending}
          >
            {mut.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
            Refresh
          </Button>
          <Button onClick={() => onOpenChange(false)}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

interface RouteLeadResult {
  recommendedOwnerId: string | null
  reasoning: string
  alternatives: Array<{ ownerId: string; ownerName: string; reason: string }>
  applied?: boolean
}

function AISuggestOwner({
  contactId,
  currentOwnerId,
  users,
  onApply,
}: {
  contactId: string
  currentOwnerId: string
  users: UserRow[]
  onApply: (ownerId: string) => void
}) {
  const [result, setResult] = React.useState<RouteLeadResult | null>(null)
  const mut = useMutation<RouteLeadResult, Error, void>({
    mutationFn: async () => {
      const res = await fetch("/api/ai/route-lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "Failed")
      return data as RouteLeadResult
    },
    onSuccess: (d) => setResult(d),
    onError: (e) => toast.error(e.message),
  })

  const recName = result?.recommendedOwnerId
    ? users.find((u) => u.id === result.recommendedOwnerId)?.name ?? "Unknown"
    : null
  const sameAsCurrent = result?.recommendedOwnerId === currentOwnerId

  return (
    <div className="mb-2">
      <Button
        size="sm"
        variant="outline"
        className="h-7 text-[11px] border-violet-200 text-violet-700 hover:bg-violet-50 hover:text-violet-700 w-full"
        onClick={() => mut.mutate()}
        disabled={mut.isPending}
      >
        {mut.isPending ? <Loader2 className="h-3 w-3 mr-1.5 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1.5" />}
        AI suggest owner
      </Button>
      {result && result.recommendedOwnerId && (
        <div className="mt-2 rounded-md border bg-card p-2.5 space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs">
              AI recommends: <span className="font-medium text-foreground">{recName}</span>
            </span>
            {!sameAsCurrent && (
              <button
                type="button"
                onClick={() => onApply(result.recommendedOwnerId!)}
                className="text-violet-600 hover:text-violet-700 font-medium text-[11px]"
              >
                Apply
              </button>
            )}
            {sameAsCurrent && <span className="text-[10px] text-muted-foreground">already current</span>}
          </div>
          {result.reasoning && <p className="text-[11px] text-muted-foreground leading-snug">{result.reasoning}</p>}
          {result.alternatives.length > 0 && (
            <ul className="space-y-0.5 pt-1 border-t">
              {result.alternatives.map((a) => (
                <li key={a.ownerId} className="text-[10px] text-muted-foreground flex items-center justify-between gap-2">
                  <span><span className="font-medium text-foreground">{a.ownerName}</span> — {a.reason}</span>
                  <button
                    type="button"
                    onClick={() => onApply(a.ownerId)}
                    className="text-violet-600 hover:text-violet-700"
                  >
                    Use
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}

function AITriageCard({
  data,
  loading,
  onRun,
  onRefresh,
}: {
  data: ContactScore | null
  loading: boolean
  onRun: () => void
  onRefresh: () => void
}) {
  if (loading) {
    return (
      <div className="rounded-md border bg-card p-3 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/2" />
        <Skeleton className="h-3 w-full" />
      </div>
    )
  }
  if (!data) {
    return (
      <div className="rounded-md border bg-card p-3 flex items-center justify-between gap-2">
        <div className="text-xs text-muted-foreground">No AI triage yet</div>
        <Button size="sm" variant="outline" className="h-7 text-[11px] border-violet-200 text-violet-700 hover:bg-violet-50 hover:text-violet-700" onClick={onRun}>
          <Sparkles className="h-3 w-3 mr-1" /> Run AI
        </Button>
      </div>
    )
  }
  const intentColor = data.intent === "high" ? "bg-emerald-50 text-emerald-700 border-emerald-200"
    : data.intent === "med" ? "bg-amber-50 text-amber-700 border-amber-200"
    : "bg-slate-100 text-slate-700 border-slate-200"
  const fitColor = data.fit === "high" ? "bg-blue-50 text-blue-700 border-blue-200"
    : data.fit === "med" ? "bg-violet-50 text-violet-700 border-violet-200"
    : "bg-slate-100 text-slate-700 border-slate-200"
  const scoreColor = data.score >= 75 ? "bg-emerald-500 text-white"
    : data.score >= 50 ? "bg-amber-500 text-white"
    : "bg-slate-400 text-white"
  return (
    <div className="rounded-md border bg-card p-3 space-y-2">
      <div className="flex items-center gap-2">
        <div className={`h-10 w-10 rounded-full flex items-center justify-center text-sm font-semibold tabular-nums ${scoreColor}`}>
          {data.score}
        </div>
        <div className="flex flex-wrap gap-1 flex-1">
          <Badge className={`${intentColor} font-medium text-[10px]`} variant="outline">Intent: {data.intent}</Badge>
          <Badge className={`${fitColor} font-medium text-[10px]`} variant="outline">Fit: {data.fit}</Badge>
        </div>
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 shrink-0" onClick={onRefresh} title="Refresh">
          <RefreshCw className="h-3 w-3" />
        </Button>
      </div>
      {data.reasoning && <p className="text-xs text-muted-foreground leading-snug">{data.reasoning}</p>}
      {data.topSignals && data.topSignals.length > 0 && (
        <ul className="space-y-0.5 pt-1 border-t">
          {data.topSignals.map((s, i) => (
            <li key={i} className="text-[11px] text-muted-foreground flex items-start gap-1">
              <span className="text-violet-500">•</span><span>{s}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

const WA_PURPOSES = [
  { value: "follow-up", label: "Follow-up" },
  { value: "intro", label: "Introduction" },
  { value: "checkin", label: "Check-in" },
  { value: "reminder", label: "Reminder" },
  { value: "thank-you", label: "Thank you" },
] as const

function WhatsAppDraftDialog({
  open,
  onOpenChange,
  contactId,
  waNumber,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  contactId: string
  waNumber: string
}) {
  const [purpose, setPurpose] = React.useState<typeof WA_PURPOSES[number]["value"]>("follow-up")
  const [language, setLanguage] = React.useState<"en" | "hi" | "hinglish">("hinglish")
  const [text, setText] = React.useState("")

  const gen = useMutation<{ text: string }, Error>({
    mutationFn: async () => {
      const res = await fetch("/api/ai/draft-whatsapp", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, purpose, language }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error ?? "AI draft failed")
      return data
    },
    onSuccess: (d) => setText(d.text),
    onError: (e) => toast.error(e.message),
  })

  function sendViaWA() {
    if (!waNumber) { toast.error("No phone number"); return }
    const url = `https://wa.me/${waNumber}?text=${encodeURIComponent(text)}`
    window.open(url, "_blank", "noopener,noreferrer")
    onOpenChange(false)
  }

  React.useEffect(() => {
    if (!open) { setText(""); setPurpose("follow-up"); setLanguage("hinglish") }
  }, [open])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-violet-500" /> Draft WhatsApp Message</DialogTitle>
          <DialogDescription>AI drafts a short business message you can edit and send</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Purpose</label>
              <Select value={purpose} onValueChange={(v) => setPurpose(v as typeof purpose)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {WA_PURPOSES.map((p) => <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Language</label>
              <Select value={language} onValueChange={(v) => setLanguage(v as typeof language)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="en">English</SelectItem>
                  <SelectItem value="hi">Hindi (हिन्दी)</SelectItem>
                  <SelectItem value="hinglish">Hinglish</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <Button size="sm" variant="outline" onClick={() => gen.mutate()} disabled={gen.isPending} className="w-full">
            {gen.isPending ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
            {gen.isPending ? "Generating..." : text ? "Regenerate" : "Generate"}
          </Button>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Message ({text.length}/320)</label>
            <Textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 320))}
              rows={5}
              placeholder="Click Generate to draft, or type your own..."
              className="text-sm"
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={sendViaWA}
            disabled={!text.trim() || !waNumber}
            className="bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Send className="h-3.5 w-3.5 mr-1.5" /> Send via WhatsApp
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EmailReplyDialog({
  message,
  contactEmail,
  onOpenChange,
}: {
  message: EmailMessage | null
  contactEmail: string
  onOpenChange: (o: boolean) => void
}) {
  const open = message !== null
  const q = useQuery<EmailReplyResult>({
    queryKey: ["ai-email-replies", message?.id],
    queryFn: async () => {
      const res = await fetch("/api/ai/email-reply-suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId: message!.id }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed")
      return res.json()
    },
    enabled: open,
  })

  function copyReply(r: EmailReplyVariant) {
    const mailto = `mailto:${encodeURIComponent(contactEmail)}?subject=${encodeURIComponent(r.subject)}&body=${encodeURIComponent(r.body)}`
    window.open(mailto, "_self")
    onOpenChange(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Mail className="h-4 w-4 text-violet-500" /> AI Reply Suggestions</DialogTitle>
          <DialogDescription>{message?.subject}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 max-h-[60vh] overflow-y-auto">
          {q.isLoading && (
            <>
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </>
          )}
          {q.data?.replies.map((r, i) => (
            <div key={i} className="rounded-md border bg-card p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Badge variant="outline" className="text-[10px] capitalize">{r.tone}</Badge>
                <Button size="sm" variant="outline" onClick={() => copyReply(r)} className="h-7 text-[11px]">
                  <Send className="h-3 w-3 mr-1" /> Use this
                </Button>
              </div>
              <div className="text-sm font-medium">{r.subject}</div>
              <p className="text-xs text-muted-foreground whitespace-pre-wrap leading-snug">{r.body}</p>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function InfoField({
  label,
  value,
  link,
  tabular,
}: {
  label: string
  value: string | null | undefined
  link?: string
  tabular?: boolean
}) {
  const display = value && value.trim().length > 0 ? value : "—"
  const isEmpty = display === "—"
  return (
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">{label}</div>
      <div className={`text-[13px] truncate ${tabular ? "tabular-nums" : ""} ${isEmpty ? "text-muted-foreground" : ""}`}>
        {link && !isEmpty ? (
          <a
            href={link.startsWith("http") || link.startsWith("mailto") ? link : `https://${link}`}
            target={link.startsWith("mailto") ? "_self" : "_blank"}
            rel="noreferrer"
            className="text-foreground hover:text-primary hover:underline"
          >
            {display}
          </a>
        ) : display}
      </div>
    </div>
  )
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{title}</h3>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <label className="text-[11px] font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  )
}

function toDateInput(date: string | null | undefined): string {
  if (!date) return ""
  const d = new Date(date)
  if (isNaN(d.getTime())) return ""
  return d.toISOString().slice(0, 10)
}

interface NurtureTouch {
  dayOffset: number
  channel: "email" | "whatsapp" | "call"
  purpose: string
  subject?: string | null
  body?: string | null
}

interface NurtureResponse { touches: NurtureTouch[]; strategy: string }

const INTENTS: Array<{ value: "new-lead" | "warmup" | "re-engage" | "post-demo"; label: string }> = [
  { value: "new-lead", label: "New lead intro" },
  { value: "warmup", label: "Warmup educate" },
  { value: "re-engage", label: "Re-engage stale" },
  { value: "post-demo", label: "Post-demo follow-up" },
]

function NurtureSequenceTrigger({ contactId }: { contactId: string }) {
  const [open, setOpen] = React.useState(false)
  const [intent, setIntent] = React.useState<(typeof INTENTS)[number]["value"]>("new-lead")
  const [seq, setSeq] = React.useState<NurtureResponse | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [scheduling, setScheduling] = React.useState(false)

  async function generate() {
    setLoading(true); setSeq(null)
    try {
      const r = await fetch("/api/ai/nurture-sequence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, intent }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? "Failed")
      setSeq(data as NurtureResponse)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  async function schedule() {
    if (!seq) return
    setScheduling(true)
    try {
      const r = await fetch("/api/ai/schedule-nurture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, sequence: seq.touches }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? "Failed")
      toast.success(`Scheduled ${data.activityIds.length} touches`)
      setOpen(false); setSeq(null)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setScheduling(false)
    }
  }

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="border-violet-200 text-violet-700 hover:bg-violet-50 hover:text-violet-700"
        onClick={() => setOpen(true)}
      >
        <Sparkles className="h-3.5 w-3.5 mr-1.5" />
        Generate nurture sequence
      </Button>
      <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setSeq(null) }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-violet-500" /> Nurture Sequence
            </DialogTitle>
            <DialogDescription>
              AI generates a 4-touch sequence based on contact context. Review, then schedule as tasks.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Intent</label>
              <Select value={intent} onValueChange={(v) => setIntent(v as typeof intent)}>
                <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {INTENTS.map((i) => <SelectItem key={i.value} value={i.value}>{i.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {!seq && (
              <Button size="sm" onClick={generate} disabled={loading}>
                {loading ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Generating...</> : "Generate"}
              </Button>
            )}
            {seq && (
              <div className="space-y-2">
                <div className="rounded-md border bg-violet-50/40 p-2.5 text-xs">
                  <span className="font-medium">Strategy: </span>{seq.strategy}
                </div>
                <ul className="space-y-1.5">
                  {seq.touches.map((t, i) => (
                    <li key={i} className="rounded-md border bg-card p-2.5">
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <Badge variant="outline" className="text-[10px]">Day +{t.dayOffset}</Badge>
                        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t.channel}</span>
                      </div>
                      <div className="text-xs font-medium">{t.purpose}</div>
                      {t.subject && <div className="text-[11px] text-muted-foreground mt-1"><span className="font-medium">Subject:</span> {t.subject}</div>}
                      {t.body && <div className="text-[11px] text-muted-foreground mt-1 line-clamp-2">{t.body}</div>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            {seq && (
              <>
                <Button variant="outline" onClick={generate} disabled={loading}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Regenerate
                </Button>
                <Button onClick={schedule} disabled={scheduling}>
                  {scheduling ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
                  Schedule as tasks
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
