import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { callLLM } from "@/lib/ai-provider"
import { extractJson } from "@/lib/ai"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"

export const dynamic = "force-dynamic"

const schema = z.object({
  company: z.string().nullable().optional(),
  notes: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  zone: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
})

interface TagResult { tags: string[] }

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!rateLimit(`ai:${session.user.id}`, 20, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const body = await req.json()
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const ctx = [
      parsed.data.company && `Company: ${parsed.data.company}`,
      parsed.data.type && `Type: ${parsed.data.type}`,
      parsed.data.zone && `Zone: ${parsed.data.zone}`,
      parsed.data.city && `City: ${parsed.data.city}`,
      parsed.data.notes && `Notes: ${parsed.data.notes.slice(0, 400)}`,
    ].filter(Boolean).join("\n")

    if (!ctx) return NextResponse.json({ tags: [] })

    const prompt = `Suggest up to 5 short business CRM tags (1-2 words each, lowercase, no #) for this contact. Reply ONLY with JSON.

${ctx}

Output JSON: {"tags":["tag1","tag2",...]}`

    const llm = await callLLM({ prompt, maxTokens: 200, task: "classify" })
    if (!llm.ok) return NextResponse.json({ tags: [] })
    const out = extractJson<TagResult>(llm.text, { tags: [] })
    const tags = Array.isArray(out.tags)
      ? out.tags.filter((t) => typeof t === "string" && t.length > 0 && t.length < 30).slice(0, 5).map((t) => t.toLowerCase().trim())
      : []
    return NextResponse.json({ tags })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
