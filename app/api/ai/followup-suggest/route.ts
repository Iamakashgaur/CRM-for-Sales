import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"

export const dynamic = "force-dynamic"

const schema = z.object({
  contactId: z.string().min(1),
  status: z.string().min(1),
})

const RULES: Record<string, number> = {
  "Interested": 2,
  "Follow Up": 3,
  "No Response": 7,
  "Called": 5,
  "Overdue": 1,
  "Completed": 14,
}

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

    const days = RULES[parsed.data.status] ?? 3
    const d = new Date()
    d.setDate(d.getDate() + days)
    const suggestedDate = d.toISOString().slice(0, 10)
    const reasoning = `Based on status "${parsed.data.status}", suggesting follow-up in ${days} ${days === 1 ? "day" : "days"}.`
    return NextResponse.json({ suggestedDate, reasoning, days })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
