import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { exchangeGmailCode } from "@/lib/gmail"
import { getServerSession } from "@/lib/auth"
import { verifyState } from "@/lib/oauth-state"
import { safeError } from "@/lib/api-errors"
import { encrypt } from "@/lib/crypto"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const searchParams = req.nextUrl.searchParams
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    if (!code || !state) return NextResponse.json({ error: "Missing code or state" }, { status: 400 })

    const verified = verifyState(state)
    if (!verified) return NextResponse.json({ error: "Invalid or expired state" }, { status: 400 })

    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    if (session.user.id !== verified.userId) {
      return NextResponse.json({ error: "State user mismatch" }, { status: 403 })
    }

    const base = process.env.NEXTAUTH_URL ?? new URL(req.url).origin
    const redirectUri = `${base}/api/email-sync/gmail/callback`
    const tokens = await exchangeGmailCode(code, redirectUri)
    if (!tokens.accessToken) {
      return NextResponse.redirect(`${base}/settings?gmail=error`)
    }

    const userId = verified.userId
    const email = tokens.email ?? "unknown"

    await prisma.emailSync.upsert({
      where: { userId_provider: { userId, provider: "GMAIL" } },
      create: {
        userId,
        provider: "GMAIL",
        accessToken: encrypt(tokens.accessToken),
        refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
        email,
      },
      update: {
        accessToken: encrypt(tokens.accessToken),
        refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
        email,
      },
    })

    return NextResponse.redirect(`${base}/settings?gmail=connected`)
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
