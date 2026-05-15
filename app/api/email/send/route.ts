import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { sendEmail, resendConfigured } from "@/lib/resend"

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
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

  const parsed = Body.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

  const { to, subject, body, dealId, contactId } = parsed.data

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
