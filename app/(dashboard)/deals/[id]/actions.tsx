"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Pencil, Trash2, CheckCircle2, XCircle, Loader2, Sparkles } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
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
import { DealForm } from "@/components/crm/DealForm"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

interface DealInput {
  id: string
  title: string
  value: number
  currency: string
  stageId: string
  contactId: string
  ownerId: string
  probability: number
  expectedCloseDate: string | null
  notes: string | null
  tags: string[]
  lostReason: string | null
}

interface StageOpt { id: string; name: string; probability: number }

export function DealDetailActions({ deal }: { deal: DealInput }) {
  const router = useRouter()
  const qc = useQueryClient()
  const [editOpen, setEditOpen] = React.useState(false)
  const [lostOpen, setLostOpen] = React.useState(false)
  const [lostReason, setLostReason] = React.useState("")
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  const stagesQ = useQuery<{ stages: StageOpt[] }>({
    queryKey: ["stages"],
    queryFn: async () => (await fetch("/api/stages")).json(),
  })

  const [calibration, setCalibration] = React.useState<{
    probability: number
    reasoning: string
    basisCount: number
    basisWon: number
    basisLost: number
  } | null>(null)
  const [calibrating, setCalibrating] = React.useState(false)

  async function runCalibration() {
    setCalibrating(true)
    try {
      const res = await fetch(`/api/ai/calibrate-probability?dealId=${deal.id}&refresh=1`)
      const data = (await res.json()) as { probability?: number; reasoning?: string; basisCount?: number; basisWon?: number; basisLost?: number; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Calibration failed")
      setCalibration({
        probability: data.probability ?? deal.probability,
        reasoning: data.reasoning ?? "",
        basisCount: data.basisCount ?? 0,
        basisWon: data.basisWon ?? 0,
        basisLost: data.basisLost ?? 0,
      })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setCalibrating(false)
    }
  }

  function applyCalibration() {
    if (!calibration) return
    updateMut.mutate(
      { probability: calibration.probability },
      { onSuccess: () => toast.success(`Probability set to ${calibration.probability}%`) }
    )
  }

  const updateMut = useMutation({
    mutationFn: async (patch: Record<string, unknown>) => {
      const res = await fetch(`/api/deals/${deal.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed")
      return res.json()
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["deals"] })
      router.refresh()
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const deleteMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/deals/${deal.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed")
      return res.json()
    },
    onSuccess: () => {
      toast.success("Deal deleted")
      qc.invalidateQueries({ queryKey: ["deals"] })
      router.push("/deals")
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const stages = stagesQ.data?.stages ?? []
  const wonStage = stages.find((s) => s.probability === 100) ?? stages.find((s) => s.name.toLowerCase().includes("won"))
  const lostStage =
    stages.find((s) => s.probability === 0 && s.name.toLowerCase().includes("lost"))
    ?? stages.find((s) => s.name.toLowerCase().includes("lost"))

  function handleDelete() {
    setConfirmOpen(true)
  }

  function handleMarkWon() {
    if (!wonStage) {
      toast.error("Closed Won stage not configured")
      return
    }
    updateMut.mutate({ stageId: wonStage.id }, { onSuccess: () => toast.success("Marked as won") })
  }

  function confirmMarkLost() {
    if (!lostStage) {
      toast.error("Closed Lost stage not configured")
      return
    }
    updateMut.mutate(
      { stageId: lostStage.id, lostReason: lostReason || null },
      {
        onSuccess: () => {
          toast.success("Marked as lost")
          setLostOpen(false)
          setLostReason("")
        },
      }
    )
  }

  function handleStageChange(stageId: string) {
    if (stageId === deal.stageId) return
    updateMut.mutate({ stageId }, { onSuccess: () => toast.success("Stage updated") })
  }

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Actions</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <div className="space-y-2">
          <Label>Stage</Label>
          <Select value={deal.stageId} onValueChange={handleStageChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(stagesQ.data?.stages ?? []).map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            className="bg-green-50 hover:bg-green-100 border-green-300 text-green-700"
            onClick={handleMarkWon}
            disabled={updateMut.isPending}
          >
            <CheckCircle2 className="h-4 w-4 mr-1" /> Mark Won
          </Button>
          <Button
            variant="outline"
            className="bg-red-50 hover:bg-red-100 border-red-300 text-red-700"
            onClick={() => setLostOpen(true)}
            disabled={updateMut.isPending}
          >
            <XCircle className="h-4 w-4 mr-1" /> Mark Lost
          </Button>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => setEditOpen(true)}>
            <Pencil className="h-4 w-4 mr-1" /> Edit
          </Button>
          <Button variant="destructive" onClick={handleDelete} disabled={deleteMut.isPending}>
            {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Trash2 className="h-4 w-4 mr-1" /> Delete</>}
          </Button>
        </div>
        <div className="pt-3 border-t space-y-2">
          <div className="flex items-center justify-between gap-2">
            <Label className="m-0">Win probability</Label>
            <Button
              size="sm"
              variant="outline"
              className="border-violet-200 text-violet-700 hover:bg-violet-50 hover:text-violet-700"
              onClick={runCalibration}
              disabled={calibrating}
            >
              {calibrating ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 mr-1.5" />}
              Calibrate with AI
            </Button>
          </div>
          {calibration && (
            <div className="rounded-md border bg-violet-50/50 border-violet-200 p-3 text-xs space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">AI suggests</span>
                <span className="text-base font-semibold text-violet-700 tabular-nums">{calibration.probability}%</span>
              </div>
              <p className="text-muted-foreground">{calibration.reasoning}</p>
              {calibration.basisCount > 0 && (
                <p className="text-[10px] text-muted-foreground">
                  Based on {calibration.basisCount} similar closed deals · won {calibration.basisWon} · lost {calibration.basisLost}
                </p>
              )}
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="ghost" onClick={() => setCalibration(null)}>Dismiss</Button>
                <Button
                  size="sm"
                  onClick={applyCalibration}
                  disabled={updateMut.isPending || calibration.probability === deal.probability}
                >
                  Apply
                </Button>
              </div>
            </div>
          )}
        </div>
      </CardContent>

      <DealForm open={editOpen} onOpenChange={setEditOpen} initial={deal} />

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete deal?"
        description={`Delete deal "${deal.title}"? This cannot be undone.`}
        confirmText="Delete"
        destructive
        onConfirm={() => { setConfirmOpen(false); deleteMut.mutate() }}
      />

      <Dialog open={lostOpen} onOpenChange={(o) => { setLostOpen(o); if (!o) setLostReason("") }}>
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
            <Button variant="outline" onClick={() => setLostOpen(false)}>Cancel</Button>
            <Button variant="destructive" onClick={confirmMarkLost} disabled={!lostReason.trim() || updateMut.isPending}>
              Mark Lost
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}
