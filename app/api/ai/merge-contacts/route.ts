import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { safeError } from "@/lib/api-errors"
import { isPrivileged } from "@/lib/constants"
import { rateLimit } from "@/lib/rate-limit"
import { parseTags, stringifyTags } from "@/lib/utils"

export const dynamic = "force-dynamic"

const Body = z.object({
  keepId: z.string().min(1),
  mergeIds: z.array(z.string().min(1)).min(1).max(20),
})

export async function POST(req: NextRequest): Promise<NextResponse> {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (!isPrivileged(session.user.role)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })

    if (!rateLimit(`ai-merge:${session.user.id}`, 20, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const parsed = Body.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
    const { keepId, mergeIds } = parsed.data

    if (mergeIds.includes(keepId)) {
      return NextResponse.json({ error: "keepId cannot also be in mergeIds" }, { status: 400 })
    }

    const keep = await prisma.contact.findUnique({ where: { id: keepId } })
    if (!keep) return NextResponse.json({ error: "Canonical contact not found" }, { status: 404 })

    const merging = await prisma.contact.findMany({ where: { id: { in: mergeIds } } })
    if (merging.length === 0) {
      return NextResponse.json({ error: "No mergeable contacts found" }, { status: 404 })
    }

    // Compute merged-tag & note fields. Keep keep's non-null values; fill nulls from merging records.
    const tagSet = new Set<string>(parseTags(keep.tags))
    const noteFragments: string[] = []
    if (keep.notes) noteFragments.push(keep.notes)
    const fillable: Record<string, unknown> = {}
    const FILLABLE_FIELDS = [
      "phone",
      "phoneSecondary",
      "altPhone",
      "company",
      "title",
      "source",
      "linkedinUrl",
      "socialUrl",
      "website",
      "addressLine1",
      "addressLine2",
      "city",
      "state",
      "pinCode",
      "zone",
      "type",
      "category",
      "callStatus",
      "followUpStatus",
    ] as const

    for (const m of merging) {
      for (const t of parseTags(m.tags)) tagSet.add(t)
      if (m.notes && m.notes.trim() && m.notes !== keep.notes) {
        noteFragments.push(`--- merged from ${m.name} (${m.email}) ---\n${m.notes}`)
      }
      for (const f of FILLABLE_FIELDS) {
        const keepVal = (keep as unknown as Record<string, unknown>)[f]
        if (keepVal == null || keepVal === "") {
          const mVal = (m as unknown as Record<string, unknown>)[f]
          if (mVal != null && mVal !== "" && fillable[f] == null) {
            fillable[f] = mVal
          }
        }
      }
      // lastContactDate: take latest non-null
      if (m.lastContactDate) {
        const prev = (fillable.lastContactDate as Date | undefined) ?? keep.lastContactDate ?? null
        if (!prev || m.lastContactDate > prev) fillable.lastContactDate = m.lastContactDate
      }
    }

    const mergedTags = stringifyTags(Array.from(tagSet))
    const mergedNotes = noteFragments.join("\n\n").slice(0, 20000)

    let merged = 0
    await prisma.$transaction(async (tx) => {
      // Re-parent owned rows. Activities/CallLogs/AIInsights have nullable links to contact;
      // EmailSyncMessage.contactId is also nullable.
      for (const m of merging) {
        await tx.deal.updateMany({ where: { contactId: m.id }, data: { contactId: keepId } })
        await tx.callLog.updateMany({ where: { contactId: m.id }, data: { contactId: keepId } })
        await tx.activity.updateMany({ where: { contactId: m.id }, data: { contactId: keepId } })
        await tx.aIInsight.updateMany({ where: { contactId: m.id }, data: { contactId: keepId } })
        await tx.emailSyncMessage.updateMany({ where: { contactId: m.id }, data: { contactId: keepId } })
      }
      await tx.contact.update({
        where: { id: keepId },
        data: {
          ...fillable,
          tags: mergedTags,
          notes: mergedNotes || null,
        },
      })
      const result = await tx.contact.deleteMany({ where: { id: { in: merging.map((m) => m.id) } } })
      merged = result.count
    })

    // Invalidate any cached duplicate groups so the UI refreshes after merge.
    await prisma.aIInsight.deleteMany({ where: { type: "DUPLICATE_GROUPS" } })

    return NextResponse.json({ merged })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
