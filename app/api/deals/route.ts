import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { parseTags, stringifyTags } from "@/lib/utils"

export const dynamic = "force-dynamic"

const createSchema = z.object({
  title: z.string().min(1),
  value: z.number().min(0),
  currency: z.string().default("USD"),
  stageId: z.string().min(1),
  contactId: z.string().min(1),
  ownerId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  expectedCloseDate: z.string().optional(),
  notes: z.string().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1)
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") ?? "100", 10) || 100))
    const stage = searchParams.get("stage") || undefined
    const ownerId = searchParams.get("ownerId") || undefined
    const contactId = searchParams.get("contactId") || undefined
    const minValue = searchParams.get("minValue")
    const maxValue = searchParams.get("maxValue")
    const q = searchParams.get("q")?.trim() || ""

    const where: Record<string, unknown> = {}
    if (stage) where.stage = stage
    // REP: scope to own deals only. ADMIN/MANAGER see all.
    if (session.user.role === "REP") {
      where.ownerId = session.user.id
    } else if (ownerId) {
      where.ownerId = ownerId
    }
    if (contactId) where.contactId = contactId
    const valueFilter: Record<string, number> = {}
    if (minValue) valueFilter.gte = parseFloat(minValue)
    if (maxValue) valueFilter.lte = parseFloat(maxValue)
    if (Object.keys(valueFilter).length) where.value = valueFilter
    if (q) where.title = { contains: q }

    const [total, rows] = await Promise.all([
      prisma.deal.count({ where }),
      prisma.deal.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          contact: { select: { id: true, name: true, company: true, email: true } },
          owner: { select: { id: true, name: true, avatar: true } },
        },
      }),
    ])
    const deals = rows.map((d) => ({ ...d, tags: parseTags(d.tags) }))
    return NextResponse.json({
      deals,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      limit,
    })
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
    const stage = await prisma.stage.findUnique({ where: { id: data.stageId } })
    if (!stage) return NextResponse.json({ error: "Stage not found" }, { status: 404 })

    const contact = await prisma.contact.findUnique({ where: { id: data.contactId } })
    if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 })

    const ownerId = data.ownerId ?? session.user.id

    const created = await prisma.deal.create({
      data: {
        title: data.title,
        value: data.value,
        currency: data.currency,
        stage: stage.name,
        stageId: stage.id,
        probability: stage.probability,
        contactId: data.contactId,
        ownerId,
        tags: stringifyTags(data.tags ?? []),
        expectedCloseDate: data.expectedCloseDate ? new Date(data.expectedCloseDate) : null,
        notes: data.notes ?? null,
      },
    })

    await prisma.activity.create({
      data: {
        type: "NOTE",
        subject: "Deal created",
        body: `Deal "${created.title}" created in stage ${stage.name}`,
        dealId: created.id,
        contactId: created.contactId,
        userId: session.user.id,
      },
    })

    return NextResponse.json({ ...created, tags: parseTags(created.tags) }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
