import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { callLLM } from "@/lib/ai-provider"
import { extractJson } from "@/lib/ai"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"
import { isPrivileged } from "@/lib/constants"
import { getClosedStageIds } from "@/lib/stage-helpers"

export const dynamic = "force-dynamic"

const Body = z.object({
  contactId: z.string().min(1),
})

export interface RouteLeadResult {
  recommendedOwnerId: string | null
  reasoning: string
  alternatives: Array<{ ownerId: string; ownerName: string; reason: string }>
  applied?: boolean
}

interface RepProfile {
  id: string
  name: string
  zonesCovered: string[]
  openDealCount: number
  assignedContactCount: number
  wonCount: number
  wonValue: number
  totalClosed: number
}

function fallbackRoute(reps: RepProfile[], contactZone: string | null): RouteLeadResult {
  if (reps.length === 0) {
    return { recommendedOwnerId: null, reasoning: "No reps available.", alternatives: [] }
  }
  // pick rep with zone match and lowest load
  const sameZone = contactZone
    ? reps.filter((r) => r.zonesCovered.includes(contactZone))
    : []
  const pool = sameZone.length > 0 ? sameZone : reps
  const best = [...pool].sort((a, b) => (a.openDealCount + a.assignedContactCount) - (b.openDealCount + b.assignedContactCount))[0]
  return {
    recommendedOwnerId: best.id,
    reasoning: contactZone && sameZone.length > 0
      ? `Heuristic pick: ${best.name} covers ${contactZone} and has the lowest current workload.`
      : `Heuristic pick: ${best.name} has the lowest current workload. (AI not configured.)`,
    alternatives: pool
      .filter((r) => r.id !== best.id)
      .slice(0, 2)
      .map((r) => ({ ownerId: r.id, ownerName: r.name, reason: `${r.openDealCount} open deals, ${r.assignedContactCount} contacts` })),
  }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isPrivileged(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    if (!rateLimit(`ai-route:${session.user.id}`, 30, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const parsed = Body.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const apply = req.nextUrl.searchParams.get("apply") === "1"

    const contact = await prisma.contact.findUnique({
      where: { id: parsed.data.contactId },
      select: {
        id: true,
        name: true,
        company: true,
        zone: true,
        type: true,
        city: true,
        state: true,
        category: true,
        ownerId: true,
      },
    })
    if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const closed = await getClosedStageIds()
    const wonId = closed.wonId
    const closedIds = [closed.wonId, closed.lostId].filter((s): s is string => !!s)

    const reps = await prisma.user.findMany({ where: { role: "REP" }, select: { id: true, name: true } })
    if (reps.length === 0) {
      return NextResponse.json({ recommendedOwnerId: null, reasoning: "No reps to route to.", alternatives: [] })
    }

    const repIds = reps.map((r) => r.id)

    const [openDealAgg, assignedAgg, wonAgg, allClosedAgg, contactZones] = await Promise.all([
      prisma.deal.groupBy({
        by: ["ownerId"],
        where: { ownerId: { in: repIds }, stageId: { notIn: closedIds } },
        _count: { _all: true },
      }),
      prisma.contact.groupBy({
        by: ["ownerId"],
        where: { ownerId: { in: repIds } },
        _count: { _all: true },
      }),
      wonId
        ? prisma.deal.groupBy({
            by: ["ownerId"],
            where: { ownerId: { in: repIds }, stageId: wonId },
            _count: { _all: true },
            _sum: { value: true },
          })
        : Promise.resolve([] as Array<{ ownerId: string; _count: { _all: number }; _sum: { value: number | null } }>),
      prisma.deal.groupBy({
        by: ["ownerId"],
        where: { ownerId: { in: repIds }, stageId: { in: closedIds } },
        _count: { _all: true },
      }),
      // pull zones for each rep based on contacts they own
      prisma.contact.findMany({
        where: { ownerId: { in: repIds }, zone: { not: null } },
        select: { ownerId: true, zone: true },
        take: 5000,
      }),
    ])

    const openCount = new Map(openDealAgg.map((g) => [g.ownerId, g._count._all]))
    const assignedCount = new Map(assignedAgg.map((g) => [g.ownerId, g._count._all]))
    const wonStats = new Map(wonAgg.map((g) => [g.ownerId, { count: g._count._all, value: g._sum.value ?? 0 }]))
    const closedCount = new Map(allClosedAgg.map((g) => [g.ownerId, g._count._all]))

    const zonesByRep = new Map<string, Set<string>>()
    for (const c of contactZones) {
      if (!c.zone) continue
      if (!zonesByRep.has(c.ownerId)) zonesByRep.set(c.ownerId, new Set())
      zonesByRep.get(c.ownerId)!.add(c.zone)
    }

    const profiles: RepProfile[] = reps.map((r) => {
      const won = wonStats.get(r.id)
      return {
        id: r.id,
        name: r.name,
        zonesCovered: [...(zonesByRep.get(r.id) ?? new Set<string>())],
        openDealCount: openCount.get(r.id) ?? 0,
        assignedContactCount: assignedCount.get(r.id) ?? 0,
        wonCount: won?.count ?? 0,
        wonValue: won?.value ?? 0,
        totalClosed: closedCount.get(r.id) ?? 0,
      }
    })

    const contactSummary = `Contact: ${contact.name}${contact.company ? ` at ${contact.company}` : ""}
Zone: ${contact.zone ?? "—"} | City: ${contact.city ?? "—"} | State: ${contact.state ?? "—"}
Type/Industry: ${contact.type ?? "—"} | Category: ${contact.category ?? "—"}`

    const repsSummary = profiles
      .map((r) => {
        const winRate = r.totalClosed > 0 ? Math.round((r.wonCount / r.totalClosed) * 100) : 0
        return `Rep ID: ${r.id} | Name: ${r.name}
  - Zones covered: ${r.zonesCovered.join(", ") || "—"}
  - Workload: ${r.openDealCount} open deals, ${r.assignedContactCount} assigned contacts
  - Performance: ${r.wonCount} won deals ($${Math.round(r.wonValue)}), win rate ${winRate}%`
      })
      .join("\n\n")

    const prompt = `You are a B2B sales operations expert routing a new lead to the best sales rep. Consider zone fit, current workload, and historical performance. Avoid overloading anyone.

NEW LEAD:
${contactSummary}

AVAILABLE REPS:
${repsSummary}

Return JSON:
{
  "recommendedOwnerId": "<rep id>",
  "reasoning": "<2-3 sentence justification>",
  "alternatives": [
    { "ownerId": "<rep id>", "reason": "<short>" }
  ]
}

Pick exactly one recommendedOwnerId. Provide 1-2 alternatives. Only use rep IDs from the list above.`

    const llmResult = await callLLM({ prompt, maxTokens: 600, task: "classify" })
    let finalResult: RouteLeadResult
    if (!llmResult.ok) {
      finalResult = fallbackRoute(profiles, contact.zone)
    } else {
      const parsedOut = extractJson<{
        recommendedOwnerId?: string
        reasoning?: string
        alternatives?: Array<{ ownerId?: string; reason?: string }>
      }>(llmResult.text, {})
      const validIds = new Set(repIds)
      const recId = parsedOut.recommendedOwnerId && validIds.has(parsedOut.recommendedOwnerId)
        ? parsedOut.recommendedOwnerId
        : null
      if (!recId) {
        finalResult = fallbackRoute(profiles, contact.zone)
      } else {
        const alts = (parsedOut.alternatives ?? [])
          .filter((a) => a.ownerId && validIds.has(a.ownerId) && a.ownerId !== recId)
          .slice(0, 2)
          .map((a) => {
            const r = profiles.find((p) => p.id === a.ownerId)
            return { ownerId: a.ownerId as string, ownerName: r?.name ?? "Unknown", reason: a.reason ?? "" }
          })
        finalResult = {
          recommendedOwnerId: recId,
          reasoning: parsedOut.reasoning ?? "",
          alternatives: alts,
        }
      }
    }

    if (apply && finalResult.recommendedOwnerId && finalResult.recommendedOwnerId !== contact.ownerId) {
      await prisma.contact.update({
        where: { id: contact.id },
        data: { ownerId: finalResult.recommendedOwnerId },
      })
      finalResult.applied = true
    }

    return NextResponse.json(finalResult)
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
