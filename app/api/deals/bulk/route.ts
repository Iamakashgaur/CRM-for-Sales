import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { stringifyTags } from "@/lib/utils"

export const dynamic = "force-dynamic"

const bulkSchema = z.object({
  ids: z.array(z.string()).min(1),
  patch: z.object({
    stageId: z.string().optional(),
    ownerId: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
})

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
    let stage: { id: string; name: string; probability: number } | null = null
    if (patch.stageId) {
      const found = await prisma.stage.findUnique({ where: { id: patch.stageId } })
      if (!found) return NextResponse.json({ error: "Stage not found" }, { status: 404 })
      stage = { id: found.id, name: found.name, probability: found.probability }
    }

    const deals = await prisma.deal.findMany({ where: { id: { in: ids } } })
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
        if (stage.name === "Closed Won" || stage.name === "Closed Lost") {
          updateData.actualCloseDate = new Date()
        }
      }
      if (patch.ownerId !== undefined) updateData.ownerId = patch.ownerId
      if (patch.tags !== undefined) updateData.tags = stringifyTags(patch.tags)

      if (Object.keys(updateData).length === 0) continue

      await prisma.deal.update({ where: { id: deal.id }, data: updateData })
      updated++

      if (stageChanged && stage) {
        await prisma.activity.create({
          data: {
            type: "NOTE",
            subject: `Stage changed to ${stage.name}`,
            body: `${oldStageName} → ${stage.name}`,
            dealId: deal.id,
            contactId: deal.contactId,
            userId: session.user.id,
          },
        })
      }
    }

    return NextResponse.json({ updated })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
