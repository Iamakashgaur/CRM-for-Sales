import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { scoreDeal } from "@/lib/ai"
import { daysBetween } from "@/lib/utils"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"
import crypto from "crypto"

export const dynamic = "force-dynamic"

const schema = z.object({ dealId: z.string().min(1) })

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!rateLimit(`ai:${session.user.id}`, 20, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const forceRefresh = req.nextUrl.searchParams.get("refresh") === "1"

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const deal = await prisma.deal.findUnique({
      where: { id: parsed.data.dealId },
      include: {
        contact: true,
        activities: { orderBy: { createdAt: "desc" } },
      },
    })
    if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (session.user.role === "REP" && deal.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const stageChangeActivity = deal.activities.find((a) => a.kind === "stage_change" || a.subject.startsWith("Stage changed"))
    const sinceDate = stageChangeActivity ? stageChangeActivity.createdAt : deal.createdAt
    const daysInStage = daysBetween(sinceDate)
    const lastActivity = deal.activities[0]
    const daysSinceLastActivity = lastActivity ? daysBetween(lastActivity.createdAt) : daysBetween(deal.createdAt)

    const contentHash = crypto
      .createHash("sha1")
      .update(`${deal.stage}|${deal.value}|${deal.activities.length}|${daysInStage}`)
      .digest("hex")

    if (!forceRefresh) {
      const recent = await prisma.aIInsight.findFirst({
        where: {
          dealId: deal.id,
          type: "SCORE",
          createdAt: { gte: new Date(Date.now() - 86_400_000) },
        },
        orderBy: { createdAt: "desc" },
      })
      if (recent) {
        try {
          const parsed = JSON.parse(recent.payload) as { _contentHash?: string }
          if (parsed._contentHash === contentHash) {
            return NextResponse.json(parsed)
          }
        } catch {
          // fall through to recompute
        }
      }
    }

    const result = await scoreDeal({
      title: deal.title,
      value: deal.value,
      stage: deal.stage,
      daysInStage,
      daysSinceLastActivity,
      contactCompany: deal.contact.company,
      notes: deal.notes,
    })

    const stored = { ...result, _contentHash: contentHash }
    await prisma.aIInsight.create({
      data: {
        type: "SCORE",
        payload: JSON.stringify(stored),
        dealId: deal.id,
        contactId: deal.contactId,
        userId: session.user.id,
      },
    })

    return NextResponse.json(stored)
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
