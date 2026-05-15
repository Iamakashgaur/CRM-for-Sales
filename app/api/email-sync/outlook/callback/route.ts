import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { exchangeOutlookCode } from "@/lib/outlook"

export const dynamic = "force-dynamic"

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get("code")
    const state = searchParams.get("state")
    if (!code || !state) return NextResponse.json({ error: "Missing code or state" }, { status: 400 })

    const base = process.env.NEXTAUTH_URL ?? new URL(req.url).origin
    const redirectUri = `${base}/api/email-sync/outlook/callback`
    const tokens = await exchangeOutlookCode(code, redirectUri)
    if (!tokens.accessToken) {
      return NextResponse.redirect(`${base}/settings?outlook=error`)
    }

    const userId = state
    const email = tokens.email ?? "unknown"

    await prisma.emailSync.upsert({
      where: { userId_provider: { userId, provider: "OUTLOOK" } },
      create: {
        userId,
        provider: "OUTLOOK",
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

    return NextResponse.redirect(`${base}/settings?outlook=connected`)
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
