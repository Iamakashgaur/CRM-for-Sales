import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const createSchema = z.object({
  type: z.enum(["CALL", "EMAIL", "MEETING", "NOTE", "TASK"]),
  subject: z.string().min(1),
  body: z.string().optional(),
  dueAt: z.string().optional(),
  completedAt: z.string().optional(),
  dealId: z.string().optional(),
  contactId: z.string().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const contactId = searchParams.get("contactId") || undefined
    const dealId = searchParams.get("dealId") || undefined
    const userId = searchParams.get("userId") || undefined
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10) || 100))

    const where: Record<string, unknown> = {}
    if (contactId) where.contactId = contactId
    if (dealId) where.dealId = dealId
    if (userId) where.userId = userId

    const activities = await prisma.activity.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { user: { select: { id: true, name: true, avatar: true } } },
    })
    return NextResponse.json({ activities })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const data = parsed.data
    const created = await prisma.activity.create({
      data: {
        type: data.type,
        subject: data.subject,
        body: data.body ?? null,
        dueAt: data.dueAt ? new Date(data.dueAt) : null,
        completedAt: data.completedAt ? new Date(data.completedAt) : null,
        dealId: data.dealId ?? null,
        contactId: data.contactId ?? null,
        userId: session.user.id,
      },
    })
    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
