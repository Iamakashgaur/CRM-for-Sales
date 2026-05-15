"use client"

import * as React from "react"
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query"
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
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
        "w-[300px] shrink-0 flex flex-col rounded-xl bg-muted/40 transition-all duration-150",
        isOver && "ring-2 ring-accent/40 bg-accent/5"
      )}
    >
      <div className="px-3 py-3 sticky top-0 bg-muted/60 backdrop-blur rounded-t-xl z-10">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="h-2 w-2 rounded-full shrink-0" style={{ background: stage.color }} />
            <span className="font-semibold text-[13px] truncate">{stage.name}</span>
            <span className="inline-flex items-center justify-center min-w-[20px] h-[18px] px-1.5 rounded-full bg-background text-[10px] font-medium text-muted-foreground">
              {deals.length}
            </span>
          </div>
          <div className="text-[11px] text-muted-foreground tabular-nums shrink-0">{formatCurrency(total)}</div>
        </div>
      </div>
      <SortableContext id={stage.id} items={deals.map((d) => d.id)} strategy={verticalListSortingStrategy}>
        <div className="flex-1 p-2 space-y-2 min-h-[200px]">
          {deals.map((d) => (
            <DealCard key={d.id} deal={d} />
          ))}
          {deals.length === 0 && (
            <div className="text-xs text-muted-foreground text-center py-8">Drop deals here</div>
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
      const res = await fetch("/api/deals?limit=500")
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }))

  const move = useMutation({
    mutationFn: async ({ id, stageId }: { id: string; stageId: string }) => {
      const res = await fetch(`/api/deals/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stageId }),
      })
      if (!res.ok) throw new Error("Move failed")
      return res.json()
    },
    onSuccess: () => {
      toast.success("Deal moved")
      qc.invalidateQueries({ queryKey: ["deals"] })
    },
    onError: (e: Error) => {
      toast.error(e.message)
      qc.invalidateQueries({ queryKey: ["deals"] })
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

    qc.setQueryData<{ deals: DealWire[] }>(["deals", "pipeline"], (old) => {
      if (!old) return old
      return {
        deals: old.deals.map((d) =>
          d.id === activeDeal.id ? { ...d, stageId: newStage.id, stage: newStage.name, probability: newStage.probability } : d
        ),
      }
    })
    move.mutate({ id: activeDeal.id, stageId: newStage.id })
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
          <h1 className="text-2xl font-bold tracking-tight">Pipeline</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Drag deals between stages to update them</p>
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

      {loading ? (
        <div className="flex gap-4 overflow-x-auto">
          {[1, 2, 3, 4].map((i) => (
            <Skeleton key={i} className="w-[300px] h-[400px] shrink-0" />
          ))}
        </div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd}>
          <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
            <SortableContext items={stages.map((s) => `col-${s.id}`)}>
              {stages.map((st) => (
                <Column key={st.id} stage={st} deals={deals.filter((d) => d.stageId === st.id)} />
              ))}
            </SortableContext>
          </div>
          <DragOverlay>{activeDeal ? <DealCard deal={activeDeal} /> : null}</DragOverlay>
        </DndContext>
      )}

      <DealForm open={openNew} onOpenChange={setOpenNew} />
    </div>
  )
}
