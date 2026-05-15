"use client"

import * as React from "react"
import { useMutation } from "@tanstack/react-query"
import { toast } from "sonner"
import { Loader2, Sparkles, Send } from "lucide-react"
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

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  dealId: string
  contactId?: string
  contactEmail?: string
}

export function EmailComposer({ open, onOpenChange, dealId, contactId, contactEmail }: Props) {
  const [to, setTo] = React.useState(contactEmail ?? "")
  const [subject, setSubject] = React.useState("")
  const [body, setBody] = React.useState("")
  const [purpose, setPurpose] = React.useState<"follow-up" | "proposal" | "closing" | "introduction">("follow-up")

  React.useEffect(() => { if (contactEmail) setTo(contactEmail) }, [contactEmail])

  const gen = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/ai/draft-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, purpose }),
      })
      if (!res.ok) throw new Error("AI draft failed")
      return res.json() as Promise<{ subject: string; body: string; tone: string }>
    },
    onSuccess: (d) => {
      setSubject(d.subject)
      setBody(d.body)
      toast.success("Draft generated")
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const send = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/email/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ to, subject, body, dealId, contactId }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || "Send failed")
      return data
    },
    onSuccess: () => {
      toast.success("Email sent via Resend")
      setSubject(""); setBody("")
      onOpenChange(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  function handleSend() {
    if (!to.trim() || !to.includes("@")) { toast.error("Valid recipient email required"); return }
    if (!subject.trim() || !body.trim()) { toast.error("Subject and body required"); return }
    send.mutate()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Compose email</DialogTitle>
          <DialogDescription>Draft and send a B2B sales email.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="flex gap-2 items-end">
            <div className="flex-1 space-y-2">
              <Label>Purpose</Label>
              <Select value={purpose} onValueChange={(v) => setPurpose(v as typeof purpose)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="follow-up">Follow up</SelectItem>
                  <SelectItem value="proposal">Send proposal</SelectItem>
                  <SelectItem value="closing">Closing</SelectItem>
                  <SelectItem value="introduction">Introduction</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={() => gen.mutate()} disabled={gen.isPending} variant="secondary">
              {gen.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Generate with AI
            </Button>
          </div>
          <div className="space-y-2">
            <Label>To</Label>
            <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="contact@example.com" />
          </div>
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Body</Label>
            <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSend} disabled={send.isPending}>
            {send.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            {send.isPending ? "Sending..." : "Send"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
