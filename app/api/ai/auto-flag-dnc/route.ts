import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"
import { isPrivileged } from "@/lib/constants"

export const dynamic = "force-dynamic"

const Body = z.object({
  contactId: z.string().min(1),
  confirm: z.literal(true),
  reason: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!rateLimit(`dnc-flag:${session.user.id}`, 60, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const parsed = Body.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const { contactId, reason } = parsed.data
    const contact = await prisma.contact.findUnique({ where: { id: contactId } })
    if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 })

    const isPriv = isPrivileged(session.user.role)
    if (!isPriv && contact.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await prisma.$transaction([
      prisma.contact.update({
        where: { id: contactId },
        data: { dnc: true },
      }),
      prisma.activity.create({
        data: {
          type: "NOTE",
          kind: "auto-dnc",
          subject: "Auto-flagged DNC",
          body: reason ? `Auto-flagged from DNC signal scan. Reason: ${reason}` : "Auto-flagged from DNC signal scan.",
          contactId,
          userId: session.user.id,
          completedAt: new Date(),
        },
      }),
    ])

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
