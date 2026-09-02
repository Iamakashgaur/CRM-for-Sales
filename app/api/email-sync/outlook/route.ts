import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { getOutlookAuthUrl } from "@/lib/outlook"
import { signState } from "@/lib/oauth-state"
import { safeError } from "@/lib/api-errors"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const base = process.env.NEXTAUTH_URL ?? new URL(req.url).origin
    const redirectUri = `${base}/api/email-sync/outlook/callback`
    const state = signState(session.user.id)
    const url = getOutlookAuthUrl(redirectUri, state)
    return NextResponse.redirect(url)
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
