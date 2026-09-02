// Curated model catalog and per-task defaults for the AI provider layer.
//
// Each entry describes a model that the Karat CRM is known to work with.
// The catalog is used by:
//   - The Settings -> AI tab UI to render dropdowns + tier/cost hints
//   - The /api/admin/ai-config endpoint to validate and surface choices
//
// Adding a new model is as simple as appending a row here.

export type AIProvider = "anthropic" | "openrouter" | "groq"

export type ModelTier = "fast" | "balanced" | "premium" | "free"

export type ModelFeature = "chat" | "tools" | "vision" | "long-context"

export interface ModelOption {
  id: string
  label: string
  provider: AIProvider
  tier: ModelTier
  features: ModelFeature[]
  costHint: string // e.g. "Free", "$0.15/M", "$3/M"
  notes?: string
}

export type TaskKey =
  | "score"
  | "suggest"
  | "draft"
  | "coach"
  | "vision"
  | "reasoning"
  | "classify"
  | "chat"

export const TASK_KEYS: readonly TaskKey[] = [
  "score",
  "suggest",
  "draft",
  "coach",
  "vision",
  "reasoning",
  "classify",
  "chat",
] as const

export interface TaskDescriptor {
  key: TaskKey
  label: string
  description: string
}

export const TASK_DESCRIPTORS: readonly TaskDescriptor[] = [
  { key: "score",     label: "Score",     description: "Deal & contact scoring, triage. Cheap and repetitive — favour fast models." },
  { key: "suggest",   label: "Suggest",   description: "Briefings, stalled-deal nudges, slippage explanations." },
  { key: "draft",     label: "Draft",     description: "Email, WhatsApp, nurture sequence drafting." },
  { key: "coach",     label: "Coach",     description: "Deal coach chat and copilot — tool-use capable." },
  { key: "vision",    label: "Vision",    description: "Business-card OCR and other image-aware extraction." },
  { key: "reasoning", label: "Reasoning", description: "Monthly narratives, territory insights, calibration." },
  { key: "classify",  label: "Classify",  description: "Bulk categorisation, lost-deal clustering, query parsing." },
  { key: "chat",      label: "Chat",      description: "General copilot conversations." },
]

export const MODEL_CATALOG: ModelOption[] = [
  // --- Anthropic --------------------------------------------------------
  { id: "claude-sonnet-4-5", label: "Claude Sonnet 4.5", provider: "anthropic", tier: "premium", features: ["chat", "tools", "vision", "long-context"], costHint: "$3/$15 per M" },
  { id: "claude-opus-4-1", label: "Claude Opus 4.1", provider: "anthropic", tier: "premium", features: ["chat", "tools", "vision", "long-context"], costHint: "$15/$75 per M", notes: "Best reasoning" },
  { id: "claude-3-5-haiku-latest", label: "Claude Haiku 3.5", provider: "anthropic", tier: "fast", features: ["chat", "tools", "vision"], costHint: "$0.80/$4 per M", notes: "Cheap + fast" },

  // --- OpenRouter (one key, many models) --------------------------------
  { id: "openai/gpt-4o", label: "GPT-4o", provider: "openrouter", tier: "premium", features: ["chat", "tools", "vision"], costHint: "$2.50/$10 per M" },
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini", provider: "openrouter", tier: "balanced", features: ["chat", "tools", "vision"], costHint: "$0.15/$0.60 per M", notes: "Best price/quality" },
  { id: "anthropic/claude-3.5-sonnet", label: "Claude 3.5 Sonnet (via OR)", provider: "openrouter", tier: "premium", features: ["chat", "tools", "vision", "long-context"], costHint: "$3/$15 per M" },
  { id: "anthropic/claude-3.5-haiku", label: "Claude 3.5 Haiku (via OR)", provider: "openrouter", tier: "fast", features: ["chat", "tools", "vision"], costHint: "$1/$5 per M" },
  { id: "google/gemini-2.0-flash-001", label: "Gemini 2.0 Flash", provider: "openrouter", tier: "fast", features: ["chat", "tools", "vision", "long-context"], costHint: "$0.10/$0.40 per M" },
  { id: "google/gemini-2.0-flash-exp:free", label: "Gemini 2.0 Flash (free)", provider: "openrouter", tier: "free", features: ["chat", "vision", "long-context"], costHint: "Free", notes: "Rate-limited" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", provider: "openrouter", tier: "balanced", features: ["chat", "tools"], costHint: "$0.12/$0.30 per M" },
  { id: "meta-llama/llama-3.3-70b-instruct:free", label: "Llama 3.3 70B (free)", provider: "openrouter", tier: "free", features: ["chat"], costHint: "Free", notes: "Rate-limited" },
  { id: "mistralai/mistral-large-2411", label: "Mistral Large", provider: "openrouter", tier: "premium", features: ["chat", "tools"], costHint: "$2/$6 per M" },
  { id: "deepseek/deepseek-chat", label: "DeepSeek V3", provider: "openrouter", tier: "balanced", features: ["chat", "tools", "long-context"], costHint: "$0.27/$1.10 per M" },
  { id: "qwen/qwen-2.5-72b-instruct", label: "Qwen 2.5 72B", provider: "openrouter", tier: "balanced", features: ["chat"], costHint: "$0.35/$0.40 per M" },
  { id: "google/gemma-2-9b-it:free", label: "Gemma 2 9B (free)", provider: "openrouter", tier: "free", features: ["chat"], costHint: "Free" },

  // --- Groq (free tier, fast) -------------------------------------------
  { id: "llama-3.3-70b-versatile", label: "Llama 3.3 70B", provider: "groq", tier: "balanced", features: ["chat", "tools"], costHint: "Free tier", notes: "Very fast" },
  { id: "llama-3.1-8b-instant", label: "Llama 3.1 8B Instant", provider: "groq", tier: "fast", features: ["chat"], costHint: "Free tier", notes: "Cheapest, fastest" },
  { id: "mixtral-8x7b-32768", label: "Mixtral 8x7B", provider: "groq", tier: "balanced", features: ["chat", "long-context"], costHint: "Free tier" },
  { id: "llama-3.2-11b-vision-preview", label: "Llama 3.2 11B Vision", provider: "groq", tier: "balanced", features: ["chat", "vision"], costHint: "Free tier" },
  { id: "llama-3.2-90b-vision-preview", label: "Llama 3.2 90B Vision", provider: "groq", tier: "premium", features: ["chat", "vision"], costHint: "Free tier" },
  { id: "deepseek-r1-distill-llama-70b", label: "DeepSeek R1 Llama 70B", provider: "groq", tier: "premium", features: ["chat"], costHint: "Free tier", notes: "Strong reasoning" },
]

export interface TaskDefault {
  tier: "fast" | "balanced" | "premium"
  needsTools?: boolean
  needsVision?: boolean
}

export const TASK_DEFAULTS: Record<TaskKey, TaskDefault> = {
  score:     { tier: "fast" },
  suggest:   { tier: "balanced" },
  draft:     { tier: "balanced" },
  coach:     { tier: "premium", needsTools: true },
  vision:    { tier: "balanced", needsVision: true },
  reasoning: { tier: "premium" },
  classify:  { tier: "fast" },
  chat:      { tier: "balanced" },
}

export function modelsForProvider(p: AIProvider): ModelOption[] {
  return MODEL_CATALOG.filter((m) => m.provider === p)
}

export function findModel(id: string): ModelOption | undefined {
  return MODEL_CATALOG.find((m) => m.id === id)
}

export function isTaskKey(value: string): value is TaskKey {
  return (TASK_KEYS as readonly string[]).includes(value)
}
