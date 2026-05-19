import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { callLLM } from "@/lib/ai-provider"
import { extractJson } from "@/lib/ai"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"
import { formatDate } from "@/lib/utils"

export const dynamic = "force-dynamic"

export interface ProbabilityCalibration {
  probability: number
  reasoning: string
  basisCount: number
  basisWon: number
  basisLost: number
  _generatedAt: string
}

const FALLBACK = (msg: string): ProbabilityCalibration => ({
  probability: 50,
  reasoning: msg,
  basisCount: 0,
  basisWon: 0,
  basisLost: 0,
  _generatedAt: new Date().toISOString(),
})

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!rateLimit(`ai-prob:${session.user.id}`, 20, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const dealId = req.nextUrl.searchParams.get("dealId")
    const force = req.nextUrl.searchParams.get("refresh") === "1"
    if (!dealId) return NextResponse.json({ error: "dealId required" }, { status: 400 })

    const deal = await prisma.deal.findUnique({
      where: { id: dealId },
      include: { contact: true, stageRef: true },
    })
    if (!deal) return NextResponse.json({ error: "Not found" }, { status: 404 })
    if (session.user.role === "REP" && deal.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    if (!force) {
      const cached = await prisma.aIInsight.findFirst({
        where: {
          dealId,
          type: "PROB_CALIBRATION",
          createdAt: { gte: new Date(Date.now() - 86_400_000) },
        },
        orderBy: { createdAt: "desc" },
      })
      if (cached) {
        try {
          const parsedCache = JSON.parse(cached.payload) as ProbabilityCalibration
          return NextResponse.json(parsedCache)
        } catch {
          // fall through
        }
      }
    }

    // Find similar closed deals (won probability == 100 or lost probability == 0).
    const valueLow = deal.value * 0.5
    const valueHigh = deal.value * 1.5
    const sameZone = deal.contact?.zone ?? null

    const similar = await prisma.deal.findMany({
      where: {
        id: { not: deal.id },
        OR: [{ probability: 100 }, { probability: 0 }],
        value: deal.value > 0 ? { gte: valueLow, lte: valueHigh } : undefined,
        ...(sameZone ? { contact: { zone: sameZone } } : {}),
      },
      include: { contact: { select: { company: true, zone: true } }, stageRef: true },
      orderBy: { updatedAt: "desc" },
      take: 50,
    })

    let pool = similar
    if (pool.length < 5) {
      // Relax: drop zone restriction
      pool = await prisma.deal.findMany({
        where: {
          id: { not: deal.id },
          OR: [{ probability: 100 }, { probability: 0 }],
        },
        include: { contact: { select: { company: true, zone: true } }, stageRef: true },
        orderBy: { updatedAt: "desc" },
        take: 50,
      })
    }

    const won = pool.filter((d) => d.probability === 100)
    const lost = pool.filter((d) => d.probability === 0)

    if (pool.length === 0) {
      const fb = FALLBACK("Not enough historical closed deals to calibrate. Using stage default.")
      fb.probability = deal.probability
      return NextResponse.json(fb)
    }

    const examples = pool
      .slice(0, 30)
      .map(
        (d) =>
          `- "${d.title}" | stage:${d.stage} | value:${d.value} ${d.currency} | zone:${d.contact?.zone ?? "—"} | outcome:${d.probability === 100 ? "WON" : "LOST"}`
      )
      .join("\n")

    const prompt = `You are a B2B sales analyst calibrating win probability for an open deal using historical outcomes. Respond ONLY with JSON.

OPEN DEAL
- Title: ${deal.title}
- Value: ${deal.value} ${deal.currency}
- Stage: ${deal.stage}
- Stage default probability: ${deal.stageRef.probability}%
- Expected close: ${deal.expectedCloseDate ? formatDate(deal.expectedCloseDate) : "—"}
- Contact: ${deal.contact?.name ?? "—"} (${deal.contact?.company ?? "—"})
- Zone: ${deal.contact?.zone ?? "—"}
- Notes: ${deal.notes ?? "—"}

HISTORICAL CLOSED DEALS (${pool.length}; won=${won.length}, lost=${lost.length})
${examples}

Estimate calibrated win probability (0-100). Anchor to the win-rate of similar past deals, then adjust for the open deal's stage and value. Be specific in reasoning (1-2 sentences).

Output JSON:
{"probability": <0-100 integer>, "reasoning": "<one or two sentences>"}`

    const llm = await callLLM({ prompt, maxTokens: 300, task: "reasoning" })
    if (!llm.ok) {
      const fb = FALLBACK("AI unavailable. Showing stage default.")
      fb.probability = deal.probability
      fb.basisCount = pool.length
      fb.basisWon = won.length
      fb.basisLost = lost.length
      return NextResponse.json(fb)
    }

    const raw = extractJson<{ probability?: number; reasoning?: string }>(llm.text, {})
    let probability = typeof raw.probability === "number" ? Math.round(raw.probability) : deal.probability
    probability = Math.max(0, Math.min(100, probability))
    const reasoning =
      typeof raw.reasoning === "string" && raw.reasoning.trim()
        ? raw.reasoning.trim()
        : `Based on ${pool.length} similar closed deals (won=${won.length}, lost=${lost.length}).`

    const out: ProbabilityCalibration = {
      probability,
      reasoning,
      basisCount: pool.length,
      basisWon: won.length,
      basisLost: lost.length,
      _generatedAt: new Date().toISOString(),
    }

    await prisma.aIInsight.create({
      data: {
        type: "PROB_CALIBRATION",
        payload: JSON.stringify(out),
        dealId: deal.id,
        userId: session.user.id,
      },
    })

    return NextResponse.json(out)
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
