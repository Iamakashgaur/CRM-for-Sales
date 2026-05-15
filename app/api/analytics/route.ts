import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { getAnalytics } from "@/lib/analytics"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const { searchParams } = new URL(req.url)
    const requestedOwnerId = searchParams.get("ownerId") || undefined
    const isPrivileged = ["ADMIN", "MANAGER"].includes(session.user.role)
    const ownerId = isPrivileged ? requestedOwnerId : session.user.id

    const data = await getAnalytics(ownerId)
    return NextResponse.json(data)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
