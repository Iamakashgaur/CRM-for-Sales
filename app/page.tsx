import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth"

export const dynamic = "force-dynamic"

export default async function HomePage() {
  const session = await getServerSession()
  if (session?.user) redirect("/dashboard")
  redirect("/login")
}
