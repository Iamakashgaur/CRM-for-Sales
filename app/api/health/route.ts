import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { safeError } from "@/lib/api-errors"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ ok: true, db: "ok", time: new Date().toISOString() })
  } catch (err) {
    return NextResponse.json(
      { ok: false, db: "error", error: safeError(err) },
      { status: 503 }
    )
  }
}
