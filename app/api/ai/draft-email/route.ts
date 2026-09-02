import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { draftEmail } from "@/lib/ai"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"

export const dynamic = "force-dynamic"

const schema = z.object({
  dealId: z.string().min(1),
  purpose: z.enum(["follow-up", "proposal", "closing", "introduction"]),
  language: z.enum(["en", "hi", "hinglish"]).optional(),
})

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!rateLimit(`ai:${session.user.id}`, 20, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const deal = await prisma.deal.findUnique({
      where: { id: parsed.data.dealId },
      include: { contact: true },
    })
    if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (session.user.role === "REP" && deal.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const result = await draftEmail({
      contactName: deal.contact.name,
      contactCompany: deal.contact.company,
      dealTitle: deal.title,
      purpose: parsed.data.purpose,
      tone: "professional",
      language: parsed.data.language ?? "en",
    })

    await prisma.aIInsight.create({
      data: {
        type: "DRAFT",
        payload: JSON.stringify(result),
        dealId: deal.id,
        contactId: deal.contactId,
        userId: session.user.id,
      },
    })

    return NextResponse.json(result)
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
