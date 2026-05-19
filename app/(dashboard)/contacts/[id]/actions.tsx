"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { toast } from "sonner"
import { Pencil, Trash2, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ContactForm } from "@/components/crm/ContactForm"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"

interface ContactInput {
  id: string
  name: string
  email: string
  phone: string | null
  phoneSecondary: string | null
  company: string | null
  title: string | null
  source: string | null
  notes: string | null
  linkedinUrl: string | null
  socialUrl: string | null
  website: string | null
  city: string | null
  state: string | null
  pinCode: string | null
  addressLine1: string | null
  addressLine2: string | null
  zone: string | null
  type: string | null
  category: string | null
  tags: string[]
  ownerId: string
}

export function ContactDetailActions({ contact }: { contact: ContactInput }) {
  const router = useRouter()
  const qc = useQueryClient()
  const [editOpen, setEditOpen] = React.useState(false)
  const [confirmOpen, setConfirmOpen] = React.useState(false)

  const deleteMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/contacts/${contact.id}`, { method: "DELETE" })
      if (!res.ok) throw new Error((await res.json()).error ?? "Failed")
      return res.json()
    },
    onSuccess: () => {
      toast.success("Contact deleted")
      qc.invalidateQueries({ queryKey: ["contacts"] })
      router.push("/contacts")
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <div className="flex gap-2">
      <Button variant="outline" className="flex-1" onClick={() => setEditOpen(true)}>
        <Pencil className="h-4 w-4 mr-2" /> Edit
      </Button>
      <Button variant="destructive" className="flex-1" onClick={() => setConfirmOpen(true)} disabled={deleteMut.isPending}>
        {deleteMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Trash2 className="h-4 w-4 mr-2" /> Delete</>}
      </Button>
      <ContactForm open={editOpen} onOpenChange={setEditOpen} initial={contact} />
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Delete contact?"
        description={`Delete contact "${contact.name}"? This cannot be undone.`}
        confirmText="Delete"
        destructive
        onConfirm={() => { setConfirmOpen(false); deleteMut.mutate() }}
      />
    </div>
  )
}
