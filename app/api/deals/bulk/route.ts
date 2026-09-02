import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { stringifyTags } from "@/lib/utils"
import { isClosedStage } from "@/lib/stage-helpers"
import { safeError } from "@/lib/api-errors"

export const dynamic = "force-dynamic"

const bulkSchema = z.object({
  ids: z.array(z.string()).min(1),
  patch: z.object({
    stageId: z.string().optional(),
    ownerId: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
})

const bulkDeleteSchema = z.object({
  ids: z.array(z.string()).min(1),
})

const MAX_IDS = 500

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!["ADMIN", "MANAGER"].includes(session.user.role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json()
    const parsed = bulkSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const { ids, patch } = parsed.data
    if (ids.length > MAX_IDS) return NextResponse.json({ error: `Too many ids (max ${MAX_IDS})` }, { status: 400 })

    if (patch.ownerId) {
      const owner = await prisma.user.findUnique({ where: { id: patch.ownerId }, select: { id: true } })
      if (!owner) return NextResponse.json({ error: "Owner not found" }, { status: 400 })
    }

    let stage: { id: string; name: string; probability: number } | null = null
    if (patch.stageId) {
      const found = await prisma.stage.findUnique({ where: { id: patch.stageId } })
      if (!found) return NextResponse.json({ error: "Stage not found" }, { status: 400 })
      stage = { id: found.id, name: found.name, probability: found.probability }
    }

    const deals = await prisma.deal.findMany({ where: { id: { in: ids } } })

    type Op = ReturnType<typeof prisma.deal.update> | ReturnType<typeof prisma.activity.create>
    const ops: Op[] = []
    let updated = 0

    for (const deal of deals) {
      const updateData: Record<string, unknown> = {}
      let stageChanged = false
      const oldStageName = deal.stage

      if (stage && stage.id !== deal.stageId) {
        updateData.stageId = stage.id
        updateData.stage = stage.name
        updateData.probability = stage.probability
        stageChanged = true
        if (isClosedStage(stage.name)) {
          updateData.actualCloseDate = new Date()
        }
      }
      if (patch.ownerId !== undefined) updateData.ownerId = patch.ownerId
      if (patch.tags !== undefined) updateData.tags = stringifyTags(patch.tags)

      if (Object.keys(updateData).length === 0) continue

      ops.push(prisma.deal.update({ where: { id: deal.id }, data: updateData }))
      updated++

      if (stageChanged && stage) {
        ops.push(
          prisma.activity.create({
            data: {
              type: "NOTE",
              kind: "stage_change",
              subject: `Stage changed to ${stage.name}`,
              body: `${oldStageName} → ${stage.name}`,
              dealId: deal.id,
              contactId: deal.contactId,
              userId: session.user.id,
            },
          })
        )
      }
    }

    if (ops.length > 0) {
      await prisma.$transaction(ops)
    }

    return NextResponse.json({ updated })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const body = await req.json()
    const parsed = bulkDeleteSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const { ids } = parsed.data
    if (ids.length > MAX_IDS) return NextResponse.json({ error: `Too many ids (max ${MAX_IDS})` }, { status: 400 })

    const [result] = await prisma.$transaction([
      prisma.deal.deleteMany({ where: { id: { in: ids } } }),
    ])
    const failed = ids.length - result.count

    return NextResponse.json({ deleted: result.count, failed, total: ids.length })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
