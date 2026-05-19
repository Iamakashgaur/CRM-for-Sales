import crypto from "crypto"

const STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes

function getSecret(): string {
  return process.env.OAUTH_STATE_SECRET ?? process.env.NEXTAUTH_SECRET ?? ""
}

export function signState(userId: string): string {
  const secret = getSecret()
  if (!secret) throw new Error("OAUTH_STATE_SECRET / NEXTAUTH_SECRET not configured")
  const nonce = crypto.randomBytes(16).toString("hex")
  const payload = `${userId}:${nonce}:${Date.now()}`
  const sig = crypto.createHmac("sha256", secret).update(payload).digest("hex")
  return Buffer.from(`${payload}:${sig}`).toString("base64url")
}

export function verifyState(state: string | null | undefined): { userId: string } | null {
  if (!state) return null
  const secret = getSecret()
  if (!secret) return null
  try {
    const decoded = Buffer.from(state, "base64url").toString()
    const parts = decoded.split(":")
    if (parts.length !== 4) return null
    const [userId, nonce, ts, sig] = parts
    const tsNum = parseInt(ts, 10)
    if (!Number.isFinite(tsNum)) return null
    if (Date.now() - tsNum > STATE_TTL_MS) return null
    const expected = crypto
      .createHmac("sha256", secret)
      .update(`${userId}:${nonce}:${ts}`)
      .digest("hex")
    const a = Buffer.from(sig, "hex")
    const b = Buffer.from(expected, "hex")
    if (a.length !== b.length) return null
    if (!crypto.timingSafeEqual(a, b)) return null
    return { userId }
  } catch {
    return null
  }
}
