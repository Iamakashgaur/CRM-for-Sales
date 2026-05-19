import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { safeError } from "@/lib/api-errors"

export const dynamic = "force-dynamic"

const Body = z.object({
  target: z.enum(["contacts", "deals", "activities", "callLogs", "aiInsights", "all"]),
  confirm: z.literal("DELETE"),
})

interface DeleteableModel {
  findMany: (args: { where: object; select: { id: true }; take: number }) => Promise<{ id: string }[]>
  deleteMany: (args: { where: { id: { in: string[] } } }) => Promise<{ count: number }>
}

async function chunkedDeleteAll(model: DeleteableModel): Promise<number> {
  let total = 0
  // Loop until no rows remain
  while (true) {
    const batch = await model.findMany({ where: {}, select: { id: true }, take: 1000 })
    if (batch.length === 0) break
    const r = await model.deleteMany({ where: { id: { in: batch.map((b) => b.id) } } })
    total += r.count
    if (batch.length < 1000) break
  }
  return total
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 })

    const parsed = Body.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const { target } = parsed.data
    const result: Record<string, number> = {}

    switch (target) {
      case "callLogs": {
        const r = await prisma.callLog.deleteMany({})
        result.callLogs = r.count
        break
      }
      case "aiInsights": {
        const r = await prisma.aIInsight.deleteMany({})
        result.aiInsights = r.count
        break
      }
      case "activities": {
        const r = await prisma.activity.deleteMany({})
        result.activities = r.count
        break
      }
      case "deals": {
        const [a, b] = await prisma.$transaction([
          prisma.aIInsight.deleteMany({ where: { dealId: { not: null } } }),
          prisma.deal.deleteMany({}),
        ])
        result.aiInsights = a.count
        result.deals = b.count
        break
      }
      case "contacts":
      case "all": {
        // Chunked deletes to avoid SQLite transaction-size limits on large datasets
        result.aiInsights = await chunkedDeleteAll(prisma.aIInsight as unknown as DeleteableModel)
        result.activities = await chunkedDeleteAll(prisma.activity as unknown as DeleteableModel)
        result.callLogs = await chunkedDeleteAll(prisma.callLog as unknown as DeleteableModel)
        result.emails = await chunkedDeleteAll(prisma.emailSyncMessage as unknown as DeleteableModel)
        result.deals = await chunkedDeleteAll(prisma.deal as unknown as DeleteableModel)
        result.contacts = await chunkedDeleteAll(prisma.contact as unknown as DeleteableModel)
        break
      }
    }

    return NextResponse.json({ ok: true, target, deleted: result })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
