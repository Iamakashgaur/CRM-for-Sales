import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth"
import { isPrivileged } from "@/lib/constants"
import { ReportsClient } from "./client"

export const dynamic = "force-dynamic"

export default async function ReportsPage() {
  const session = await getServerSession()
  if (!session?.user) redirect("/login")
  if (!isPrivileged(session.user.role)) redirect("/dashboard")
  return <ReportsClient />
}
