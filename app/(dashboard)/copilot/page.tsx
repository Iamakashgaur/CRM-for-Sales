import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth"
import { CopilotClient } from "./client"

export const dynamic = "force-dynamic"

export default async function CopilotPage() {
  const session = await getServerSession()
  if (!session?.user) redirect("/login")
  return <CopilotClient userName={session.user.name ?? ""} />
}
