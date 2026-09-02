import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { safeError } from "@/lib/api-errors"
import { ROLES } from "@/lib/constants"

export const dynamic = "force-dynamic"

const Body = z.object({
  status: z.string().min(1),
  notes: z.string().nullable().optional(),
})

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const contact = await prisma.contact.findUnique({ where: { id: params.id } })
    if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (session.user.role === ROLES.REP && contact.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const parsed = Body.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const now = new Date()
    const [log] = await prisma.$transaction([
      prisma.callLog.create({
        data: {
          contactId: params.id,
          status: parsed.data.status,
          notes: parsed.data.notes ?? null,
          userId: session.user.id,
          at: now,
        },
      }),
      prisma.contact.update({
        where: { id: params.id },
        data: { callStatus: parsed.data.status, lastContactDate: now },
      }),
      prisma.activity.create({
        data: {
          type: "CALL",
          subject: parsed.data.status,
          body: parsed.data.notes ?? null,
          contactId: params.id,
          userId: session.user.id,
          completedAt: now,
        },
      }),
    ])

    return NextResponse.json({ log })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
