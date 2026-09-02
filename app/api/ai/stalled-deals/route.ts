import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { callLLM } from "@/lib/ai-provider"
import { extractJson } from "@/lib/ai"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"
import { getClosedStageIds } from "@/lib/stage-helpers"

export const dynamic = "force-dynamic"

interface StalledInsight {
  dealId: string
  dealTitle: string
  value: number
  daysStuck: number
  stage: string
  contactName: string
  insight: string
  action: string
}

interface LLMOutput { insight: string; action: string }

const LLM_FALLBACK: LLMOutput = { insight: "Pipeline is aging without engagement.", action: "Reach out for a status check." }

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!rateLimit(`ai:${session.user.id}`, 20, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const isRep = session.user.role === "REP"
    const closed = await getClosedStageIds()
    const where: Record<string, unknown> = {
      stageEnteredAt: { lt: new Date(Date.now() - 14 * 86_400_000) },
      probability: { lt: 40 },
      stage: { notIn: closed.closedNames },
    }
    if (isRep) where.ownerId = session.user.id

    const deals = await prisma.deal.findMany({
      where,
      orderBy: { value: "desc" },
      take: 20,
      include: { contact: { select: { name: true, company: true } } },
    })

    const results: StalledInsight[] = []

    for (const d of deals) {
      const cached = await prisma.aIInsight.findFirst({
        where: {
          dealId: d.id,
          type: "STALLED_INSIGHT",
          createdAt: { gte: new Date(Date.now() - 7 * 86_400_000) },
        },
        orderBy: { createdAt: "desc" },
      })
      let llmOut: LLMOutput = LLM_FALLBACK
      if (cached) {
        try { llmOut = JSON.parse(cached.payload) as LLMOutput } catch { /* recompute */ }
      } else {
        const daysStuck = Math.floor((Date.now() - d.stageEnteredAt.getTime()) / 86_400_000)
        const prompt = `Brief stalled-deal analysis. Reply ONLY with JSON.

Deal: ${d.title} | Value: ${d.value} | Stage: ${d.stage} | Days stuck: ${daysStuck} | Probability: ${d.probability}%
Contact: ${d.contact.name}${d.contact.company ? ` at ${d.contact.company}` : ""}
Notes: ${d.notes?.slice(0, 200) ?? "none"}

Output: {"insight":"<one sentence why stalled>","action":"<one sentence next step>"}`
        const llm = await callLLM({ prompt, maxTokens: 256, task: "suggest" })
        if (llm.ok) {
          const parsed = extractJson<LLMOutput>(llm.text, LLM_FALLBACK)
          if (parsed.insight && parsed.action) {
            llmOut = parsed
            await prisma.aIInsight.create({
              data: {
                type: "STALLED_INSIGHT",
                payload: JSON.stringify(llmOut),
                dealId: d.id,
                contactId: d.contactId,
                userId: session.user.id,
              },
            })
          }
        }
      }

      results.push({
        dealId: d.id,
        dealTitle: d.title,
        value: d.value,
        daysStuck: Math.floor((Date.now() - d.stageEnteredAt.getTime()) / 86_400_000),
        stage: d.stage,
        contactName: d.contact.name,
        insight: llmOut.insight,
        action: llmOut.action,
      })
    }

    return NextResponse.json({ items: results })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
