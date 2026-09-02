"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { Briefcase, Users, Sparkles, Loader2, Wand2 } from "lucide-react"
import { toast } from "sonner"
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
  score?: number
}

interface SearchDeal {
  id: string
  title: string
  value: number
  contact: { id: string; name: string; company: string | null } | null
}

interface SemanticSearchContact {
  id: string
  name: string
  email: string
  company: string | null
  score: number
}

export function CommandPalette() {
  const open = useCRMStore((s) => s.commandPaletteOpen)
  const setOpen = useCRMStore((s) => s.setCommandPaletteOpen)
  const router = useRouter()
  const [query, setQuery] = React.useState("")
  const [semantic, setSemantic] = React.useState(false)
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
        if (semantic) {
          const res = await fetch(`/api/ai/semantic-search?q=${encodeURIComponent(query)}`)
          if (res.ok) {
            const data = (await res.json()) as { results?: SemanticSearchContact[] }
            const contacts: SearchContact[] = (data.results ?? []).map((r) => ({
              id: r.id,
              name: r.name,
              email: r.email,
              company: r.company,
              score: r.score,
            }))
            setResults({ contacts, deals: [] })
          }
        } else {
          const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`)
          if (res.ok) {
            const data = await res.json()
            setResults({ contacts: data.contacts ?? [], deals: data.deals ?? [] })
          }
        }
      } finally {
        setLoading(false)
      }
    }, 250)
    return () => clearTimeout(t)
  }, [query, semantic])

  function go(href: string) {
    setOpen(false)
    setQuery("")
    router.push(href)
  }

  const [aiLoading, setAiLoading] = React.useState(false)
  async function runAISearch() {
    if (!query.trim()) return
    setAiLoading(true)
    try {
      const res = await fetch("/api/ai/parse-query", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ q: query }),
      })
      const data = await res.json() as { filters?: Record<string, string | boolean>; error?: string }
      if (!res.ok) {
        toast.error(data.error ?? "AI parse failed")
        return
      }
      const params = new URLSearchParams()
      if (data.filters) {
        for (const [k, v] of Object.entries(data.filters)) {
          if (v !== undefined && v !== null && String(v).length > 0) {
            params.set(k, String(v))
          }
        }
      }
      const url = params.toString() ? `/contacts?${params.toString()}` : "/contacts"
      go(url)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setAiLoading(false)
    }
  }

  const showAIOption = query.trim().length >= 3 && query.split(/\s+/).filter(Boolean).length >= 2

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput
        placeholder={semantic ? "Semantic search (meaning-aware)..." : "Search contacts, deals..."}
        value={query}
        onValueChange={setQuery}
      />
      <div className="flex items-center justify-between px-3 py-1.5 border-b text-xs">
        <button
          type="button"
          onClick={() => setSemantic((v) => !v)}
          className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 transition-colors ${
            semantic
              ? "bg-violet-50 text-violet-700 border border-violet-200"
              : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <Wand2 className="h-3 w-3" />
          {semantic ? "Semantic search: ON" : "Semantic search: OFF"}
        </button>
        <span className="text-muted-foreground">
          {semantic ? "by meaning" : "by text"}
        </span>
      </div>
      <CommandList>
        {showAIOption && (
          <CommandGroup heading="AI Search">
            <CommandItem value={`ai-search-${query}`} onSelect={runAISearch}>
              {aiLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin text-violet-600" />
              ) : (
                <Sparkles className="h-4 w-4 mr-2 text-violet-600" />
              )}
              <div className="flex flex-col">
                <span>Search with AI: &quot;{query}&quot;</span>
                <span className="text-xs text-muted-foreground">Parse to structured filters</span>
              </div>
            </CommandItem>
          </CommandGroup>
        )}
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
          <CommandGroup heading={semantic ? "Contacts (semantic)" : "Contacts"}>
            {results.contacts.map((c) => (
              <CommandItem key={c.id} value={`contact-${c.id}-${c.name}`} onSelect={() => go(`/contacts/${c.id}`)}>
                <Users className="h-4 w-4 mr-2 text-muted-foreground" />
                <div className="flex flex-col flex-1 min-w-0">
                  <span className="truncate">{c.name}</span>
                  <span className="text-xs text-muted-foreground truncate">{c.company ?? c.email}</span>
                </div>
                {typeof c.score === "number" && (
                  <span className="text-[10px] font-mono rounded bg-violet-50 text-violet-700 border border-violet-200 px-1.5 py-0.5 ml-2">
                    {(c.score * 100).toFixed(0)}%
                  </span>
                )}
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
