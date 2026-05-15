import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { parseTags, stringifyTags, daysBetween } from "@/lib/utils"

export const dynamic = "force-dynamic"

const updateSchema = z.object({
  title: z.string().min(1).optional(),
  value: z.number().min(0).optional(),
  currency: z.string().optional(),
  stageId: z.string().optional(),
  contactId: z.string().optional(),
  ownerId: z.string().optional(),
  probability: z.number().min(0).max(100).optional(),
  tags: z.array(z.string()).optional(),
  expectedCloseDate: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  lostReason: z.string().nullable().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const deal = await prisma.deal.findUnique({
      where: { id: params.id },
      include: {
        contact: true,
        owner: { select: { id: true, name: true, avatar: true, email: true } },
        activities: { orderBy: { createdAt: "desc" }, include: { user: { select: { id: true, name: true, avatar: true } } } },
        aiInsights: { orderBy: { createdAt: "desc" } },
      },
    })
    if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 })
    // REP: only own deals visible
    if (session.user.role === "REP" && deal.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const stageChangeActivity = deal.activities.find((a) => a.subject.startsWith("Stage changed"))
    const sinceDate = stageChangeActivity ? stageChangeActivity.createdAt : deal.createdAt
    const daysInStage = daysBetween(sinceDate)

    return NextResponse.json({
      ...deal,
      tags: parseTags(deal.tags),
      contact: { ...deal.contact, tags: parseTags(deal.contact.tags) },
      daysInStage,
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const existing = await prisma.deal.findUnique({ where: { id: params.id } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const data = parsed.data
    const updateData: Record<string, unknown> = {}
    let stageChanged = false
    let oldStageName = existing.stage
    let newStageName = existing.stage

    if (data.stageId && data.stageId !== existing.stageId) {
      const stage = await prisma.stage.findUnique({ where: { id: data.stageId } })
      if (!stage) return NextResponse.json({ error: "Stage not found" }, { status: 404 })
      updateData.stageId = stage.id
      updateData.stage = stage.name
      updateData.probability = stage.probability
      newStageName = stage.name
      stageChanged = true
      if (stage.name === "Closed Won" || stage.name === "Closed Lost") {
        updateData.actualCloseDate = new Date()
      }
    }

    if (data.title !== undefined) updateData.title = data.title
    if (data.value !== undefined) updateData.value = data.value
    if (data.currency !== undefined) updateData.currency = data.currency
    if (data.contactId !== undefined) updateData.contactId = data.contactId
    if (data.ownerId !== undefined) updateData.ownerId = data.ownerId
    if (data.probability !== undefined && !stageChanged) updateData.probability = data.probability
    if (data.tags !== undefined) updateData.tags = stringifyTags(data.tags)
    if (data.expectedCloseDate !== undefined)
      updateData.expectedCloseDate = data.expectedCloseDate ? new Date(data.expectedCloseDate) : null
    if (data.notes !== undefined) updateData.notes = data.notes
    if (data.lostReason !== undefined) updateData.lostReason = data.lostReason

    const updated = await prisma.deal.update({ where: { id: params.id }, data: updateData })

    if (stageChanged) {
      await prisma.activity.create({
        data: {
          type: "NOTE",
          subject: `Stage changed to ${newStageName}`,
          body: `${oldStageName} → ${newStageName}`,
          dealId: updated.id,
          contactId: updated.contactId,
          userId: session.user.id,
        },
      })
    }

    return NextResponse.json({ ...updated, tags: parseTags(updated.tags) })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const existing = await prisma.deal.findUnique({ where: { id: params.id } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (
      session.user.role !== "ADMIN" &&
      session.user.role !== "MANAGER" &&
      existing.ownerId !== session.user.id
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await prisma.deal.delete({ where: { id: params.id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
