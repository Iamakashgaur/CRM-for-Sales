import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { safeError } from "@/lib/api-errors"
import { getAIConfig, setAIConfig, defaultModelFor, callLLM, type AIProvider } from "@/lib/ai-provider"
import { MODEL_CATALOG, TASK_DESCRIPTORS, isTaskKey, type TaskKey } from "@/lib/ai-models"

export const dynamic = "force-dynamic"

function mask(key: string): string {
  if (!key) return ""
  if (key.length <= 8) return "•".repeat(key.length)
  return key.slice(0, 4) + "•".repeat(Math.min(20, key.length - 8)) + key.slice(-4)
}

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 })

    const cfg = await getAIConfig()
    return NextResponse.json({
      provider: cfg.provider,
      model: cfg.model,
      anthropicKey: mask(cfg.anthropicKey),
      openrouterKey: mask(cfg.openrouterKey),
      groqKey: mask(cfg.groqKey),
      anthropicConfigured: cfg.anthropicKey.length > 0,
      openrouterConfigured: cfg.openrouterKey.length > 0,
      groqConfigured: cfg.groqKey.length > 0,
      defaults: {
        anthropic: defaultModelFor("anthropic"),
        openrouter: defaultModelFor("openrouter"),
        groq: defaultModelFor("groq"),
      },
      taskModels: cfg.taskModels,
      catalog: MODEL_CATALOG,
      tasks: TASK_DESCRIPTORS,
    })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}

const TaskModelsSchema = z.record(z.string(), z.union([z.string(), z.null()])).optional()

const UpdateBody = z.object({
  provider: z.enum(["anthropic", "openrouter", "groq"]).optional(),
  model: z.string().optional(),
  anthropicKey: z.string().optional(),
  openrouterKey: z.string().optional(),
  groqKey: z.string().optional(),
  taskModels: TaskModelsSchema,
})

export async function PUT(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 })

    const parsed = UpdateBody.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    // Skip masked-value writes (UI may resubmit mask if key unchanged)
    const data = { ...parsed.data }
    for (const k of ["anthropicKey", "openrouterKey", "groqKey"] as const) {
      const v = data[k]
      if (v && /^[•]+$/.test(v)) delete data[k]
      if (v && v.includes("•")) delete data[k]
    }

    // Whitelist task keys so we never persist garbage settings.
    let taskModels: Partial<Record<TaskKey, string | null>> | undefined
    if (data.taskModels) {
      taskModels = {}
      for (const [k, v] of Object.entries(data.taskModels)) {
        if (!isTaskKey(k)) continue
        taskModels[k] = typeof v === "string" ? v : null
      }
    }

    await setAIConfig({
      provider: data.provider,
      model: data.model,
      anthropicKey: data.anthropicKey,
      openrouterKey: data.openrouterKey,
      groqKey: data.groqKey,
      taskModels,
    })

    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}

const TestBody = z.object({
  provider: z.enum(["anthropic", "openrouter", "groq"]).optional(),
  task: z.string().optional(),
})

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 })

    const body = await req.json().catch(() => ({}))
    const parsed = TestBody.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    // If provider passed, temporarily set it then test, then revert
    let revert: AIProvider | undefined
    if (parsed.data.provider) {
      const current = await getAIConfig()
      revert = current.provider
      await setAIConfig({ provider: parsed.data.provider })
    }

    const taskHint =
      parsed.data.task && isTaskKey(parsed.data.task) ? parsed.data.task : undefined

    const result = await callLLM({
      prompt: "Reply with exactly the JSON: {\"ok\":true}",
      maxTokens: 64,
      task: taskHint,
    })

    if (revert) await setAIConfig({ provider: revert })

    return NextResponse.json({
      ok: result.ok,
      provider: result.provider,
      model: result.model,
      reply: result.text.slice(0, 200),
      error: result.error,
    })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
