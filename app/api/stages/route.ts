import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

const createSchema = z.object({
  name: z.string().min(1),
  order: z.number().int(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  probability: z.number().int().min(0).max(100),
  isDefault: z.boolean().optional(),
})

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const stages = await prisma.stage.findMany({ orderBy: { order: "asc" } })
    return NextResponse.json({ stages })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
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
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
