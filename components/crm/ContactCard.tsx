"use client"

import Link from "next/link"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent } from "@/components/ui/card"
import { getInitials, avatarColor, cn } from "@/lib/utils"

interface ContactCardData {
  id: string
  name: string
  title: string | null
  company: string | null
  email: string
  tags: string[]
  activityCount?: number
}

export function ContactCard({ contact }: { contact: ContactCardData }) {
  return (
    <Link href={`/contacts/${contact.id}`}>
      <Card className="hover:border-primary/40 hover:shadow-md transition-all">
        <CardContent className="p-4 flex items-center gap-3">
          <Avatar className="h-10 w-10 shrink-0">
            <AvatarFallback className={cn("text-white text-sm", avatarColor(contact.name))}>
              {getInitials(contact.name)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <div className="font-medium truncate">{contact.name}</div>
            <div className="text-xs text-muted-foreground truncate">
              {contact.title ? `${contact.title} · ` : ""}
              {contact.company ?? contact.email}
            </div>
            {contact.tags.length > 0 && (
              <div className="flex gap-1 mt-2 flex-wrap">
                {contact.tags.slice(0, 3).map((t) => (
                  <Badge key={t} variant="secondary" className="text-[10px] px-1.5 py-0">
                    {t}
                  </Badge>
                ))}
              </div>
            )}
          </div>
          {typeof contact.activityCount === "number" && (
            <div className="text-xs text-muted-foreground shrink-0">{contact.activityCount} act.</div>
          )}
        </CardContent>
      </Card>
    </Link>
  )
}
