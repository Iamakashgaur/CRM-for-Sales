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
import { ContactForm } from "@/components/crm/ContactForm"
import { getInitials, avatarColor, cn, formatDate } from "@/lib/utils"

interface ContactRow {
  id: string
  name: string
  email: string
  company: string | null
  title: string | null
  tags: string[]
  updatedAt: string
}

export function ContactsClient() {
  const [q, setQ] = React.useState("")
  const [page, setPage] = React.useState(1)
  const [open, setOpen] = React.useState(false)

  const query = useQuery<{ contacts: ContactRow[]; total: number; pages: number; page: number }>({
    queryKey: ["contacts", q, page],
    queryFn: async () => {
      const params = new URLSearchParams()
      if (q) params.set("q", q)
      params.set("page", String(page))
      const res = await fetch(`/api/contacts?${params.toString()}`)
      if (!res.ok) throw new Error("Failed")
      return res.json()
    },
  })

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Contacts</h1>
          <p className="text-sm text-muted-foreground">All your B2B contacts in one place</p>
        </div>
        <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4 mr-2" />New Contact</Button>
      </div>

      <Card>
        <CardContent className="p-3">
          <div className="relative max-w-md">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search by name, email, company..."
              value={q}
              onChange={(e) => { setQ(e.target.value); setPage(1) }}
              className="pl-9"
            />
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
                  <TableHead>Name</TableHead>
                  <TableHead>Company</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Tags</TableHead>
                  <TableHead>Updated</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(query.data?.contacts ?? []).map((c) => (
                  <TableRow key={c.id} className="cursor-pointer">
                    <TableCell>
                      <Link href={`/contacts/${c.id}`} className="flex items-center gap-3">
                        <Avatar className="h-8 w-8">
                          <AvatarFallback className={cn("text-white text-xs", avatarColor(c.name))}>{getInitials(c.name)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium">{c.name}</div>
                          {c.title && <div className="text-xs text-muted-foreground">{c.title}</div>}
                        </div>
                      </Link>
                    </TableCell>
                    <TableCell className="text-sm">{c.company ?? "—"}</TableCell>
                    <TableCell className="text-sm">{c.email}</TableCell>
                    <TableCell>
                      <div className="flex gap-1 flex-wrap">
                        {c.tags.slice(0, 2).map((t) => <Badge key={t} variant="secondary" className="text-[10px]">{t}</Badge>)}
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{formatDate(c.updatedAt)}</TableCell>
                  </TableRow>
                ))}
                {(query.data?.contacts ?? []).length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">No contacts</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {query.data && query.data.pages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">Page {query.data.page} of {query.data.pages} · {query.data.total} contacts</span>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page >= query.data.pages} onClick={() => setPage(page + 1)}>Next</Button>
          </div>
        </div>
      )}

      <ContactForm open={open} onOpenChange={setOpen} />
    </div>
  )
}
