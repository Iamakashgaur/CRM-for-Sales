import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { safeError } from "@/lib/api-errors"
import { isPrivileged } from "@/lib/constants"
import { invalidateMetaCache } from "@/lib/meta-cache"

export const dynamic = "force-dynamic"

const MAX_IDS = 500

const BulkUpdate = z.object({
  ids: z.array(z.string()).min(1),
  patch: z.object({
    ownerId: z.string().optional(),
  }),
})

const BulkDelete = z.object({
  ids: z.array(z.string()).min(1),
})

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isPrivileged(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const parsed = BulkUpdate.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const { ids, patch } = parsed.data
    if (ids.length > MAX_IDS) return NextResponse.json({ error: `Too many ids (max ${MAX_IDS})` }, { status: 400 })
    if (!patch.ownerId) return NextResponse.json({ error: "No fields to update" }, { status: 400 })

    // Validate ownerId exists
    const owner = await prisma.user.findUnique({ where: { id: patch.ownerId }, select: { id: true } })
    if (!owner) return NextResponse.json({ error: "Owner not found" }, { status: 400 })

    const result = await prisma.contact.updateMany({
      where: { id: { in: ids } },
      data: { ownerId: patch.ownerId },
    })

    invalidateMetaCache()
    return NextResponse.json({ updated: result.count })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const parsed = BulkDelete.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const { ids } = parsed.data
    if (ids.length > MAX_IDS) return NextResponse.json({ error: `Too many ids (max ${MAX_IDS})` }, { status: 400 })

    const [result] = await prisma.$transaction([
      prisma.contact.deleteMany({ where: { id: { in: ids } } }),
    ])
    invalidateMetaCache()
    return NextResponse.json({ deleted: result.count })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
