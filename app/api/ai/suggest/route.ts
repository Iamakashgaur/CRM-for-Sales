import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { suggestActions } from "@/lib/ai"
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
        activities: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    })
    if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const recentActivities = deal.activities.map((a) => {
      const daysAgo = daysBetween(a.createdAt)
      return `[${a.type} - ${daysAgo}d ago] ${a.subject}`
    })
    const lastActivity = deal.activities[0]
    const daysSinceLastActivity = lastActivity ? daysBetween(lastActivity.createdAt) : daysBetween(deal.createdAt)

    const result = await suggestActions({
      dealTitle: deal.title,
      stage: deal.stage,
      daysSinceLastActivity,
      recentActivities,
    })

    await prisma.aIInsight.create({
      data: {
        type: "SUGGESTION",
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
