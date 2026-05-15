import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { exchangeGmailCode } from "@/lib/gmail"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    if (!code || !state) return NextResponse.json({ error: "Missing code or state" }, { status: 400 })

    const base = process.env.NEXTAUTH_URL ?? new URL(req.url).origin
    const redirectUri = `${base}/api/email-sync/gmail/callback`
    const tokens = await exchangeGmailCode(code, redirectUri)
    if (!tokens.accessToken) {
      return NextResponse.redirect(`${base}/settings?gmail=error`)
    }

    const userId = state
    const email = tokens.email ?? "unknown"

    await prisma.emailSync.upsert({
      where: { userId_provider: { userId, provider: "GMAIL" } },
      create: {
        userId,
        provider: "GMAIL",
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        email,
      },
      update: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        email,
      },
    })

    return NextResponse.redirect(`${base}/settings?gmail=connected`)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
