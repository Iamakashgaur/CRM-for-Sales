import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { parseTags, stringifyTags } from "@/lib/utils"

export const dynamic = "force-dynamic"

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  source: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  linkedinUrl: z.string().optional(),
  website: z.string().optional(),
  ownerId: z.string().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50))
    const q = searchParams.get("q")?.trim() || ""
    const ownerId = searchParams.get("ownerId") || undefined
    const company = searchParams.get("company") || undefined
    const tag = searchParams.get("tag") || undefined

    const where: Record<string, unknown> = {}
    // REP: scope to own contacts only. ADMIN/MANAGER see all.
    if (session.user.role === "REP") {
      where.ownerId = session.user.id
    } else if (ownerId) {
      where.ownerId = ownerId
    }
    if (company) where.company = { contains: company }
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { email: { contains: q } },
        { company: { contains: q } },
      ]
    }
    if (tag) where.tags = { contains: tag }

    const [total, rows] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])
    const contacts = rows.map((c) => ({ ...c, tags: parseTags(c.tags) }))
    return NextResponse.json({
      contacts,
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
    const created = await prisma.contact.create({
      data: {
        name: data.name,
        email: data.email,
        phone: data.phone ?? null,
        company: data.company ?? null,
        title: data.title ?? null,
        source: data.source ?? null,
        tags: stringifyTags(data.tags ?? []),
        notes: data.notes ?? null,
        linkedinUrl: data.linkedinUrl ?? null,
        website: data.website ?? null,
        ownerId: data.ownerId ?? session.user.id,
      },
    })
    return NextResponse.json({ ...created, tags: parseTags(created.tags) }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
