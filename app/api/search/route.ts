import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { parseTags } from "@/lib/utils"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const q = searchParams.get("q")?.trim() || ""
    if (!q) return NextResponse.json({ contacts: [], deals: [] })

    const isRep = session.user.role === "REP"
    const repScope = isRep ? { ownerId: session.user.id } : {}

    const [contactRows, dealRows] = await Promise.all([
      prisma.contact.findMany({
        where: {
          ...repScope,
          OR: [
            { name: { contains: q } },
            { email: { contains: q } },
            { company: { contains: q } },
          ],
        },
        take: 10,
        orderBy: { updatedAt: "desc" },
      }),
      prisma.deal.findMany({
        where: { ...repScope, title: { contains: q } },
        take: 10,
        orderBy: { updatedAt: "desc" },
        include: {
          contact: { select: { id: true, name: true, company: true } },
        },
      }),
    ])

    const contacts = contactRows.map((c) => ({ ...c, tags: parseTags(c.tags) }))
    const deals = dealRows.map((d) => ({ ...d, tags: parseTags(d.tags) }))

    return NextResponse.json({ contacts, deals })
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
