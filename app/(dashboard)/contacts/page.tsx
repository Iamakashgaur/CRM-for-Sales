import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth"
import { ContactsClient } from "./client"

export const dynamic = "force-dynamic"

export default async function ContactsPage() {
  const session = await getServerSession()
  if (!session?.user) redirect("/login")
  return <ContactsClient role={session.user.role} />
}
