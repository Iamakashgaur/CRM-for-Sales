import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { safeError } from "@/lib/api-errors"
import { parseTags } from "@/lib/utils"
import { isPrivileged } from "@/lib/constants"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const sp = req.nextUrl.searchParams
    const bucket = sp.get("bucket") ?? "all"
    const scope = sp.get("scope") ?? "mine"

    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const tomorrow = new Date(today)
    tomorrow.setDate(tomorrow.getDate() + 1)
    const sevenDaysAgo = new Date(today)
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    // Base scope: REP locked to own; ADMIN/MANAGER can pick scope=mine|team
    const ownerFilter =
      session.user.role === "REP" || scope === "mine"
        ? { ownerId: session.user.id }
        : isPrivileged(session.user.role)
          ? {}
          : { ownerId: session.user.id }

    let where: Record<string, unknown> = { ...ownerFilter, dnc: false }

    switch (bucket) {
      case "today":
        where = { ...where, nextFollowUpDate: { gte: today, lt: tomorrow } }
        break
      case "overdue":
        where = {
          ...where,
          nextFollowUpDate: { lt: today, not: null },
          followUpStatus: { not: "Completed" },
        }
        break
      case "hot":
        where = { ...where, category: "Hot Lead" }
        break
      case "warm":
        where = { ...where, category: "Warm Lead" }
        break
      case "interested":
        where = { ...where, followUpStatus: "Interested" }
        break
      case "recent-calls":
        where = { ...where, lastContactDate: { gte: sevenDaysAgo } }
        break
      case "no-followup":
        where = { ...where, nextFollowUpDate: null, category: { not: null } }
        break
      case "all":
      default:
        where = {
          ...where,
          OR: [
            { category: { not: null } },
            { followUpStatus: { not: null } },
            { nextFollowUpDate: { not: null } },
            { lastContactDate: { gte: sevenDaysAgo } },
          ],
        }
    }

    const [contacts, counts] = await Promise.all([
      prisma.contact.findMany({
        where,
        orderBy: [{ nextFollowUpDate: "asc" }, { updatedAt: "desc" }],
        take: 200,
        include: {
          owner: { select: { id: true, name: true } },
        },
      }),
      bucket === "all"
        ? Promise.all([
            prisma.contact.count({ where: { ...ownerFilter, dnc: false, nextFollowUpDate: { gte: today, lt: tomorrow } } }),
            prisma.contact.count({
              where: {
                ...ownerFilter,
                dnc: false,
                nextFollowUpDate: { lt: today, not: null },
                followUpStatus: { not: "Completed" },
              },
            }),
            prisma.contact.count({ where: { ...ownerFilter, dnc: false, category: "Hot Lead" } }),
            prisma.contact.count({ where: { ...ownerFilter, dnc: false, category: "Warm Lead" } }),
            prisma.contact.count({ where: { ...ownerFilter, dnc: false, followUpStatus: "Interested" } }),
            prisma.contact.count({ where: { ...ownerFilter, dnc: false, lastContactDate: { gte: sevenDaysAgo } } }),
          ])
        : Promise.resolve([0, 0, 0, 0, 0, 0]),
    ])

    const mapped = contacts.map((c) => ({ ...c, tags: parseTags(c.tags) }))
    const [todayN, overdueN, hotN, warmN, interestedN, recentN] = counts as number[]

    return NextResponse.json({
      contacts: mapped,
      counts: {
        today: todayN,
        overdue: overdueN,
        hot: hotN,
        warm: warmN,
        interested: interestedN,
        recentCalls: recentN,
      },
    })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
