import { NextRequest, NextResponse } from "next/server"
import { z } from "zod"
import { getServerSession } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { rateLimit } from "@/lib/rate-limit"
import { safeError } from "@/lib/api-errors"
import { callLLMWithTools, type ToolSpec } from "@/lib/ai-provider"
import { parseTags } from "@/lib/utils"
import { getAnalytics } from "@/lib/analytics"

export const dynamic = "force-dynamic"

const Body = z.object({
  messages: z.array(
    z.object({
      role: z.enum(["user", "assistant"]),
      content: z.string().min(1).max(8000),
    })
  ).min(1).max(40),
})

const TOOLS: ToolSpec[] = [
  {
    name: "searchContacts",
    description: "Search the user's contacts by free-text query (name, email, company).",
    input_schema: {
      type: "object",
      properties: {
        q: { type: "string", description: "Search query" },
        limit: { type: "number", description: "Max results (default 5, max 10)" },
      },
      required: ["q"],
    },
  },
  {
    name: "searchDeals",
    description: "Search deals by free-text query on deal title.",
    input_schema: {
      type: "object",
      properties: {
        q: { type: "string" },
        limit: { type: "number" },
      },
      required: ["q"],
    },
  },
  {
    name: "getDealById",
    description: "Get a single deal with its contact, stage, and recent activities.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "getContactById",
    description: "Get a single contact by id, with recent calls.",
    input_schema: {
      type: "object",
      properties: { id: { type: "string" } },
      required: ["id"],
    },
  },
  {
    name: "logCall",
    description: "Log a phone call against a contact. Status examples: 'Connected - Positive', 'Not Reachable', 'Call Back Requested'.",
    input_schema: {
      type: "object",
      properties: {
        contactId: { type: "string" },
        status: { type: "string" },
        notes: { type: "string" },
      },
      required: ["contactId", "status"],
    },
  },
  {
    name: "createActivity",
    description: "Create a task/note/activity. type must be one of CALL, EMAIL, MEETING, NOTE, TASK. Provide dealId OR contactId.",
    input_schema: {
      type: "object",
      properties: {
        type: { type: "string", enum: ["CALL", "EMAIL", "MEETING", "NOTE", "TASK"] },
        subject: { type: "string" },
        body: { type: "string" },
        dueAt: { type: "string", description: "ISO date string" },
        dealId: { type: "string" },
        contactId: { type: "string" },
      },
      required: ["type", "subject"],
    },
  },
  {
    name: "getAnalytics",
    description: "Get high-level analytics: pipeline value, forecast, win rate, won this month, stage breakdown.",
    input_schema: {
      type: "object",
      properties: {},
    },
  },
  {
    name: "listMyTasks",
    description: "List the user's pending follow-ups. bucket: 'today' (default), 'overdue', 'hot', 'warm', 'interested'.",
    input_schema: {
      type: "object",
      properties: {
        bucket: { type: "string" },
        limit: { type: "number" },
      },
    },
  },
]

function clip<T>(arr: T[], limit: number): T[] {
  const n = Math.max(1, Math.min(limit || 5, 10))
  return arr.slice(0, n)
}

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession()
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 })

    if (!rateLimit(`copilot:${session.user.id}`, 20, 60_000)) {
      return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 })
    }

    const parsed = Body.safeParse(await req.json())
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })

    const userId = session.user.id
    const isRep = session.user.role === "REP"
    const repScope = isRep ? { ownerId: userId } : {}

    const system = `You are Karat Copilot, an AI assistant inside a B2B sales CRM for jewellery and wholesale reps.
The current user is ${session.user.name ?? "the rep"} (role: ${session.user.role}, id: ${userId}).

You have tools to look up contacts, deals, analytics, log calls, and create tasks. Use them whenever the answer requires CRM data — do not guess from training data.

Style:
- Be concise. Bullet lists or short paragraphs.
- When you reference a contact or deal, mention its name (id can stay hidden unless asked).
- If a tool returns 0 results, say so plainly and suggest a refinement.
- Today's date is ${new Date().toISOString().slice(0, 10)}.

When the user asks to log a call or create a task, first identify the contact/deal via search if the user only gave a name. Then call logCall or createActivity. Confirm what you did in the reply.`

    const executor = async (name: string, input: Record<string, unknown>): Promise<string> => {
      try {
        switch (name) {
          case "searchContacts": {
            const q = String(input.q ?? "").trim()
            const limit = typeof input.limit === "number" ? input.limit : 5
            if (q.length < 2) return JSON.stringify({ contacts: [], note: "Query too short" })
            const rows = await prisma.contact.findMany({
              where: {
                ...repScope,
                OR: [
                  { name: { contains: q } },
                  { email: { contains: q } },
                  { company: { contains: q } },
                ],
              },
              take: Math.max(1, Math.min(limit, 10)),
              orderBy: { updatedAt: "desc" },
              select: {
                id: true,
                name: true,
                email: true,
                phone: true,
                company: true,
                city: true,
                state: true,
                category: true,
                callStatus: true,
                followUpStatus: true,
                nextFollowUpDate: true,
                dnc: true,
              },
            })
            return JSON.stringify({ contacts: rows })
          }

          case "searchDeals": {
            const q = String(input.q ?? "").trim()
            const limit = typeof input.limit === "number" ? input.limit : 5
            if (q.length < 2) return JSON.stringify({ deals: [], note: "Query too short" })
            const rows = await prisma.deal.findMany({
              where: { ...repScope, title: { contains: q } },
              take: Math.max(1, Math.min(limit, 10)),
              orderBy: { updatedAt: "desc" },
              include: {
                contact: { select: { id: true, name: true, company: true } },
              },
            })
            return JSON.stringify({
              deals: rows.map((d) => ({
                id: d.id,
                title: d.title,
                value: d.value,
                stage: d.stage,
                probability: d.probability,
                expectedCloseDate: d.expectedCloseDate,
                contact: d.contact,
                tags: parseTags(d.tags),
              })),
            })
          }

          case "getDealById": {
            const id = String(input.id ?? "")
            if (!id) return JSON.stringify({ error: "id required" })
            const deal = await prisma.deal.findUnique({
              where: { id },
              include: {
                contact: { select: { id: true, name: true, email: true, company: true, phone: true } },
                activities: { orderBy: { createdAt: "desc" }, take: 10 },
              },
            })
            if (!deal) return JSON.stringify({ error: "not found" })
            if (isRep && deal.ownerId !== userId) return JSON.stringify({ error: "forbidden" })
            return JSON.stringify({
              id: deal.id,
              title: deal.title,
              value: deal.value,
              currency: deal.currency,
              stage: deal.stage,
              probability: deal.probability,
              expectedCloseDate: deal.expectedCloseDate,
              notes: deal.notes,
              tags: parseTags(deal.tags),
              contact: deal.contact,
              recentActivities: deal.activities.map((a) => ({
                id: a.id,
                type: a.type,
                subject: a.subject,
                createdAt: a.createdAt,
              })),
            })
          }

          case "getContactById": {
            const id = String(input.id ?? "")
            if (!id) return JSON.stringify({ error: "id required" })
            const contact = await prisma.contact.findUnique({
              where: { id },
              include: {
                callLogs: { orderBy: { at: "desc" }, take: 5 },
              },
            })
            if (!contact) return JSON.stringify({ error: "not found" })
            if (isRep && contact.ownerId !== userId) return JSON.stringify({ error: "forbidden" })
            return JSON.stringify({
              id: contact.id,
              name: contact.name,
              email: contact.email,
              phone: contact.phone,
              company: contact.company,
              city: contact.city,
              state: contact.state,
              category: contact.category,
              callStatus: contact.callStatus,
              followUpStatus: contact.followUpStatus,
              dnc: contact.dnc,
              lastContactDate: contact.lastContactDate,
              nextFollowUpDate: contact.nextFollowUpDate,
              callLogs: contact.callLogs.map((c) => ({ at: c.at, status: c.status, notes: c.notes })),
            })
          }

          case "logCall": {
            const contactId = String(input.contactId ?? "")
            const status = String(input.status ?? "").trim()
            const notes = typeof input.notes === "string" ? input.notes : null
            if (!contactId || !status) return JSON.stringify({ error: "contactId and status required" })
            const c = await prisma.contact.findUnique({ where: { id: contactId } })
            if (!c) return JSON.stringify({ error: "contact not found" })
            if (isRep && c.ownerId !== userId) return JSON.stringify({ error: "forbidden" })
            const now = new Date()
            const [log] = await prisma.$transaction([
              prisma.callLog.create({
                data: { contactId, status, notes, userId, at: now },
              }),
              prisma.contact.update({
                where: { id: contactId },
                data: { callStatus: status, lastContactDate: now },
              }),
              prisma.activity.create({
                data: {
                  type: "CALL",
                  subject: status,
                  body: notes,
                  contactId,
                  userId,
                  completedAt: now,
                },
              }),
            ])
            return JSON.stringify({ ok: true, logId: log.id, message: `Logged call: ${status}` })
          }

          case "createActivity": {
            const type = String(input.type ?? "").toUpperCase()
            const subject = String(input.subject ?? "").trim()
            const body = typeof input.body === "string" ? input.body : null
            const dueAtRaw = typeof input.dueAt === "string" ? input.dueAt : null
            const dealId = typeof input.dealId === "string" ? input.dealId : null
            const contactId = typeof input.contactId === "string" ? input.contactId : null
            if (!["CALL", "EMAIL", "MEETING", "NOTE", "TASK"].includes(type)) {
              return JSON.stringify({ error: "invalid type" })
            }
            if (!subject) return JSON.stringify({ error: "subject required" })

            // Authz
            if (dealId) {
              const d = await prisma.deal.findUnique({ where: { id: dealId }, select: { ownerId: true } })
              if (!d) return JSON.stringify({ error: "deal not found" })
              if (isRep && d.ownerId !== userId) return JSON.stringify({ error: "forbidden" })
            }
            if (contactId) {
              const cc = await prisma.contact.findUnique({ where: { id: contactId }, select: { ownerId: true } })
              if (!cc) return JSON.stringify({ error: "contact not found" })
              if (isRep && cc.ownerId !== userId) return JSON.stringify({ error: "forbidden" })
            }
            const created = await prisma.activity.create({
              data: {
                type,
                subject,
                body,
                dueAt: dueAtRaw ? new Date(dueAtRaw) : null,
                dealId,
                contactId,
                userId,
              },
            })
            return JSON.stringify({ ok: true, activityId: created.id, message: `Created ${type}: ${subject}` })
          }

          case "getAnalytics": {
            const ownerId = isRep ? userId : undefined
            const data = await getAnalytics(ownerId)
            // Trim to manageable size
            return JSON.stringify({
              forecastedRevenue: data.forecastedRevenue,
              totalPipelineValue: data.totalPipelineValue,
              revenueThisMonth: data.revenueThisMonth,
              winRate: data.winRate,
              avgDealSize: data.avgDealSize,
              stageBreakdown: data.stageBreakdown,
            })
          }

          case "listMyTasks": {
            const bucket = String(input.bucket ?? "today")
            const limit = typeof input.limit === "number" ? input.limit : 10
            const today = new Date()
            today.setHours(0, 0, 0, 0)
            const tomorrow = new Date(today)
            tomorrow.setDate(tomorrow.getDate() + 1)
            const sevenDaysAgo = new Date(today)
            sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

            const base: Record<string, unknown> = { ownerId: userId, dnc: false }
            let where: Record<string, unknown>
            switch (bucket) {
              case "overdue":
                where = { ...base, nextFollowUpDate: { lt: today, not: null }, followUpStatus: { not: "Completed" } }
                break
              case "hot":
                where = { ...base, category: "Hot Lead" }
                break
              case "warm":
                where = { ...base, category: "Warm Lead" }
                break
              case "interested":
                where = { ...base, followUpStatus: "Interested" }
                break
              case "today":
              default:
                where = { ...base, nextFollowUpDate: { gte: today, lt: tomorrow } }
            }
            const rows = await prisma.contact.findMany({
              where,
              orderBy: [{ nextFollowUpDate: "asc" }, { updatedAt: "desc" }],
              take: Math.max(1, Math.min(limit, 25)),
              select: {
                id: true,
                name: true,
                company: true,
                phone: true,
                category: true,
                followUpStatus: true,
                nextFollowUpDate: true,
                city: true,
                state: true,
              },
            })
            return JSON.stringify({ bucket, contacts: clip(rows, limit) })
          }

          default:
            return JSON.stringify({ error: `Unknown tool: ${name}` })
        }
      } catch (e) {
        return JSON.stringify({ error: (e as Error).message })
      }
    }

    const result = await callLLMWithTools({
      system,
      messages: parsed.data.messages,
      tools: TOOLS,
      executor,
      maxIterations: 5,
      maxTokens: 2048,
      task: "coach",
    })

    return NextResponse.json({
      ok: result.ok,
      text: result.finalText,
      toolCalls: result.toolCalls.map((t) => ({ name: t.name, input: t.input, isError: t.isError })),
      iterations: result.steps.length,
      provider: result.provider,
      model: result.model,
      error: result.error,
    })
  } catch (err) {
    return NextResponse.json({ error: safeError(err) }, { status: 500 })
  }
}
