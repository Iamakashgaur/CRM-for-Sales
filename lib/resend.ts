import { Resend } from "resend"

const apiKey = process.env.RESEND_API_KEY ?? ""
const fromAddress = process.env.RESEND_FROM ?? "onboarding@resend.dev"

export const resendConfigured = apiKey.length > 0

const client = apiKey ? new Resend(apiKey) : null

export interface SendEmailInput {
  to: string
  subject: string
  body: string
  replyTo?: string
}

export interface SendEmailResult {
  ok: boolean
  id?: string
  error?: string
}

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  if (!client) {
    return { ok: false, error: "RESEND_API_KEY not configured. Add to .env and restart server." }
  }
  try {
    const res = await client.emails.send({
      from: fromAddress,
      to: input.to,
      subject: input.subject,
      text: input.body,
      replyTo: input.replyTo,
    })
    if (res.error) return { ok: false, error: res.error.message }
    return { ok: true, id: res.data?.id }
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Send failed"
    return { ok: false, error: msg }
  }
}

export function getFromAddress(): string {
  return fromAddress
}
