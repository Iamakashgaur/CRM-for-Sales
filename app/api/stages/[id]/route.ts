import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  order: z.number().int().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  probability: z.number().int().min(0).max(100).optional(),
  isDefault: z.boolean().optional(),
})

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const existing = await prisma.stage.findUnique({ where: { id: params.id } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const updated = await prisma.stage.update({ where: { id: params.id }, data: parsed.data })

    if (parsed.data.name && parsed.data.name !== existing.name) {
      await prisma.deal.updateMany({
        where: { stageId: updated.id },
        data: { stage: updated.name },
      })
    }

    return NextResponse.json(updated)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const existing = await prisma.stage.findUnique({ where: { id: params.id } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const count = await prisma.deal.count({ where: { stageId: params.id } })
    if (count > 0) {
      return NextResponse.json({ error: `Stage has ${count} deals` }, { status: 409 })
    }

    await prisma.stage.delete({ where: { id: params.id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
