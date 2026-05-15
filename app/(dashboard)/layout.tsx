import { redirect } from "next/navigation"
import { getServerSession } from "@/lib/auth"
import { Sidebar } from "@/components/layout/Sidebar"
import { TopBar } from "@/components/layout/TopBar"
import { CommandPalette } from "@/components/layout/CommandPalette"

export const dynamic = "force-dynamic"

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession()
  if (!session?.user) redirect("/login")

  return (
    <div className="flex min-h-screen bg-background">
      <Sidebar user={{ name: session.user.name ?? "", email: session.user.email ?? "", role: session.user.role }} />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar user={{ name: session.user.name ?? "", email: session.user.email ?? "" }} />
        <main className="flex-1 overflow-auto">
          <div className="mx-auto max-w-[1400px] px-6 py-6 animate-fade-in">
            {children}
          </div>
        </main>
      </div>
      <CommandPalette />
    </div>
  )
}
