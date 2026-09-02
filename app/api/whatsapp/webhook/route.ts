import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { normalizePhone } from "@/lib/utils"
import { safeError } from "@/lib/api-errors"

export const dynamic = "force-dynamic"

// Meta webhook verification (GET) per
// https://developers.facebook.com/docs/graph-api/webhooks/getting-started
export async function GET(req: NextRequest): Promise<NextResponse> {
  const sp = req.nextUrl.searchParams
  const mode = sp.get("hub.mode")
  const token = sp.get("hub.verify_token")
  const challenge = sp.get("hub.challenge")
  const expected = process.env.WHATSAPP_VERIFY_TOKEN ?? ""
  if (mode === "subscribe" && token && expected && token === expected && challenge) {
    return new NextResponse(challenge, { status: 200 })
  }
  return new NextResponse("forbidden", { status: 403 })
}

interface WAMessage {
  id: string
  from: string
  to?: string
  type?: string
  text?: { body?: string }
  image?: { id?: string; link?: string }
  audio?: { id?: string; link?: string }
  document?: { id?: string; link?: string }
  timestamp?: string
}

interface WAStatus {
  id: string
  recipient_id?: string
  status?: string
  timestamp?: string
}

interface WAValue {
  messaging_product?: string
  metadata?: { display_phone_number?: string; phone_number_id?: string }
  messages?: WAMessage[]
  statuses?: WAStatus[]
}

interface WAEntry {
  id: string
  changes?: Array<{ field?: string; value?: WAValue }>
}

interface WAWebhookPayload {
  object?: string
  entry?: WAEntry[]
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const payload = (await req.json()) as WAWebhookPayload
    const entries = payload.entry ?? []

    for (const entry of entries) {
      for (const change of entry.changes ?? []) {
        const value = change.value
        if (!value) continue

        // Inbound messages
        const businessNumber = value.metadata?.display_phone_number ?? ""
        for (const m of value.messages ?? []) {
          const fromNorm = normalizePhone(m.from)
          const body =
            m.text?.body ??
            (m.image ? "[image]" : m.audio ? "[audio]" : m.document ? "[document]" : null)
          const mediaUrl = m.image?.link ?? m.audio?.link ?? m.document?.link ?? null

          // Try to link to contact by phone match
          const contact = await prisma.contact.findFirst({
            where: {
              OR: [
                { phone: { contains: fromNorm.slice(-10) } },
                { phoneSecondary: { contains: fromNorm.slice(-10) } },
                { altPhone: { contains: fromNorm.slice(-10) } },
              ],
            },
            select: { id: true },
          })

          await prisma.whatsAppMessage.upsert({
            where: { waMessageId: m.id },
            update: {},
            create: {
              waMessageId: m.id,
              direction: "inbound",
              fromNumber: fromNorm,
              toNumber: normalizePhone(businessNumber),
              body,
              mediaUrl,
              contactId: contact?.id ?? null,
              status: "received",
              rawPayload: JSON.stringify(m),
              receivedAt: m.timestamp ? new Date(parseInt(m.timestamp, 10) * 1000) : new Date(),
            },
          })
        }

        // Status updates for outbound messages
        for (const s of value.statuses ?? []) {
          await prisma.whatsAppMessage.updateMany({
            where: { waMessageId: s.id },
            data: { status: s.status ?? null },
          })
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
