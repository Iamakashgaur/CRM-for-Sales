import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { safeError } from "@/lib/api-errors"
import { isPrivileged } from "@/lib/constants"
import { rateLimit } from "@/lib/rate-limit"
import { contactEmbedText, embedBatch } from "@/lib/embeddings"
import { parseTags as parseTagsJson } from "@/lib/utils"

export const dynamic = "force-dynamic"

const BATCH = 50

interface BackfillResponse {
  processed: number
  remaining: number
  total: number
  indexed: number
}

export async function GET(): Promise<NextResponse> {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isPrivileged(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    const [total, indexed] = await Promise.all([
      prisma.contact.count(),
      prisma.contact.count({ where: { embedding: { not: null } } }),
    ])
    return NextResponse.json({ total, indexed, remaining: total - indexed })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}

export async function POST(_req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isPrivileged(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    if (!rateLimit(`ai-embed:${session.user.id}`, 5, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const candidates = await prisma.contact.findMany({
      where: { embedding: null },
      select: {
        id: true,
        name: true,
        company: true,
        title: true,
        city: true,
        state: true,
        zone: true,
        type: true,
        source: true,
        category: true,
        tags: true,
        notes: true,
      },
      take: BATCH,
      orderBy: { updatedAt: "desc" },
    })

    if (candidates.length === 0) {
      const total = await prisma.contact.count()
      const indexed = await prisma.contact.count({ where: { embedding: { not: null } } })
      const res: BackfillResponse = { processed: 0, remaining: total - indexed, total, indexed }
      return NextResponse.json(res)
    }

    const texts = candidates.map((c) =>
      contactEmbedText({
        name: c.name,
        company: c.company,
        title: c.title,
        city: c.city,
        state: c.state,
        zone: c.zone,
        type: c.type,
        source: c.source,
        category: c.category,
        tags: parseTagsJson(c.tags),
        notes: c.notes,
      })
    )

    const vectors = await embedBatch(texts)
    const now = new Date()

    await prisma.$transaction(
      candidates.map((c, idx) =>
        prisma.contact.update({
          where: { id: c.id },
          data: { embedding: JSON.stringify(vectors[idx] ?? []), embeddingAt: now },
        })
      )
    )

    const [total, indexed] = await Promise.all([
      prisma.contact.count(),
      prisma.contact.count({ where: { embedding: { not: null } } }),
    ])
    const res: BackfillResponse = {
      processed: candidates.length,
      remaining: total - indexed,
      total,
      indexed,
    }
    return NextResponse.json(res)
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
