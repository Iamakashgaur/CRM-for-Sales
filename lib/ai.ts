import type { AIInsight } from "@prisma/client"
import { callLLM } from "./ai-provider"
import type { TaskKey } from "./ai-models"

export function parseAIInsight<T>(insight: AIInsight): T | null {
  try {
    return JSON.parse(insight.payload) as T
  } catch {
    console.warn("Bad AIInsight payload:", insight.id)
    return null
  }
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

export function extractJson<T>(text: string, fallback: T): T {
  try {
    // Try direct parse first
    const trimmed = text.trim()
    try { return JSON.parse(trimmed) as T } catch { /* fall through */ }
    // Strip ```json fences if present
    const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i)
    if (fence) {
      try { return JSON.parse(fence[1]) as T } catch { /* fall through */ }
    }
    // Greedy match — works for {...} and [...]
    const objMatch = text.match(/\{[\s\S]*\}/)
    if (objMatch) {
      try { return JSON.parse(objMatch[0]) as T } catch { /* fall through */ }
    }
    const arrMatch = text.match(/\[[\s\S]*\]/)
    if (arrMatch) {
      try { return JSON.parse(arrMatch[0]) as T } catch { /* fall through */ }
    }
    return fallback
  } catch {
    return fallback
  }
}

async function callClaude(prompt: string, task?: TaskKey): Promise<string> {
  const result = await callLLM({ prompt, maxTokens: 1024, task })
  if (!result.ok) throw new Error(result.error ?? "LLM call failed")
  return result.text
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
    const text = await callClaude(prompt, "score")
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
    const text = await callClaude(prompt, "suggest")
    const parsed = extractJson<SuggestionResult>(text, fallback)
    if (!Array.isArray(parsed.actions)) return fallback
    return parsed
  } catch {
    return fallback
  }
}

export type DraftLanguage = "en" | "hi" | "hinglish"

function languageInstruction(lang: DraftLanguage): string {
  switch (lang) {
    case "hi":
      return "Draft the email in Hindi (Devanagari script). Keep subject also in Hindi. Use formal but warm tone suitable for Indian B2B business."
    case "hinglish":
      return "Draft in Hinglish — natural mix of Hindi and English as urban Indian professionals speak. Hindi can be in Devanagari or romanized. Keep it conversational yet professional."
    case "en":
    default:
      return "Draft in clear, professional English."
  }
}

export async function draftEmail(input: {
  contactName: string
  contactCompany?: string | null
  dealTitle?: string | null
  purpose: string
  tone?: "professional" | "friendly" | "concise"
  language?: DraftLanguage
}): Promise<DraftEmailResult> {
  const language: DraftLanguage = input.language ?? "en"
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

Language: ${language}
${languageInstruction(language)}

JSON shape:
{"subject": "...", "body": "<full email body with greeting and signoff>", "tone": "..."}`
    const text = await callClaude(prompt, "draft")
    const parsed = extractJson<DraftEmailResult>(text, fallback)
    if (!parsed.subject || !parsed.body) return fallback
    return parsed
  } catch {
    return fallback
  }
}
