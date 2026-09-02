import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { getClosedStageIds } from "@/lib/stage-helpers"
import { safeError } from "@/lib/api-errors"

export const dynamic = "force-dynamic"

interface NotificationsResponse {
  items: NotificationItem[]
  unreadCount: number
}

const notifCache = new Map<string, { data: NotificationsResponse; expiresAt: number }>()
const NOTIF_TTL_MS = 30 * 1000

export interface NotificationItem {
  id: string
  kind: "task" | "deal-risk" | "activity"
  title: string
  subtitle: string
  href: string
  time: string
  unread: boolean
  severity?: "info" | "warning" | "danger"
}

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    const isRep = session.user.role === "REP"
    const userId = session.user.id

    const cacheKey = `notif:${userId}:${session.user.role}`
    const hit = notifCache.get(cacheKey)
    if (hit && hit.expiresAt > Date.now()) {
      return NextResponse.json(hit.data)
    }

    const now = new Date()
    const endOfToday = new Date(now)
    endOfToday.setHours(23, 59, 59, 999)
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000)

    const closed = await getClosedStageIds()
    const closedNames = closed.closedNames

    // Tasks due today or overdue (uncompleted)
    const taskWhere: Record<string, unknown> = {
      dueAt: { lte: endOfToday, not: null },
      completedAt: null,
    }
    if (isRep) taskWhere.userId = userId

    const tasks = await prisma.activity.findMany({
      where: taskWhere,
      orderBy: { dueAt: "asc" },
      take: 8,
      include: { deal: { select: { id: true, title: true } }, contact: { select: { id: true, name: true } } },
    })

    // Deals at risk
    const dealWhere: Record<string, unknown> = {
      stage: { notIn: closedNames },
      probability: { lt: 40 },
      stageEnteredAt: { lt: new Date(Date.now() - 14 * 86400000) },
    }
    if (isRep) dealWhere.ownerId = userId

    const risks = await prisma.deal.findMany({
      where: dealWhere,
      orderBy: { value: "desc" },
      take: 5,
      include: { contact: { select: { name: true } } },
    })

    // Recent activity (last 24h)
    const recentWhere: Record<string, unknown> = {
      createdAt: { gte: last24h },
    }
    if (isRep) recentWhere.userId = userId
    const recent = await prisma.activity.findMany({
      where: recentWhere,
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { deal: { select: { id: true, title: true } }, contact: { select: { id: true, name: true } } },
    })

    const items: NotificationItem[] = []

    for (const t of tasks) {
      const overdue = t.dueAt ? new Date(t.dueAt) < now : false
      const href = t.deal ? `/deals/${t.deal.id}` : t.contact ? `/contacts/${t.contact.id}` : "/dashboard"
      items.push({
        id: `task-${t.id}`,
        kind: "task",
        title: t.subject,
        subtitle: t.deal?.title ?? t.contact?.name ?? "Task",
        href,
        time: (t.dueAt ?? t.createdAt).toString(),
        unread: true,
        severity: overdue ? "danger" : "warning",
      })
    }

    for (const d of risks) {
      items.push({
        id: `deal-${d.id}`,
        kind: "deal-risk",
        title: `${d.title} stalled`,
        subtitle: `${d.contact?.name ?? ""} · ${d.stage}`,
        href: `/deals/${d.id}`,
        time: d.stageEnteredAt.toString(),
        unread: true,
        severity: "warning",
      })
    }

    for (const a of recent) {
      const href = a.deal ? `/deals/${a.deal.id}` : a.contact ? `/contacts/${a.contact.id}` : "/dashboard"
      items.push({
        id: `act-${a.id}`,
        kind: "activity",
        title: a.subject,
        subtitle: `${a.type.toLowerCase()} · ${a.deal?.title ?? a.contact?.name ?? ""}`,
        href,
        time: a.createdAt.toString(),
        unread: false,
        severity: "info",
      })
    }

    items.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime())
    const trimmed = items.slice(0, 20)
    const unreadCount = trimmed.filter((i) => i.unread).length

    const payload: NotificationsResponse = { items: trimmed, unreadCount }
    notifCache.set(cacheKey, { data: payload, expiresAt: Date.now() + NOTIF_TTL_MS })
    return NextResponse.json(payload)
  } catch (e) {
    return NextResponse.json({ error: safeError(e) }, { status: 500 })
  }
}
