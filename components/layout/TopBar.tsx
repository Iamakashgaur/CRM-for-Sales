"use client"

import * as React from "react"
import { signOut } from "next-auth/react"
import { usePathname } from "next/navigation"
import { Search, ChevronDown } from "lucide-react"
import { useCRMStore } from "@/store"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { NotificationsDropdown } from "./NotificationsDropdown"
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

function pageTitleFromPath(pathname: string): string {
  const segments = pathname.split("/").filter(Boolean)
  if (segments.length === 0) return "Dashboard"
  const first = segments[0]
  return first.charAt(0).toUpperCase() + first.slice(1)
}

export function TopBar({ user }: TopBarProps) {
  const setPaletteOpen = useCRMStore((s) => s.setCommandPaletteOpen)
  const pathname = usePathname()
  const title = pageTitleFromPath(pathname)
  const [scrolled, setScrolled] = React.useState(false)

  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  return (
    <header
      className={cn(
        "sticky top-0 z-30 h-14 flex items-center px-6 gap-4 bg-background/80 backdrop-blur-md transition-all duration-180",
        "border-b border-border/70",
        scrolled && "shadow-[0_1px_0_0_hsl(var(--border)/0.5)]"
      )}
    >
      {/* Page title */}
      <div className="flex items-center min-w-0">
        <h1 className="text-base font-semibold tracking-tight truncate">{title}</h1>
      </div>

      {/* Search pill */}
      <div className="flex-1 flex justify-center">
        <button
          type="button"
          onClick={() => setPaletteOpen(true)}
          className="group inline-flex items-center gap-2.5 w-80 max-w-full rounded-full bg-muted/60 hover:bg-muted px-4 py-1.5 text-[13px] text-muted-foreground transition-all duration-180 ease-out-soft hover:shadow-xs"
        >
          <Search className="h-4 w-4 shrink-0" strokeWidth={1.75} />
          <span className="flex-1 text-left">Search anything...</span>
          <kbd className="pointer-events-none inline-flex h-5 select-none items-center gap-0.5 rounded border border-border bg-background px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            <span className="text-[11px]">⌘</span>K
          </kbd>
        </button>
      </div>

      {/* Right cluster */}
      <div className="flex items-center gap-1">
        <NotificationsDropdown />
        <div className="h-6 w-px bg-border/70 mx-1.5" aria-hidden="true" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="flex items-center gap-1.5 rounded-full pl-0.5 pr-2 py-0.5 hover:bg-muted/60 transition-colors duration-180"
              aria-label="User menu"
            >
              <Avatar className="h-8 w-8">
                <AvatarFallback className="text-white text-[11px]" style={{ backgroundColor: avatarColor(user.name) }}>
                  {getInitials(user.name)}
                </AvatarFallback>
              </Avatar>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.75} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>
              <div className="font-medium text-[13px]">{user.name}</div>
              <div className="text-[11px] text-muted-foreground font-normal mt-0.5">{user.email}</div>
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
