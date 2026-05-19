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
    } catch (e) {
      console.warn("Outlook profile fetch failed:", (e as Error).message)
      email = null
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresIn: data.expires_in ?? 3600,
      email,
    }
  } catch (e) {
    console.warn("Outlook code exchange failed:", (e as Error).message)
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
  } catch (e) {
    console.warn("Outlook token refresh failed:", (e as Error).message)
    return null
  }
}

interface OutlookAuthCtx {
  syncId: string
  accessToken: string
  refreshToken: string | null
}

async function fetchWithOutlookRefresh(url: string, ctx: OutlookAuthCtx): Promise<Response> {
  let token = ctx.accessToken
  let res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
  if (res.status === 401 && ctx.refreshToken) {
    const newToken = await refreshOutlookToken(ctx.refreshToken)
    if (newToken) {
      token = newToken
      ctx.accessToken = newToken
      try {
        const { prisma } = await import("./prisma")
        const { encrypt } = await import("./crypto")
        await prisma.emailSync.update({ where: { id: ctx.syncId }, data: { accessToken: encrypt(newToken) } })
      } catch (e) {
        console.warn("Outlook token persist failed:", (e as Error).message)
      }
      res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    }
  }
  return res
}

export async function fetchOutlookMessagesByContact(
  accessToken: string,
  contactEmail: string,
  max = 25,
  authCtx?: { syncId: string; refreshToken: string | null }
): Promise<OutlookMessage[]> {
  try {
    if (!accessToken || !contactEmail) return []
    const ctx: OutlookAuthCtx = {
      syncId: authCtx?.syncId ?? "",
      accessToken,
      refreshToken: authCtx?.refreshToken ?? null,
    }
    const filter = encodeURIComponent(
      `(from/emailAddress/address eq '${contactEmail}') or (toRecipients/any(r:r/emailAddress/address eq '${contactEmail}'))`
    )
    const url = `${GRAPH_API}/me/messages?$top=${max}&$filter=${filter}&$select=id,subject,from,toRecipients,body,receivedDateTime`
    const res = ctx.syncId
      ? await fetchWithOutlookRefresh(url, ctx)
      : await fetch(url, { headers: { Authorization: `Bearer ${ctx.accessToken}` } })
    if (!res.ok) return []
    const data = await res.json()
    interface OutlookRecipient { emailAddress?: { address?: string } }
    interface OutlookRaw {
      id: string
      subject?: string
      from?: { emailAddress?: { address?: string } }
      toRecipients?: OutlookRecipient[]
      body?: { content?: string }
      receivedDateTime?: string
    }
    const items: OutlookRaw[] = data.value ?? []
    return items.map((m) => ({
      id: m.id,
      subject: m.subject ?? "(no subject)",
      from: m.from?.emailAddress?.address ?? "",
      to: (m.toRecipients ?? [])
        .map((r) => r.emailAddress?.address)
        .filter((s): s is string => !!s)
        .join(", "),
      body: m.body?.content ?? "",
      receivedAt: new Date(m.receivedDateTime ?? Date.now()),
    }))
  } catch (e) {
    console.warn("Outlook list fetch failed:", (e as Error).message)
    return []
  }
}
