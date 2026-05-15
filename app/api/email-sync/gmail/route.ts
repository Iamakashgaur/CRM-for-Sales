import { NextRequest, NextResponse } from "next/server"
import { getServerSession } from "@/lib/auth"
import { getGmailAuthUrl } from "@/lib/gmail"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    const base = process.env.NEXTAUTH_URL ?? new URL(req.url).origin
    const redirectUri = `${base}/api/email-sync/gmail/callback`
    const url = getGmailAuthUrl(redirectUri, session.user.id)
    return NextResponse.redirect(url)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
