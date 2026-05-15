"use client"

import * as React from "react"
import Link from "next/link"
import { useQuery } from "@tanstack/react-query"
import { Plus, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { DealForm } from "@/components/crm/DealForm"
import { WinProbabilityBadge } from "@/components/crm/WinProbabilityBadge"
import { formatCurrency, formatDate, getInitials, avatarColor, cn } from "@/lib/utils"

interface DealRow {
  id: string
  title: string
  value: number
  currency: string
  stage: string
  stageId: string
  probability: number
  expectedCloseDate: string | null
  contact: { id: string; name: string; company: string | null } | null
  owner: { id: string; name: string; avatar: string | null } | null
}

export function DealsClient() {
  const [q, setQ] = React.useState("")
  const [stage, setStage] = React.useState<string>("")
  const [open, setOpen] = React.useState(false)

  const query = useQuery<{ deals: DealRow[]; total: number }>({
    queryKey: ["deals", "list", q, stage],
    queryFn: async () => {
      const p = new URLSearchParams()
      if (q) p.set("q", q)
      if (stage) p.set("stage", stage)
      p.set("limit", "200")
      const res = await fetch(`/api/deals?${p.toString()}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  const stagesQ = useQuery<{ stages: Array<{ id: string; name: string }> }>({
    queryKey: ["stages"],
    queryFn: async () => (await fetch("/api/stages")).json(),
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Deals</h1>
          <p className="text-sm text-muted-foreground">All opportunities, sortable and filterable</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />New Deal</Button>
      </div>

      <Card>
        <CardContent className="p-3 flex gap-3 flex-wrap items-center">
          <div className="relative flex-1 max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="Search deals..." value={q} onChange={(e) => setQ(e.target.value)} className="pl-9" />
          </div>
          <div className="flex gap-1 flex-wrap">
            <Badge variant={stage === "" ? "default" : "outline"} onClick={() => setStage("")} className="cursor-pointer">All</Badge>
            {(stagesQ.data?.stages ?? []).map((s) => (
              <Badge key={s.id} variant={stage === s.name ? "default" : "outline"} onClick={() => setStage(s.name)} className="cursor-pointer">
                {s.name}
              </Badge>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          {query.isLoading ? (
            <div className="p-4 space-y-2">{[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Value</TableHead>
                  <TableHead>Stage</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Probability</TableHead>
                  <TableHead>Close Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(query.data?.deals ?? []).map((d) => (
                  <TableRow key={d.id}>
                    <TableCell><Link href={`/deals/${d.id}`} className="font-medium hover:underline">{d.title}</Link></TableCell>
                    <TableCell className="font-semibold">{formatCurrency(d.value, d.currency)}</TableCell>
                    <TableCell><Badge variant="outline">{d.stage}</Badge></TableCell>
                    <TableCell className="text-sm">{d.contact?.name ?? "—"}</TableCell>
                    <TableCell>
                      {d.owner && (
                        <div className="flex items-center gap-2">
                          <Avatar className="h-6 w-6"><AvatarFallback className={cn("text-white text-[10px]", avatarColor(d.owner.name))}>{getInitials(d.owner.name)}</AvatarFallback></Avatar>
                          <span className="text-sm">{d.owner.name}</span>
                        </div>
                      )}
                    </TableCell>
                    <TableCell><WinProbabilityBadge probability={d.probability} /></TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(d.expectedCloseDate)}</TableCell>
                  </TableRow>
                ))}
                {(query.data?.deals ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">No deals</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <DealForm open={open} onOpenChange={setOpen} />
    </div>
  )
}
