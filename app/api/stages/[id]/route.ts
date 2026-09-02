import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { Prisma } from "@prisma/client"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { safeError } from "@/lib/api-errors"

export const dynamic = "force-dynamic"

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  order: z.number().int().optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  probability: z.number().int().min(0).max(100).optional(),
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

    // Handle order swap: if `order` collides with another stage, swap their orders atomically.
    if (parsed.data.order !== undefined && parsed.data.order !== existing.order) {
      const conflict = await prisma.stage.findUnique({ where: { order: parsed.data.order } })
      if (conflict && conflict.id !== existing.id) {
        // Move conflicting stage to a temporary order to avoid unique-constraint collision
        const max = await prisma.stage.aggregate({ _max: { order: true } })
        const temp = (max._max.order ?? 0) + 1000
        const { order: _o, ...rest } = parsed.data
        const ops: Prisma.PrismaPromise<unknown>[] = [
          prisma.stage.update({ where: { id: conflict.id }, data: { order: temp } }),
          prisma.stage.update({ where: { id: existing.id }, data: { order: parsed.data.order } }),
          prisma.stage.update({ where: { id: conflict.id }, data: { order: existing.order } }),
          prisma.stage.update({ where: { id: params.id }, data: rest }),
        ]
        if (parsed.data.name && parsed.data.name !== existing.name) {
          ops.push(prisma.deal.updateMany({ where: { stageId: params.id }, data: { stage: parsed.data.name } }))
        }
        const results = await prisma.$transaction(ops)
        return NextResponse.json(results[3])
      }
    }

    const ops: Prisma.PrismaPromise<unknown>[] = [
      prisma.stage.update({ where: { id: params.id }, data: parsed.data }),
    ]
    if (parsed.data.name && parsed.data.name !== existing.name) {
      ops.push(prisma.deal.updateMany({ where: { stageId: params.id }, data: { stage: parsed.data.name } }))
    }
    const results = await prisma.$transaction(ops)
    return NextResponse.json(results[0])
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
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
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
