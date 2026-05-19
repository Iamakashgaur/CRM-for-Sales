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
  Inbox,
  Copy,
  FileText,
  Sparkles,
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
  { href: "/my-work", label: "My Work", icon: Inbox },
  { href: "/contacts", label: "Contacts", icon: Users },
  { href: "/deals", label: "Deals", icon: Briefcase },
  { href: "/pipeline", label: "Pipeline", icon: KanbanSquare },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/copilot", label: "Copilot", icon: Sparkles },
] as const

function roleLabel(role: string): string {
  return role.charAt(0).toUpperCase() + role.slice(1).toLowerCase()
}

export function Sidebar({ user }: SidebarProps) {
  const pathname = usePathname()
  const showSettings = user.role === "ADMIN" || user.role === "MANAGER"

  return (
    <aside className="w-[248px] shrink-0 flex flex-col border-r border-border/70 bg-sidebar">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-4 h-14 border-b border-border/70">
        <div className="relative h-9 w-9 rounded-lg bg-gradient-to-br from-amber-300 via-amber-400 to-amber-600 flex items-center justify-center shadow-sm overflow-hidden">
          <span className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent pointer-events-none" />
          <svg viewBox="0 0 24 24" className="relative h-5 w-5 text-white drop-shadow-sm" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
            <path d="M6 3h12l4 6-10 12L2 9z" />
            <path d="M2 9h20" />
            <path d="M10 3l2 6-2 12" />
            <path d="M14 3l-2 6 2 12" />
          </svg>
        </div>
        <div className="flex flex-col leading-none">
          <span className="font-semibold text-[15px] tracking-tight">Karat</span>
          <span className="text-[9px] uppercase tracking-[0.15em] text-muted-foreground mt-1">Sales CRM</span>
        </div>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-6 overflow-y-auto scrollbar-thin">
        <div className="space-y-0.5">
          <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
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
                  "relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-180 ease-out-soft",
                  active
                    ? "bg-foreground/[0.04] text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                )}
              >
                {active && (
                  <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-r-full bg-accent" />
                )}
                <Icon className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </div>

        {showSettings && (
          <div className="space-y-0.5">
            <div className="px-3 mb-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              Admin
            </div>
            <Link
              href="/reports"
              className={cn(
                "relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-180 ease-out-soft",
                pathname.startsWith("/reports")
                  ? "bg-foreground/[0.04] text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              {pathname.startsWith("/reports") && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-r-full bg-accent" />
              )}
              <FileText className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
              <span>Reports</span>
            </Link>
            <Link
              href="/duplicates"
              className={cn(
                "relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-180 ease-out-soft",
                pathname.startsWith("/duplicates")
                  ? "bg-foreground/[0.04] text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              {pathname.startsWith("/duplicates") && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-r-full bg-accent" />
              )}
              <Copy className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
              <span>Duplicates</span>
            </Link>
            <Link
              href="/settings"
              className={cn(
                "relative flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-[13px] font-medium transition-all duration-180 ease-out-soft",
                pathname.startsWith("/settings")
                  ? "bg-foreground/[0.04] text-foreground"
                  : "text-muted-foreground hover:bg-muted/60 hover:text-foreground"
              )}
            >
              {pathname.startsWith("/settings") && (
                <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[2px] rounded-r-full bg-accent" />
              )}
              <Settings className="h-[18px] w-[18px] shrink-0" strokeWidth={1.75} />
              <span>Settings</span>
            </Link>
          </div>
        )}
      </nav>

      {/* User card */}
      <div className="border-t border-border/70 p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-muted/60 transition-colors duration-180">
          <Avatar className="h-8 w-8 shrink-0">
            <AvatarFallback className="text-white text-[11px]" style={{ backgroundColor: avatarColor(user.name) }}>
              {getInitials(user.name)}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-[13px] font-medium truncate leading-tight">{user.name}</div>
            <div className="text-[10px] uppercase tracking-[0.08em] text-muted-foreground truncate leading-tight mt-1">
              {roleLabel(user.role)}
            </div>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger
              className="h-7 w-7 rounded-md flex items-center justify-center text-muted-foreground hover:bg-muted hover:text-foreground transition-colors duration-180"
              aria-label="User menu"
            >
              <MoreHorizontal className="h-4 w-4" strokeWidth={1.75} />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => (window.location.href = "/settings")}>
                <Settings className="h-4 w-4 mr-2" strokeWidth={1.75} /> Settings
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>
                <LogOut className="h-4 w-4 mr-2" strokeWidth={1.75} /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    </aside>
  )
}
