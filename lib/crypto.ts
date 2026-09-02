import crypto from "crypto"

const ALG = "aes-256-gcm"

function getKey(): Buffer {
  const secret = process.env.NEXTAUTH_SECRET ?? ""
  if (secret.length < 16) throw new Error("NEXTAUTH_SECRET too short")
  return crypto.createHash("sha256").update(secret).digest()
}

export function encrypt(plain: string): string {
  if (!plain) return ""
  const iv = crypto.randomBytes(12)
  const cipher = crypto.createCipheriv(ALG, getKey(), iv)
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()])
  const tag = cipher.getAuthTag()
  return `v1:${iv.toString("base64url")}:${tag.toString("base64url")}:${enc.toString("base64url")}`
}

export function decrypt(payload: string): string {
  if (!payload) return ""
  if (!payload.startsWith("v1:")) return payload // legacy plaintext, return as-is
  const [, iv, tag, data] = payload.split(":")
  const decipher = crypto.createDecipheriv(ALG, getKey(), Buffer.from(iv, "base64url"))
  decipher.setAuthTag(Buffer.from(tag, "base64url"))
  const dec = Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()])
  return dec.toString("utf8")
}
