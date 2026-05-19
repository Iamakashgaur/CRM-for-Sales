import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { safeError } from "@/lib/api-errors"

export const dynamic = "force-dynamic"

const createSchema = z.object({
  name: z.string().min(1),
  order: z.number().int(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  probability: z.number().int().min(0).max(100),
})

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const raw = await prisma.stage.findMany({ orderBy: { order: "asc" } })
    const stages = raw.map((s) => ({ ...s, isClosed: s.probability === 0 || s.probability === 100 }))
    return NextResponse.json({ stages })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const created = await prisma.stage.create({ data: parsed.data })
    return NextResponse.json(created, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
