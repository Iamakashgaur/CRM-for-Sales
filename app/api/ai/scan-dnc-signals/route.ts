import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"
import { isPrivileged } from "@/lib/constants"

export const dynamic = "force-dynamic"

const Body = z.object({
  contactIds: z.array(z.string()).optional(),
}).optional()

interface DncSignal {
  source: "email" | "call_note" | "whatsapp"
  snippet: string
  severity: "low" | "medium" | "high"
  matched: string
  at: string
}

interface DncDetection {
  contactId: string
  contactName: string
  contactEmail: string
  signals: DncSignal[]
  suggestedAction: "flag-dnc" | "review"
}

// Phrase -> severity. Use word boundaries via regex.
const PATTERNS: Array<{ rx: RegExp; severity: DncSignal["severity"]; label: string }> = [
  { rx: /\bunsubscribe\b/i, severity: "high", label: "unsubscribe" },
  { rx: /\bdo\s*not\s*(contact|call|email|message)\b/i, severity: "high", label: "do not contact" },
  { rx: /\bdont\s*(contact|call|email|message)\b/i, severity: "high", label: "don't contact" },
  { rx: /\bremove\s*(me|from)\b/i, severity: "high", label: "remove me" },
  { rx: /\bstop\s*(contacting|calling|emailing|messaging)\b/i, severity: "high", label: "stop contacting" },
  { rx: /\bDND\b/, severity: "high", label: "DND" },
  { rx: /\bnot\s*interested\b/i, severity: "medium", label: "not interested" },
  { rx: /\bnever\s*(call|contact)\b/i, severity: "high", label: "never contact" },
  { rx: /\blawsuit\b/i, severity: "high", label: "lawsuit" },
  { rx: /\bcomplaint\b/i, severity: "medium", label: "complaint" },
  { rx: /\bangry\b/i, severity: "low", label: "angry" },
  { rx: /\bharass\w*\b/i, severity: "high", label: "harassment" },
  { rx: /\bspam\b/i, severity: "medium", label: "spam" },
  { rx: /\breport\s*(you|this)\b/i, severity: "medium", label: "threatened to report" },
]

function scanText(text: string): Array<{ severity: DncSignal["severity"]; label: string; snippet: string }> {
  if (!text) return []
  const out: Array<{ severity: DncSignal["severity"]; label: string; snippet: string }> = []
  for (const p of PATTERNS) {
    const m = p.rx.exec(text)
    if (m) {
      const idx = m.index
      const start = Math.max(0, idx - 40)
      const end = Math.min(text.length, idx + m[0].length + 60)
      const snippet = text.slice(start, end).replace(/\s+/g, " ").trim()
      out.push({ severity: p.severity, label: p.label, snippet })
    }
  }
  return out
}

function severityRank(s: DncSignal["severity"]): number {
  return s === "high" ? 3 : s === "medium" ? 2 : 1
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!rateLimit(`dnc-scan:${session.user.id}`, 5, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const bodyRaw = await req.json().catch(() => ({}))
    const parsed = Body.safeParse(bodyRaw)
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const isPriv = isPrivileged(session.user.role)
    const ownerFilter = isPriv ? {} : { ownerId: session.user.id }

    const where: Record<string, unknown> = {
      ...ownerFilter,
      dnc: false,
    }
    if (parsed.data?.contactIds && parsed.data.contactIds.length > 0) {
      where.id = { in: parsed.data.contactIds }
    }

    const contacts = await prisma.contact.findMany({
      where,
      take: parsed.data?.contactIds ? parsed.data.contactIds.length : 500,
      select: {
        id: true,
        name: true,
        email: true,
        emailMsgs: {
          orderBy: { receivedAt: "desc" },
          take: 5,
          select: { body: true, receivedAt: true, subject: true },
        },
        callLogs: {
          orderBy: { at: "desc" },
          take: 5,
          select: { notes: true, at: true, status: true },
        },
        whatsappMessages: {
          orderBy: { receivedAt: "desc" },
          take: 5,
          select: { body: true, receivedAt: true, direction: true },
        },
      },
    })

    const detections: DncDetection[] = []
    for (const c of contacts) {
      const signals: DncSignal[] = []

      for (const m of c.emailMsgs) {
        const text = `${m.subject ?? ""} ${m.body ?? ""}`
        for (const hit of scanText(text)) {
          signals.push({
            source: "email",
            snippet: hit.snippet,
            severity: hit.severity,
            matched: hit.label,
            at: m.receivedAt.toISOString(),
          })
        }
      }
      for (const log of c.callLogs) {
        const text = `${log.status ?? ""} ${log.notes ?? ""}`
        for (const hit of scanText(text)) {
          signals.push({
            source: "call_note",
            snippet: hit.snippet,
            severity: hit.severity,
            matched: hit.label,
            at: log.at.toISOString(),
          })
        }
      }
      for (const wa of c.whatsappMessages) {
        // Only inbound messages from the contact matter
        if (wa.direction !== "inbound") continue
        for (const hit of scanText(wa.body ?? "")) {
          signals.push({
            source: "whatsapp",
            snippet: hit.snippet,
            severity: hit.severity,
            matched: hit.label,
            at: wa.receivedAt.toISOString(),
          })
        }
      }

      if (signals.length === 0) continue
      // Dedup by matched+source
      const seen = new Set<string>()
      const dedup = signals.filter((s) => {
        const k = `${s.source}|${s.matched}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })
      const top = dedup.sort((a, b) => severityRank(b.severity) - severityRank(a.severity)).slice(0, 5)

      const highCount = top.filter((s) => s.severity === "high").length
      const suggestedAction: DncDetection["suggestedAction"] = highCount > 0 ? "flag-dnc" : "review"
      detections.push({
        contactId: c.id,
        contactName: c.name,
        contactEmail: c.email,
        signals: top,
        suggestedAction,
      })
    }

    detections.sort((a, b) => {
      const aHigh = a.signals.filter((s) => s.severity === "high").length
      const bHigh = b.signals.filter((s) => s.severity === "high").length
      if (aHigh !== bHigh) return bHigh - aHigh
      return b.signals.length - a.signals.length
    })

    return NextResponse.json({ detections, scanned: contacts.length })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
