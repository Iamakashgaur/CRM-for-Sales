"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Briefcase, Users } from "lucide-react"
import { useCRMStore } from "@/store"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command"

interface SearchContact {
  id: string
  name: string
  company: string | null
  email: string
}

interface SearchDeal {
  id: string
  title: string
  value: number
  contact: { id: string; name: string; company: string | null } | null
}

export function CommandPalette() {
  const open = useCRMStore((s) => s.commandPaletteOpen)
  const setOpen = useCRMStore((s) => s.setCommandPaletteOpen)
  const router = useRouter()
  const [query, setQuery] = React.useState("")
  const [results, setResults] = React.useState<{ contacts: SearchContact[]; deals: SearchDeal[] }>({
    contacts: [],
    deals: [],
  })
  const [loading, setLoading] = React.useState(false)

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === "k" || e.key === "K") && (e.metaKey || e.ctrlKey)) {
        e.preventDefault()
        setOpen(!open)
      }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [open, setOpen])

  React.useEffect(() => {
    if (!query.trim()) {
      setResults({ contacts: [], deals: [] })
      return
    }
    setLoading(true)
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
        if (res.ok) {
          const data = await res.json()
          setResults({ contacts: data.contacts ?? [], deals: data.deals ?? [] })
        }
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [query])

  function go(href: string) {
    setOpen(false)
    setQuery("")
    router.push(href)
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search contacts, deals..." value={query} onValueChange={setQuery} />
      <CommandList>
        {loading && <div className="py-6 text-center text-sm text-muted-foreground">Searching...</div>}
        {!loading && query && results.contacts.length === 0 && results.deals.length === 0 && (
          <CommandEmpty>No results found.</CommandEmpty>
        )}
        {!query && (
          <CommandGroup heading="Navigation">
            <CommandItem onSelect={() => go("/dashboard")}>Go to Dashboard</CommandItem>
            <CommandItem onSelect={() => go("/contacts")}>Go to Contacts</CommandItem>
            <CommandItem onSelect={() => go("/deals")}>Go to Deals</CommandItem>
            <CommandItem onSelect={() => go("/pipeline")}>Go to Pipeline</CommandItem>
            <CommandItem onSelect={() => go("/analytics")}>Go to Analytics</CommandItem>
          </CommandGroup>
        )}
        {results.contacts.length > 0 && (
          <CommandGroup heading="Contacts">
            {results.contacts.map((c) => (
              <CommandItem key={c.id} value={`contact-${c.id}-${c.name}`} onSelect={() => go(`/contacts/${c.id}`)}>
                <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                <div className="flex flex-col">
                  <span>{c.name}</span>
                  <span className="text-xs text-muted-foreground">{c.company ?? c.email}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {results.contacts.length > 0 && results.deals.length > 0 && <CommandSeparator />}
        {results.deals.length > 0 && (
          <CommandGroup heading="Deals">
            {results.deals.map((d) => (
              <CommandItem key={d.id} value={`deal-${d.id}-${d.title}`} onSelect={() => go(`/deals/${d.id}`)}>
                <Briefcase className="h-4 w-4 mr-2 text-muted-foreground" />
                <div className="flex flex-col">
                  <span>{d.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {d.contact?.name ?? "—"} · ${d.value.toLocaleString()}
                  </span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
      </CommandList>
    </CommandDialog>
  )
}
