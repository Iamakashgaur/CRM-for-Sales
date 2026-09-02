import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth"
import { MyWorkClient } from "./client"

export const dynamic = "force-dynamic"

export default async function MyWorkPage() {
  const session = await getServerSession()
  if (!session?.user) redirect("/login")
  return <MyWorkClient role={session.user.role} userName={session.user.name ?? ""} />
}
