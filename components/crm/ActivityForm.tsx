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
  type: z.enum(["CALL", "EMAIL", "MEETING", "NOTE", "TASK"]),
  subject: z.string().min(1, "Subject required"),
  body: z.string().optional(),
  dueAt: z.string().optional(),
})

interface Props {
  open: boolean
  onOpenChange: (o: boolean) => void
  dealId?: string
  contactId?: string
}

export function ActivityForm({ open, onOpenChange, dealId, contactId }: Props) {
  const qc = useQueryClient()
  const [type, setType] = React.useState<"CALL" | "EMAIL" | "MEETING" | "NOTE" | "TASK">("NOTE")
  const [subject, setSubject] = React.useState("")
  const [body, setBody] = React.useState("")
  const [dueAt, setDueAt] = React.useState("")
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  function reset() {
    setType("NOTE")
    setSubject("")
    setBody("")
    setDueAt("")
    setErrors({})
  }

  const m = useMutation({
    mutationFn: async () => {
      const parsed = Schema.safeParse({ type, subject, body: body || undefined, dueAt: dueAt || undefined })
      if (!parsed.success) {
        const fieldErrors: Record<string, string> = {}
        for (const e of parsed.error.errors) fieldErrors[String(e.path[0])] = e.message
        setErrors(fieldErrors)
        throw new Error("Invalid")
      }
      const res = await fetch("/api/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...parsed.data, dealId, contactId }),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed")
      return res.json()
    },
    onSuccess: () => {
      toast.success("Activity logged")
      qc.invalidateQueries({ queryKey: ["activities"] })
      reset()
      onOpenChange(false)
    },
    onError: (e: Error) => {
      if (e.message !== "Invalid") toast.error(e.message)
    },
  })

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset() }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Log activity</DialogTitle>
          <DialogDescription>Record a call, email, meeting, note or task.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as typeof type)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="CALL">Call</SelectItem>
                <SelectItem value="EMAIL">Email</SelectItem>
                <SelectItem value="MEETING">Meeting</SelectItem>
                <SelectItem value="NOTE">Note</SelectItem>
                <SelectItem value="TASK">Task</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} />
            {errors.subject && <p className="text-xs text-destructive">{errors.subject}</p>}
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} />
          </div>
          <div className="space-y-2">
            <Label>Due date (optional)</Label>
            <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => m.mutate()} disabled={m.isPending}>
            {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
