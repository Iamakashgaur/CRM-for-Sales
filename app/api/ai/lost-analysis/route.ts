import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { callLLM } from "@/lib/ai-provider"
import { extractJson } from "@/lib/ai"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"
import { isPrivileged } from "@/lib/constants"

export const dynamic = "force-dynamic"

interface Theme {
  name: string
  count: number
  examples: string[]
  suggestion: string
}

interface LostAnalysisResult {
  themes: Theme[]
  note?: string
  _generatedAt?: string
}

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isPrivileged(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    if (!rateLimit(`ai:${session.user.id}`, 20, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    // Cache 24h
    const cached = await prisma.aIInsight.findFirst({
      where: { type: "LOST_ANALYSIS", createdAt: { gte: new Date(Date.now() - 86_400_000) } },
      orderBy: { createdAt: "desc" },
    })
    if (cached) {
      try { return NextResponse.json(JSON.parse(cached.payload) as LostAnalysisResult) } catch { /* recompute */ }
    }

    const since = new Date(Date.now() - 90 * 86_400_000)
    const lostDeals = await prisma.deal.findMany({
      where: { lostReason: { not: null }, updatedAt: { gte: since } },
      select: { id: true, title: true, value: true, lostReason: true },
      take: 200,
    })

    if (lostDeals.length < 5) {
      const result: LostAnalysisResult = { themes: [], note: "Not enough lost deals in the last 90 days (need ≥5)", _generatedAt: new Date().toISOString() }
      return NextResponse.json(result)
    }

    const list = lostDeals.map((d, i) => `${i + 1}. [${d.title}] ${d.lostReason}`).join("\n")
    const prompt = `Analyze these B2B lost deal reasons and identify the top 5 themes. Reply ONLY with JSON.

Lost deals:
${list}

Output JSON: {"themes":[{"name":"<short theme>","count":<n>,"examples":["<short example>","<short example>"],"suggestion":"<one actionable suggestion>"}]}

Limit to top 5 themes. Counts must sum to roughly the total. Keep examples short.`

    const llm = await callLLM({ prompt, maxTokens: 1024, task: "classify" })
    const fallback: LostAnalysisResult = { themes: [], note: "AI unavailable", _generatedAt: new Date().toISOString() }
    if (!llm.ok) return NextResponse.json(fallback)

    const parsed = extractJson<LostAnalysisResult>(llm.text, fallback)
    if (!Array.isArray(parsed.themes)) return NextResponse.json(fallback)
    parsed._generatedAt = new Date().toISOString()

    await prisma.aIInsight.create({
      data: {
        type: "LOST_ANALYSIS",
        payload: JSON.stringify(parsed),
        userId: session.user.id,
      },
    })

    return NextResponse.json(parsed)
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
