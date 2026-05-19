import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"
import { getAIConfig } from "@/lib/ai-provider"
import { extractJson } from "@/lib/ai"
import { normalizePhone } from "@/lib/utils"

export const dynamic = "force-dynamic"

interface CardFields {
  name?: string | null
  title?: string | null
  company?: string | null
  email?: string | null
  phone?: string | null
  website?: string | null
  address?: string | null
  social?: string | null
}

const PROMPT = `You are extracting contact details from a business card image. Output ONLY a JSON object with these fields (all optional, use null when missing): {"name": string, "title": string, "company": string, "email": string, "phone": string, "website": string, "address": string, "social": string}.
Rules:
- Extract the cardholder's name (usually the largest, most prominent name).
- title = job title / designation.
- company = business / brand name.
- email = first valid email visible.
- phone = primary phone (mobile preferred). Strip spaces, keep country code if visible.
- website = full URL or domain.
- address = single-line concatenated postal address (city + state + country if visible).
- social = LinkedIn / Instagram / X handle or URL if printed.
Respond ONLY with the JSON object, no commentary.`

interface AnthropicVisionResponse {
  content?: Array<{ text?: string }>
}

interface OpenAIVisionResponse {
  choices?: Array<{ message?: { content?: string } }>
}

async function extractWithAnthropic(key: string, model: string, base64: string, mediaType: string): Promise<string> {
  const body = {
    model,
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
          { type: "text", text: PROMPT },
        ],
      },
    ],
  }
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Anthropic vision: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as AnthropicVisionResponse
  return data.content?.map((b) => b.text ?? "").join("") ?? ""
}

async function extractWithOpenAICompat(endpoint: string, key: string, model: string, base64: string, mediaType: string): Promise<string> {
  const dataUrl = `data:${mediaType};base64,${base64}`
  const body = {
    model,
    max_tokens: 800,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: PROMPT },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  }
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "content-type": "application/json",
      ...(endpoint.includes("openrouter") ? { "HTTP-Referer": "http://localhost:3000", "X-Title": "Karat CRM" } : {}),
    },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Vision API: ${res.status} ${await res.text()}`)
  const data = (await res.json()) as OpenAIVisionResponse
  return data.choices?.[0]?.message?.content ?? ""
}

function cleanField(s: string | null | undefined): string | null {
  if (!s) return null
  const trimmed = String(s).trim()
  if (!trimmed || trimmed.toLowerCase() === "null") return null
  return trimmed
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!rateLimit(`scan-card:${session.user.id}`, 10, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const form = await req.formData()
    const file = form.get("image")
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "image required" }, { status: 400 })
    }
    if (file.size > 8 * 1024 * 1024) {
      return NextResponse.json({ error: "Image too large (max 8MB)" }, { status: 400 })
    }
    const mediaType = (file.type || "image/jpeg").toLowerCase()
    if (!mediaType.startsWith("image/")) {
      return NextResponse.json({ error: "Must be an image" }, { status: 400 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const base64 = buf.toString("base64")

    const cfg = await getAIConfig()
    // Prefer the per-task vision override when configured.
    const visionOverride = cfg.taskModels.vision
    let raw = ""
    try {
      if (cfg.provider === "anthropic") {
        if (!cfg.anthropicKey) throw new Error("Anthropic key not configured")
        const baseModel = visionOverride || cfg.model
        const model = baseModel && baseModel.toLowerCase().includes("claude") ? baseModel : "claude-sonnet-4-5"
        raw = await extractWithAnthropic(cfg.anthropicKey, model, base64, mediaType)
      } else if (cfg.provider === "openrouter") {
        if (!cfg.openrouterKey) throw new Error("OpenRouter key not configured")
        const model = visionOverride || cfg.model || "openai/gpt-4o-mini"
        raw = await extractWithOpenAICompat("https://openrouter.ai/api/v1/chat/completions", cfg.openrouterKey, model, base64, mediaType)
      } else {
        // Groq currently lacks broad vision support — try anyway with a vision-capable model
        if (!cfg.groqKey) throw new Error("Groq key not configured")
        const baseModel = visionOverride || cfg.model
        const model = baseModel && baseModel.toLowerCase().includes("vision") ? baseModel : "llama-3.2-11b-vision-preview"
        raw = await extractWithOpenAICompat("https://api.groq.com/openai/v1/chat/completions", cfg.groqKey, model, base64, mediaType)
      }
    } catch (e) {
      return NextResponse.json({ error: `Vision extraction failed: ${(e as Error).message}` }, { status: 502 })
    }

    const parsed = extractJson<CardFields>(raw, {})
    const fields: CardFields = {
      name: cleanField(parsed.name),
      title: cleanField(parsed.title),
      company: cleanField(parsed.company),
      email: cleanField(parsed.email)?.toLowerCase() ?? null,
      phone: cleanField(parsed.phone),
      website: cleanField(parsed.website),
      address: cleanField(parsed.address),
      social: cleanField(parsed.social),
    }
    if (fields.phone) fields.phone = normalizePhone(fields.phone)

    const wantCreate = req.nextUrl.searchParams.get("create") === "1"
    if (wantCreate) {
      if (!fields.name || !fields.email) {
        return NextResponse.json({ fields, error: "Cannot auto-create: name and email required" }, { status: 400 })
      }
      const existing = await prisma.contact.findUnique({
        where: { ownerId_email: { ownerId: session.user.id, email: fields.email } },
      })
      if (existing) {
        return NextResponse.json({ fields, contactId: existing.id, duplicate: true })
      }
      const created = await prisma.contact.create({
        data: {
          ownerId: session.user.id,
          name: fields.name,
          email: fields.email,
          phone: fields.phone ?? null,
          company: fields.company ?? null,
          title: fields.title ?? null,
          website: fields.website ?? null,
          socialUrl: fields.social ?? null,
          notes: fields.address ? `Address (from card): ${fields.address}` : null,
          source: "Business card scan",
        },
      })
      return NextResponse.json({ fields, contactId: created.id })
    }

    return NextResponse.json({ fields, raw: raw.slice(0, 500) })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
