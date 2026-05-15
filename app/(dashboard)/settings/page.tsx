import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth"
import { SettingsClient } from "./client"

export const dynamic = "force-dynamic"

export default async function SettingsPage() {
  const session = await getServerSession()
  if (!session?.user) redirect("/login")
  return <SettingsClient role={session.user.role} userName={session.user.name ?? ""} userEmail={session.user.email ?? ""} />
}
