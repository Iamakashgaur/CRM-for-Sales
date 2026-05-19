import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { fetchGmailMessagesByContact } from "@/lib/gmail"
import { fetchOutlookMessagesByContact } from "@/lib/outlook"
import { safeError } from "@/lib/api-errors"
import { decrypt } from "@/lib/crypto"

export const dynamic = "force-dynamic"

const syncSchema = z.object({ provider: z.enum(["GMAIL", "OUTLOOK"]) })

async function pMapWithLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = []
  for (let i = 0; i < items.length; i += limit) {
    const chunk = items.slice(i, i + limit)
    results.push(...(await Promise.all(chunk.map(fn))))
  }
  return results
}

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
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
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

    const provider = parsed.data.provider
    const syncRecord = sync
    const decAccess = decrypt(syncRecord.accessToken)
    const decRefresh = syncRecord.refreshToken ? decrypt(syncRecord.refreshToken) : null
    const authCtx = { syncId: syncRecord.id, refreshToken: decRefresh }
    const contacts = await prisma.contact.findMany({
      where: { ownerId: session.user.id },
      take: 200,
      orderBy: { updatedAt: "desc" },
    })

    async function fetchAndStore(contact: { id: string; email: string }): Promise<number> {
      const messages =
        provider === "GMAIL"
          ? await fetchGmailMessagesByContact(decAccess, contact.email, 25, authCtx)
          : await fetchOutlookMessagesByContact(decAccess, contact.email, 25, authCtx)

      let count = 0
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
              syncId: syncRecord.id,
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
          count++
        } catch {
          continue
        }
      }
      return count
    }

    const counts = await pMapWithLimit(contacts, 5, fetchAndStore)
    const synced = counts.reduce((a, b) => a + b, 0)

    await prisma.emailSync.update({
      where: { id: sync.id },
      data: { lastSyncAt: new Date() },
    })

    return NextResponse.json({ synced })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
