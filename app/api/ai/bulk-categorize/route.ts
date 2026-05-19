import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { callLLM } from "@/lib/ai-provider"
import { extractJson } from "@/lib/ai"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"
import { isPrivileged } from "@/lib/constants"
import { invalidateMetaCache } from "@/lib/meta-cache"

export const dynamic = "force-dynamic"

const VALID_CATEGORIES = ["Hot Lead", "Warm Lead", "Cold Lead", "Existing Client", "Prospect", "Not Relevant"]

const schema = z.object({ batchSize: z.number().int().min(1).max(100).optional() })

interface Assignment { id: string; category: string }

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isPrivileged(session.user.role)) {
      return NextResponse.json({ error: "Admin/Manager only" }, { status: 403 })
    }
    if (!rateLimit(`ai:bulk:${session.user.id}`, 10, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const body = await req.json().catch(() => ({}))
    const parsed = schema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    const batchSize = parsed.data.batchSize ?? 50

    const contacts = await prisma.contact.findMany({
      where: { category: null },
      take: batchSize,
      select: { id: true, name: true, company: true, type: true, zone: true, source: true, city: true, state: true },
    })

    if (contacts.length === 0) {
      const remainingCount = await prisma.contact.count({ where: { category: null } })
      return NextResponse.json({ processed: 0, updated: 0, remaining: remainingCount })
    }

    const list = contacts.map((c, i) =>
      `${i + 1}. id=${c.id} | name=${c.name} | company=${c.company ?? "—"} | type=${c.type ?? "—"} | zone=${c.zone ?? "—"} | city=${c.city ?? "—"} | source=${c.source ?? "—"}`
    ).join("\n")

    const prompt = `You are a B2B sales lead classifier. For each contact, assign exactly one category from: ${VALID_CATEGORIES.join(", ")}.

Heuristics:
- "Hot Lead": clear buying intent / inbound / referrals
- "Warm Lead": engaged but not urgent
- "Cold Lead": no prior engagement
- "Existing Client": already a customer (look for source hints)
- "Prospect": potential but needs nurturing
- "Not Relevant": clearly not fit (wrong industry, too small, blocked)

If unsure default to "Cold Lead".

Contacts:
${list}

Reply ONLY with JSON array, one item per contact:
[{"id":"<contact id>","category":"<one of the categories>"}, ...]`

    const result = await callLLM({ prompt, maxTokens: 2048, task: "classify" })
    if (!result.ok) {
      return NextResponse.json({ processed: contacts.length, updated: 0, remaining: await prisma.contact.count({ where: { category: null } }), error: result.error })
    }

    const assignments = extractJson<Assignment[]>(result.text, [])
    let updated = 0
    if (Array.isArray(assignments) && assignments.length > 0) {
      const validIds = new Set(contacts.map((c) => c.id))
      const ops = assignments
        .filter((a) => a && validIds.has(a.id) && VALID_CATEGORIES.includes(a.category))
        .map((a) => prisma.contact.update({ where: { id: a.id }, data: { category: a.category } }))
      const settled = await Promise.allSettled(ops)
      updated = settled.filter((s) => s.status === "fulfilled").length
    }

    if (updated > 0) invalidateMetaCache()
    const remaining = await prisma.contact.count({ where: { category: null } })

    await prisma.aIInsight.create({
      data: {
        type: "BULK_CATEGORIZE",
        payload: JSON.stringify({ processed: contacts.length, updated, remaining, at: new Date().toISOString() }),
        userId: session.user.id,
      },
    })

    return NextResponse.json({ processed: contacts.length, updated, remaining })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isPrivileged(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    const uncategorized = await prisma.contact.count({ where: { category: null } })
    return NextResponse.json({ uncategorized })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
