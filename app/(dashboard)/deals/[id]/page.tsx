import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "@/lib/auth"
import { parseTags, formatCurrency, formatDate, daysBetween } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { ActivityFeed } from "@/components/crm/ActivityFeed"
import { AIAssistantPanel } from "@/components/crm/AIAssistantPanel"
import { DealCoachPanel } from "@/components/crm/DealCoachPanel"
import { WinProbabilityBadge } from "@/components/crm/WinProbabilityBadge"
import { StageSuggestionBanner } from "@/components/crm/StageSuggestionBanner"
import { DealDetailActions } from "./actions"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ArrowLeft, MessageSquare, Sparkles } from "lucide-react"

export const dynamic = "force-dynamic"

export default async function DealDetailPage({ params }: { params: { id: string } }) {
  const session = await getServerSession()
  if (!session) redirect("/login")

  const deal = await prisma.deal.findUnique({
    where: { id: params.id },
    include: {
      contact: true,
      owner: { select: { id: true, name: true, email: true } },
      stageRef: true,
    },
  })
  if (!deal) return notFound()
  if (session.user.role === "REP" && deal.ownerId !== session.user.id) {
    notFound()
  }

  const tags = parseTags(deal.tags)
  const days = daysBetween(deal.updatedAt)

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild><Link href="/deals"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link></Button>
      </div>

      <StageSuggestionBanner dealId={deal.id} currentStageId={deal.stageId} />

      {/* Header card — full width */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <CardTitle className="text-2xl">{deal.title}</CardTitle>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="outline" style={{ borderColor: deal.stageRef.color, color: deal.stageRef.color }}>{deal.stage}</Badge>
                <WinProbabilityBadge probability={deal.probability} />
                <span className="text-xs text-muted-foreground">Updated {days}d ago</span>
                {tags.map((t) => <Badge key={t} variant="secondary">{t}</Badge>)}
              </div>
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold text-primary tabular-nums">{formatCurrency(deal.value, deal.currency)}</div>
              {deal.expectedCloseDate && <div className="text-xs text-muted-foreground mt-1">Close: {formatDate(deal.expectedCloseDate)}</div>}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Contact</div>
              <Link href={`/contacts/${deal.contact.id}`} className="hover:underline font-medium">
                {deal.contact.name}
              </Link>
              {deal.contact.company && <div className="text-xs text-muted-foreground">{deal.contact.company}</div>}
            </div>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Owner</div>
              <div className="font-medium">{deal.owner.name}</div>
            </div>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Probability</div>
              <div className="font-medium tabular-nums">{deal.probability}%</div>
            </div>
            <div>
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Created</div>
              <div className="font-medium tabular-nums">{formatDate(deal.createdAt)}</div>
            </div>
          </div>
          {deal.notes && (
            <div className="pt-3 border-t">
              <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground mb-1">Notes</div>
              <div className="whitespace-pre-wrap">{deal.notes}</div>
            </div>
          )}
          {deal.lostReason && (
            <div className="pt-3 border-t">
              <div className="text-[10px] font-medium uppercase tracking-wider text-destructive mb-1">Lost reason</div>
              <div className="whitespace-pre-wrap text-destructive">{deal.lostReason}</div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions toolbar — full width, compact */}
      <DealDetailActions
        deal={{
          id: deal.id,
          title: deal.title,
          value: deal.value,
          currency: deal.currency,
          stageId: deal.stageId,
          contactId: deal.contactId,
          ownerId: deal.ownerId,
          probability: deal.probability,
          expectedCloseDate: deal.expectedCloseDate ? deal.expectedCloseDate.toISOString() : null,
          notes: deal.notes,
          tags,
          lostReason: deal.lostReason,
        }}
      />

      {/* Activity + AI side-by-side, both useful width */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader><CardTitle className="text-base">Activity</CardTitle></CardHeader>
            <CardContent><ActivityFeed dealId={deal.id} /></CardContent>
          </Card>
        </div>
        <div>
          <Tabs defaultValue="assistant" className="w-full">
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="assistant" className="text-xs">
                <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Assistant
              </TabsTrigger>
              <TabsTrigger value="coach" className="text-xs">
                <MessageSquare className="h-3.5 w-3.5 mr-1.5" /> Coach
              </TabsTrigger>
            </TabsList>
            <TabsContent value="assistant" className="mt-3">
              <AIAssistantPanel dealId={deal.id} />
            </TabsContent>
            <TabsContent value="coach" className="mt-3">
              <DealCoachPanel dealId={deal.id} />
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  )
}
