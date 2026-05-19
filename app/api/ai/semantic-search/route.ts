import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { safeError } from "@/lib/api-errors"
import { rateLimit } from "@/lib/rate-limit"
import { cosine, embed, parseEmbedding } from "@/lib/embeddings"
import { parseTags } from "@/lib/utils"

export const dynamic = "force-dynamic"

interface SemanticResult {
  id: string
  name: string
  email: string
  company: string | null
  city: string | null
  state: string | null
  zone: string | null
  type: string | null
  category: string | null
  tags: string[]
  score: number
}

const MAX_RESULTS = 20

export async function GET(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!rateLimit(`ai-sem:${session.user.id}`, 60, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const q = req.nextUrl.searchParams.get("q")?.trim() ?? ""
    if (q.length < 2) return NextResponse.json({ results: [] })

    const isRep = session.user.role === "REP"
    const where: Record<string, unknown> = { embedding: { not: null } }
    if (isRep) where.ownerId = session.user.id

    // Pull all candidate vectors. Practical cap to keep memory bounded.
    const candidates = await prisma.contact.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        company: true,
        city: true,
        state: true,
        zone: true,
        type: true,
        category: true,
        tags: true,
        embedding: true,
      },
      take: 20000,
    })

    if (candidates.length === 0) {
      return NextResponse.json({ results: [], indexed: 0 })
    }

    const queryVec = await embed(q)

    interface Scored {
      c: typeof candidates[number]
      score: number
    }
    const scored: Scored[] = []
    for (const c of candidates) {
      const vec = parseEmbedding(c.embedding)
      if (!vec || vec.length !== queryVec.length) continue
      const s = cosine(queryVec, vec)
      scored.push({ c, score: s })
    }
    scored.sort((a, b) => b.score - a.score)

    const results: SemanticResult[] = scored.slice(0, MAX_RESULTS).map((row) => ({
      id: row.c.id,
      name: row.c.name,
      email: row.c.email,
      company: row.c.company,
      city: row.c.city,
      state: row.c.state,
      zone: row.c.zone,
      type: row.c.type,
      category: row.c.category,
      tags: parseTags(row.c.tags),
      score: Math.round(row.score * 1000) / 1000,
    }))

    return NextResponse.json({ results, indexed: candidates.length })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
