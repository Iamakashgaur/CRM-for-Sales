import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { parseTags, stringifyTags, normalizePhone } from "@/lib/utils"
import { safeError } from "@/lib/api-errors"
import { isPrivileged } from "@/lib/constants"
import { invalidateMetaCache } from "@/lib/meta-cache"

export const dynamic = "force-dynamic"

const updateSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  phone: z.string().nullable().optional(),
  phoneSecondary: z.string().nullable().optional(),
  altPhone: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  title: z.string().nullable().optional(),
  source: z.string().nullable().optional(),
  tags: z.array(z.string()).optional(),
  notes: z.string().nullable().optional(),
  linkedinUrl: z.string().nullable().optional(),
  socialUrl: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
  addressLine1: z.string().nullable().optional(),
  addressLine2: z.string().nullable().optional(),
  city: z.string().nullable().optional(),
  state: z.string().nullable().optional(),
  pinCode: z.string().nullable().optional(),
  zone: z.string().nullable().optional(),
  type: z.string().nullable().optional(),
  ownerId: z.string().optional(),
  dnc: z.boolean().optional(),
  category: z.string().nullable().optional(),
  callStatus: z.string().nullable().optional(),
  followUpStatus: z.string().nullable().optional(),
  lastContactDate: z.string().nullable().optional(),
  nextFollowUpDate: z.string().nullable().optional(),
  nextFollowUpTime: z.string().nullable().optional(),
})

export async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const contact = await prisma.contact.findUnique({
      where: { id: params.id },
      include: {
        owner: { select: { id: true, name: true, email: true, avatar: true } },
        deals: { include: { owner: { select: { id: true, name: true } } } },
        activities: { orderBy: { createdAt: "desc" }, take: 50 },
        callLogs: { orderBy: { at: "desc" }, take: 50, include: { user: { select: { id: true, name: true } } } },
        emailMsgs: {
          orderBy: { receivedAt: "desc" },
          take: 5,
          select: { id: true, subject: true, from: true, to: true, body: true, receivedAt: true },
        },
        whatsappMessages: {
          orderBy: { receivedAt: "desc" },
          take: 20,
          select: { id: true, direction: true, fromNumber: true, toNumber: true, body: true, status: true, receivedAt: true },
        },
      },
    })
    if (!contact) return NextResponse.json({ error: "Not found" }, { status: 404 })
    // REP: only own contacts visible
    if (session.user.role === "REP" && contact.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }
    return NextResponse.json({
      ...contact,
      tags: parseTags(contact.tags),
      deals: contact.deals.map((d) => ({ ...d, tags: parseTags(d.tags) })),
    })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const existing = await prisma.contact.findUnique({ where: { id: params.id } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    const body = await req.json()
    const parsed = updateSchema.safeParse(body)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    // REP scope: cannot modify foreign contacts
    if (session.user.role === "REP" && existing.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    const data = parsed.data
    const canAssign = isPrivileged(session.user.role)
    const warnings: string[] = []
    const updateData: Record<string, unknown> = {}
    if (data.name !== undefined) updateData.name = data.name
    if (data.email !== undefined) updateData.email = data.email.trim().toLowerCase()
    if (data.phone !== undefined) updateData.phone = data.phone ? normalizePhone(data.phone) : null
    if (data.phoneSecondary !== undefined) updateData.phoneSecondary = data.phoneSecondary ? normalizePhone(data.phoneSecondary) : null
    if (data.altPhone !== undefined) updateData.altPhone = data.altPhone ? normalizePhone(data.altPhone) : null
    if (data.company !== undefined) updateData.company = data.company
    if (data.addressLine1 !== undefined) updateData.addressLine1 = data.addressLine1
    if (data.addressLine2 !== undefined) updateData.addressLine2 = data.addressLine2
    if (data.city !== undefined) updateData.city = data.city
    if (data.state !== undefined) updateData.state = data.state
    if (data.pinCode !== undefined) updateData.pinCode = data.pinCode
    if (data.zone !== undefined) updateData.zone = data.zone
    if (data.type !== undefined) updateData.type = data.type
    if (data.socialUrl !== undefined) updateData.socialUrl = data.socialUrl
    if (data.title !== undefined) updateData.title = data.title
    if (data.source !== undefined) updateData.source = data.source
    if (data.tags !== undefined) updateData.tags = stringifyTags(data.tags)
    if (data.notes !== undefined) updateData.notes = data.notes
    if (data.linkedinUrl !== undefined) updateData.linkedinUrl = data.linkedinUrl
    if (data.website !== undefined) updateData.website = data.website
    if (data.dnc !== undefined) updateData.dnc = data.dnc
    if (data.category !== undefined) updateData.category = data.category
    if (data.callStatus !== undefined) updateData.callStatus = data.callStatus
    if (data.followUpStatus !== undefined) updateData.followUpStatus = data.followUpStatus
    if (data.lastContactDate !== undefined) updateData.lastContactDate = data.lastContactDate ? new Date(data.lastContactDate) : null
    if (data.nextFollowUpDate !== undefined) updateData.nextFollowUpDate = data.nextFollowUpDate ? new Date(data.nextFollowUpDate) : null
    if (data.nextFollowUpTime !== undefined) updateData.nextFollowUpTime = data.nextFollowUpTime
    // REPs cannot reassign ownership — return 403 if attempted
    if (data.ownerId !== undefined) {
      if (canAssign) {
        updateData.ownerId = data.ownerId
      } else if (data.ownerId !== existing.ownerId) {
        return NextResponse.json({ error: "Only admins can reassign contacts" }, { status: 403 })
      }
    }

    try {
      const updated = await prisma.contact.update({ where: { id: params.id }, data: updateData })
      invalidateMetaCache()
      return NextResponse.json({ ...updated, tags: parseTags(updated.tags), warnings })
    } catch (err) {
      if ((err as { code?: string }).code === "P2002") {
        return NextResponse.json({ error: "Email already in use" }, { status: 409 })
      }
      throw err
    }
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const existing = await prisma.contact.findUnique({ where: { id: params.id } })
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 })

    if (!isPrivileged(session.user.role) && existing.ownerId !== session.user.id) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 })
    }

    await prisma.contact.delete({ where: { id: params.id } })
    invalidateMetaCache()
    return NextResponse.json({ ok: true })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
