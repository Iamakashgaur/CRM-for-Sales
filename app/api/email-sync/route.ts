import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { fetchGmailMessagesByContact } from "@/lib/gmail"
import { fetchOutlookMessagesByContact } from "@/lib/outlook"

export const dynamic = "force-dynamic"

const syncSchema = z.object({ provider: z.enum(["GMAIL", "OUTLOOK"]) })

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const syncs = await prisma.emailSync.findMany({
      where: { userId: session.user.id },
      select: { id: true, provider: true, email: true, lastSyncAt: true },
    })
    return NextResponse.json({ syncs })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const parsed = syncSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const sync = await prisma.emailSync.findUnique({
      where: { userId_provider: { userId: session.user.id, provider: parsed.data.provider } },
    })
    if (!sync) return NextResponse.json({ error: "Provider not connected" }, { status: 404 })

    const contacts = await prisma.contact.findMany({ where: { ownerId: session.user.id } })
    let synced = 0

    for (const contact of contacts) {
      const messages =
        parsed.data.provider === "GMAIL"
          ? await fetchGmailMessagesByContact(sync.accessToken, contact.email)
          : await fetchOutlookMessagesByContact(sync.accessToken, contact.email)

      for (const m of messages) {
        try {
          await prisma.emailSyncMessage.upsert({
            where: { messageId: m.id },
            create: {
              messageId: m.id,
              subject: m.subject,
              from: m.from,
              to: m.to,
              body: m.body ?? null,
              receivedAt: m.receivedAt,
              syncId: sync.id,
              contactId: contact.id,
            },
            update: {
              subject: m.subject,
              from: m.from,
              to: m.to,
              body: m.body ?? null,
              receivedAt: m.receivedAt,
              contactId: contact.id,
            },
          })
          synced++
        } catch {
          continue
        }
      }
    }

    await prisma.emailSync.update({
      where: { id: sync.id },
      data: { lastSyncAt: new Date() },
    })

    return NextResponse.json({ synced })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
