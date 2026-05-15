import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { parseTags, stringifyTags } from "@/lib/utils"

export const dynamic = "force-dynamic"

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
  linkedinUrl: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  ownerId: z.string().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const contact = await prisma.contact.findUnique({
      where: { id: params.id },
      include: {
        deals: true,
        activities: { orderBy: { createdAt: "desc" }, take: 50 },
        emailMsgs: { orderBy: { receivedAt: "desc" }, take: 20 },
      },
    })
    if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 })
    // REP: only own contacts visible
    if (session.user.role === "REP" && contact.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    return NextResponse.json({
      ...contact,
      tags: parseTags(contact.tags),
      deals: contact.deals.map((d) => ({ ...d, tags: parseTags(d.tags) })),
    })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const existing = await prisma.contact.findUnique({ where: { id: params.id } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const data = parsed.data
    const updateData: Record<string, unknown> = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.email !== undefined) updateData.email = data.email
    if (data.phone !== undefined) updateData.phone = data.phone
    if (data.company !== undefined) updateData.company = data.company
    if (data.title !== undefined) updateData.title = data.title
    if (data.source !== undefined) updateData.source = data.source
    if (data.tags !== undefined) updateData.tags = stringifyTags(data.tags)
    if (data.notes !== undefined) updateData.notes = data.notes
    if (data.linkedinUrl !== undefined) updateData.linkedinUrl = data.linkedinUrl
    if (data.website !== undefined) updateData.website = data.website
    if (data.ownerId !== undefined) updateData.ownerId = data.ownerId

    const updated = await prisma.contact.update({ where: { id: params.id }, data: updateData })
    return NextResponse.json({ ...updated, tags: parseTags(updated.tags) })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const existing = await prisma.contact.findUnique({ where: { id: params.id } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (session.user.role !== "ADMIN" && existing.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await prisma.contact.delete({ where: { id: params.id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
