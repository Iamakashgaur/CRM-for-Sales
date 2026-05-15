"use client"

import * as React from "react"
import { signOut } from "next-auth/react"
import { usePathname } from "next/navigation"
import { Bell, Search, ChevronRight } from "lucide-react"
import { useCRMStore } from "@/store"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { getInitials, avatarColor, cn } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

interface TopBarProps {
  user: { name: string; email: string }
}

function titleize(seg: string) {
  return seg.charAt(0).toUpperCase() + seg.slice(1)
}

export function TopBar({ user }: TopBarProps) {
  const setPaletteOpen = useCRMStore((s) => s.setCommandPaletteOpen)
  const pathname = usePathname()
  const segments = pathname.split("/").filter(Boolean)
  const crumbs = segments.slice(0, 2)

  return (
    <header className="sticky top-0 z-30 h-14 border-b border-border bg-background/80 backdrop-blur-md flex items-center px-6 gap-4">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-1.5 text-sm min-w-0">
        {crumbs.length === 0 ? (
          <span className="font-medium text-foreground">Dashboard</span>
        ) : (
          crumbs.map((seg, i) => {
            const isLast = i === crumbs.length - 1
            return (
              <React.Fragment key={seg + i}>
                {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-muted-foreground/60" />}
                <span
                  className={cn(
                    "truncate",
                    isLast ? "font-medium text-foreground" : "text-muted-foreground"
                  )}
                >
                  {titleize(seg)}
                </span>
              </React.Fragment>
            )
          })
        )}
      </nav>

      {/* Search button */}
      <div className="flex-1 flex justify-center">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="group inline-flex items-center gap-2.5 w-80 max-w-full rounded-full bg-muted/70 hover:bg-muted px-4 py-1.5 text-sm text-muted-foreground transition-colors"
        >
          <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span className="flex-1 text-left">Search...</span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <span>⌘</span>K
          </kbd>
        </button>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="rounded-full h-9 w-9" aria-label="Notifications">
          <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="rounded-full p-0.5 hover:bg-muted/60 transition-colors"
              aria-label="User menu"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className={cn("text-white text-[11px]", avatarColor(user.name))}>
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="font-medium">{user.name}</div>
              <div className="text-xs text-muted-foreground font-normal">{user.email}</div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => (window.location.href = "/settings")}>Settings</DropdownMenuItem>
            <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/login" })}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  )
}
