import Anthropic from "@anthropic-ai/sdk"

const MODEL = "claude-sonnet-4-5"

function getClient(): Anthropic | null {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) return null
  return new Anthropic({ apiKey: key })
}

export interface ScoreResult {
  score: number
  confidence: "low" | "medium" | "high"
  reasoning: string
  risks: string[]
  opportunities: string[]
}

export interface SuggestionResult {
  actions: Array<{ title: string; description: string; priority: "low" | "medium" | "high"; type: string }>
}

export interface DraftEmailResult {
  subject: string
  body: string
  tone: string
}

function extractJson<T>(text: string, fallback: T): T {
  try {
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return fallback
    return JSON.parse(m[0]) as T
  } catch {
    return fallback
  }
}

async function callClaude(prompt: string): Promise<string> {
  const client = getClient()
  if (!client) throw new Error("No Anthropic API key configured")
  const resp = await client.messages.create({
    model: MODEL,
    max_tokens: 1024,
    messages: [{ role: "user", content: prompt }],
  })
  const block = resp.content[0]
  if (block && block.type === "text") return block.text
  return ""
}

export async function scoreDeal(input: {
  title: string
  value: number
  stage: string
  daysInStage: number
  daysSinceLastActivity: number
  contactCompany?: string | null
  notes?: string | null
}): Promise<ScoreResult> {
  const fallback: ScoreResult = {
    score: 50,
    confidence: "low",
    reasoning: "AI scoring unavailable. Showing a neutral baseline.",
    risks: [],
    opportunities: [],
  }
  try {
    const prompt = `You are a B2B sales analyst. Score the deal health from 0-100 and respond ONLY with a JSON object.

Deal:
- Title: ${input.title}
- Value: $${input.value}
- Stage: ${input.stage}
- Days in current stage: ${input.daysInStage}
- Days since last activity: ${input.daysSinceLastActivity}
- Company: ${input.contactCompany ?? "Unknown"}
- Notes: ${input.notes ?? "None"}

Respond with JSON:
{"score": <0-100>, "confidence": "low"|"medium"|"high", "reasoning": "<1-2 sentences>", "risks": ["..."], "opportunities": ["..."]}`
    const text = await callClaude(prompt)
    const parsed = extractJson<ScoreResult>(text, fallback)
    if (typeof parsed.score !== "number") return fallback
    return parsed
  } catch {
    return fallback
  }
}

export async function suggestActions(input: {
  dealTitle: string
  stage: string
  daysSinceLastActivity: number
  recentActivities: string[]
}): Promise<SuggestionResult> {
  const fallback: SuggestionResult = {
    actions: [
      { title: "Reach out to contact", description: "Send a follow-up email to re-engage.", priority: "medium", type: "EMAIL" },
    ],
  }
  try {
    const prompt = `You are a B2B sales coach. Suggest 3 next best actions for this deal. Respond ONLY with JSON.

Deal: ${input.dealTitle}
Stage: ${input.stage}
Days since last activity: ${input.daysSinceLastActivity}
Recent activities: ${input.recentActivities.join("; ") || "none"}

JSON shape:
{"actions": [{"title": "...", "description": "...", "priority": "low"|"medium"|"high", "type": "CALL"|"EMAIL"|"MEETING"|"NOTE"|"TASK"}]}`
    const text = await callClaude(prompt)
    const parsed = extractJson<SuggestionResult>(text, fallback)
    if (!Array.isArray(parsed.actions)) return fallback
    return parsed
  } catch {
    return fallback
  }
}

export async function draftEmail(input: {
  contactName: string
  contactCompany?: string | null
  dealTitle?: string | null
  purpose: string
  tone?: "professional" | "friendly" | "concise"
}): Promise<DraftEmailResult> {
  const fallback: DraftEmailResult = {
    subject: `Following up: ${input.dealTitle ?? input.purpose}`,
    body: `Hi ${input.contactName.split(" ")[0] ?? input.contactName},\n\nI wanted to follow up regarding ${input.purpose}. Do you have time this week for a quick chat?\n\nBest regards`,
    tone: input.tone ?? "professional",
  }
  try {
    const prompt = `Draft a B2B sales email. Respond ONLY with JSON.

Recipient: ${input.contactName}${input.contactCompany ? ` at ${input.contactCompany}` : ""}
Related deal: ${input.dealTitle ?? "N/A"}
Purpose: ${input.purpose}
Tone: ${input.tone ?? "professional"}

JSON shape:
{"subject": "...", "body": "<full email body with greeting and signoff>", "tone": "..."}`
    const text = await callClaude(prompt)
    const parsed = extractJson<DraftEmailResult>(text, fallback)
    if (!parsed.subject || !parsed.body) return fallback
    return parsed
  } catch {
    return fallback
  }
}
