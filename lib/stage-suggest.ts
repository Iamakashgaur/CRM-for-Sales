import { prisma } from "./prisma"
import { callLLM } from "./ai-provider"
import { extractJson } from "./ai"

export interface StageSuggestionPayload {
  suggestedStageId: string
  suggestedStageName: string
  reasoning: string
  triggerActivityId?: string | null
  triggerSubject?: string | null
  status: "pending" | "accepted" | "dismissed"
  _generatedAt: string
}

interface MiniStage {
  id: string
  name: string
  probability: number
}

function pickStageHeuristic(
  text: string,
  stages: MiniStage[]
): { id: string; name: string; reason: string } | null {
  const matchers: Array<{
    keywords: RegExp
    pickName: (s: MiniStage) => boolean
    reason: string
  }> = [
    {
      keywords: /(signed|won|contract executed|closed[- ]won|deal closed)/i,
      pickName: (s) => s.probability === 100 || /won/i.test(s.name),
      reason: "Activity mentions a signed contract / win.",
    },
    {
      keywords: /(lost|declined|chose competitor|went with|no go|closed[- ]lost)/i,
      pickName: (s) => s.probability === 0 || /lost/i.test(s.name),
      reason: "Activity mentions the deal being lost.",
    },
    {
      keywords: /(negotiat|counter[- ]?offer|redlines?)/i,
      pickName: (s) => /negotiat/i.test(s.name),
      reason: "Activity mentions negotiation.",
    },
    {
      keywords: /(proposal sent|sent the proposal|sow sent|quote sent|sent a quote)/i,
      pickName: (s) => /(proposal|quote|sow)/i.test(s.name),
      reason: "Activity mentions sending a proposal/quote.",
    },
    {
      keywords: /(demo (completed|done|delivered)|demo recap|after the demo)/i,
      pickName: (s) => /(qualif|discovery|propos)/i.test(s.name),
      reason: "Activity mentions a completed demo.",
    },
  ]
  for (const m of matchers) {
    if (m.keywords.test(text)) {
      const target = stages.find(m.pickName)
      if (target) return { id: target.id, name: target.name, reason: m.reason }
    }
  }
  return null
}

/**
 * Fire-and-forget: analyse a freshly created activity and store a stage
 * suggestion as an AIInsight if one is warranted. Caller should NOT await
 * unless they specifically want to block on the result.
 */
export async function suggestStageForActivity(activityId: string): Promise<void> {
  try {
    const activity = await prisma.activity.findUnique({
      where: { id: activityId },
      include: { deal: { include: { stageRef: true } } },
    })
    if (!activity || !activity.deal) return
    const deal = activity.deal

    // Skip if the deal is already closed (probability 0 or 100)
    if (deal.probability === 0 || deal.probability === 100) return

    const stages = await prisma.stage.findMany({ orderBy: { order: "asc" } })
    if (stages.length === 0) return

    const subj = activity.subject.toLowerCase()
    const body = (activity.body ?? "").toLowerCase()
    const hay = `${subj} ${body}`
    const heuristic = pickStageHeuristic(
      hay,
      stages.map((s) => ({ id: s.id, name: s.name, probability: s.probability }))
    )

    let suggestedId: string | null = heuristic?.id ?? null
    let suggestedName: string | null = heuristic?.name ?? null
    let reasoning = heuristic?.reason ?? ""

    if (!suggestedId) {
      const prompt = `You are a sales pipeline analyst. Given a sales activity, decide if it signals the deal should move to a different stage. Respond ONLY with JSON.

Current stage: ${deal.stage} (id: ${deal.stageId})
Available stages (id | name | default probability):
${stages.map((s) => `- ${s.id} | ${s.name} | ${s.probability}%`).join("\n")}

Activity:
- Type: ${activity.type}
- Subject: ${activity.subject}
- Body: ${(activity.body ?? "").slice(0, 600)}

Respond with:
{"shouldMove": true|false, "stageId": "<id from the list above, or null>", "reasoning": "<one short sentence>"}
If unsure or no strong signal, return shouldMove=false.`

      const llm = await callLLM({ prompt, maxTokens: 200 })
      if (llm.ok) {
        const out = extractJson<{ shouldMove?: boolean; stageId?: string | null; reasoning?: string }>(
          llm.text,
          {}
        )
        if (out.shouldMove && typeof out.stageId === "string") {
          const match = stages.find((s) => s.id === out.stageId)
          if (match && match.id !== deal.stageId) {
            suggestedId = match.id
            suggestedName = match.name
            reasoning =
              typeof out.reasoning === "string" && out.reasoning.trim()
                ? out.reasoning.trim()
                : `Signal in "${activity.subject}".`
          }
        }
      }
    }

    if (!suggestedId || !suggestedName || suggestedId === deal.stageId) return

    const payload: StageSuggestionPayload = {
      suggestedStageId: suggestedId,
      suggestedStageName: suggestedName,
      reasoning,
      triggerActivityId: activity.id,
      triggerSubject: activity.subject,
      status: "pending",
      _generatedAt: new Date().toISOString(),
    }

    await prisma.aIInsight.create({
      data: {
        type: "STAGE_SUGGESTION",
        payload: JSON.stringify(payload),
        dealId: deal.id,
        userId: activity.userId,
      },
    })
  } catch {
    // never block on AI
  }
}
