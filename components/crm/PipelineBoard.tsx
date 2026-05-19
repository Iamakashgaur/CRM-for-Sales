"use client"

import * as React from "react"
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  closestCenter,
} from "@dnd-kit/core"
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable"
import { toast } from "sonner"
import { Plus } from "lucide-react"
import { DealCard, type DealCardData } from "./DealCard"
import { DealForm } from "./DealForm"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { formatCurrency, cn } from "@/lib/utils"

interface Stage {
  id: string
  name: string
  order: number
  color: string
  probability: number
  isClosed?: boolean
}

interface DealWire extends DealCardData {
  stageId: string
  stage: string
}

function Column({
  stage,
  deals,
}: {
  stage: Stage
  deals: DealWire[]
}) {
  const { setNodeRef, isOver } = useSortable({ id: `col-${stage.id}`, data: { type: "column", stageId: stage.id } })
  const total = deals.reduce((s, d) => s + d.value, 0)
  return (
    <div
      ref={setNodeRef}
      className={cn(
        "min-w-[240px] flex flex-col rounded-xl bg-muted/40 transition-all duration-180 ease-out-soft",
        isOver && "ring-2 ring-accent/30 bg-accent/5"
      )}
    >
      <div className="px-3 py-2.5 sticky top-0 bg-muted/70 backdrop-blur-md rounded-t-xl z-10 border-b border-border/40">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-2 w-2 rounded-full shrink-0 ring-2 ring-background" style={{ background: stage.color }} />
            <span className="font-semibold text-[12px] tracking-tight truncate">{stage.name}</span>
            <span className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full bg-background text-[10px] font-medium text-muted-foreground tabular-nums">
              {deals.length}
            </span>
          </div>
          <div className="text-[11px] font-medium text-foreground tabular-nums shrink-0">{formatCurrency(total)}</div>
        </div>
      </div>
      <SortableContext id={stage.id} items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 p-2 space-y-2 min-h-[200px]">
          {deals.map((d) => (
            <DealCard key={d.id} deal={d} />
          ))}
          {deals.length === 0 && (
            <div className="m-2 rounded-lg border border-dashed border-border/70 py-10 px-3 text-center">
              <p className="text-[11px] text-muted-foreground">Drop deals here</p>
            </div>
          )}
        </div>
      </SortableContext>
    </div>
  )
}

export function PipelineBoard() {
  const qc = useQueryClient()
  const [activeId, setActiveId] = React.useState<string | null>(null)
  const [search, setSearch] = React.useState("")
  const [openNew, setOpenNew] = React.useState(false)

  const stagesQ = useQuery<{ stages: Stage[] }>({
    queryKey: ["stages"],
    queryFn: async () => {
      const res = await fetch("/api/stages")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })
  const dealsQ = useQuery<{ deals: DealWire[] }>({
    queryKey: ["deals", "pipeline"],
    queryFn: async () => {
      const res = await fetch("/api/deals?slim=true&limit=1000")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } }),
  )

  interface MoveVars { id: string; stageId: string; newStage: Stage }
  interface MoveCtx { prev: { deals: DealWire[] } | undefined }

  const move = useMutation<unknown, Error, MoveVars, MoveCtx>({
    mutationFn: async ({ id, stageId }: MoveVars) => {
      const res = await fetch(`/api/deals/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId }),
      })
      if (!res.ok) throw new Error("Move failed")
      return res.json()
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: ["deals", "pipeline"] })
      const prev = qc.getQueryData<{ deals: DealWire[] }>(["deals", "pipeline"])
      qc.setQueryData<{ deals: DealWire[] }>(["deals", "pipeline"], (old) => {
        if (!old) return old
        return {
          deals: old.deals.map((d) => {
            if (d.id !== vars.id) return d
            const targetClosed = vars.newStage.isClosed ?? (vars.newStage.probability === 100 || vars.newStage.probability === 0)
            const wasClosed = d.probability === 100 || d.probability === 0
            const nowIso = new Date().toISOString()
            const next: DealWire = {
              ...d,
              stageId: vars.newStage.id,
              stage: vars.newStage.name,
              probability: vars.newStage.probability,
              stageEnteredAt: nowIso,
            }
            if (targetClosed) next.actualCloseDate = nowIso
            else if (wasClosed) next.actualCloseDate = null
            return next
          }),
        }
      })
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["deals", "pipeline"], ctx.prev)
      toast.error("Failed to move deal")
    },
    onSuccess: () => {
      toast.success("Deal moved")
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["deals", "pipeline"] })
    },
  })

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over || !dealsQ.data || !stagesQ.data) return

    const activeDeal = dealsQ.data.deals.find((d) => d.id === active.id)
    if (!activeDeal) return

    let targetStageId: string | undefined
    const overId = String(over.id)
    if (overId.startsWith("col-")) {
      targetStageId = overId.slice(4)
    } else {
      const overDeal = dealsQ.data.deals.find((d) => d.id === overId)
      targetStageId = overDeal?.stageId
    }
    if (!targetStageId || targetStageId === activeDeal.stageId) return

    const newStage = stagesQ.data.stages.find((s) => s.id === targetStageId)
    if (!newStage) return

    move.mutate({ id: activeDeal.id, stageId: newStage.id, newStage })
  }

  const loading = stagesQ.isLoading || dealsQ.isLoading
  const stages = stagesQ.data?.stages ?? []
  const dealsAll = dealsQ.data?.deals ?? []
  const deals = search
    ? dealsAll.filter((d) => d.title.toLowerCase().includes(search.toLowerCase()))
    : dealsAll
  const activeDeal = dealsAll.find((d) => d.id === activeId) ?? null

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Pipeline</h1>
          <p className="text-[13px] text-muted-foreground mt-1">Drag deals between stages to update them</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="Search deals..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-xs"
          />
          <Button onClick={() => setOpenNew(true)}>
            <Plus className="h-4 w-4 mr-2" /> New Deal
          </Button>
        </div>
      </div>

      {dealsAll.length >= 1000 && (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800">
          Showing first 1000 deals. Use filters to narrow results.
        </div>
      )}

      {loading ? (
        <div className="overflow-x-auto">
          <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${stages.length || 6}, minmax(240px, 1fr))` }}>
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <Skeleton key={i} className="h-[400px]" />
            ))}
          </div>
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="overflow-x-auto pb-4 flex-1">
            <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${stages.length || 6}, minmax(240px, 1fr))` }}>
              <SortableContext items={stages.map((s) => `col-${s.id}`)}>
                {stages.map((st) => (
                  <Column key={st.id} stage={st} deals={deals.filter((d) => d.stageId === st.id)} />
                ))}
              </SortableContext>
            </div>
          </div>
          <DragOverlay>{activeDeal ? <DealCard deal={activeDeal} /> : null}</DragOverlay>
        </DndContext>
      )}

      <DealForm open={openNew} onOpenChange={setOpenNew} />
    </div>
  )
}
