import { notFound } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { parseTags, formatCurrency, formatDate, daysBetween } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ActivityFeed } from "@/components/crm/ActivityFeed"
import { AIAssistantPanel } from "@/components/crm/AIAssistantPanel"
import { WinProbabilityBadge } from "@/components/crm/WinProbabilityBadge"
import { ArrowLeft } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function DealDetailPage({ params }: { params: { id: string } }) {
  const deal = await prisma.deal.findUnique({
    where: { id: params.id },
    include: {
      contact: true,
      owner: { select: { id: true, name: true, email: true } },
      stageRef: true,
    },
  })
  if (!deal) return notFound()

  const tags = parseTags(deal.tags)
  const days = daysBetween(deal.updatedAt)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild><Link href="/deals"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link></Button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="text-2xl">{deal.title}</CardTitle>
                  <div className="flex items-center gap-2 mt-2 flex-wrap">
                    <Badge variant="outline" style={{ borderColor: deal.stageRef.color, color: deal.stageRef.color }}>{deal.stage}</Badge>
                    <WinProbabilityBadge probability={deal.probability} />
                    <span className="text-xs text-muted-foreground">Updated {days}d ago</span>
                    {tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-3xl font-bold text-primary">{formatCurrency(deal.value, deal.currency)}</div>
                  {deal.expectedCloseDate && <div className="text-xs text-muted-foreground mt-1">Close: {formatDate(deal.expectedCloseDate)}</div>}
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="text-xs text-muted-foreground">Contact</div>
                  <Link href={`/contacts/${deal.contact.id}`} className="hover:underline font-medium">
                    {deal.contact.name}
                  </Link>
                  {deal.contact.company && <div className="text-xs text-muted-foreground">{deal.contact.company}</div>}
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Owner</div>
                  <div className="font-medium">{deal.owner.name}</div>
                </div>
              </div>
              {deal.notes && (
                <div className="pt-3 border-t">
                  <div className="text-xs text-muted-foreground mb-1">Notes</div>
                  <div className="whitespace-pre-wrap">{deal.notes}</div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Activity</CardTitle></CardHeader>
            <CardContent><ActivityFeed dealId={deal.id} /></CardContent>
          </Card>
        </div>

        <div className="space-y-4">
          <AIAssistantPanel dealId={deal.id} />
        </div>
      </div>
    </div>
  )
}
