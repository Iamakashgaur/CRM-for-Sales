import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { scoreDeal } from "@/lib/ai"
import { daysBetween } from "@/lib/utils"

export const dynamic = "force-dynamic"

const schema = z.object({ dealId: z.string().min(1) })

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

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

    const stageChangeActivity = deal.activities.find((a) => a.subject.startsWith("Stage changed"))
    const sinceDate = stageChangeActivity ? stageChangeActivity.createdAt : deal.createdAt
    const daysInStage = daysBetween(sinceDate)
    const lastActivity = deal.activities[0]
    const daysSinceLastActivity = lastActivity ? daysBetween(lastActivity.createdAt) : daysBetween(deal.createdAt)

    const result = await scoreDeal({
      title: deal.title,
      value: deal.value,
      stage: deal.stage,
      daysInStage,
      daysSinceLastActivity,
      contactCompany: deal.contact.company,
      notes: deal.notes,
    })

    await prisma.aIInsight.create({
      data: {
        type: "SCORE",
        payload: JSON.stringify(result),
        dealId: deal.id,
        contactId: deal.contactId,
        userId: session.user.id,
      },
    })

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
