import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { parseTags, stringifyTags, daysBetween } from "@/lib/utils"
import { isClosedStage } from "@/lib/stage-helpers"
import { safeError } from "@/lib/api-errors"
import { parseAIInsight } from "@/lib/ai"
import { isPrivileged, ROLES } from "@/lib/constants"

interface ScorePayload {
  score: number
  confidence: "low" | "medium" | "high"
  reasoning: string
  risks: string[]
  opportunities: string[]
}
interface SuggestionPayload {
  actions: Array<{ title: string; description: string; priority: "low" | "medium" | "high"; type: string }>
}

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
    if (session.user.role === ROLES.REP && deal.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const daysInStage = daysBetween(deal.stageEnteredAt)

    // aiInsights is ordered desc by createdAt; find() returns the most-recent match per type.
    const latestScoreInsight = deal.aiInsights.find((i) => i.type === "SCORE")
    const latestSuggestInsight = deal.aiInsights.find((i) => i.type === "SUGGESTION")
    const latestScore = latestScoreInsight ? parseAIInsight<ScorePayload>(latestScoreInsight) : null
    const latestSuggestions = latestSuggestInsight ? parseAIInsight<SuggestionPayload>(latestSuggestInsight) : null

    return NextResponse.json({
      ...deal,
      tags: parseTags(deal.tags),
      contact: { ...deal.contact, tags: parseTags(deal.contact.tags) },
      daysInStage,
      latestScore,
      latestSuggestions,
    })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
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
    const oldStageName = existing.stage
    let newStageName = existing.stage

    // REP scope: cannot modify foreign deals
    if (session.user.role === ROLES.REP && existing.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    const canAssign = isPrivileged(session.user.role)

    if (data.stageId && data.stageId !== existing.stageId) {
      const stage = await prisma.stage.findUnique({ where: { id: data.stageId } })
      if (!stage) return NextResponse.json({ error: "Stage not found" }, { status: 404 })
      updateData.stageId = stage.id
      updateData.stage = stage.name
      updateData.probability = stage.probability
      updateData.stageEnteredAt = new Date()
      newStageName = stage.name
      stageChanged = true
      if (isClosedStage(stage.name)) {
        updateData.actualCloseDate = new Date()
      } else if (isClosedStage(existing.stage)) {
        // Reopening a previously-closed deal: clear actualCloseDate
        updateData.actualCloseDate = null
      }
    }

    if (data.title !== undefined) updateData.title = data.title
    if (data.value !== undefined) updateData.value = data.value
    if (data.currency !== undefined) updateData.currency = data.currency
    if (data.contactId !== undefined) updateData.contactId = data.contactId
    // REPs cannot reassign ownership
    if (data.ownerId !== undefined && canAssign) updateData.ownerId = data.ownerId
    // Allow explicit probability override; if stage changed it set a default, override wins.
    if (data.probability !== undefined) updateData.probability = data.probability
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
          kind: "stage_change",
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
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const existing = await prisma.deal.findUnique({ where: { id: params.id } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (!isPrivileged(session.user.role) && existing.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await prisma.deal.delete({ where: { id: params.id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
