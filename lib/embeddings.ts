import { getAIConfig } from "./ai-provider"

/**
 * Embedding utilities.
 *
 * Strategy:
 *  - When the configured provider is OpenRouter, hit the OpenAI-compatible
 *    embeddings endpoint (`openai/text-embedding-3-small`, 1536-dim).
 *  - Otherwise (or on error), fall back to a deterministic 256-dim
 *    feature-hash embedding so search still functions without a network LLM.
 *
 * All vectors returned are L2-normalised so cosine similarity is a simple
 * dot product.
 */

const HASH_DIM = 256

interface OpenAIEmbeddingsResponse {
  data?: Array<{ embedding: number[] }>
}

function l2Normalize(v: number[]): number[] {
  let sum = 0
  for (const x of v) sum += x * x
  const norm = Math.sqrt(sum) || 1
  if (norm === 1) return v
  const out = new Array<number>(v.length)
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm
  return out
}

export function hashEmbed(text: string, dim = HASH_DIM): number[] {
  const v = new Array<number>(dim).fill(0)
  const tokens = text.toLowerCase().split(/\W+/).filter(Boolean)
  for (const tok of tokens) {
    let h = 5381
    for (let i = 0; i < tok.length; i++) {
      h = ((h << 5) + h + tok.charCodeAt(i)) | 0
    }
    const idx = Math.abs(h) % dim
    v[idx] += 1
    // bigram-ish: hash adjacent token too for a touch more signal
    let h2 = 7919
    for (let i = 0; i < tok.length; i++) {
      h2 = ((h2 * 31) + tok.charCodeAt(i)) | 0
    }
    v[Math.abs(h2) % dim] += 0.5
  }
  return l2Normalize(v)
}

function truncateForEmbed(text: string, maxChars = 8000): string {
  if (text.length <= maxChars) return text
  return text.slice(0, maxChars)
}

async function fetchOpenRouterEmbeddings(inputs: string[], key: string, signal?: AbortSignal): Promise<number[][] | null> {
  try {
    const res = await fetch("https://openrouter.ai/api/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "content-type": "application/json",
        "HTTP-Referer": "http://localhost:3000",
        "X-Title": "Karat CRM",
      },
      body: JSON.stringify({
        model: "openai/text-embedding-3-small",
        input: inputs.map((s) => truncateForEmbed(s)),
      }),
      signal,
    })
    if (!res.ok) return null
    const data = (await res.json()) as OpenAIEmbeddingsResponse
    if (!Array.isArray(data.data) || data.data.length !== inputs.length) return null
    return data.data.map((d) => l2Normalize(d.embedding))
  } catch {
    return null
  }
}

export async function embed(text: string): Promise<number[]> {
  const cfg = await getAIConfig()
  if (cfg.provider === "openrouter" && cfg.openrouterKey) {
    const result = await fetchOpenRouterEmbeddings([text], cfg.openrouterKey)
    if (result && result[0]) return result[0]
  }
  return hashEmbed(text)
}

export async function embedBatch(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return []
  const cfg = await getAIConfig()
  if (cfg.provider === "openrouter" && cfg.openrouterKey) {
    // OpenAI-compatible endpoint accepts an array of inputs in one call.
    // Chunk to avoid huge payloads.
    const CHUNK = 64
    const out: number[][] = []
    for (let i = 0; i < texts.length; i += CHUNK) {
      const slice = texts.slice(i, i + CHUNK)
      const result = await fetchOpenRouterEmbeddings(slice, cfg.openrouterKey)
      if (!result) {
        // Fall back to hash embed for the whole batch from this point
        for (let j = i; j < texts.length; j++) out.push(hashEmbed(texts[j]))
        return out
      }
      out.push(...result)
    }
    return out
  }
  return texts.map((t) => hashEmbed(t))
}

export function cosine(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0
  let dot = 0
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i]
  // vectors are L2-normalised so dot == cosine
  return dot
}

export function parseEmbedding(s: string | null | undefined): number[] | null {
  if (!s) return null
  try {
    const v = JSON.parse(s) as unknown
    if (!Array.isArray(v)) return null
    const out = new Array<number>(v.length)
    for (let i = 0; i < v.length; i++) {
      const n = v[i]
      if (typeof n !== "number" || !Number.isFinite(n)) return null
      out[i] = n
    }
    return out
  } catch {
    return null
  }
}

/** Builds the text representation of a contact used for embedding. */
export function contactEmbedText(c: {
  name?: string | null
  company?: string | null
  city?: string | null
  state?: string | null
  zone?: string | null
  type?: string | null
  source?: string | null
  category?: string | null
  title?: string | null
  tags?: string[] | null
  notes?: string | null
}): string {
  const parts: string[] = []
  if (c.name) parts.push(c.name)
  if (c.company) parts.push(c.company)
  if (c.title) parts.push(c.title)
  if (c.city) parts.push(c.city)
  if (c.state) parts.push(c.state)
  if (c.zone) parts.push(c.zone)
  if (c.type) parts.push(c.type)
  if (c.source) parts.push(c.source)
  if (c.category) parts.push(c.category)
  if (c.tags && c.tags.length) parts.push(c.tags.join(" "))
  if (c.notes) parts.push(c.notes)
  return parts.filter(Boolean).join(" ")
}
