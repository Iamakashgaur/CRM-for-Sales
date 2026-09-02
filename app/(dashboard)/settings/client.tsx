"use client"

import * as React from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { useSession } from "next-auth/react"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Skeleton } from "@/components/ui/skeleton"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { ConfirmDialog } from "@/components/ui/confirm-dialog"
import { Mail, MoreHorizontal, Plus, Trash2, Pencil, KeyRound, Upload, Database, Loader2, AlertTriangle, Sparkles, CheckCircle2, XCircle, MessageCircle } from "lucide-react"
import { toast } from "sonner"

interface Stage { id: string; name: string; order: number; color: string; probability: number }
interface UserRow { id: string; name: string; email: string; role: string }

export function SettingsClient({ role, userName, userEmail }: { role: string; userName: string; userEmail: string }) {
  const isAdmin = role === "ADMIN"
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-sm text-muted-foreground">Manage your profile, team, pipeline stages, and integrations</p>
      </div>
      <Tabs defaultValue="profile">
        <TabsList>
          <TabsTrigger value="profile">Profile</TabsTrigger>
          {isAdmin && <TabsTrigger value="users">Users</TabsTrigger>}
          <TabsTrigger value="stages">Stages</TabsTrigger>
          <TabsTrigger value="email">Email Sync</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          {isAdmin && <TabsTrigger value="ai">AI</TabsTrigger>}
          {isAdmin && <TabsTrigger value="data">Data</TabsTrigger>}
        </TabsList>
        <TabsContent value="profile">
          <ProfileTab role={role} userName={userName} userEmail={userEmail} />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="users">
            <UsersTab />
          </TabsContent>
        )}
        <TabsContent value="stages">
          <StagesTab />
        </TabsContent>
        <TabsContent value="email">
          <EmailSyncTab />
        </TabsContent>
        <TabsContent value="integrations">
          <IntegrationsTab />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="ai">
            <AITab />
          </TabsContent>
        )}
        {isAdmin && (
          <TabsContent value="data">
            <DataTab />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

function ProfileTab({ role, userName, userEmail }: { role: string; userName: string; userEmail: string }) {
  const { data: session, update: updateSession } = useSession()
  const [name, setName] = React.useState(userName)

  React.useEffect(() => {
    setName(userName)
  }, [userName])

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!session?.user?.id) throw new Error("Not signed in")
      const res = await fetch(`/api/users/${session.user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim() }),
      })
      if (!res.ok) {
        const err = (await res.json()).error ?? "Save failed"
        throw new Error(typeof err === "string" ? err : "Save failed")
      }
      return res.json() as Promise<{ id: string; name: string; email: string; role: string }>
    },
    onSuccess: async (data) => {
      toast.success("Profile saved")
      await updateSession({ ...session, user: { ...session?.user, name: data.name } })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const trimmed = name.trim()
  const disabled = trimmed.length === 0 || trimmed === userName || saveMut.isPending

  return (
    <Card>
      <CardHeader><CardTitle>Profile</CardTitle><CardDescription>Your account info</CardDescription></CardHeader>
      <CardContent className="space-y-3 max-w-md">
        <div className="space-y-2"><Label>Name</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="space-y-2"><Label>Email</Label><Input defaultValue={userEmail} disabled /></div>
        <div className="space-y-2"><Label>Role</Label><Input defaultValue={role} disabled /></div>
        <Button onClick={() => saveMut.mutate()} disabled={disabled}>
          {saveMut.isPending ? "Saving..." : "Save"}
        </Button>
      </CardContent>
    </Card>
  )
}

function UsersTab() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editUser, setEditUser] = React.useState<UserRow | null>(null)
  const [pwUser, setPwUser] = React.useState<UserRow | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState<UserRow | null>(null)

  const q = useQuery<{ users: UserRow[] }>({
    queryKey: ["users"],
    queryFn: async () => (await fetch("/api/users")).json(),
  })

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/users/${id}`, { method: "DELETE" })
      if (!r.ok) throw new Error((await r.json()).error || "Delete failed")
    },
    onSuccess: () => { toast.success("User deleted"); qc.invalidateQueries({ queryKey: ["users"] }) },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Users</CardTitle>
          <CardDescription>Team members in your workspace</CardDescription>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Add User
        </Button>
      </CardHeader>
      <CardContent className="p-0">
        {q.isLoading ? (
          <div className="p-4 space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {(q.data?.users ?? []).map((u) => (
                <TableRow key={u.id}>
                  <TableCell className="font-medium">{u.name}</TableCell>
                  <TableCell>{u.email}</TableCell>
                  <TableCell>
                    <Badge variant={u.role === "ADMIN" ? "default" : u.role === "MANAGER" ? "secondary" : "outline"}>
                      {u.role}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-8 w-8">
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem onClick={() => setEditUser(u)}>
                          <Pencil className="h-4 w-4 mr-2" /> Edit
                        </DropdownMenuItem>
                        <DropdownMenuItem onClick={() => setPwUser(u)}>
                          <KeyRound className="h-4 w-4 mr-2" /> Change password
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onClick={() => setConfirmDelete(u)}
                        >
                          <Trash2 className="h-4 w-4 mr-2" /> Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>

      <UserCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <UserEditDialog user={editUser} onOpenChange={(o) => !o && setEditUser(null)} />
      <UserPasswordDialog user={pwUser} onOpenChange={(o) => !o && setPwUser(null)} />
      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null) }}
        title="Delete user?"
        description={confirmDelete ? `Delete ${confirmDelete.name}?` : undefined}
        confirmText="Delete"
        destructive
        onConfirm={() => {
          if (confirmDelete) {
            delMut.mutate(confirmDelete.id)
            setConfirmDelete(null)
          }
        }}
      />
    </Card>
  )
}

function UserCreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [role, setRole] = React.useState("REP")

  const mut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, password, role }),
      })
      if (!r.ok) throw new Error((await r.json()).error || "Create failed")
      return r.json()
    },
    onSuccess: () => {
      toast.success("User created")
      qc.invalidateQueries({ queryKey: ["users"] })
      setName(""); setEmail(""); setPassword(""); setRole("REP")
      onOpenChange(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add User</DialogTitle>
          <DialogDescription>Create a new team member account</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@crm.com" />
          </div>
          <div className="space-y-1.5">
            <Label>Password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 chars" />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="MANAGER">Manager</SelectItem>
                <SelectItem value="REP">Sales Rep</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={!name || !email || !password || mut.isPending}>
            {mut.isPending ? "Creating..." : "Create User"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UserEditDialog({ user, onOpenChange }: { user: UserRow | null; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const [name, setName] = React.useState("")
  const [email, setEmail] = React.useState("")
  const [role, setRole] = React.useState("REP")

  React.useEffect(() => {
    if (user) { setName(user.name); setEmail(user.email); setRole(user.role) }
  }, [user])

  const mut = useMutation({
    mutationFn: async () => {
      if (!user) return
      const r = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, role }),
      })
      if (!r.ok) throw new Error((await r.json()).error || "Update failed")
    },
    onSuccess: () => {
      toast.success("User updated")
      qc.invalidateQueries({ queryKey: ["users"] })
      onOpenChange(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit User</DialogTitle>
          <DialogDescription>Update name, email, or role</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Email</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Role</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ADMIN">Admin</SelectItem>
                <SelectItem value="MANAGER">Manager</SelectItem>
                <SelectItem value="REP">Sales Rep</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function UserPasswordDialog({ user, onOpenChange }: { user: UserRow | null; onOpenChange: (o: boolean) => void }) {
  const [password, setPassword] = React.useState("")

  React.useEffect(() => { if (user) setPassword("") }, [user])

  const mut = useMutation({
    mutationFn: async () => {
      if (!user) return
      const r = await fetch(`/api/users/${user.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      })
      if (!r.ok) throw new Error((await r.json()).error || "Password change failed")
    },
    onSuccess: () => { toast.success("Password updated"); onOpenChange(false) },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open={!!user} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change Password</DialogTitle>
          <DialogDescription>{user?.email}</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>New password</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Min 8 chars" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={password.length < 8 || mut.isPending}>
            {mut.isPending ? "Updating..." : "Update Password"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StagesTab() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editStage, setEditStage] = React.useState<Stage | null>(null)
  const [confirmDelete, setConfirmDelete] = React.useState<Stage | null>(null)

  const q = useQuery<{ stages: Stage[] }>({
    queryKey: ["stages"],
    queryFn: async () => (await fetch("/api/stages")).json(),
  })

  const delMut = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/stages/${id}`, { method: "DELETE" })
      if (!r.ok) throw new Error((await r.json()).error || "Delete failed")
    },
    onSuccess: () => { toast.success("Stage deleted"); qc.invalidateQueries({ queryKey: ["stages"] }) },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Pipeline Stages</CardTitle>
          <CardDescription>Stages in your sales pipeline</CardDescription>
        </div>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> Add Stage
        </Button>
      </CardHeader>
      <CardContent>
        {q.isLoading ? (
          <div className="space-y-2">{[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-10" />)}</div>
        ) : (
          <ul className="space-y-2">
            {(q.data?.stages ?? []).map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-md border p-3">
                <span className="h-4 w-4 rounded" style={{ background: s.color }} />
                <span className="font-medium">{s.name}</span>
                <Badge variant="outline" className="ml-auto">{s.probability}%</Badge>
                <Badge variant="secondary">order {s.order}</Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-8 w-8">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => setEditStage(s)}>
                      <Pencil className="h-4 w-4 mr-2" /> Edit
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => setConfirmDelete(s)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Delete
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <StageCreateDialog open={createOpen} onOpenChange={setCreateOpen} nextOrder={(q.data?.stages?.length ?? 0) + 1} />
      <StageEditDialog stage={editStage} stages={q.data?.stages ?? []} onOpenChange={(o) => !o && setEditStage(null)} />
      <ConfirmDialog
        open={confirmDelete !== null}
        onOpenChange={(o) => { if (!o) setConfirmDelete(null) }}
        title="Delete stage?"
        description={confirmDelete ? `Delete stage "${confirmDelete.name}"?` : undefined}
        confirmText="Delete"
        destructive
        onConfirm={() => {
          if (confirmDelete) {
            delMut.mutate(confirmDelete.id)
            setConfirmDelete(null)
          }
        }}
      />
    </Card>
  )
}

function StageCreateDialog({ open, onOpenChange, nextOrder }: { open: boolean; onOpenChange: (o: boolean) => void; nextOrder: number }) {
  const qc = useQueryClient()
  const [name, setName] = React.useState("")
  const [color, setColor] = React.useState("#6366f1")
  const [probability, setProbability] = React.useState(50)
  const [order, setOrder] = React.useState(nextOrder)

  React.useEffect(() => { if (open) setOrder(nextOrder) }, [open, nextOrder])

  const mut = useMutation({
    mutationFn: async () => {
      const r = await fetch("/api/stages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color, probability, order }),
      })
      if (!r.ok) throw new Error((await r.json()).error || "Create failed")
    },
    onSuccess: () => {
      toast.success("Stage created")
      qc.invalidateQueries({ queryKey: ["stages"] })
      setName(""); setColor("#6366f1"); setProbability(50)
      onOpenChange(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Stage</DialogTitle>
          <DialogDescription>New pipeline stage</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Discovery" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 rounded border border-input cursor-pointer" />
                <Input value={color} onChange={(e) => setColor(e.target.value)} className="font-mono" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Probability (%)</Label>
              <Input type="number" min={0} max={100} value={probability} onChange={(e) => setProbability(Number(e.target.value))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Order</Label>
            <Input type="number" min={1} value={order} onChange={(e) => setOrder(Number(e.target.value))} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={!name || mut.isPending}>
            {mut.isPending ? "Creating..." : "Create Stage"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function StageEditDialog({ stage, stages, onOpenChange }: { stage: Stage | null; stages: Stage[]; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const [name, setName] = React.useState("")
  const [color, setColor] = React.useState("#6366f1")
  const [probability, setProbability] = React.useState(50)
  const [order, setOrder] = React.useState(1)

  React.useEffect(() => {
    if (stage) { setName(stage.name); setColor(stage.color); setProbability(stage.probability); setOrder(stage.order) }
  }, [stage])

  const conflict = stage
    ? stages.find((s) => s.id !== stage.id && s.order === order)
    : null

  const mut = useMutation({
    mutationFn: async () => {
      if (!stage) return
      const r = await fetch(`/api/stages/${stage.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, color, probability, order }),
      })
      if (!r.ok) throw new Error((await r.json()).error || "Update failed")
    },
    onSuccess: () => {
      toast.success("Stage updated")
      qc.invalidateQueries({ queryKey: ["stages"] })
      onOpenChange(false)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  return (
    <Dialog open={!!stage} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Stage</DialogTitle>
          <DialogDescription>Update stage properties</DialogDescription>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex items-center gap-2">
                <input type="color" value={color} onChange={(e) => setColor(e.target.value)} className="h-9 w-12 rounded border border-input cursor-pointer" />
                <Input value={color} onChange={(e) => setColor(e.target.value)} className="font-mono" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Probability (%)</Label>
              <Input type="number" min={0} max={100} value={probability} onChange={(e) => setProbability(Number(e.target.value))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Order</Label>
            <Input type="number" min={1} value={order} onChange={(e) => setOrder(Number(e.target.value))} />
            {conflict && (
              <p className="text-xs text-amber-600">
                Order {order} is currently used by &quot;{conflict.name}&quot;. Saving will swap their orders.
              </p>
            )}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={() => mut.mutate()} disabled={mut.isPending}>
            {mut.isPending ? "Saving..." : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function EmailSyncTab() {
  const q = useQuery<{ configured: boolean }>({
    queryKey: ["resend-status"],
    queryFn: async () => (await fetch("/api/email/send")).json(),
  })
  const configured = q.data?.configured ?? false
  return (
    <Card>
      <CardHeader>
        <CardTitle>Email Sending</CardTitle>
        <CardDescription>Send emails to contacts via Resend</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg border p-4">
          <div className={`h-10 w-10 rounded-full flex items-center justify-center ${configured ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
            <Mail className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="font-medium text-sm">Resend</div>
            <div className="text-xs text-muted-foreground">
              {configured ? "Connected. Send buttons enabled across CRM." : "Not configured. Add RESEND_API_KEY to .env"}
            </div>
          </div>
          <Badge variant={configured ? "default" : "outline"}>{configured ? "Active" : "Setup needed"}</Badge>
        </div>
        {!configured && (
          <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
            <div className="font-medium">Setup steps</div>
            <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-xs">
              <li>Sign up at <a href="https://resend.com" target="_blank" rel="noreferrer noopener" className="text-foreground underline">resend.com</a></li>
              <li>API Keys → Create API Key → copy</li>
              <li>Add to <code className="bg-background px-1 py-0.5 rounded">.env</code>:
                <pre className="mt-1 bg-background p-2 rounded border text-foreground font-mono">RESEND_API_KEY=re_xxx{"\n"}RESEND_FROM=onboarding@resend.dev</pre>
              </li>
              <li>Restart dev server: <code className="bg-background px-1 py-0.5 rounded">npm run dev</code></li>
            </ol>
            <div className="text-xs text-muted-foreground pt-1">
              Free tier: 100/day, 3000/month. To send from your own domain, verify it in Resend dashboard.
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function IntegrationsTab() {
  const q = useQuery<{
    configured: boolean
    verifyTokenConfigured: boolean
    businessAccountConfigured: boolean
  }>({
    queryKey: ["whatsapp-status"],
    queryFn: async () => {
      const r = await fetch("/api/whatsapp/send")
      if (!r.ok) return { configured: false, verifyTokenConfigured: false, businessAccountConfigured: false }
      return r.json()
    },
  })

  const status = q.data
  const baseUrl = typeof window !== "undefined" ? window.location.origin : ""
  const webhookUrl = `${baseUrl}/api/whatsapp/webhook`

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><MessageCircle className="h-5 w-5 text-emerald-600" /> WhatsApp Cloud API</CardTitle>
        <CardDescription>Send and receive WhatsApp messages via Meta Business Cloud API</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 rounded-lg border p-4">
          <div className={`h-10 w-10 rounded-full flex items-center justify-center ${status?.configured ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
            <MessageCircle className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <div className="font-medium text-sm">WhatsApp Cloud</div>
            <div className="text-xs text-muted-foreground">
              {status?.configured ? "Connected. Send messages from contact panel." : "Not configured. Add env vars below."}
            </div>
          </div>
          <Badge variant={status?.configured ? "default" : "outline"}>
            {status?.configured ? "Active" : "Setup required"}
          </Badge>
        </div>

        <div className="rounded-lg border bg-muted/30 p-4 space-y-3 text-sm">
          <div className="font-medium">Environment variables checklist</div>
          <ul className="space-y-1.5 text-xs">
            <li className="flex items-center gap-2">
              {status?.configured ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-amber-600" />}
              <code className="bg-background px-1 py-0.5 rounded">WHATSAPP_API_TOKEN</code>
              <span className="text-muted-foreground">— permanent access token from Meta Business</span>
            </li>
            <li className="flex items-center gap-2">
              {status?.configured ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-amber-600" />}
              <code className="bg-background px-1 py-0.5 rounded">WHATSAPP_PHONE_NUMBER_ID</code>
              <span className="text-muted-foreground">— phone number ID</span>
            </li>
            <li className="flex items-center gap-2">
              {status?.verifyTokenConfigured ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-amber-600" />}
              <code className="bg-background px-1 py-0.5 rounded">WHATSAPP_VERIFY_TOKEN</code>
              <span className="text-muted-foreground">— webhook verification token</span>
            </li>
            <li className="flex items-center gap-2">
              {status?.businessAccountConfigured ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /> : <XCircle className="h-3.5 w-3.5 text-amber-600" />}
              <code className="bg-background px-1 py-0.5 rounded">WHATSAPP_BUSINESS_ACCOUNT_ID</code>
              <span className="text-muted-foreground">— optional, for template management</span>
            </li>
          </ul>
        </div>

        <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
          <div className="font-medium">Webhook URL</div>
          <div className="flex items-center gap-2">
            <code className="bg-background px-2 py-1 rounded text-xs flex-1 font-mono truncate">{webhookUrl}</code>
            <Button
              size="sm"
              variant="outline"
              onClick={() => { navigator.clipboard.writeText(webhookUrl); toast.success("Copied") }}
            >
              Copy
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Configure this URL in Meta Developer Console → WhatsApp → Configuration. Subscribe to <code className="bg-background px-1 rounded">messages</code> field.
            HTTPS required — use ngrok or deploy to production.
          </p>
        </div>

        <div className="rounded-lg border bg-muted/30 p-4 space-y-2 text-sm">
          <div className="font-medium">Setup steps</div>
          <ol className="list-decimal list-inside space-y-1 text-muted-foreground text-xs">
            <li>Create a Meta Business Account at <a className="text-foreground underline" href="https://business.facebook.com" target="_blank" rel="noreferrer">business.facebook.com</a></li>
            <li>Create a WhatsApp Business App in <a className="text-foreground underline" href="https://developers.facebook.com" target="_blank" rel="noreferrer">developers.facebook.com</a></li>
            <li>Register a phone number and request a permanent System User access token</li>
            <li>Add the env vars above to your <code className="bg-background px-1 py-0.5 rounded">.env</code> and restart</li>
            <li>Configure webhook URL above; subscribe to <code className="bg-background px-1 rounded">messages</code></li>
            <li>Test by sending a message from a verified test number</li>
          </ol>
        </div>
      </CardContent>
    </Card>
  )
}

type WipeTarget = "contacts" | "deals" | "activities" | "callLogs" | "aiInsights" | "all"

interface AdminStats {
  contacts: number
  deals: number
  activities: number
  callLogs: number
  aiInsights: number
  users: number
}

function DataTab() {
  const qc = useQueryClient()
  const [importOpen, setImportOpen] = React.useState(false)
  const [importFile, setImportFile] = React.useState<File | null>(null)
  const [mapPreview, setMapPreview] = React.useState<{ headers: string[]; samples: Record<string, unknown>[]; map: Record<string, string | null>; confidence: number } | null>(null)
  const [mapLoading, setMapLoading] = React.useState(false)
  const [confirmWipe, setConfirmWipe] = React.useState<WipeTarget | null>(null)
  const [confirmText, setConfirmText] = React.useState("")

  const statsQ = useQuery<AdminStats>({
    queryKey: ["admin-stats"],
    queryFn: async () => {
      const r = await fetch("/api/admin/stats")
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed")
      return r.json()
    },
  })

  const importMut = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData()
      fd.append("file", file)
      const r = await fetch("/api/contacts/import", { method: "POST", body: fd })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? "Import failed")
      return data as { imported: number; skipped: number; duplicates?: number; total: number }
    },
    onSuccess: (d) => {
      const dup = d.duplicates ?? 0
      toast.success(`Imported ${d.imported} of ${d.total} (${d.skipped} skipped, ${dup} duplicates)`)
      qc.invalidateQueries({ queryKey: ["contacts"] })
      qc.invalidateQueries({ queryKey: ["contacts-meta"] })
      qc.invalidateQueries({ queryKey: ["admin-stats"] })
      setImportOpen(false)
      setImportFile(null)
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const wipeMut = useMutation({
    mutationFn: async (target: WipeTarget) => {
      const r = await fetch("/api/admin/wipe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ target, confirm: "DELETE" }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? "Wipe failed")
      return data as { ok: true; target: WipeTarget; deleted: Record<string, number> }
    },
    onSuccess: (d) => {
      const totals = Object.entries(d.deleted).map(([k, v]) => `${v} ${k}`).join(", ")
      toast.success(`Wiped ${d.target}: ${totals}`)
      qc.invalidateQueries({ queryKey: ["admin-stats"] })
      qc.invalidateQueries({ queryKey: ["contacts"] })
      qc.invalidateQueries({ queryKey: ["deals"] })
      qc.invalidateQueries({ queryKey: ["contacts-meta"] })
      setConfirmWipe(null)
      setConfirmText("")
    },
    onError: (e: Error) => { toast.error(e.message); setConfirmWipe(null); setConfirmText("") },
  })

  const stats = statsQ.data
  const wipeOptions: Array<{ target: WipeTarget; label: string; description: string; count?: number; destructive?: "warn" | "danger" }> = [
    { target: "aiInsights", label: "Clear AI Insights", description: "Delete cached AI scores, suggestions, drafts", count: stats?.aiInsights, destructive: "warn" },
    { target: "callLogs", label: "Clear Call History", description: "Delete all call log entries", count: stats?.callLogs, destructive: "warn" },
    { target: "activities", label: "Clear Activities", description: "Delete all calls/emails/meetings/notes/tasks", count: stats?.activities, destructive: "warn" },
    { target: "deals", label: "Delete All Deals", description: "Removes every deal + related AI insights. Keeps contacts", count: stats?.deals, destructive: "danger" },
    { target: "contacts", label: "Delete All Contacts", description: "Removes contacts + deals + activities + call logs + emails (cascades)", count: stats?.contacts, destructive: "danger" },
    { target: "all", label: "Wipe All Data", description: "Nuclear: removes everything except users + stages + config", destructive: "danger" },
  ]

  return (
    <div className="space-y-4">
      {/* Stats */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Database className="h-5 w-5" /> Database</CardTitle>
          <CardDescription>Record counts across all tables</CardDescription>
        </CardHeader>
        <CardContent>
          {statsQ.isLoading ? (
            <div className="grid grid-cols-3 gap-2">{[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-16" />)}</div>
          ) : (
            <div className="grid grid-cols-3 gap-2 text-sm">
              {stats && [
                ["Contacts", stats.contacts],
                ["Deals", stats.deals],
                ["Activities", stats.activities],
                ["Call Logs", stats.callLogs],
                ["AI Insights", stats.aiInsights],
                ["Users", stats.users],
              ].map(([label, val]) => (
                <div key={label as string} className="rounded-md border bg-card p-3">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
                  <div className="text-2xl font-semibold tabular-nums mt-1">{(val as number).toLocaleString()}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* AI Auto-categorize */}
      <AICategorizeCard />

      {/* Semantic search index */}
      <SemanticIndexCard />

      {/* DNC signal scanner */}
      <DncSignalScanCard />

      {/* Import */}
      <Card>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div>
            <CardTitle>Import Contacts</CardTitle>
            <CardDescription>Upload CSV or Excel (xlsx/xls) — max 10MB, 50k rows</CardDescription>
          </div>
          <Button size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-4 w-4 mr-1.5" /> Import
          </Button>
        </CardHeader>
        <CardContent className="text-xs text-muted-foreground space-y-1">
          <p>Recognized columns: name, email, phone (or mobile), phoneSecondary (or &quot;phone no&quot;), company, title, source, city, state, zone, type, pinCode, addressLine1, addressLine2, website, social, notes</p>
          <p>Duplicates skipped by (owner, email). Email lowercased automatically.</p>
        </CardContent>
      </Card>

      {/* Danger zone */}
      <Card className="border-destructive/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> Danger Zone
          </CardTitle>
          <CardDescription>Destructive actions. Type DELETE to confirm. No undo.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {wipeOptions.map((o) => (
            <div key={o.target} className="flex items-center justify-between gap-3 rounded-md border p-3">
              <div className="min-w-0">
                <div className="font-medium text-sm flex items-center gap-2">
                  {o.label}
                  {o.count != null && <Badge variant="secondary" className="text-[10px] tabular-nums">{o.count.toLocaleString()}</Badge>}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{o.description}</div>
              </div>
              <Button
                size="sm"
                variant={o.destructive === "danger" ? "destructive" : "outline"}
                onClick={() => { setConfirmWipe(o.target); setConfirmText("") }}
                disabled={wipeMut.isPending}
              >
                {wipeMut.isPending && wipeMut.variables === o.target ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </Button>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Import dialog */}
      <Dialog open={importOpen} onOpenChange={(o) => { setImportOpen(o); if (!o) { setImportFile(null); setMapPreview(null) } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import Contacts</DialogTitle>
            <DialogDescription>CSV / Excel file. First row = headers. Existing duplicates (owner + email) skipped.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-2">
              <Label>File</Label>
              <Input type="file" accept=".csv,.xlsx,.xls" onChange={(e) => { setImportFile(e.target.files?.[0] ?? null); setMapPreview(null) }} />
              {importFile && <p className="text-xs text-muted-foreground">{importFile.name} · {(importFile.size / 1024).toFixed(1)} KB</p>}
            </div>
            {importFile && (
              <Button
                size="sm"
                variant="outline"
                className="border-violet-200 text-violet-700 hover:bg-violet-50 hover:text-violet-700"
                disabled={mapLoading}
                onClick={async () => {
                  setMapLoading(true)
                  try {
                    const XLSX = await import("xlsx")
                    const buf = await importFile.arrayBuffer()
                    const wb = XLSX.read(buf, { type: "array" })
                    const sheet = wb.Sheets[wb.SheetNames[0]]
                    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" })
                    const headers = rows.length > 0 ? Object.keys(rows[0]) : []
                    const samples = rows.slice(0, 3)
                    const res = await fetch("/api/ai/import-map", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ headers, samples }),
                    })
                    const data = await res.json()
                    if (!res.ok) throw new Error(data.error ?? "Failed")
                    setMapPreview({ headers, samples, map: data.map, confidence: data.confidence })
                  } catch (e) {
                    toast.error((e as Error).message)
                  } finally {
                    setMapLoading(false)
                  }
                }}
              >
                {mapLoading ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Analyzing...</> : <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> AI Preview Mapping</>}
              </Button>
            )}
            {mapPreview && (
              <div className="rounded-md border bg-muted/30 p-3 space-y-2 max-h-60 overflow-y-auto">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">AI Suggested Mapping</span>
                  <Badge variant="outline" className="text-[10px]">Confidence: {Math.round(mapPreview.confidence * 100)}%</Badge>
                </div>
                <ul className="space-y-1 text-xs">
                  {Object.entries(mapPreview.map).map(([field, header]) => (
                    <li key={field} className="flex justify-between gap-2">
                      <span className="text-muted-foreground tabular-nums">{field}</span>
                      <span className={header ? "font-mono font-medium" : "text-muted-foreground/60 italic"}>
                        {header ?? "no match"}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="text-[10px] text-muted-foreground italic pt-2 border-t">
                  Preview only. The import backend uses built-in column matching.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setImportOpen(false)}>Cancel</Button>
            <Button disabled={!importFile || importMut.isPending} onClick={() => importFile && importMut.mutate(importFile)}>
              {importMut.isPending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Importing...</> : "Import"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Wipe confirm dialog */}
      <Dialog open={confirmWipe !== null} onOpenChange={(o) => { if (!o) { setConfirmWipe(null); setConfirmText("") } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="text-destructive flex items-center gap-2">
              <AlertTriangle className="h-5 w-5" /> Confirm destructive action
            </DialogTitle>
            <DialogDescription>
              {confirmWipe && wipeOptions.find((w) => w.target === confirmWipe)?.description}
              <br />
              <span className="font-medium text-foreground">This cannot be undone.</span>
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Type <code className="bg-muted px-1 py-0.5 rounded text-destructive font-mono">DELETE</code> to confirm</Label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="DELETE"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setConfirmWipe(null); setConfirmText("") }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={confirmText !== "DELETE" || wipeMut.isPending}
              onClick={() => confirmWipe && wipeMut.mutate(confirmWipe)}
            >
              {wipeMut.isPending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Deleting...</> : "Delete forever"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AICategorizeCard() {
  const qc = useQueryClient()
  const [confirmOpen, setConfirmOpen] = React.useState(false)
  const [running, setRunning] = React.useState(false)
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)

  const statusQ = useQuery<{ uncategorized: number }>({
    queryKey: ["ai-bulk-categorize-status"],
    queryFn: async () => {
      const r = await fetch("/api/ai/bulk-categorize")
      if (!r.ok) return { uncategorized: 0 }
      return r.json()
    },
  })

  async function run() {
    setConfirmOpen(false)
    setRunning(true)
    setErrorMsg(null)
    let totalProcessed = 0
    const initial = statusQ.data?.uncategorized ?? 0
    setProgress({ done: 0, total: initial })
    try {
      for (let i = 0; i < 10; i++) {
        const r = await fetch("/api/ai/bulk-categorize", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ batchSize: 50 }),
        })
        const data = await r.json() as { processed: number; updated: number; remaining: number; error?: string }
        if (!r.ok) {
          setErrorMsg(data.error ?? "Failed")
          break
        }
        totalProcessed += data.updated
        setProgress({ done: totalProcessed, total: Math.max(initial, totalProcessed + data.remaining) })
        if (data.remaining === 0 || data.processed === 0) break
      }
      toast.success(`Categorized ${totalProcessed} contacts`)
      qc.invalidateQueries({ queryKey: ["ai-bulk-categorize-status"] })
      qc.invalidateQueries({ queryKey: ["contacts"] })
      qc.invalidateQueries({ queryKey: ["contacts-meta"] })
    } catch (e) {
      setErrorMsg((e as Error).message)
      toast.error((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  const uncategorized = statusQ.data?.uncategorized ?? 0

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-violet-500" /> AI Auto-categorize</CardTitle>
          <CardDescription>
            {statusQ.isLoading ? "Checking..." : `${uncategorized.toLocaleString()} contacts uncategorized`}
          </CardDescription>
        </div>
        <Button size="sm" onClick={() => setConfirmOpen(true)} disabled={running || uncategorized === 0}>
          {running ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
          {running ? "Running..." : "Run AI categorization"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          AI will classify contacts as Hot Lead, Warm Lead, Cold Lead, Existing Client, Prospect, or Not Relevant based on their company, type, zone, and source.
        </p>
        {progress && (
          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium tabular-nums">Categorized {progress.done.toLocaleString()} / {progress.total.toLocaleString()}</span>
            </div>
            <div className="h-1.5 bg-background rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 transition-all duration-300"
                style={{ width: `${Math.min(100, progress.total === 0 ? 0 : (progress.done / progress.total) * 100)}%` }}
              />
            </div>
          </div>
        )}
        {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}
      </CardContent>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Run AI categorization?</DialogTitle>
            <DialogDescription>
              Up to 500 contacts will be categorized per run (10 batches of 50). This uses AI tokens.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>Cancel</Button>
            <Button onClick={run}>Run</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

function SemanticIndexCard() {
  const qc = useQueryClient()
  const [running, setRunning] = React.useState(false)
  const [progress, setProgress] = React.useState<{ done: number; total: number } | null>(null)
  const [errorMsg, setErrorMsg] = React.useState<string | null>(null)

  const statusQ = useQuery<{ total: number; indexed: number; remaining: number }>({
    queryKey: ["ai-semantic-status"],
    queryFn: async () => {
      const r = await fetch("/api/ai/embed-contacts")
      if (!r.ok) return { total: 0, indexed: 0, remaining: 0 }
      return r.json()
    },
  })

  const total = statusQ.data?.total ?? 0
  const indexed = statusQ.data?.indexed ?? 0
  const remaining = statusQ.data?.remaining ?? 0

  async function run() {
    setRunning(true)
    setErrorMsg(null)
    let done = indexed
    setProgress({ done, total: Math.max(total, 1) })
    try {
      // Run up to 50 batches per click (50 * 50 = 2500 contacts).
      for (let i = 0; i < 50; i++) {
        const r = await fetch("/api/ai/embed-contacts", { method: "POST" })
        const data = (await r.json()) as { processed: number; remaining: number; total: number; indexed: number; error?: string }
        if (!r.ok) {
          setErrorMsg(data.error ?? "Failed")
          break
        }
        done = data.indexed
        setProgress({ done, total: data.total })
        if (data.processed === 0 || data.remaining === 0) break
      }
      toast.success(`Indexed ${done.toLocaleString()} contacts`)
      qc.invalidateQueries({ queryKey: ["ai-semantic-status"] })
    } catch (e) {
      setErrorMsg((e as Error).message)
      toast.error((e as Error).message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-violet-500" /> Semantic Search Index</CardTitle>
          <CardDescription>
            {statusQ.isLoading
              ? "Checking..."
              : `${indexed.toLocaleString()} / ${total.toLocaleString()} contacts indexed`}
          </CardDescription>
        </div>
        <Button size="sm" onClick={run} disabled={running || remaining === 0}>
          {running ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : <Sparkles className="h-4 w-4 mr-1.5" />}
          {running ? "Indexing..." : remaining === 0 ? "Up to date" : "Build / Update Index"}
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        <p className="text-xs text-muted-foreground">
          Generates embeddings used by semantic search in the command palette. Uses OpenRouter embeddings when configured, otherwise a deterministic hash-based fallback that still groups similar contacts.
        </p>
        {progress && (
          <div className="rounded-md border bg-muted/30 p-3 text-xs space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Progress</span>
              <span className="font-medium tabular-nums">Indexed {progress.done.toLocaleString()} / {progress.total.toLocaleString()}</span>
            </div>
            <div className="h-1.5 bg-background rounded-full overflow-hidden">
              <div
                className="h-full bg-violet-500 transition-all duration-300"
                style={{ width: `${Math.min(100, progress.total === 0 ? 0 : (progress.done / progress.total) * 100)}%` }}
              />
            </div>
          </div>
        )}
        {errorMsg && <p className="text-xs text-destructive">{errorMsg}</p>}
      </CardContent>
    </Card>
  )
}

type AICatalogProvider = "anthropic" | "openrouter" | "groq"

type AICatalogTier = "fast" | "balanced" | "premium" | "free"

type AICatalogFeature = "chat" | "tools" | "vision" | "long-context"

interface AICatalogEntry {
  id: string
  label: string
  provider: AICatalogProvider
  tier: AICatalogTier
  features: AICatalogFeature[]
  costHint: string
  notes?: string
}

interface AITaskDescriptor {
  key: string
  label: string
  description: string
}

interface AIConfigResponse {
  provider: AICatalogProvider
  model: string
  anthropicKey: string
  openrouterKey: string
  groqKey: string
  anthropicConfigured: boolean
  openrouterConfigured: boolean
  groqConfigured: boolean
  defaults: { anthropic: string; openrouter: string; groq: string }
  taskModels: Record<string, string | undefined>
  catalog: AICatalogEntry[]
  tasks: AITaskDescriptor[]
}

interface DncSignal { source: string; snippet: string; severity: "low" | "medium" | "high"; matched: string; at: string }
interface DncDetection { contactId: string; contactName: string; contactEmail: string; signals: DncSignal[]; suggestedAction: "flag-dnc" | "review" }

function DncSignalScanCard() {
  const [scanning, setScanning] = React.useState(false)
  const [detections, setDetections] = React.useState<DncDetection[]>([])
  const [scanned, setScanned] = React.useState<number | null>(null)
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set())
  const [applying, setApplying] = React.useState<string | null>(null)
  const qc = useQueryClient()

  async function scan() {
    setScanning(true)
    try {
      const r = await fetch("/api/ai/scan-dnc-signals", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({}) })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? "Scan failed")
      setDetections(data.detections as DncDetection[])
      setScanned(data.scanned as number)
      setDismissed(new Set())
      toast.success(`Scanned ${data.scanned} contacts, ${data.detections.length} with signals`)
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setScanning(false)
    }
  }

  async function applyDnc(contactId: string, reason: string) {
    setApplying(contactId)
    try {
      const r = await fetch("/api/ai/auto-flag-dnc", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, confirm: true, reason }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? "Failed")
      toast.success("Contact flagged DNC")
      setDetections((d) => d.filter((x) => x.contactId !== contactId))
      qc.invalidateQueries({ queryKey: ["contacts"] })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setApplying(null)
    }
  }

  const visible = detections.filter((d) => !dismissed.has(d.contactId))

  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5 text-amber-600" /> DNC Signal Detection</CardTitle>
          <CardDescription>
            Scan recent emails, call notes, and WhatsApp messages for unsubscribe / negative-sentiment phrases.
          </CardDescription>
        </div>
        <Button size="sm" onClick={scan} disabled={scanning}>
          {scanning ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> Scanning...</> : <><Sparkles className="h-3.5 w-3.5 mr-1.5" /> Run DNC scan</>}
        </Button>
      </CardHeader>
      <CardContent>
        {scanned !== null && visible.length === 0 && (
          <p className="text-sm text-muted-foreground">Scanned {scanned} contacts — no DNC signals detected.</p>
        )}
        {visible.length > 0 && (
          <ul className="space-y-2">
            {visible.map((d) => {
              const top = d.signals[0]
              const tone = d.suggestedAction === "flag-dnc"
                ? "bg-rose-50 text-rose-700 border-rose-200"
                : "bg-amber-50 text-amber-700 border-amber-200"
              return (
                <li key={d.contactId} className="rounded-md border bg-card p-3 space-y-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">{d.contactName}</div>
                      <div className="text-[11px] text-muted-foreground truncate">{d.contactEmail}</div>
                    </div>
                    <Badge variant="outline" className={`text-[10px] ${tone}`}>
                      {d.suggestedAction === "flag-dnc" ? "Strong signal" : "Review"}
                    </Badge>
                  </div>
                  <div className="space-y-1">
                    {d.signals.slice(0, 2).map((s, i) => (
                      <div key={i} className="text-[11px] text-muted-foreground">
                        <span className="font-medium uppercase mr-1.5">[{s.source}]</span>
                        <span className="italic">&ldquo;{s.snippet}&rdquo;</span>
                        <Badge variant="outline" className="ml-1.5 text-[9px]">{s.matched}</Badge>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant="destructive"
                      onClick={() => applyDnc(d.contactId, top?.matched ?? "signal detected")}
                      disabled={applying === d.contactId}
                    >
                      {applying === d.contactId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Apply DNC"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setDismissed((s) => new Set(s).add(d.contactId))}
                    >
                      Dismiss
                    </Button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

const TIER_COLORS: Record<AICatalogTier, string> = {
  fast: "bg-sky-100 text-sky-800 border-sky-200",
  balanced: "bg-violet-100 text-violet-800 border-violet-200",
  premium: "bg-amber-100 text-amber-800 border-amber-200",
  free: "bg-emerald-100 text-emerald-800 border-emerald-200",
}

const CUSTOM_MODEL_TOKEN = "__custom__"
const USE_DEFAULT_TOKEN = "__default__"

function ModelTierBadge({ tier }: { tier: AICatalogTier }) {
  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0 text-[10px] font-medium uppercase ${TIER_COLORS[tier]}`}>
      {tier}
    </span>
  )
}

function ModelDropdown({
  value,
  onChange,
  catalog,
  provider,
  placeholder,
  includeDefault,
}: {
  value: string
  onChange: (v: string) => void
  catalog: AICatalogEntry[]
  provider: AICatalogProvider
  placeholder: string
  includeDefault?: boolean
}) {
  const options = React.useMemo(
    () => catalog.filter((m) => m.provider === provider),
    [catalog, provider]
  )
  const selectionToken = !value
    ? includeDefault
      ? USE_DEFAULT_TOKEN
      : ""
    : options.some((m) => m.id === value)
      ? value
      : CUSTOM_MODEL_TOKEN

  return (
    <Select
      value={selectionToken}
      onValueChange={(v) => {
        if (v === USE_DEFAULT_TOKEN) onChange("")
        else if (v === CUSTOM_MODEL_TOKEN) onChange(value || "")
        else onChange(v)
      }}
    >
      <SelectTrigger>
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent>
        {includeDefault && (
          <SelectItem value={USE_DEFAULT_TOKEN}>
            <span className="text-muted-foreground">Use default</span>
          </SelectItem>
        )}
        {options.map((m) => (
          <SelectItem key={m.id} value={m.id}>
            <span className="flex items-center gap-2">
              <span className="font-medium">{m.label}</span>
              <span className="text-[10px] uppercase text-muted-foreground tracking-wide">{m.tier}</span>
              <span className="text-[11px] text-muted-foreground">· {m.costHint}</span>
            </span>
          </SelectItem>
        ))}
        <SelectItem value={CUSTOM_MODEL_TOKEN}>
          <span className="text-muted-foreground">Use custom model ID...</span>
        </SelectItem>
      </SelectContent>
    </Select>
  )
}

function AITab() {
  const qc = useQueryClient()
  const [provider, setProvider] = React.useState<AICatalogProvider>("anthropic")
  const [model, setModel] = React.useState("")
  const [taskModels, setTaskModels] = React.useState<Record<string, string>>({})
  const [anthropicKey, setAnthropicKey] = React.useState("")
  const [openrouterKey, setOpenrouterKey] = React.useState("")
  const [groqKey, setGroqKey] = React.useState("")
  const [testResult, setTestResult] = React.useState<{ ok: boolean; reply?: string; error?: string } | null>(null)
  const [tasksOpen, setTasksOpen] = React.useState(false)

  const q = useQuery<AIConfigResponse>({
    queryKey: ["ai-config"],
    queryFn: async () => (await fetch("/api/admin/ai-config")).json(),
  })

  React.useEffect(() => {
    if (q.data) {
      setProvider(q.data.provider)
      setModel(q.data.model)
      setAnthropicKey(q.data.anthropicKey)
      setOpenrouterKey(q.data.openrouterKey)
      setGroqKey(q.data.groqKey)
      const next: Record<string, string> = {}
      for (const [k, v] of Object.entries(q.data.taskModels ?? {})) {
        if (typeof v === "string" && v.length > 0) next[k] = v
      }
      setTaskModels(next)
    }
  }, [q.data])

  const cfg = q.data
  const catalog = cfg?.catalog ?? []
  const tasks = cfg?.tasks ?? []

  const currentModelEntry = React.useMemo(
    () => catalog.find((m) => m.id === model && m.provider === provider),
    [catalog, model, provider]
  )
  const useCustomDefault = model.length > 0 && !currentModelEntry

  const saveMut = useMutation({
    mutationFn: async () => {
      const payload: {
        provider: AICatalogProvider
        model: string
        anthropicKey?: string
        openrouterKey?: string
        groqKey?: string
        taskModels: Record<string, string | null>
      } = {
        provider,
        model,
        taskModels: Object.fromEntries(
          tasks.map((t) => [t.key, taskModels[t.key] && taskModels[t.key].length > 0 ? taskModels[t.key] : null])
        ),
      }
      if (!anthropicKey.includes("•")) payload.anthropicKey = anthropicKey
      if (!openrouterKey.includes("•")) payload.openrouterKey = openrouterKey
      if (!groqKey.includes("•")) payload.groqKey = groqKey
      const r = await fetch("/api/admin/ai-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!r.ok) throw new Error((await r.json()).error ?? "Save failed")
      return r.json()
    },
    onSuccess: () => {
      toast.success("AI config saved")
      qc.invalidateQueries({ queryKey: ["ai-config"] })
    },
    onError: (e: Error) => toast.error(e.message),
  })

  const testMut = useMutation({
    mutationFn: async () => {
      await saveMut.mutateAsync()
      // Test the default model first.
      const r = await fetch("/api/admin/ai-config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error ?? "Test failed")
      const defaultResult = data as { ok: boolean; provider: string; model: string; reply: string; error?: string }

      // Test each configured task model so admins know overrides actually work.
      const overrideTasks = Object.entries(taskModels).filter(([, v]) => v && v.length > 0)
      const taskResults: Array<{ task: string; ok: boolean; model: string; error?: string }> = []
      for (const [taskKey] of overrideTasks) {
        const rr = await fetch("/api/admin/ai-config", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ task: taskKey }),
        })
        const dd = await rr.json()
        taskResults.push({
          task: taskKey,
          ok: Boolean(dd.ok),
          model: typeof dd.model === "string" ? dd.model : "",
          error: typeof dd.error === "string" ? dd.error : undefined,
        })
      }

      return { defaultResult, taskResults }
    },
    onSuccess: (d) => {
      setTestResult({ ok: d.defaultResult.ok, reply: d.defaultResult.reply, error: d.defaultResult.error })
      if (d.defaultResult.ok) {
        toast.success(`Default ${d.defaultResult.provider} (${d.defaultResult.model}) responding`)
      } else {
        toast.error(d.defaultResult.error ?? "Default model not responding")
      }
      for (const tr of d.taskResults) {
        if (tr.ok) toast.success(`Task "${tr.task}" via ${tr.model} OK`)
        else toast.error(`Task "${tr.task}" failed: ${tr.error ?? "no response"}`)
      }
    },
    onError: (e: Error) => { setTestResult({ ok: false, error: e.message }); toast.error(e.message) },
  })

  const isConfigured = !cfg ? false
    : provider === "anthropic" ? cfg.anthropicConfigured
    : provider === "openrouter" ? cfg.openrouterConfigured
    : cfg.groqConfigured

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> AI Provider</CardTitle>
          <CardDescription>Choose which AI service powers deal scoring, suggestions, and email drafts.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {q.isLoading ? (
            <div className="space-y-2">{[1, 2, 3].map((i) => <Skeleton key={i} className="h-10" />)}</div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Active provider</Label>
                <Select value={provider} onValueChange={(v) => {
                  const p = v as AICatalogProvider
                  setProvider(p)
                  if (cfg) setModel(cfg.defaults[p])
                }}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="anthropic">Anthropic (Claude direct){cfg?.anthropicConfigured ? " — configured" : ""}</SelectItem>
                    <SelectItem value="openrouter">OpenRouter (200+ models){cfg?.openrouterConfigured ? " — configured" : ""}</SelectItem>
                    <SelectItem value="groq">Groq (fast Llama/Mixtral){cfg?.groqConfigured ? " — configured" : ""}</SelectItem>
                  </SelectContent>
                </Select>
                <div className="flex items-center gap-1.5 text-xs">
                  {isConfigured ? (
                    <><CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" /><span className="text-emerald-700">Key configured</span></>
                  ) : (
                    <><XCircle className="h-3.5 w-3.5 text-amber-600" /><span className="text-amber-700">API key required below</span></>
                  )}
                </div>
              </div>

              <div className="space-y-1.5">
                <Label>Default model</Label>
                <ModelDropdown
                  value={model}
                  onChange={(v) => setModel(v)}
                  catalog={catalog}
                  provider={provider}
                  placeholder={cfg?.defaults[provider] ?? "Pick a model"}
                />
                {currentModelEntry && (
                  <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                    <ModelTierBadge tier={currentModelEntry.tier} />
                    <span className="font-mono">{currentModelEntry.id}</span>
                    <span>·</span>
                    <span>{currentModelEntry.costHint}</span>
                    {currentModelEntry.notes && <><span>·</span><span>{currentModelEntry.notes}</span></>}
                  </div>
                )}
                <label className="flex items-center gap-2 text-[11px] text-muted-foreground pt-1">
                  <input
                    type="checkbox"
                    checked={useCustomDefault}
                    onChange={(e) => {
                      if (e.target.checked) setModel(model || "")
                      else if (cfg) setModel(cfg.defaults[provider])
                    }}
                  />
                  Use a custom model ID (advanced)
                </label>
                {useCustomDefault && (
                  <Input
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                    placeholder={cfg?.defaults[provider]}
                    className="font-mono text-xs"
                  />
                )}
                <p className="text-[11px] text-muted-foreground">
                  {provider === "anthropic" && "Pick from the curated list above, or supply a custom Claude model ID."}
                  {provider === "openrouter" && "Pick from the curated list above, or use any OpenRouter vendor/model ID."}
                  {provider === "groq" && "Pick from the curated list above, or supply a custom Groq model name."}
                </p>
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Task-specific models (optional)</CardTitle>
          <CardDescription>
            Override which model handles each kind of AI request. Leave on
            “Use default” to fall back to the default model above.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            onClick={() => setTasksOpen((o) => !o)}
            aria-expanded={tasksOpen}
          >
            <span>{tasksOpen ? "▾" : "▸"}</span>
            <span>{tasksOpen ? "Hide" : "Show"} per-task overrides</span>
            <span className="text-[11px] text-muted-foreground">
              ({Object.values(taskModels).filter((v) => v && v.length > 0).length} configured)
            </span>
          </button>
          {tasksOpen && (
            <div className="mt-3 space-y-3">
              {tasks.map((t) => {
                const current = taskModels[t.key] ?? ""
                const entry = catalog.find((m) => m.id === current && m.provider === provider)
                const isCustom = current.length > 0 && !entry
                return (
                  <div key={t.key} className="rounded-md border p-3 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <div>
                        <div className="text-sm font-medium">{t.label}</div>
                        <div className="text-[11px] text-muted-foreground">{t.description}</div>
                      </div>
                      {entry && <ModelTierBadge tier={entry.tier} />}
                    </div>
                    <ModelDropdown
                      value={current}
                      onChange={(v) =>
                        setTaskModels((prev) => {
                          const next = { ...prev }
                          if (!v) delete next[t.key]
                          else next[t.key] = v
                          return next
                        })
                      }
                      catalog={catalog}
                      provider={provider}
                      placeholder="Use default"
                      includeDefault
                    />
                    {isCustom && (
                      <Input
                        value={current}
                        onChange={(e) =>
                          setTaskModels((prev) => ({ ...prev, [t.key]: e.target.value }))
                        }
                        placeholder="custom-model-id"
                        className="font-mono text-xs"
                      />
                    )}
                    {entry && (
                      <div className="text-[11px] text-muted-foreground">
                        <span className="font-mono">{entry.id}</span>
                        <span> · {entry.costHint}</span>
                        {entry.notes && <span> · {entry.notes}</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>API Keys</CardTitle>
          <CardDescription>Stored in DB. Masked when displayed. Only set keys you need.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <KeyField label="Anthropic API key" hint="console.anthropic.com — starts with sk-ant-" value={anthropicKey} onChange={setAnthropicKey} />
          <KeyField label="OpenRouter API key" hint="openrouter.ai/keys — starts with sk-or-" value={openrouterKey} onChange={setOpenrouterKey} />
          <KeyField label="Groq API key" hint="console.groq.com/keys — starts with gsk_" value={groqKey} onChange={setGroqKey} />
        </CardContent>
      </Card>

      <div className="flex items-center gap-2">
        <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
          {saveMut.isPending ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
          Save
        </Button>
        <Button variant="outline" onClick={() => testMut.mutate()} disabled={testMut.isPending}>
          {testMut.isPending ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Testing...</> : "Save & Test"}
        </Button>
        {testResult && (
          <div className="flex items-center gap-1.5 text-xs">
            {testResult.ok ? (
              <><CheckCircle2 className="h-4 w-4 text-emerald-600" /><span className="text-emerald-700">OK</span></>
            ) : (
              <><XCircle className="h-4 w-4 text-rose-600" /><span className="text-rose-700">{testResult.error ?? "Failed"}</span></>
            )}
          </div>
        )}
      </div>

      <TrainingDataExportCard />
    </div>
  )
}

function TrainingDataExportCard() {
  const [downloading, setDownloading] = React.useState(false)
  const q = useQuery<{ total: number; includedTypes: string[] }>({
    queryKey: ["training-export-count"],
    queryFn: async () => {
      const r = await fetch("/api/admin/export-training-data?count=1")
      if (!r.ok) throw new Error((await r.json()).error ?? "Failed")
      return r.json()
    },
  })

  async function download(format: "jsonl" | "json") {
    setDownloading(true)
    try {
      const r = await fetch(`/api/admin/export-training-data?format=${format}`)
      if (!r.ok) throw new Error("Download failed")
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement("a")
      a.href = url
      a.download = `karat-training-${new Date().toISOString().slice(0, 10)}.${format}`
      a.click()
      URL.revokeObjectURL(url)
      toast.success("Dataset downloaded")
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setDownloading(false)
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5" /> Training Data Export</CardTitle>
        <CardDescription>
          Download cached AI responses as a fine-tuning dataset. Skips low-confidence rows.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1">
          {q.isLoading ? (
            <Skeleton className="h-5 w-32" />
          ) : (
            <>
              <div className="font-medium tabular-nums">{q.data?.total.toLocaleString() ?? 0} eligible rows</div>
              <div className="text-xs text-muted-foreground">
                Types: {q.data?.includedTypes.slice(0, 6).join(", ")}{(q.data?.includedTypes.length ?? 0) > 6 ? "..." : ""}
              </div>
            </>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={() => download("jsonl")} disabled={downloading || !q.data?.total}>
            {downloading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : null}
            Download JSONL
          </Button>
          <Button size="sm" variant="outline" onClick={() => download("json")} disabled={downloading || !q.data?.total}>
            Download JSON
          </Button>
        </div>
        <div className="rounded-md border bg-muted/30 p-3 text-xs text-muted-foreground space-y-1.5">
          <p className="font-medium text-foreground">How to use this dataset</p>
          <p>
            JSONL is in OpenAI / Groq fine-tuning format: each line is{" "}
            <code className="bg-background px-1 rounded">{`{ "messages": [...] }`}</code>.
          </p>
          <p>
            For OpenAI:{" "}
            <code className="bg-background px-1 rounded">openai files create --file karat-training.jsonl --purpose fine-tune</code>{" "}
            then <code className="bg-background px-1 rounded">openai fine-tunes create</code>.
          </p>
          <p>
            For Groq: upload via the Groq fine-tuning API with the same JSONL. Filter / reformat as needed for other providers.
          </p>
        </div>
      </CardContent>
    </Card>
  )
}

function KeyField({ label, hint, value, onChange }: { label: string; hint: string; value: string; onChange: (v: string) => void }) {
  const [show, setShow] = React.useState(false)
  const masked = value.includes("•")
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex gap-2">
        <Input
          type={show || masked ? "text" : "password"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="(not set)"
          className="font-mono text-xs"
        />
        {value && (
          <Button variant="outline" size="sm" onClick={() => setShow((s) => !s)} type="button">
            {show ? "Hide" : "Show"}
          </Button>
        )}
        {value && (
          <Button variant="ghost" size="sm" onClick={() => onChange("")} type="button">
            Clear
          </Button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground">{hint}</p>
    </div>
  )
}
