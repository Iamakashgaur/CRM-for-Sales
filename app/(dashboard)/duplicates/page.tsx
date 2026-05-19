import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth"
import { DuplicatesClient } from "./client"
import { isPrivileged } from "@/lib/constants"

export const dynamic = "force-dynamic"

export default async function DuplicatesPage() {
  const session = await getServerSession()
  if (!session?.user) redirect("/login")
  if (!isPrivileged(session.user.role)) redirect("/dashboard")
  return <DuplicatesClient />
}
