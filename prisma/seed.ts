import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

function daysAgo(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d
}
function daysFromNow(n: number): Date {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d
}

async function main() {
  console.log("Wiping existing data...")
  await prisma.aIInsight.deleteMany()
  await prisma.emailSyncMessage.deleteMany()
  await prisma.emailSync.deleteMany()
  await prisma.activity.deleteMany()
  await prisma.deal.deleteMany()
  await prisma.contact.deleteMany()
  await prisma.stage.deleteMany()
  await prisma.user.deleteMany()

  console.log("Creating users...")
  const [adminPw, sarahPw, mikePw] = await Promise.all([
    bcrypt.hash("Admin1234!", 10),
    bcrypt.hash("Sarah1234!", 10),
    bcrypt.hash("Mike1234!", 10),
  ])
  const admin = await prisma.user.create({
    data: { name: "Alex Chen", email: "admin@crm.com", passwordHash: adminPw, role: "ADMIN" },
  })
  const sarah = await prisma.user.create({
    data: { name: "Sarah Johnson", email: "sarah@crm.com", passwordHash: sarahPw, role: "MANAGER" },
  })
  const mike = await prisma.user.create({
    data: { name: "Mike Rodriguez", email: "mike@crm.com", passwordHash: mikePw, role: "REP" },
  })
  const users = [admin, sarah, mike]

  console.log("Creating stages...")
  const stages = await Promise.all([
    prisma.stage.create({ data: { name: "Prospect", order: 1, color: "#64748b", probability: 10, isDefault: true } }),
    prisma.stage.create({ data: { name: "Qualified", order: 2, color: "#3b82f6", probability: 25 } }),
    prisma.stage.create({ data: { name: "Proposal", order: 3, color: "#6366f1", probability: 50 } }),
    prisma.stage.create({ data: { name: "Negotiation", order: 4, color: "#f59e0b", probability: 75 } }),
    prisma.stage.create({ data: { name: "Closed Won", order: 5, color: "#10b981", probability: 100 } }),
    prisma.stage.create({ data: { name: "Closed Lost", order: 6, color: "#ef4444", probability: 0 } }),
  ])
  const [prospect, qualified, proposal, negotiation, won, lost] = stages

  console.log("Creating contacts...")
  const companies = [
    { name: "Stripe", domain: "stripe.com" },
    { name: "Acme Corp", domain: "acme.com" },
    { name: "GlobalTech", domain: "globaltech.io" },
    { name: "Initech", domain: "initech.com" },
    { name: "Hooli", domain: "hooli.com" },
    { name: "Pied Piper", domain: "piedpiper.com" },
    { name: "Soylent", domain: "soylent.com" },
    { name: "Massive Dynamic", domain: "massivedynamic.com" },
    { name: "Wayne Enterprises", domain: "wayne.com" },
    { name: "Stark Industries", domain: "stark.com" },
  ]
  const titles = ["VP Sales", "Director of Engineering", "CTO", "CEO", "Head of Ops", "VP Marketing", "Product Manager", "Procurement Lead"]
  const sources = ["LinkedIn", "Referral", "Inbound", "Cold Email", "Event"]
  const tagSets = [["enterprise"], ["smb"], ["enterprise", "hot"], ["mid-market"], ["smb", "warm"], ["enterprise", "vip"]]
  const firstNames = ["Olivia", "Liam", "Emma", "Noah", "Ava", "James", "Sophia", "Logan", "Isabella", "Mason", "Mia", "Ethan", "Charlotte", "Lucas", "Amelia", "Henry", "Harper", "Daniel", "Evelyn", "Jackson"]
  const lastNames = ["Smith", "Johnson", "Williams", "Brown", "Jones", "Garcia", "Miller", "Davis", "Rodriguez", "Martinez", "Hernandez", "Lopez", "Gonzalez", "Wilson", "Anderson", "Thomas", "Taylor", "Moore", "Jackson", "Martin"]

  const contacts: { id: string }[] = []
  for (let i = 0; i < 20; i++) {
    const fn = firstNames[i % firstNames.length]
    const ln = lastNames[(i * 7) % lastNames.length]
    const company = companies[i % companies.length]
    const title = titles[i % titles.length]
    const source = sources[i % sources.length]
    const tags = tagSets[i % tagSets.length]
    const owner = users[i % users.length]
    const c = await prisma.contact.create({
      data: {
        name: `${fn} ${ln}`,
        email: `${fn.toLowerCase()}.${ln.toLowerCase()}@${company.domain}`,
        phone: `+1 555-0${100 + i}`,
        company: company.name,
        title,
        source,
        tags: JSON.stringify(tags),
        notes: i % 3 === 0 ? `Met at ${source}. Interested in our enterprise tier.` : null,
        linkedinUrl: `https://linkedin.com/in/${fn.toLowerCase()}-${ln.toLowerCase()}`,
        website: `https://${company.domain}`,
        ownerId: owner.id,
      },
    })
    contacts.push(c)
  }

  console.log("Creating deals...")
  type DealPlan = { stage: typeof prospect; valueK: number; daysOld: number; closedDaysAgo?: number; lost?: boolean }
  const plans: DealPlan[] = [
    { stage: prospect, valueK: 15, daysOld: 5 },
    { stage: prospect, valueK: 25, daysOld: 10 },
    { stage: prospect, valueK: 40, daysOld: 2 },
    { stage: qualified, valueK: 60, daysOld: 14 },
    { stage: qualified, valueK: 80, daysOld: 21 },
    { stage: qualified, valueK: 120, daysOld: 9 },
    { stage: proposal, valueK: 150, daysOld: 30 },
    { stage: proposal, valueK: 200, daysOld: 18 },
    { stage: proposal, valueK: 90, daysOld: 7 },
    { stage: negotiation, valueK: 250, daysOld: 35 },
    { stage: negotiation, valueK: 175, daysOld: 22 },
    { stage: won, valueK: 320, daysOld: 60, closedDaysAgo: 12 },
    { stage: won, valueK: 90, daysOld: 75, closedDaysAgo: 25 },
    { stage: won, valueK: 200, daysOld: 90, closedDaysAgo: 40 },
    { stage: won, valueK: 450, daysOld: 100, closedDaysAgo: 55 },
    { stage: lost, valueK: 50, daysOld: 80, closedDaysAgo: 30, lost: true },
    { stage: lost, valueK: 110, daysOld: 95, closedDaysAgo: 45, lost: true },
  ]

  const deals: { id: string; stageName: string; contactId: string; ownerId: string }[] = []
  for (let i = 0; i < plans.length; i++) {
    const p = plans[i]
    const contact = contacts[i % contacts.length]
    const owner = users[i % users.length]
    const d = await prisma.deal.create({
      data: {
        title: `${["Q1", "Q2", "Q3", "Q4"][i % 4]} renewal · ${["Platform", "Enterprise", "Growth", "Premium"][i % 4]} ${i + 1}`,
        value: p.valueK * 1000,
        currency: "USD",
        stage: p.stage.name,
        stageId: p.stage.id,
        probability: p.stage.probability,
        contactId: contact.id,
        ownerId: owner.id,
        tags: JSON.stringify(i % 2 === 0 ? ["enterprise"] : ["mid-market"]),
        expectedCloseDate: daysFromNow(30 - p.daysOld),
        actualCloseDate: p.closedDaysAgo ? daysAgo(p.closedDaysAgo) : null,
        lostReason: p.lost ? "Budget cut" : null,
        notes: `Initial conversation went well. ${p.stage.name} stage discussions ongoing.`,
        createdAt: daysAgo(p.daysOld),
      },
    })
    deals.push({ id: d.id, stageName: p.stage.name, contactId: contact.id, ownerId: owner.id })
  }

  console.log("Creating activities...")
  const types = ["CALL", "EMAIL", "MEETING", "NOTE", "TASK"]
  const subjects: Record<string, string[]> = {
    CALL: ["Discovery call", "Follow-up call", "Pricing discussion", "Check-in call"],
    EMAIL: ["Sent proposal", "Replied with quote", "Follow-up email", "Intro email"],
    MEETING: ["Demo", "Stakeholder meeting", "Kickoff", "Quarterly review"],
    NOTE: ["Prospect notes", "Internal sync", "Competitive intel", "Pricing notes"],
    TASK: ["Send contract", "Update CRM", "Prepare deck", "Send case study"],
  }
  for (let i = 0; i < 30; i++) {
    const type = types[i % types.length]
    const subj = subjects[type][i % subjects[type].length]
    const deal = deals[i % deals.length]
    const user = users[i % users.length]
    await prisma.activity.create({
      data: {
        type,
        subject: subj,
        body: i % 3 === 0 ? `Discussed ${type.toLowerCase()} details and next steps.` : null,
        completedAt: i % 4 !== 0 ? daysAgo(Math.floor(Math.random() * 45)) : null,
        dueAt: i % 5 === 0 ? daysFromNow(3 + (i % 7)) : null,
        dealId: deal.id,
        contactId: deal.contactId,
        userId: user.id,
        createdAt: daysAgo(Math.floor(Math.random() * 45)),
      },
    })
  }

  console.log("Seed complete.")
  console.log(`  Users: ${users.length}`)
  console.log(`  Stages: ${stages.length}`)
  console.log(`  Contacts: ${contacts.length}`)
  console.log(`  Deals: ${deals.length}`)
  console.log(`  Activities: 30`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
