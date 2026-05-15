function getTenant(): string {
  return process.env.OUTLOOK_TENANT_ID || "common"
}

function authBaseUrl(): string {
  return `https://login.microsoftonline.com/${getTenant()}/oauth2/v2.0`
}

const GRAPH_API = "https://graph.microsoft.com/v1.0"
const SCOPES = ["offline_access", "openid", "profile", "email", "User.Read", "Mail.Read"]

export interface OutlookMessage {
  id: string
  subject: string
  from: string
  to: string
  body: string
  receivedAt: Date
}

export function getOutlookAuthUrl(redirectUri: string, state: string): string {
  const params = new URLSearchParams({
    client_id: process.env.OUTLOOK_CLIENT_ID ?? "",
    response_type: "code",
    redirect_uri: redirectUri,
    response_mode: "query",
    scope: SCOPES.join(" "),
    state,
  })
  return `${authBaseUrl()}/authorize?${params.toString()}`
}

export async function exchangeOutlookCode(code: string, redirectUri: string): Promise<{
  accessToken: string
  refreshToken: string | null
  expiresIn: number
  email: string | null
}> {
  try {
    const body = new URLSearchParams({
      client_id: process.env.OUTLOOK_CLIENT_ID ?? "",
      client_secret: process.env.OUTLOOK_CLIENT_SECRET ?? "",
      code,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
      scope: SCOPES.join(" "),
    })
    const res = await fetch(`${authBaseUrl()}/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    })
    if (!res.ok) throw new Error(`Token exchange failed: ${res.status}`)
    const data = await res.json()

    let email: string | null = null
    try {
      const meRes = await fetch(`${GRAPH_API}/me`, {
        headers: { Authorization: `Bearer ${data.access_token}` },
      })
      if (meRes.ok) {
        const me = await meRes.json()
        email = me.mail ?? me.userPrincipalName ?? null
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

export async function refreshOutlookToken(refreshToken: string): Promise<string | null> {
  try {
    const body = new URLSearchParams({
      client_id: process.env.OUTLOOK_CLIENT_ID ?? "",
      client_secret: process.env.OUTLOOK_CLIENT_SECRET ?? "",
      refresh_token: refreshToken,
      grant_type: "refresh_token",
      scope: SCOPES.join(" "),
    })
    const res = await fetch(`${authBaseUrl()}/token`, {
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

export async function fetchOutlookMessagesByContact(
  accessToken: string,
  contactEmail: string,
  max = 25
): Promise<OutlookMessage[]> {
  try {
    if (!accessToken || !contactEmail) return []
    const filter = encodeURIComponent(
      `(from/emailAddress/address eq '${contactEmail}') or (toRecipients/any(r:r/emailAddress/address eq '${contactEmail}'))`
    )
    const url = `${GRAPH_API}/me/messages?$top=${max}&$filter=${filter}&$select=id,subject,from,toRecipients,body,receivedDateTime`
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    })
    if (!res.ok) return []
    const data = await res.json()
    const items: any[] = data.value ?? []
    return items.map((m) => ({
      id: m.id,
      subject: m.subject ?? "(no subject)",
      from: m.from?.emailAddress?.address ?? "",
      to: (m.toRecipients ?? []).map((r: any) => r.emailAddress?.address).filter(Boolean).join(", "),
      body: m.body?.content ?? "",
      receivedAt: new Date(m.receivedDateTime ?? Date.now()),
    }))
  } catch {
    return []
  }
}
