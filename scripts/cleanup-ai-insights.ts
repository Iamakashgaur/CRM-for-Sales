import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const cutoff = new Date(Date.now() - 30 * 86400000)
  const r = await prisma.aIInsight.deleteMany({ where: { createdAt: { lt: cutoff } } })
  console.log("Deleted", r.count, "old AIInsights")
}

main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
