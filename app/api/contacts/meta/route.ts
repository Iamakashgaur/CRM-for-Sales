import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { safeError } from "@/lib/api-errors"
import { parseTags } from "@/lib/utils"
import { ROLES } from "@/lib/constants"
import { metaCacheGet, metaCacheSet } from "@/lib/meta-cache"

export const dynamic = "force-dynamic"

interface MetaPayload {
  sources: Array<{ name: string; count: number }>
  zones: Array<{ name: string; count: number }>
  types: Array<{ name: string; count: number }>
  cities: Array<{ name: string; count: number }>
  states: Array<{ name: string; count: number }>
  tags: Array<{ name: string; count: number }>
}

const TTL_MS = 5 * 60 * 1000

async function distinct(field: "source" | "zone" | "type" | "city" | "state", scope: Record<string, unknown>) {
  const rows = await prisma.contact.groupBy({
    by: [field],
    where: { ...scope, [field]: { not: null } },
    _count: true,
    orderBy: { _count: { [field]: "desc" } },
    take: 200,
  })
  return rows
    .filter((r): r is typeof r & Record<typeof field, string> => (r as Record<string, unknown>)[field] !== null)
    .map((r) => ({ name: (r as Record<string, unknown>)[field] as string, count: r._count }))
}

export async function GET(_req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const key = `meta:${session.user.id}:${session.user.role}`
    const hit = metaCacheGet<MetaPayload>(key)
    if (hit) {
      return NextResponse.json(hit)
    }

    const scope = session.user.role === ROLES.REP ? { ownerId: session.user.id } : {}

    const [sources, zones, types, cities, states, tagRows] = await Promise.all([
      distinct("source", scope),
      distinct("zone", scope),
      distinct("type", scope),
      distinct("city", scope),
      distinct("state", scope),
      prisma.contact.findMany({ where: scope, select: { tags: true }, take: 5000 }),
    ])

    const tagCounts = new Map<string, number>()
    for (const row of tagRows) {
      for (const t of parseTags(row.tags)) tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1)
    }
    const tags = Array.from(tagCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }))

    const data: MetaPayload = { sources, zones, types, cities, states, tags }
    metaCacheSet(key, data, TTL_MS)
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
