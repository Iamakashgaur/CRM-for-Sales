import { notFound } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { parseTags, getInitials, avatarColor, cn, formatCurrency, formatDate } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { ActivityFeed } from "@/components/crm/ActivityFeed"
import { Mail, Phone, Globe, Linkedin } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function ContactDetailPage({ params }: { params: { id: string } }) {
  const contact = await prisma.contact.findUnique({
    where: { id: params.id },
    include: {
      deals: { include: { owner: { select: { name: true } } } },
      owner: { select: { id: true, name: true } },
    },
  })
  if (!contact) return notFound()

  const tags = parseTags(contact.tags)

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Avatar className="h-16 w-16">
          <AvatarFallback className={cn("text-white text-lg", avatarColor(contact.name))}>{getInitials(contact.name)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold">{contact.name}</h1>
          <p className="text-sm text-muted-foreground">{contact.title ? `${contact.title} · ` : ""}{contact.company ?? ""}</p>
          <div className="flex gap-2 mt-2 flex-wrap">
            {tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
            {contact.source && <Badge variant="outline">{contact.source}</Badge>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="deals">Deals ({contact.deals.length})</TabsTrigger>
              <TabsTrigger value="activities">Activities</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <Card>
                <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
                <CardContent className="space-y-3 text-sm">
                  <div className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted-foreground" /><a href={`mailto:${contact.email}`} className="hover:underline">{contact.email}</a></div>
                  {contact.phone && <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{contact.phone}</div>}
                  {contact.website && <div className="flex items-center gap-2"><Globe className="h-4 w-4 text-muted-foreground" /><a href={contact.website} target="_blank" rel="noreferrer" className="hover:underline">{contact.website}</a></div>}
                  {contact.linkedinUrl && <div className="flex items-center gap-2"><Linkedin className="h-4 w-4 text-muted-foreground" /><a href={contact.linkedinUrl} target="_blank" rel="noreferrer" className="hover:underline">LinkedIn</a></div>}
                  {contact.notes && <div className="pt-2 border-t text-muted-foreground whitespace-pre-wrap">{contact.notes}</div>}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="deals">
              <Card>
                <CardContent className="p-0">
                  {contact.deals.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center p-8">No deals yet</div>
                  ) : (
                    <ul className="divide-y">
                      {contact.deals.map((d) => (
                        <li key={d.id}>
                          <Link href={`/deals/${d.id}`} className="flex items-center gap-3 p-4 hover:bg-accent/40">
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{d.title}</div>
                              <div className="text-xs text-muted-foreground">{d.stage} · {d.owner.name}</div>
                            </div>
                            <div className="text-sm font-semibold">{formatCurrency(d.value, d.currency)}</div>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
            <TabsContent value="activities">
              <Card>
                <CardContent className="pt-6">
                  <ActivityFeed contactId={contact.id} />
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader><CardTitle className="text-base">Owner</CardTitle></CardHeader>
            <CardContent className="text-sm">{contact.owner.name}</CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle className="text-base">Meta</CardTitle></CardHeader>
            <CardContent className="space-y-1 text-xs text-muted-foreground">
              <div>Created {formatDate(contact.createdAt)}</div>
              <div>Updated {formatDate(contact.updatedAt)}</div>
            </CardContent>
          </Card>
          <Button variant="outline" className="w-full" asChild>
            <Link href="/contacts">Back to contacts</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
