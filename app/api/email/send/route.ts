import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendEmail, resendConfigured } from "@/lib/resend"
import { rateLimit } from "@/lib/rate-limit"
import { isPrivileged } from "@/lib/constants"

export const dynamic = "force-dynamic"

const Body = z.object({
  to: z.string().email(),
  subject: z.string().min(1),
  body: z.string().min(1),
  dealId: z.string().optional(),
  contactId: z.string().optional(),
})

export async function POST(req: NextRequest) {
  const session = await getServerSession()
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  if (!rateLimit(`email:${session.user.id}`, 30, 60_000)) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
  }

  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { to, subject, body, dealId, contactId } = parsed.data
  const privileged = isPrivileged(session.user.role)

  if (!privileged) {
    if (!contactId) {
      return NextResponse.json({ error: "contactId required" }, { status: 400 })
    }
    const contact = await prisma.contact.findUnique({ where: { id: contactId }, select: { ownerId: true, email: true } })
    if (!contact) return NextResponse.json({ error: "Contact not found" }, { status: 404 })
    if (contact.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    if (to.toLowerCase() !== contact.email.toLowerCase()) {
      return NextResponse.json({ error: "Recipient must match contact email" }, { status: 400 })
    }
    if (dealId) {
      const deal = await prisma.deal.findUnique({ where: { id: dealId }, select: { ownerId: true } })
      if (!deal) return NextResponse.json({ error: "Deal not found" }, { status: 404 })
      if (deal.ownerId !== session.user.id) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
  }

  const result = await sendEmail({ to, subject, body, replyTo: session.user.email ?? undefined })
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 })

  await prisma.activity.create({
    data: {
      type: "EMAIL",
      subject,
      body: `To: ${to}\n\n${body}`,
      completedAt: new Date(),
      dealId: dealId ?? null,
      contactId: contactId ?? null,
      userId: session.user.id,
    },
  })

  return NextResponse.json({ ok: true, id: result.id })
}

export async function GET() {
  return NextResponse.json({ configured: resendConfigured })
}
