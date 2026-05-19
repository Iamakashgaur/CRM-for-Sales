import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "@/lib/auth"
import { parseTags, getInitials, avatarColor, formatCurrency, formatDate } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Button } from "@/components/ui/button"
import { ActivityFeed } from "@/components/crm/ActivityFeed"
import { ContactDetailActions } from "./actions"
import { Mail, Phone, Globe, Linkedin, MapPin } from "lucide-react"

export const dynamic = "force-dynamic"

function stripStructuredLines(notes: string | null): string | null {
  if (!notes) return null
  const stripped = notes
    .split("\n")
    .filter((l) => !/^(City|State|PIN|Address|Alt phone|Social):/i.test(l.trim()))
    .join("\n")
    .trim()
  return stripped || null
}

export default async function ContactDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession()
  if (!session) redirect("/login")

  const contact = await prisma.contact.findUnique({
    where: { id: params.id },
    include: {
      deals: { include: { owner: { select: { name: true } } } },
      owner: { select: { id: true, name: true } },
      callLogs: { orderBy: { at: "desc" }, take: 20, include: { user: { select: { name: true } } } },
    },
  })
  if (!contact) return notFound()
  if (session.user.role === "REP" && contact.ownerId !== session.user.id) {
    notFound()
  }

  const tags = parseTags(contact.tags)
  const cleanNotes = stripStructuredLines(contact.notes)
  const address = [contact.addressLine1, contact.addressLine2].filter(Boolean).join(", ")

  return (
    <div className="space-y-6">
      <div className="flex items-start gap-4">
        <Avatar className="h-16 w-16">
          <AvatarFallback className="text-white text-lg" style={{ backgroundColor: avatarColor(contact.name) }}>{getInitials(contact.name)}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h1 className="text-2xl font-bold">{contact.name}</h1>
          <p className="text-sm text-muted-foreground">{contact.title ? `${contact.title} · ` : ""}{contact.company ?? ""}</p>
          <div className="flex gap-2 mt-2 flex-wrap">
            {tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
            {contact.source && <Badge variant="outline">{contact.source}</Badge>}
            {contact.zone && <Badge variant="outline">Zone: {contact.zone}</Badge>}
            {contact.type && <Badge variant="outline">{contact.type}</Badge>}
            {contact.category && <Badge variant="outline">{contact.category}</Badge>}
            {contact.dnc && <Badge className="bg-red-50 text-red-700 border border-red-200">DNC</Badge>}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Tabs defaultValue="overview">
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="deals">Deals ({contact.deals.length})</TabsTrigger>
              <TabsTrigger value="calls">Calls ({contact.callLogs.length})</TabsTrigger>
              <TabsTrigger value="activities">Activities</TabsTrigger>
            </TabsList>
            <TabsContent value="overview">
              <Card>
                <CardHeader><CardTitle className="text-base">Details</CardTitle></CardHeader>
                <CardContent className="space-y-4 text-sm">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
                    <div className="flex items-center gap-2">
                      <Mail className="h-4 w-4 text-muted-foreground" />
                      <a href={`mailto:${contact.email}`} className="hover:underline">{contact.email}</a>
                    </div>
                    {contact.phone && (
                      <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{contact.phone}</div>
                    )}
                    {contact.phoneSecondary && (
                      <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{contact.phoneSecondary} <span className="text-xs text-muted-foreground">(alt)</span></div>
                    )}
                    {contact.altPhone && (
                      <div className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted-foreground" />{contact.altPhone} <span className="text-xs text-muted-foreground">(alt)</span></div>
                    )}
                    {contact.website && (
                      <div className="flex items-center gap-2"><Globe className="h-4 w-4 text-muted-foreground" /><a href={contact.website} target="_blank" rel="noreferrer noopener" className="hover:underline">{contact.website}</a></div>
                    )}
                    {contact.linkedinUrl && (
                      <div className="flex items-center gap-2"><Linkedin className="h-4 w-4 text-muted-foreground" /><a href={contact.linkedinUrl} target="_blank" rel="noreferrer noopener" className="hover:underline">LinkedIn</a></div>
                    )}
                    {contact.socialUrl && contact.socialUrl !== contact.linkedinUrl && (
                      <div className="flex items-center gap-2"><Linkedin className="h-4 w-4 text-muted-foreground" /><a href={contact.socialUrl} target="_blank" rel="noreferrer noopener" className="hover:underline">Social</a></div>
                    )}
                    {(contact.city || contact.state || contact.pinCode) && (
                      <div className="flex items-center gap-2 md:col-span-2">
                        <MapPin className="h-4 w-4 text-muted-foreground" />
                        <span>{[contact.city, contact.state, contact.pinCode].filter(Boolean).join(", ")}</span>
                      </div>
                    )}
                    {address && (
                      <div className="md:col-span-2 text-muted-foreground">
                        <div className="text-[11px] uppercase font-semibold tracking-wider mb-0.5">Address</div>
                        <div>{address}</div>
                      </div>
                    )}
                    {contact.callStatus && (
                      <div><span className="text-muted-foreground">Last call status:</span> {contact.callStatus}</div>
                    )}
                    {contact.followUpStatus && (
                      <div><span className="text-muted-foreground">Follow-up:</span> {contact.followUpStatus}</div>
                    )}
                    {contact.lastContactDate && (
                      <div><span className="text-muted-foreground">Last contact:</span> {formatDate(contact.lastContactDate)}</div>
                    )}
                    {contact.nextFollowUpDate && (
                      <div>
                        <span className="text-muted-foreground">Next follow-up:</span> {formatDate(contact.nextFollowUpDate)}
                        {contact.nextFollowUpTime ? ` at ${contact.nextFollowUpTime}` : ""}
                      </div>
                    )}
                  </div>
                  {cleanNotes && <div className="pt-3 border-t text-muted-foreground whitespace-pre-wrap">{cleanNotes}</div>}
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
            <TabsContent value="calls">
              <Card>
                <CardContent className="p-0">
                  {contact.callLogs.length === 0 ? (
                    <div className="text-sm text-muted-foreground text-center p-8">No calls logged yet</div>
                  ) : (
                    <ul className="divide-y">
                      {contact.callLogs.map((c) => (
                        <li key={c.id} className="p-4">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-sm font-medium">{c.status}</span>
                            <span className="text-xs text-muted-foreground">{formatDate(c.at)}</span>
                          </div>
                          {c.notes && <p className="text-xs text-muted-foreground mt-1">{c.notes}</p>}
                          {c.user?.name && <p className="text-[11px] text-muted-foreground mt-1">by {c.user.name}</p>}
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
          <ContactDetailActions
            contact={{
              id: contact.id,
              name: contact.name,
              email: contact.email,
              phone: contact.phone,
              phoneSecondary: contact.phoneSecondary,
              company: contact.company,
              title: contact.title,
              source: contact.source,
              notes: cleanNotes,
              linkedinUrl: contact.linkedinUrl,
              socialUrl: contact.socialUrl,
              website: contact.website,
              city: contact.city,
              state: contact.state,
              pinCode: contact.pinCode,
              addressLine1: contact.addressLine1,
              addressLine2: contact.addressLine2,
              zone: contact.zone,
              type: contact.type,
              category: contact.category,
              tags,
              ownerId: contact.ownerId,
            }}
          />
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
