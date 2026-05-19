import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { safeError } from "@/lib/api-errors"
import { isPrivileged } from "@/lib/constants"
import { rateLimit } from "@/lib/rate-limit"
import { normalizePhone } from "@/lib/utils"
import { cosine, parseEmbedding } from "@/lib/embeddings"

export const dynamic = "force-dynamic"

export interface DuplicateCandidate {
  id: string
  name: string
  email: string
  phone: string | null
  company: string | null
  city: string | null
  ownerId: string
  ownerName: string | null
  updatedAt: string
  score: number
  reason: "phone" | "email" | "semantic"
}

export interface DuplicateGroup {
  canonicalId: string
  canonical: DuplicateCandidate
  candidates: DuplicateCandidate[]
  reason: "phone" | "email" | "semantic"
}

const SEMANTIC_THRESHOLD = 0.92
const MAX_GROUPS = 100
const MAX_SEMANTIC_CONTACTS = 8000
const CACHE_TTL_MS = 60 * 60 * 1000 // 1h
const CACHE_KEY = "DUPLICATE_GROUPS"

interface RawContact {
  id: string
  name: string
  email: string
  phone: string | null
  phoneSecondary: string | null
  company: string | null
  city: string | null
  ownerId: string
  updatedAt: Date
  embedding: string | null
  owner: { name: string | null } | null
}

function toCandidate(c: RawContact, score: number, reason: DuplicateCandidate["reason"]): DuplicateCandidate {
  return {
    id: c.id,
    name: c.name,
    email: c.email,
    phone: c.phone,
    company: c.company,
    city: c.city,
    ownerId: c.ownerId,
    ownerName: c.owner?.name ?? null,
    updatedAt: c.updatedAt.toISOString(),
    score,
    reason,
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isPrivileged(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    if (!rateLimit(`ai-dups:${session.user.id}`, 5, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    // Try cache
    const cached = await prisma.aIInsight.findFirst({
      where: {
        type: CACHE_KEY,
        userId: session.user.id,
        createdAt: { gte: new Date(Date.now() - CACHE_TTL_MS) },
      },
      orderBy: { createdAt: "desc" },
    })
    if (cached) {
      try {
        const data = JSON.parse(cached.payload) as { groups: DuplicateGroup[]; generatedAt: string }
        return NextResponse.json({ ...data, cached: true })
      } catch {
        // fall through
      }
    }

    const contacts = (await prisma.contact.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        phone: true,
        phoneSecondary: true,
        company: true,
        city: true,
        ownerId: true,
        updatedAt: true,
        embedding: true,
        owner: { select: { name: true } },
      },
      orderBy: { updatedAt: "desc" },
    })) as RawContact[]

    const groups: DuplicateGroup[] = []
    const visited = new Set<string>()

    // 1) Phone-based exact groups
    const phoneIndex = new Map<string, RawContact[]>()
    for (const c of contacts) {
      const phones = [c.phone, c.phoneSecondary].filter((p): p is string => !!p && p.trim().length > 0)
      const norms = new Set<string>()
      for (const p of phones) {
        const n = normalizePhone(p)
        if (n && n.length >= 8) norms.add(n)
      }
      for (const n of norms) {
        const list = phoneIndex.get(n) ?? []
        list.push(c)
        phoneIndex.set(n, list)
      }
    }
    for (const [, list] of phoneIndex) {
      if (list.length < 2) continue
      const sorted = [...list].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
      const canonical = sorted[0]
      if (visited.has(canonical.id)) continue
      const rest = sorted.slice(1).filter((c) => !visited.has(c.id))
      if (rest.length === 0) continue
      visited.add(canonical.id)
      for (const r of rest) visited.add(r.id)
      groups.push({
        canonicalId: canonical.id,
        canonical: toCandidate(canonical, 1, "phone"),
        candidates: rest.map((r) => toCandidate(r, 1, "phone")),
        reason: "phone",
      })
      if (groups.length >= MAX_GROUPS) break
    }

    // 2) Email-based exact (excluding placeholder domain)
    if (groups.length < MAX_GROUPS) {
      const emailIndex = new Map<string, RawContact[]>()
      for (const c of contacts) {
        const email = c.email.toLowerCase().trim()
        if (!email || email.endsWith("@noemail.local")) continue
        const list = emailIndex.get(email) ?? []
        list.push(c)
        emailIndex.set(email, list)
      }
      for (const [, list] of emailIndex) {
        if (list.length < 2) continue
        const sorted = [...list].sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
        const canonical = sorted[0]
        if (visited.has(canonical.id)) continue
        const rest = sorted.slice(1).filter((c) => !visited.has(c.id))
        if (rest.length === 0) continue
        visited.add(canonical.id)
        for (const r of rest) visited.add(r.id)
        groups.push({
          canonicalId: canonical.id,
          canonical: toCandidate(canonical, 1, "email"),
          candidates: rest.map((r) => toCandidate(r, 1, "email")),
          reason: "email",
        })
        if (groups.length >= MAX_GROUPS) break
      }
    }

    // 3) Semantic similarity (only on contacts not already grouped)
    if (groups.length < MAX_GROUPS) {
      const pool = contacts
        .filter((c) => !visited.has(c.id) && c.embedding)
        .slice(0, MAX_SEMANTIC_CONTACTS)
      interface VC { c: RawContact; vec: number[] }
      const vectors: VC[] = []
      for (const c of pool) {
        const v = parseEmbedding(c.embedding)
        if (v) vectors.push({ c, vec: v })
      }
      // O(n^2) is too big for 8k. Bucket by lowercased first 4 chars of company OR name to reduce candidates.
      const buckets = new Map<string, VC[]>()
      for (const vc of vectors) {
        const key = (vc.c.company ?? vc.c.name).toLowerCase().replace(/\W+/g, "").slice(0, 4) || "_"
        const list = buckets.get(key) ?? []
        list.push(vc)
        buckets.set(key, list)
      }
      for (const list of buckets.values()) {
        if (groups.length >= MAX_GROUPS) break
        if (list.length < 2) continue
        for (let i = 0; i < list.length; i++) {
          if (groups.length >= MAX_GROUPS) break
          const a = list[i]
          if (visited.has(a.c.id)) continue
          const matches: Array<{ c: RawContact; score: number }> = []
          for (let j = i + 1; j < list.length; j++) {
            const b = list[j]
            if (visited.has(b.c.id)) continue
            if (a.vec.length !== b.vec.length) continue
            const s = cosine(a.vec, b.vec)
            if (s >= SEMANTIC_THRESHOLD) matches.push({ c: b.c, score: s })
          }
          if (matches.length === 0) continue
          visited.add(a.c.id)
          for (const m of matches) visited.add(m.c.id)
          groups.push({
            canonicalId: a.c.id,
            canonical: toCandidate(a.c, 1, "semantic"),
            candidates: matches.map((m) => toCandidate(m.c, Math.round(m.score * 1000) / 1000, "semantic")),
            reason: "semantic",
          })
        }
      }
    }

    const generatedAt = new Date().toISOString()
    const responseData = { groups, generatedAt }

    await prisma.aIInsight.create({
      data: {
        type: CACHE_KEY,
        payload: JSON.stringify(responseData),
        userId: session.user.id,
      },
    })

    return NextResponse.json({ ...responseData, cached: false })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
