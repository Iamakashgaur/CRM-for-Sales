"use client"

import * as React from "react"
import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Loader2, RefreshCw, Users, ArrowRight, Phone, Mail, Sparkles, Building2, MapPin } from "lucide-react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Skeleton } from "@/components/ui/skeleton"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { formatRelativeDate, cn } from "@/lib/utils"

interface DuplicateCandidate {
  id: string
  name: string
  email: string
  phone: string | null
  company: string | null
  city: string | null
  ownerId: string
  ownerName: string | null
  updatedAt: string
  score: number
  reason: "phone" | "email" | "semantic"
}

interface DuplicateGroup {
  canonicalId: string
  canonical: DuplicateCandidate
  candidates: DuplicateCandidate[]
  reason: "phone" | "email" | "semantic"
}

interface DuplicatesResponse {
  groups: DuplicateGroup[]
  generatedAt: string
  cached: boolean
}

const REASON_TONE: Record<DuplicateGroup["reason"], { label: string; className: string }> = {
  phone: { label: "Same phone", className: "bg-rose-50 text-rose-700 border-rose-200" },
  email: { label: "Same email", className: "bg-amber-50 text-amber-700 border-amber-200" },
  semantic: { label: "Semantic match", className: "bg-violet-50 text-violet-700 border-violet-200" },
}

export function DuplicatesClient() {
  const qc = useQueryClient()
  const [pendingMerge, setPendingMerge] = React.useState<{ keepId: string; mergeIds: string[]; label: string } | null>(null)

  const q = useQuery<DuplicatesResponse>({
    queryKey: ["duplicates"],
    queryFn: async () => {
      const res = await fetch("/api/ai/duplicates")
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed")
      return res.json()
    },
    refetchOnWindowFocus: false,
  })

  const mergeMut = useMutation({
    mutationFn: async (input: { keepId: string; mergeIds: string[] }) => {
      const res = await fetch("/api/ai/merge-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      })
      if (!res.ok) throw new Error((await res.json()).error ?? "Merge failed")
      return res.json() as Promise<{ merged: number }>
    },
    onSuccess: (data) => {
      toast.success(`Merged ${data.merged} contact${data.merged === 1 ? "" : "s"}`)
      setPendingMerge(null)
      qc.invalidateQueries({ queryKey: ["duplicates"] })
      qc.invalidateQueries({ queryKey: ["contacts"] })
      qc.invalidateQueries({ queryKey: ["contacts-meta"] })
    },
    onError: (e: Error) => {
      toast.error(e.message)
      setPendingMerge(null)
    },
  })

  const groups = q.data?.groups ?? []

  function rescan() {
    qc.invalidateQueries({ queryKey: ["duplicates"] })
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold">Duplicate Contacts</h1>
          <p className="text-sm text-muted-foreground">
            Candidate duplicates matched by phone, email, or semantic similarity (cosine &gt; 0.92).
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={rescan} disabled={q.isFetching}>
          {q.isFetching ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5 mr-1.5" />}
          Rescan
        </Button>
      </div>

      {q.isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 w-full" />)}
        </div>
      )}

      {q.isError && (
        <Card className="border-destructive/30">
          <CardContent className="py-6 text-sm text-destructive">{(q.error as Error).message}</CardContent>
        </Card>
      )}

      {!q.isLoading && !q.isError && groups.length === 0 && (
        <Card>
          <CardContent className="py-12 text-center space-y-2">
            <div className="mx-auto h-12 w-12 rounded-full bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <Users className="h-6 w-6" />
            </div>
            <div className="font-medium">No duplicates found</div>
            <p className="text-sm text-muted-foreground">
              Your contact list looks clean. If you recently added contacts, try{" "}
              <button className="underline text-foreground" onClick={rescan}>rescanning</button>{" "}
              after building the semantic index.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="space-y-3">
        {groups.map((g) => (
          <DuplicateGroupCard
            key={g.canonicalId + g.reason}
            group={g}
            onMergeAll={() =>
              setPendingMerge({
                keepId: g.canonicalId,
                mergeIds: g.candidates.map((c) => c.id),
                label: `${g.candidates.length} contact${g.candidates.length === 1 ? "" : "s"} into ${g.canonical.name}`,
              })
            }
            onMergeOne={(candidateId) =>
              setPendingMerge({
                keepId: g.canonicalId,
                mergeIds: [candidateId],
                label: `${g.candidates.find((c) => c.id === candidateId)?.name ?? "contact"} into ${g.canonical.name}`,
              })
            }
          />
        ))}
      </div>

      <ConfirmDialog
        open={pendingMerge !== null}
        onOpenChange={(o) => { if (!o) setPendingMerge(null) }}
        title="Merge contacts?"
        description={pendingMerge ? `This will merge ${pendingMerge.label}. Owned deals, calls, activities, and emails will be re-parented to the canonical contact. Cannot be undone.` : ""}
        confirmText={mergeMut.isPending ? "Merging..." : "Merge"}
        destructive
        onConfirm={() => {
          if (pendingMerge) mergeMut.mutate({ keepId: pendingMerge.keepId, mergeIds: pendingMerge.mergeIds })
        }}
      />
    </div>
  )
}

function DuplicateGroupCard({
  group,
  onMergeAll,
  onMergeOne,
}: {
  group: DuplicateGroup
  onMergeAll: () => void
  onMergeOne: (candidateId: string) => void
}) {
  const tone = REASON_TONE[group.reason]
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
        <div className="space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge variant="outline" className={cn("text-[10px]", tone.className)}>
              {group.reason === "semantic" && <Sparkles className="h-3 w-3 mr-1" />}
              {tone.label}
            </Badge>
            <span className="text-xs text-muted-foreground">
              {group.candidates.length + 1} contact{group.candidates.length === 0 ? "" : "s"}
            </span>
          </div>
          <CardTitle className="text-base">
            <Link href={`/contacts/${group.canonical.id}`} className="hover:underline">
              {group.canonical.name}
            </Link>{" "}
            <span className="text-xs font-normal text-muted-foreground">canonical</span>
          </CardTitle>
          <CardDescription className="text-xs">
            Updated {formatRelativeDate(group.canonical.updatedAt)} · owner: {group.canonical.ownerName ?? "—"}
          </CardDescription>
        </div>
        {group.candidates.length > 1 && (
          <Button size="sm" variant="outline" onClick={onMergeAll}>
            <ArrowRight className="h-3.5 w-3.5 mr-1.5" /> Merge all {group.candidates.length}
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-2">
        <ContactRow contact={group.canonical} canonical />
        {group.candidates.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            <div className="flex-1 min-w-0">
              <ContactRow contact={c} />
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => onMergeOne(c.id)}
              className="shrink-0"
            >
              <ArrowRight className="h-3.5 w-3.5 mr-1.5" /> Merge into canonical
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}

function ContactRow({ contact, canonical }: { contact: DuplicateCandidate; canonical?: boolean }) {
  return (
    <div className={cn(
      "rounded-md border p-2.5 text-xs flex items-start justify-between gap-3",
      canonical ? "bg-emerald-50/40 border-emerald-200" : "bg-muted/30"
    )}>
      <div className="min-w-0 space-y-1">
        <div className="flex items-center gap-2 flex-wrap">
          <Link href={`/contacts/${contact.id}`} className="font-medium hover:underline truncate">
            {contact.name}
          </Link>
          {canonical && <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">Keep</Badge>}
          {contact.reason === "semantic" && contact.score < 1 && (
            <span className="text-[10px] font-mono text-violet-700">{(contact.score * 100).toFixed(1)}%</span>
          )}
        </div>
        <div className="flex items-center gap-3 text-muted-foreground flex-wrap">
          {contact.company && <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" />{contact.company}</span>}
          {contact.phone && <span className="inline-flex items-center gap-1"><Phone className="h-3 w-3" />{contact.phone}</span>}
          {contact.email && <span className="inline-flex items-center gap-1 truncate"><Mail className="h-3 w-3" />{contact.email}</span>}
          {contact.city && <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{contact.city}</span>}
        </div>
      </div>
      <div className="text-[10px] text-muted-foreground shrink-0">
        {contact.ownerName ?? "—"} · {formatRelativeDate(contact.updatedAt)}
      </div>
    </div>
  )
}
