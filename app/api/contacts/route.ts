import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { parseTags, stringifyTags, normalizePhone } from "@/lib/utils"
import { safeError } from "@/lib/api-errors"
import { isPrivileged, ROLES } from "@/lib/constants"
import { rateLimit } from "@/lib/rate-limit"
import { invalidateMetaCache } from "@/lib/meta-cache"

export const dynamic = "force-dynamic"

const createSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  phone: z.string().regex(/^[+\d\s\-().]{6,20}$/, "Invalid phone").optional(),
  phoneSecondary: z.string().optional(),
  altPhone: z.string().optional(),
  company: z.string().optional(),
  title: z.string().optional(),
  source: z.string().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().optional(),
  linkedinUrl: z.string().optional(),
  socialUrl: z.string().optional(),
  website: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  pinCode: z.string().optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  zone: z.string().optional(),
  type: z.string().optional(),
  dnc: z.boolean().optional(),
  category: z.string().optional(),
  callStatus: z.string().optional(),
  followUpStatus: z.string().optional(),
  lastContactDate: z.string().optional(),
  nextFollowUpDate: z.string().optional(),
  nextFollowUpTime: z.string().optional(),
  ownerId: z.string().optional(),
})

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!rateLimit(`list:${session.user.id}`, 120, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const searchParams = req.nextUrl.searchParams
    const page = Math.max(1, parseInt(searchParams.get("page") ?? "1", 10) || 1)
    const limit = Math.min(200, Math.max(1, parseInt(searchParams.get("limit") ?? "50", 10) || 50))
    const q = searchParams.get("q")?.trim() || ""
    const ownerId = searchParams.get("ownerId") || undefined
    const company = searchParams.get("company") || undefined
    const tag = searchParams.get("tag") || undefined
    const source = searchParams.get("source") || undefined
    const category = searchParams.get("category") || undefined
    const followUpStatus = searchParams.get("followUpStatus") || undefined
    const callStatus = searchParams.get("callStatus") || undefined
    const zone = searchParams.get("zone") || undefined
    const type = searchParams.get("type") || undefined
    const city = searchParams.get("city") || undefined
    const stateF = searchParams.get("state") || undefined
    const dnc = searchParams.get("dnc")

    const where: Record<string, unknown> = {}
    // REP: scope to own contacts only. ADMIN/MANAGER see all.
    if (session.user.role === ROLES.REP) {
      where.ownerId = session.user.id
    } else if (ownerId) {
      where.ownerId = ownerId
    }
    if (company) where.company = { contains: company }
    if (source) where.source = source
    if (category) where.category = category
    if (followUpStatus) where.followUpStatus = followUpStatus
    if (callStatus) where.callStatus = callStatus
    if (zone) where.zone = zone
    if (type) where.type = type
    if (city) where.city = city
    if (stateF) where.state = stateF
    if (dnc === "1") where.dnc = true
    if (dnc === "0") where.dnc = false
    if (q) {
      where.OR = [
        { name: { contains: q } },
        { email: { contains: q } },
        { company: { contains: q } },
      ]
    }
    if (tag) where.tags = { contains: `"${tag}"` }

    const [total, rows] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.findMany({
        where,
        orderBy: { updatedAt: "desc" },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ])
    const contacts = rows.map((c) => ({ ...c, tags: parseTags(c.tags) }))
    return NextResponse.json({
      contacts,
      total,
      page,
      pages: Math.max(1, Math.ceil(total / limit)),
      limit,
    })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const body = await req.json()
    const parsed = createSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const data = parsed.data
    const canAssign = isPrivileged(session.user.role)
    const ownerId = canAssign ? (data.ownerId ?? session.user.id) : session.user.id
    const autoRouteRequested = canAssign && !data.ownerId
    const created = await prisma.contact.create({
      data: {
        name: data.name,
        email: data.email.trim().toLowerCase(),
        phone: data.phone ? normalizePhone(data.phone) : null,
        phoneSecondary: data.phoneSecondary ? normalizePhone(data.phoneSecondary) : null,
        altPhone: data.altPhone ? normalizePhone(data.altPhone) : null,
        company: data.company ?? null,
        title: data.title ?? null,
        source: data.source ?? null,
        tags: stringifyTags(data.tags ?? []),
        notes: data.notes ?? null,
        linkedinUrl: data.linkedinUrl ?? null,
        socialUrl: data.socialUrl ?? null,
        website: data.website ?? null,
        city: data.city ?? null,
        state: data.state ?? null,
        pinCode: data.pinCode ?? null,
        addressLine1: data.addressLine1 ?? null,
        addressLine2: data.addressLine2 ?? null,
        zone: data.zone ?? null,
        type: data.type ?? null,
        dnc: data.dnc ?? false,
        category: data.category ?? null,
        callStatus: data.callStatus ?? null,
        followUpStatus: data.followUpStatus ?? null,
        lastContactDate: data.lastContactDate ? new Date(data.lastContactDate) : null,
        nextFollowUpDate: data.nextFollowUpDate ? new Date(data.nextFollowUpDate) : null,
        nextFollowUpTime: data.nextFollowUpTime ?? null,
        ownerId,
      },
    })
    invalidateMetaCache()

    // Fire-and-forget AI lead routing for admin-created contacts without explicit owner
    if (autoRouteRequested) {
      autoRouteContact(created.id, session.user.id).catch((err) => {
        console.warn("auto-route failed:", err)
      })
    }

    return NextResponse.json({ ...created, tags: parseTags(created.tags) }, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}

async function autoRouteContact(contactId: string, _adminUserId: string): Promise<void> {
  // Lazy-import to avoid pulling AI deps when not needed
  const { callLLM } = await import("@/lib/ai-provider")
  const { extractJson } = await import("@/lib/ai")
  const { getClosedStageIds } = await import("@/lib/stage-helpers")

  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, name: true, company: true, zone: true, type: true, city: true, ownerId: true, category: true },
  })
  if (!contact) return

  const closed = await getClosedStageIds()
  const closedIds = [closed.wonId, closed.lostId].filter((s): s is string => !!s)
  const reps = await prisma.user.findMany({ where: { role: "REP" }, select: { id: true, name: true } })
  if (reps.length === 0) return
  const repIds = reps.map((r) => r.id)

  const [openDealAgg, contactZones] = await Promise.all([
    prisma.deal.groupBy({
      by: ["ownerId"],
      where: { ownerId: { in: repIds }, stageId: { notIn: closedIds } },
      _count: { _all: true },
    }),
    prisma.contact.findMany({
      where: { ownerId: { in: repIds }, zone: { not: null } },
      select: { ownerId: true, zone: true },
      take: 5000,
    }),
  ])
  const openMap = new Map(openDealAgg.map((g) => [g.ownerId, g._count._all]))
  const zonesByRep = new Map<string, Set<string>>()
  for (const c of contactZones) {
    if (!c.zone) continue
    if (!zonesByRep.has(c.ownerId)) zonesByRep.set(c.ownerId, new Set())
    zonesByRep.get(c.ownerId)!.add(c.zone)
  }

  const repsSummary = reps
    .map(
      (r) =>
        `ID: ${r.id} | ${r.name} | Zones: ${[...(zonesByRep.get(r.id) ?? new Set<string>())].join(", ") || "—"} | Open deals: ${openMap.get(r.id) ?? 0}`
    )
    .join("\n")

  const prompt = `Route this new B2B lead to the best rep. Return ONLY JSON {"recommendedOwnerId":"<id>"}.

LEAD: ${contact.name}${contact.company ? ` at ${contact.company}` : ""} | Zone: ${contact.zone ?? "—"} | City: ${contact.city ?? "—"} | Type: ${contact.type ?? "—"}

REPS:
${repsSummary}`

  const res = await callLLM({ prompt, maxTokens: 100 })
  if (!res.ok) return
  const parsed = extractJson<{ recommendedOwnerId?: string }>(res.text, {})
  const recId = parsed.recommendedOwnerId
  if (recId && repIds.includes(recId) && recId !== contact.ownerId) {
    await prisma.contact.update({ where: { id: contact.id }, data: { ownerId: recId } })
    invalidateMetaCache()
  }
}
