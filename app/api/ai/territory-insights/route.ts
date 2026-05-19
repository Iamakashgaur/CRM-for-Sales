import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { safeError } from "@/lib/api-errors"
import { isPrivileged } from "@/lib/constants"
import { rateLimit } from "@/lib/rate-limit"
import { callLLM } from "@/lib/ai-provider"
import { extractJson } from "@/lib/ai"
import { getClosedStageIds } from "@/lib/stage-helpers"

export const dynamic = "force-dynamic"

const CACHE_TYPE = "TERRITORY_INSIGHTS"
const CACHE_TTL_MS = 12 * 60 * 60 * 1000 // 12h

export interface ZoneInsight {
  zone: string
  narrative: string
  strengths: string[]
  gaps: string[]
  recommendations: string[]
}

export interface TerritoryInsightsResult {
  zones: ZoneInsight[]
  overall: string
  generatedAt: string
  cached?: boolean
}

interface ZoneAggregate {
  zone: string
  totalDeals: number
  wonCount: number
  wonValue: number
  lostCount: number
  lostReasons: string[]
  topCities: Array<{ city: string; activity: number }>
  avgCycleDays: number | null
  topReps: Array<{ name: string; wonValue: number; wonCount: number }>
}

function fallback(zones: ZoneAggregate[]): TerritoryInsightsResult {
  return {
    zones: zones.map((z) => ({
      zone: z.zone,
      narrative: `${z.zone}: ${z.totalDeals} deals, ${z.wonCount} won ($${Math.round(z.wonValue)}), ${z.lostCount} lost. AI not configured for richer analysis.`,
      strengths: z.wonCount > z.lostCount ? ["Net positive win record"] : [],
      gaps: z.lostCount > z.wonCount ? ["More losses than wins"] : [],
      recommendations: ["Configure AI provider in Settings for tailored recommendations."],
    })),
    overall: "AI not configured. Configure an AI provider in Settings for territory analysis.",
    generatedAt: new Date().toISOString(),
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isPrivileged(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    if (!rateLimit(`ai-territory:${session.user.id}`, 5, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    // Check cache
    const cached = await prisma.aIInsight.findFirst({
      where: {
        type: CACHE_TYPE,
        createdAt: { gte: new Date(Date.now() - CACHE_TTL_MS) },
      },
      orderBy: { createdAt: "desc" },
    })
    if (cached) {
      try {
        const data = JSON.parse(cached.payload) as TerritoryInsightsResult
        return NextResponse.json({ ...data, cached: true })
      } catch {
        // fall through
      }
    }

    // Aggregate per zone
    const closed = await getClosedStageIds()
    const wonId = closed.wonId
    const lostId = closed.lostId

    const contacts = await prisma.contact.findMany({
      select: { id: true, zone: true, city: true, ownerId: true },
    })

    const deals = await prisma.deal.findMany({
      select: {
        id: true,
        value: true,
        stageId: true,
        ownerId: true,
        contactId: true,
        lostReason: true,
        createdAt: true,
        actualCloseDate: true,
        updatedAt: true,
      },
    })

    const users = await prisma.user.findMany({ select: { id: true, name: true } })
    const userById = new Map(users.map((u) => [u.id, u.name]))
    const contactById = new Map(contacts.map((c) => [c.id, c]))

    // group contacts by zone
    const zoneMap = new Map<string, ZoneAggregate>()
    for (const c of contacts) {
      const zone = c.zone?.trim() || "Unzoned"
      if (!zoneMap.has(zone)) {
        zoneMap.set(zone, {
          zone,
          totalDeals: 0,
          wonCount: 0,
          wonValue: 0,
          lostCount: 0,
          lostReasons: [],
          topCities: [],
          avgCycleDays: null,
          topReps: [],
        })
      }
    }

    // per-zone city activity (from contacts) + deal stats
    const cityCounts = new Map<string, Map<string, number>>() // zone -> city -> count
    for (const c of contacts) {
      const zone = c.zone?.trim() || "Unzoned"
      const city = c.city?.trim()
      if (!city) continue
      if (!cityCounts.has(zone)) cityCounts.set(zone, new Map())
      const m = cityCounts.get(zone)!
      m.set(city, (m.get(city) ?? 0) + 1)
    }

    // per-rep stats by zone
    const repByZone = new Map<string, Map<string, { wonValue: number; wonCount: number }>>()

    const cycleDaysByZone = new Map<string, number[]>()

    for (const d of deals) {
      const contact = contactById.get(d.contactId)
      if (!contact) continue
      const zone = contact.zone?.trim() || "Unzoned"
      const agg = zoneMap.get(zone)
      if (!agg) continue
      agg.totalDeals++
      if (wonId && d.stageId === wonId) {
        agg.wonCount++
        agg.wonValue += d.value
        const close = d.actualCloseDate ?? d.updatedAt
        const days = Math.max(0, Math.floor((close.getTime() - d.createdAt.getTime()) / 86400000))
        if (!cycleDaysByZone.has(zone)) cycleDaysByZone.set(zone, [])
        cycleDaysByZone.get(zone)!.push(days)
        if (!repByZone.has(zone)) repByZone.set(zone, new Map())
        const repMap = repByZone.get(zone)!
        const prev = repMap.get(d.ownerId) ?? { wonValue: 0, wonCount: 0 }
        repMap.set(d.ownerId, { wonValue: prev.wonValue + d.value, wonCount: prev.wonCount + 1 })
      }
      if (lostId && d.stageId === lostId) {
        agg.lostCount++
        if (d.lostReason && d.lostReason.trim()) {
          agg.lostReasons.push(d.lostReason.trim().slice(0, 80))
        }
      }
    }

    // finalize each zone
    for (const [zone, agg] of zoneMap) {
      const cm = cityCounts.get(zone)
      if (cm) {
        agg.topCities = [...cm.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([city, activity]) => ({ city, activity }))
      }
      const cycles = cycleDaysByZone.get(zone)
      if (cycles && cycles.length > 0) {
        agg.avgCycleDays = Math.round(cycles.reduce((s, n) => s + n, 0) / cycles.length)
      }
      const rm = repByZone.get(zone)
      if (rm) {
        agg.topReps = [...rm.entries()]
          .sort((a, b) => b[1].wonValue - a[1].wonValue)
          .slice(0, 3)
          .map(([uid, stats]) => ({
            name: userById.get(uid) ?? "Unknown",
            wonValue: stats.wonValue,
            wonCount: stats.wonCount,
          }))
      }
      agg.lostReasons = agg.lostReasons.slice(0, 8)
    }

    const zoneList = [...zoneMap.values()].filter((z) => z.totalDeals > 0 || z.topCities.length > 0)

    if (zoneList.length === 0) {
      const result: TerritoryInsightsResult = {
        zones: [],
        overall: "No territory data available yet. Add zones to your contacts to enable territory intelligence.",
        generatedAt: new Date().toISOString(),
      }
      return NextResponse.json(result)
    }

    const summaryForPrompt = zoneList
      .map(
        (z) => `Zone: ${z.zone}
- Total deals: ${z.totalDeals}
- Won: ${z.wonCount} (value $${Math.round(z.wonValue)})
- Lost: ${z.lostCount}
- Lost reasons: ${z.lostReasons.length ? z.lostReasons.join("; ") : "none"}
- Top cities: ${z.topCities.length ? z.topCities.map((c) => `${c.city} (${c.activity})`).join(", ") : "—"}
- Avg cycle (won deals): ${z.avgCycleDays !== null ? `${z.avgCycleDays}d` : "—"}
- Top reps: ${z.topReps.length ? z.topReps.map((r) => `${r.name} ($${Math.round(r.wonValue)}, ${r.wonCount} won)`).join(", ") : "—"}`
      )
      .join("\n\n")

    const prompt = `You are a B2B sales operations analyst. Analyze this territory performance data and produce structured insights.

DATA:
${summaryForPrompt}

Return JSON:
{
  "zones": [
    {
      "zone": "<name>",
      "narrative": "<2-3 sentence performance summary>",
      "strengths": ["...", "..."],
      "gaps": ["...", "..."],
      "recommendations": ["...", "..."]
    }
  ],
  "overall": "<3-4 sentence cross-zone comparison and strategic recommendation>"
}

Include EVERY zone from the input. Keep arrays to max 3 items each.`

    const llmResult = await callLLM({ prompt, maxTokens: 2000, task: "reasoning" })
    if (!llmResult.ok) {
      const fb = fallback(zoneList)
      return NextResponse.json(fb)
    }

    const parsed = extractJson<{ zones?: ZoneInsight[]; overall?: string }>(llmResult.text, { zones: [], overall: "" })
    if (!parsed.zones || !Array.isArray(parsed.zones) || parsed.zones.length === 0) {
      const fb = fallback(zoneList)
      return NextResponse.json(fb)
    }

    const finalResult: TerritoryInsightsResult = {
      zones: parsed.zones.map((z) => ({
        zone: z.zone ?? "Unknown",
        narrative: z.narrative ?? "",
        strengths: Array.isArray(z.strengths) ? z.strengths.slice(0, 3) : [],
        gaps: Array.isArray(z.gaps) ? z.gaps.slice(0, 3) : [],
        recommendations: Array.isArray(z.recommendations) ? z.recommendations.slice(0, 3) : [],
      })),
      overall: parsed.overall ?? "",
      generatedAt: new Date().toISOString(),
    }

    // store cache (delete older)
    await prisma.aIInsight.deleteMany({ where: { type: CACHE_TYPE } })
    await prisma.aIInsight.create({
      data: {
        type: CACHE_TYPE,
        payload: JSON.stringify(finalResult),
        userId: session.user.id,
      },
    })

    return NextResponse.json({ ...finalResult, cached: false })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
