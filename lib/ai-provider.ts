import { prisma } from "./prisma"
import { TASK_KEYS, isTaskKey, type TaskKey } from "./ai-models"

export type { TaskKey } from "./ai-models"

export type AIProvider = "anthropic" | "openrouter" | "groq"

export interface AIConfig {
  provider: AIProvider
  model: string
  anthropicKey: string
  openrouterKey: string
  groqKey: string
  taskModels: Partial<Record<TaskKey, string>>
}

const DEFAULT_CONFIG: AIConfig = {
  provider: "anthropic",
  model: "claude-sonnet-4-5",
  anthropicKey: "",
  openrouterKey: "",
  groqKey: "",
  taskModels: {},
}

const MODEL_DEFAULTS: Record<AIProvider, string> = {
  anthropic: "claude-sonnet-4-5",
  openrouter: "openai/gpt-4o-mini",
  groq: "llama-3.3-70b-versatile",
}

const KEY_PREFIX = "ai."
const BASE_KEYS = ["provider", "model", "anthropicKey", "openrouterKey", "groqKey"] as const
type BaseKey = (typeof BASE_KEYS)[number]

const MODEL_KEY_PREFIX = "ai.model."

function taskSettingKey(task: TaskKey): string {
  return MODEL_KEY_PREFIX + task
}

export async function getAIConfig(): Promise<AIConfig> {
  const lookups: string[] = [
    ...BASE_KEYS.map((k) => KEY_PREFIX + k),
    ...TASK_KEYS.map(taskSettingKey),
  ]
  const rows = await prisma.setting.findMany({ where: { key: { in: lookups } } })
  const map = new Map(rows.map((r) => [r.key, r.value]))

  const taskModels: Partial<Record<TaskKey, string>> = {}
  for (const t of TASK_KEYS) {
    const v = map.get(taskSettingKey(t))
    if (v && v.trim().length > 0) taskModels[t] = v
  }

  return {
    provider: (map.get(KEY_PREFIX + "provider") as AIProvider) ?? (process.env.AI_PROVIDER as AIProvider) ?? DEFAULT_CONFIG.provider,
    model: map.get(KEY_PREFIX + "model") ?? DEFAULT_CONFIG.model,
    anthropicKey: map.get(KEY_PREFIX + "anthropicKey") ?? process.env.ANTHROPIC_API_KEY ?? "",
    openrouterKey: map.get(KEY_PREFIX + "openrouterKey") ?? process.env.OPENROUTER_API_KEY ?? "",
    groqKey: map.get(KEY_PREFIX + "groqKey") ?? process.env.GROQ_API_KEY ?? "",
    taskModels,
  }
}

export interface AIConfigPatch {
  provider?: AIProvider
  model?: string
  anthropicKey?: string
  openrouterKey?: string
  groqKey?: string
  taskModels?: Partial<Record<TaskKey, string | null>>
}

export async function setAIConfig(patch: AIConfigPatch): Promise<void> {
  const ops: ReturnType<typeof prisma.setting.upsert>[] = []

  for (const k of BASE_KEYS) {
    const v = patch[k as BaseKey]
    if (v === undefined) continue
    const key = KEY_PREFIX + k
    const value = String(v ?? "")
    ops.push(
      prisma.setting.upsert({
        where: { key },
        update: { value },
        create: { key, value },
      })
    )
  }

  if (patch.taskModels) {
    for (const [task, raw] of Object.entries(patch.taskModels)) {
      if (!isTaskKey(task)) continue
      const key = taskSettingKey(task)
      const value = raw == null ? "" : String(raw)
      ops.push(
        prisma.setting.upsert({
          where: { key },
          update: { value },
          create: { key, value },
        })
      )
    }
  }

  if (ops.length) await prisma.$transaction(ops)
}

export function defaultModelFor(provider: AIProvider): string {
  return MODEL_DEFAULTS[provider]
}

function resolveModel(cfg: AIConfig, task?: TaskKey): string {
  if (task) {
    const override = cfg.taskModels[task]
    if (override && override.trim().length > 0) return override
  }
  return cfg.model || MODEL_DEFAULTS[cfg.provider]
}

export interface LLMMessage {
  role: "system" | "user" | "assistant"
  content: string
}

export interface LLMResult {
  ok: boolean
  text: string
  error?: string
  provider: AIProvider
  model: string
}

const TIMEOUT_MS = 30_000

async function fetchJson(url: string, init: RequestInit & { timeoutMs?: number }): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? TIMEOUT_MS)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    const text = await res.text()
    let body: unknown
    try { body = JSON.parse(text) } catch { body = text }
    if (!res.ok) throw new Error(typeof body === "string" ? body : JSON.stringify(body))
    return body
  } finally {
    clearTimeout(timer)
  }
}

interface OpenAIChatResponse {
  choices?: Array<{ message?: { content?: string } }>
}

interface AnthropicResponse {
  content?: Array<{ text?: string }>
}

export async function callLLM(params: {
  system?: string
  prompt: string
  maxTokens?: number
  task?: TaskKey
}): Promise<LLMResult> {
  const cfg = await getAIConfig()
  const maxTokens = params.maxTokens ?? 1024
  const model = resolveModel(cfg, params.task)

  // Validate model is plausibly correct for the chosen provider
  if (cfg.provider === "anthropic" && model && !model.toLowerCase().includes("claude")) {
    return { ok: false, text: "", error: `Model "${model}" is not valid for Anthropic`, provider: cfg.provider, model }
  }
  if (cfg.provider === "openrouter" && model && !model.includes("/")) {
    return { ok: false, text: "", error: `OpenRouter model must be in "vendor/model" format`, provider: cfg.provider, model }
  }

  try {
    if (cfg.provider === "anthropic") {
      if (!cfg.anthropicKey) return { ok: false, text: "", error: "Anthropic key not configured", provider: cfg.provider, model }
      const body = {
        model,
        max_tokens: maxTokens,
        system: params.system,
        messages: [{ role: "user", content: params.prompt }],
      }
      const data = (await fetchJson("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": cfg.anthropicKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      })) as AnthropicResponse
      const text = data.content?.map((b) => b.text ?? "").join("") ?? ""
      return { ok: true, text, provider: cfg.provider, model: body.model }
    }

    // OpenAI-compatible (OpenRouter + Groq)
    const endpoint =
      cfg.provider === "openrouter"
        ? "https://openrouter.ai/api/v1/chat/completions"
        : "https://api.groq.com/openai/v1/chat/completions"
    const key = cfg.provider === "openrouter" ? cfg.openrouterKey : cfg.groqKey
    if (!key) return { ok: false, text: "", error: `${cfg.provider} key not configured`, provider: cfg.provider, model }
    const messages: LLMMessage[] = []
    if (params.system) messages.push({ role: "system", content: params.system })
    messages.push({ role: "user", content: params.prompt })
    const data = (await fetchJson(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
        ...(cfg.provider === "openrouter" ? { "HTTP-Referer": "http://localhost:3000", "X-Title": "Karat CRM" } : {}),
      },
      body: JSON.stringify({
        model,
        max_tokens: maxTokens,
        messages,
      }),
    })) as OpenAIChatResponse
    const text = data.choices?.[0]?.message?.content ?? ""
    return { ok: true, text, provider: cfg.provider, model }
  } catch (e) {
    return { ok: false, text: "", error: (e as Error).message, provider: cfg.provider, model }
  }
}

export function isProviderConfigured(cfg: AIConfig): boolean {
  if (cfg.provider === "anthropic") return cfg.anthropicKey.length > 0
  if (cfg.provider === "openrouter") return cfg.openrouterKey.length > 0
  if (cfg.provider === "groq") return cfg.groqKey.length > 0
  return false
}

// ----------------------------------------------------------------------
// Tool-use support (Anthropic-style, falls back to plain text on other providers)
// ----------------------------------------------------------------------

export interface ToolSpec {
  name: string
  description: string
  input_schema: {
    type: "object"
    properties: Record<string, unknown>
    required?: string[]
  }
}

export interface ToolUseBlock {
  type: "tool_use"
  id: string
  name: string
  input: Record<string, unknown>
}

export interface TextBlock {
  type: "text"
  text: string
}

export type ContentBlock = TextBlock | ToolUseBlock

export interface ToolResultMessage {
  role: "user"
  content: Array<{ type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }>
}

export interface AssistantMessage {
  role: "assistant"
  content: ContentBlock[]
}

export type ToolUseMessage =
  | { role: "user"; content: string | Array<{ type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }> }
  | AssistantMessage

export interface ToolUseStep {
  iteration: number
  blocks: ContentBlock[]
  stopReason?: string
}

export interface ToolUseResult {
  ok: boolean
  finalText: string
  steps: ToolUseStep[]
  toolCalls: Array<{ name: string; input: Record<string, unknown>; output: string; isError: boolean }>
  error?: string
  provider: AIProvider
  model: string
}

interface AnthropicMessagesResponse {
  content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>
  stop_reason?: string
}

export type ToolExecutor = (name: string, input: Record<string, unknown>) => Promise<string>

/**
 * Multi-turn tool-use loop. Uses Anthropic's native tool-use API when the
 * provider is anthropic. For OpenRouter / Groq, falls back to a text-only
 * answer (no tool calls). Loops up to `maxIterations` (default 5).
 */
export async function callLLMWithTools(params: {
  system: string
  messages: Array<{ role: "user" | "assistant"; content: string }>
  tools: ToolSpec[]
  executor: ToolExecutor
  maxIterations?: number
  maxTokens?: number
  task?: TaskKey
}): Promise<ToolUseResult> {
  const cfg = await getAIConfig()
  const maxIters = params.maxIterations ?? 5
  const maxTokens = params.maxTokens ?? 2048
  const resolved = resolveModel(cfg, params.task)

  const empty: ToolUseResult = {
    ok: false,
    finalText: "",
    steps: [],
    toolCalls: [],
    provider: cfg.provider,
    model: resolved,
  }

  if (cfg.provider !== "anthropic") {
    // Fallback: plain text answer, no tool calls
    const lastUser = [...params.messages].reverse().find((m) => m.role === "user")
    const r = await callLLM({
      system: params.system + "\n\n(Note: tools are unavailable in this provider. Answer from general knowledge.)",
      prompt: lastUser?.content ?? "Hello",
      maxTokens,
      task: params.task,
    })
    return {
      ok: r.ok,
      finalText: r.text,
      steps: [],
      toolCalls: [],
      error: r.error,
      provider: cfg.provider,
      model: r.model,
    }
  }

  if (!cfg.anthropicKey) {
    return { ...empty, error: "Anthropic key not configured" }
  }

  // Build initial messages in Anthropic format
  type AMessage = { role: "user" | "assistant"; content: string | ContentBlock[] | Array<{ type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }> }
  const aMessages: AMessage[] = params.messages.map((m) => ({ role: m.role, content: m.content }))

  const steps: ToolUseStep[] = []
  const toolCalls: ToolUseResult["toolCalls"] = []
  let finalText = ""

  for (let iter = 0; iter < maxIters; iter++) {
    const body = {
      model: resolved,
      max_tokens: maxTokens,
      system: params.system,
      tools: params.tools,
      messages: aMessages,
    }
    let data: AnthropicMessagesResponse
    try {
      data = (await fetchJson("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": cfg.anthropicKey,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify(body),
      })) as AnthropicMessagesResponse
    } catch (e) {
      return { ...empty, error: (e as Error).message }
    }

    const blocks: ContentBlock[] = (data.content ?? []).map((b) => {
      if (b.type === "tool_use" && b.id && b.name) {
        return { type: "tool_use", id: b.id, name: b.name, input: b.input ?? {} } as ToolUseBlock
      }
      return { type: "text", text: b.text ?? "" } as TextBlock
    })
    steps.push({ iteration: iter, blocks, stopReason: data.stop_reason })

    const toolUses = blocks.filter((b): b is ToolUseBlock => b.type === "tool_use")
    const textOnly = blocks.filter((b): b is TextBlock => b.type === "text").map((b) => b.text).join("\n").trim()

    if (toolUses.length === 0) {
      finalText = textOnly
      return {
        ok: true,
        finalText,
        steps,
        toolCalls,
        provider: cfg.provider,
        model: body.model,
      }
    }

    // Append assistant message with blocks
    aMessages.push({ role: "assistant", content: blocks })

    // Execute each tool, build tool_result content
    const toolResults: Array<{ type: "tool_result"; tool_use_id: string; content: string; is_error?: boolean }> = []
    for (const tu of toolUses) {
      let output = ""
      let isError = false
      try {
        output = await params.executor(tu.name, tu.input)
      } catch (e) {
        output = JSON.stringify({ error: (e as Error).message })
        isError = true
      }
      toolCalls.push({ name: tu.name, input: tu.input, output, isError })
      toolResults.push({ type: "tool_result", tool_use_id: tu.id, content: output, is_error: isError })
    }
    aMessages.push({ role: "user", content: toolResults })

    if (data.stop_reason === "end_turn") {
      finalText = textOnly
      return { ok: true, finalText, steps, toolCalls, provider: cfg.provider, model: body.model }
    }
  }

  // Max iterations reached
  return {
    ok: true,
    finalText: finalText || "Reached maximum tool-call iterations.",
    steps,
    toolCalls,
    provider: cfg.provider,
    model: resolved,
  }
}
