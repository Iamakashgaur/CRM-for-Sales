import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"
import type { StageSuggestionPayload } from "@/lib/stage-suggest"

export const dynamic = "force-dynamic"

const PostBody = z.object({
  dealId: z.string().min(1),
  action: z.enum(["accept", "dismiss"]),
})

async function latestPendingSuggestion(dealId: string) {
  const rows = await prisma.aIInsight.findMany({
    where: { dealId, type: "STAGE_SUGGESTION" },
    orderBy: { createdAt: "desc" },
    take: 5,
  })
  for (const r of rows) {
    try {
      const p = JSON.parse(r.payload) as StageSuggestionPayload
      if (p.status === "pending") return { insight: r, payload: p }
    } catch {
      // skip
    }
  }
  return null
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const dealId = req.nextUrl.searchParams.get("dealId")
    if (!dealId) return NextResponse.json({ error: "dealId required" }, { status: 400 })

    const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { ownerId: true } })
    if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (session.user.role === "REP" && deal.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const pending = await latestPendingSuggestion(dealId)
    return NextResponse.json({ suggestion: pending?.payload ?? null })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!rateLimit(`ai-stage:${session.user.id}`, 30, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const parsed = PostBody.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    const { dealId, action } = parsed.data

    const deal = await prisma.deal.findUnique({ where: { id: dealId } })
    if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (session.user.role === "REP" && deal.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const pending = await latestPendingSuggestion(dealId)
    if (!pending) return NextResponse.json({ error: "No pending suggestion" }, { status: 404 })

    if (action === "accept") {
      const stage = await prisma.stage.findUnique({ where: { id: pending.payload.suggestedStageId } })
      if (!stage) {
        return NextResponse.json({ error: "Suggested stage no longer exists" }, { status: 404 })
      }
      await prisma.$transaction([
        prisma.deal.update({
          where: { id: dealId },
          data: {
            stageId: stage.id,
            stage: stage.name,
            stageEnteredAt: new Date(),
          },
        }),
        prisma.aIInsight.update({
          where: { id: pending.insight.id },
          data: {
            payload: JSON.stringify({ ...pending.payload, status: "accepted" } satisfies StageSuggestionPayload),
          },
        }),
      ])
      return NextResponse.json({ ok: true, applied: true, stageId: stage.id, stageName: stage.name })
    }

    // dismiss
    await prisma.aIInsight.update({
      where: { id: pending.insight.id },
      data: {
        payload: JSON.stringify({ ...pending.payload, status: "dismissed" } satisfies StageSuggestionPayload),
      },
    })
    return NextResponse.json({ ok: true, applied: false })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
