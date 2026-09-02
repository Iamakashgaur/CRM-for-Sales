import { NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { safeError } from "@/lib/api-errors"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Admin only" }, { status: 403 })

    const [contacts, deals, activities, callLogs, aiInsights, users] = await Promise.all([
      prisma.contact.count(),
      prisma.deal.count(),
      prisma.activity.count(),
      prisma.callLog.count(),
      prisma.aIInsight.count(),
      prisma.user.count(),
    ])

    return NextResponse.json({ contacts, deals, activities, callLogs, aiInsights, users })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
