const GMAIL_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
const GMAIL_TOKEN_URL = "https://oauth2.googleapis.com/token"
const GMAIL_API = "https://gmail.googleapis.com/gmail/v1/users/me"

const SCOPES = ["https://www.googleapis.com/auth/gmail.readonly", "openid", "email", "profile"]

export interface GmailMessage {
  id: string
  threadId: string
  subject: string
  from: string
  to: string
  body: string
  receivedAt: Date
}

export function getGmailAuthUrl(redirectUri: string, state: string): string {
  const clientId = process.env.GMAIL_CLIENT_ID ?? ""
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: SCOPES.join(" "),
    access_type: "offline",
    prompt: "consent",
    state,
  })
  return `${GMAIL_AUTH_URL}?${params.toString()}`
}

export async function exchangeGmailCode(code: string, redirectUri: string): Promise<{
  accessToken: string
  refreshToken: string | null
  expiresIn: number
  email: string | null
}> {
  try {
    const body = new URLSearchParams({
      code,
      client_id: process.env.GMAIL_CLIENT_ID ?? "",
      client_secret: process.env.GMAIL_CLIENT_SECRET ?? "",
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    })
    const res = await fetch(GMAIL_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    })
    if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`)
    const data = await res.json()

    let email: string | null = null
    try {
      const profileRes = await fetch(`${GMAIL_API}/profile`, {
        headers: { Authorization: `Bearer ${data.access_token}` },
      })
      if (profileRes.ok) {
        const profile = await profileRes.json()
        email = profile.emailAddress ?? null
      }
    } catch {
      email = null
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresIn: data.expires_in ?? 3600,
      email,
    }
  } catch {
    return { accessToken: "", refreshToken: null, expiresIn: 0, email: null }
  }
}

export async function refreshGmailToken(refreshToken: string): Promise<string | null> {
  try {
    const body = new URLSearchParams({
      refresh_token: refreshToken,
      client_id: process.env.GMAIL_CLIENT_ID ?? "",
      client_secret: process.env.GMAIL_CLIENT_SECRET ?? "",
      grant_type: "refresh_token",
    })
    const res = await fetch(GMAIL_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    })
    if (!res.ok) return null
    const data = await res.json()
    return data.access_token ?? null
  } catch {
    return null
  }
}

function decodeBase64Url(s: string): string {
  try {
    const norm = s.replace(/-/g, "+").replace(/_/g, "/")
    if (typeof Buffer !== "undefined") return Buffer.from(norm, "base64").toString("utf-8")
    return atob(norm)
  } catch {
    return ""
  }
}

function parseHeaders(headers: Array<{ name: string; value: string }>): Record<string, string> {
  const out: Record<string, string> = {}
  for (const h of headers ?? []) out[h.name.toLowerCase()] = h.value
  return out
}

function extractBody(payload: any): string {
  if (!payload) return ""
  if (payload.body?.data) return decodeBase64Url(payload.body.data)
  if (Array.isArray(payload.parts)) {
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) return decodeBase64Url(part.body.data)
    }
    for (const part of payload.parts) {
      const nested = extractBody(part)
      if (nested) return nested
    }
  }
  return ""
}

export async function fetchGmailMessagesByContact(
  accessToken: string,
  contactEmail: string,
  max = 25
): Promise<GmailMessage[]> {
  try {
    if (!accessToken || !contactEmail) return []
    const q = encodeURIComponent(`from:${contactEmail} OR to:${contactEmail}`)
    const listRes = await fetch(`${GMAIL_API}/messages?q=${q}&maxResults=${max}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!listRes.ok) return []
    const listData = await listRes.json()
    const ids: Array<{ id: string; threadId: string }> = listData.messages ?? []
    const results: GmailMessage[] = []
    for (const m of ids) {
      try {
        const detailRes = await fetch(`${GMAIL_API}/messages/${m.id}?format=full`, {
          headers: { Authorization: `Bearer ${accessToken}` },
        })
        if (!detailRes.ok) continue
        const detail = await detailRes.json()
        const headers = parseHeaders(detail.payload?.headers ?? [])
        results.push({
          id: detail.id,
          threadId: detail.threadId,
          subject: headers["subject"] ?? "(no subject)",
          from: headers["from"] ?? "",
          to: headers["to"] ?? "",
          body: extractBody(detail.payload),
          receivedAt: new Date(Number(detail.internalDate ?? Date.now())),
        })
      } catch {
        continue
      }
    }
    return results
  } catch {
    return []
  }
}
