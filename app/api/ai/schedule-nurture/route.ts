import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"
import { isPrivileged } from "@/lib/constants"

export const dynamic = "force-dynamic"

const TouchSchema = z.object({
  dayOffset: z.number().int().min(0).max(90),
  channel: z.enum(["email", "whatsapp", "call"]),
  purpose: z.string().min(1).max(200),
  subject: z.string().nullable().optional(),
  body: z.string().nullable().optional(),
})

const Body = z.object({
  contactId: z.string().min(1),
  sequence: z.array(TouchSchema).min(1).max(10),
  assignedTo: z.string().optional(),
})

function channelToType(ch: "email" | "whatsapp" | "call"): "EMAIL" | "CALL" | "TASK" {
  if (ch === "email") return "EMAIL"
  if (ch === "call") return "CALL"
  return "TASK" // whatsapp -> TASK
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!rateLimit(`nurture-schedule:${session.user.id}`, 30, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const parsed = Body.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const { contactId, sequence, assignedTo } = parsed.data
    const contact = await prisma.contact.findUnique({ where: { id: contactId } })
    if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 })
    if (session.user.role === "REP" && contact.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    // assignedTo: only privileged users can reassign
    let userId = session.user.id
    if (assignedTo && isPrivileged(session.user.role)) {
      const u = await prisma.user.findUnique({ where: { id: assignedTo } })
      if (!u) return NextResponse.json({ error: "Assignee not found" }, { status: 400 })
      userId = u.id
    }

    const now = new Date()
    const created = await prisma.$transaction(
      sequence.map((touch) => {
        const due = new Date(now.getTime() + touch.dayOffset * 86_400_000)
        const channelLabel = touch.channel === "whatsapp" ? "WhatsApp" : touch.channel
        const subject = touch.subject?.trim() ||
          `${channelLabel[0].toUpperCase() + channelLabel.slice(1)}: ${touch.purpose}`
        return prisma.activity.create({
          data: {
            type: channelToType(touch.channel),
            kind: "nurture",
            subject,
            body: touch.body ?? `[Nurture] ${touch.purpose}${touch.channel === "whatsapp" ? " (via WhatsApp)" : ""}`,
            dueAt: due,
            contactId,
            userId,
          },
        })
      })
    )

    return NextResponse.json({ ok: true, activityIds: created.map((a) => a.id) })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
