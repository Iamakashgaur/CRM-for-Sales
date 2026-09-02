import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"
import { normalizePhone } from "@/lib/utils"

export const dynamic = "force-dynamic"

const Body = z.object({
  contactId: z.string().min(1),
  text: z.string().min(1).max(4000),
})

interface GraphSendResponse {
  messages?: Array<{ id: string }>
  error?: { message?: string }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!rateLimit(`wa-send:${session.user.id}`, 30, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const token = process.env.WHATSAPP_API_TOKEN ?? ""
    const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID ?? ""
    if (!token || !phoneNumberId) {
      return NextResponse.json(
        { error: "WhatsApp Cloud API not configured. Set WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID in environment.", setupRequired: true },
        { status: 503 }
      )
    }

    const parsed = Body.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const contact = await prisma.contact.findUnique({
      where: { id: parsed.data.contactId },
      select: { id: true, phone: true, phoneSecondary: true, altPhone: true, ownerId: true },
    })
    if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (session.user.role === "REP" && contact.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const rawPhone = contact.phone ?? contact.altPhone ?? contact.phoneSecondary
    if (!rawPhone) return NextResponse.json({ error: "Contact has no phone number" }, { status: 400 })
    const toNumber = normalizePhone(rawPhone)
    if (toNumber.length < 8) return NextResponse.json({ error: "Invalid phone number" }, { status: 400 })

    const res = await fetch(`https://graph.facebook.com/v18.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: toNumber,
        type: "text",
        text: { body: parsed.data.text },
      }),
    })

    const data = (await res.json()) as GraphSendResponse
    if (!res.ok || !data.messages?.[0]?.id) {
      return NextResponse.json({ error: data.error?.message ?? "WhatsApp API send failed" }, { status: 502 })
    }

    const waMessageId = data.messages[0].id
    const stored = await prisma.whatsAppMessage.create({
      data: {
        waMessageId,
        direction: "outbound",
        fromNumber: phoneNumberId,
        toNumber,
        body: parsed.data.text,
        contactId: contact.id,
        status: "sent",
      },
    })

    return NextResponse.json({ ok: true, id: stored.id, waMessageId })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}

// GET = setup status check
export async function GET(): Promise<NextResponse> {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    const configured = !!(process.env.WHATSAPP_API_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID)
    return NextResponse.json({
      configured,
      verifyTokenConfigured: !!process.env.WHATSAPP_VERIFY_TOKEN,
      businessAccountConfigured: !!process.env.WHATSAPP_BUSINESS_ACCOUNT_ID,
    })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
