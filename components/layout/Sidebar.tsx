"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { signOut } from "next-auth/react"
import {
  LayoutDashboard,
  Users,
  Briefcase,
  KanbanSquare,
  BarChart3,
  Settings,
  LogOut,
  MoreHorizontal,
} from "lucide-react"
import { cn, getInitials, avatarColor } from "@/lib/utils"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

interface SidebarProps {
  user: { name: string; email: string; role: string }
}

const mainNav = [
  { href: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/deals", label: "Deals", icon: Briefcase },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
] as const

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const showSettings = user.role === "ADMIN" || user.role === "MANAGER"

  return (
    <aside className="w-60 shrink-0 flex flex-col border-r border-border bg-sidebar">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border">
        <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-sm shadow-sm">
          C
        </div>
        <span className="font-semibold text-[15px] tracking-tight">CRM Pro</span>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto scrollbar-thin">
        <div className="space-y-0.5">
          <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Workspace
          </div>
          {mainNav.map((item) => {
            const active = pathname === item.href || pathname.startsWith(item.href + "/")
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150",
                  active
                    ? "bg-accent/10 text-accent"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full bg-accent" />
                )}
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>

        {showSettings && (
          <div className="space-y-0.5">
            <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
              Admin
            </div>
            <Link
              href="/settings"
              className={cn(
                "relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] font-medium transition-colors duration-150",
                pathname.startsWith("/settings")
                  ? "bg-accent/10 text-accent"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              {pathname.startsWith("/settings") && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-0.5 rounded-r-full bg-accent" />
              )}
              <Settings className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
              <span>Settings</span>
            </Link>
          </div>
        )}
      </nav>

      {/* User card */}
      <div className="border-t border-border p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/60 transition-colors">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className={cn("text-white text-[11px]", avatarColor(user.name))}>
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium truncate leading-tight">{user.name}</div>
            <div className="text-[11px] text-muted-foreground truncate leading-tight mt-0.5">
              {user.role.toLowerCase()}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="User menu"
            >
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => (window.location.href = "/settings")}>
                <Settings className="h-4 w-4 mr-2" /> Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
                <LogOut className="h-4 w-4 mr-2" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </aside>
  )
}
