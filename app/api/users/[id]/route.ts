import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession, hashPassword } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  password: z.string().min(8).optional(),
  role: z.enum(["ADMIN", "MANAGER", "REP"]).optional(),
  avatar: z.string().nullable().optional(),
})

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const isSelf = session.user.id === params.id
    const isAdmin = session.user.role === "ADMIN"
    if (!isSelf && !isAdmin) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const existing = await prisma.user.findUnique({ where: { id: params.id } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    if (parsed.data.role && !isAdmin) {
      return NextResponse.json({ error: "Only admins can change role" }, { status: 403 })
    }

    const updateData: Record<string, unknown> = {}
    if (parsed.data.name !== undefined) updateData.name = parsed.data.name
    if (parsed.data.email !== undefined) updateData.email = parsed.data.email.toLowerCase()
    if (parsed.data.password !== undefined) updateData.passwordHash = await hashPassword(parsed.data.password)
    if (parsed.data.role !== undefined) updateData.role = parsed.data.role
    if (parsed.data.avatar !== undefined) updateData.avatar = parsed.data.avatar

    const updated = await prisma.user.update({
      where: { id: params.id },
      data: updateData,
      select: { id: true, name: true, email: true, role: true, avatar: true },
    })
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

    if (session.user.id === params.id) {
      return NextResponse.json({ error: "Cannot delete yourself" }, { status: 409 })
    }

    const existing = await prisma.user.findUnique({ where: { id: params.id } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (existing.role === "ADMIN") {
      const adminCount = await prisma.user.count({ where: { role: "ADMIN" } })
      if (adminCount <= 1) {
        return NextResponse.json({ error: "Cannot delete last admin" }, { status: 409 })
      }
    }

    await prisma.user.delete({ where: { id: params.id } })
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
