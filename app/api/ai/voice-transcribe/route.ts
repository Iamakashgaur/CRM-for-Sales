import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { getAIConfig } from "@/lib/ai-provider"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"

export const dynamic = "force-dynamic"

const MAX_AUDIO_BYTES = 25 * 1024 * 1024 // 25 MB

interface GroqTranscriptionResponse {
  text?: string
  error?: { message?: string }
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!rateLimit(`ai-voice:${session.user.id}`, 10, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const cfg = await getAIConfig()
    if (!cfg.groqKey) {
      return NextResponse.json(
        { error: "Voice transcription requires a Groq API key. Configure one in Settings > AI." },
        { status: 503 }
      )
    }

    const form = await req.formData()
    const audio = form.get("audio")
    if (!(audio instanceof Blob)) {
      return NextResponse.json({ error: "Missing audio file" }, { status: 400 })
    }
    if (audio.size === 0) {
      return NextResponse.json({ error: "Empty audio file" }, { status: 400 })
    }
    if (audio.size > MAX_AUDIO_BYTES) {
      return NextResponse.json({ error: "Audio too large (max 25MB)" }, { status: 413 })
    }

    const filename = (audio as File).name || "audio.webm"
    const upstreamForm = new FormData()
    upstreamForm.append("file", audio, filename)
    upstreamForm.append("model", "whisper-large-v3")
    upstreamForm.append("response_format", "json")
    const language = form.get("language")
    if (typeof language === "string" && language.length >= 2 && language.length <= 5) {
      upstreamForm.append("language", language)
    }

    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 60_000)
    try {
      const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${cfg.groqKey}` },
        body: upstreamForm,
        signal: ctrl.signal,
      })
      const data = (await res.json()) as GroqTranscriptionResponse
      if (!res.ok) {
        return NextResponse.json(
          { error: data.error?.message ?? "Transcription failed" },
          { status: 502 }
        )
      }
      return NextResponse.json({ text: (data.text ?? "").trim() })
    } finally {
      clearTimeout(timer)
    }
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
