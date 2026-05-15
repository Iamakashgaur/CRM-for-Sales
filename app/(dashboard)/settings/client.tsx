"use client"

import * as React from "react"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
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
import { Mail, MoreHorizontal, Plus, Trash2, Pencil, KeyRound } from "lucide-react"
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
        </TabsList>
        <TabsContent value="profile">
          <Card>
            <CardHeader><CardTitle>Profile</CardTitle><CardDescription>Your account info</CardDescription></CardHeader>
            <CardContent className="space-y-3 max-w-md">
              <div className="space-y-2"><Label>Name</Label><Input defaultValue={userName} /></div>
              <div className="space-y-2"><Label>Email</Label><Input defaultValue={userEmail} disabled /></div>
              <div className="space-y-2"><Label>Role</Label><Input defaultValue={role} disabled /></div>
              <Button onClick={() => toast.success("Profile saved")}>Save</Button>
            </CardContent>
          </Card>
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
      </Tabs>
    </div>
  )
}

function UsersTab() {
  const qc = useQueryClient()
  const [createOpen, setCreateOpen] = React.useState(false)
  const [editUser, setEditUser] = React.useState<UserRow | null>(null)
  const [pwUser, setPwUser] = React.useState<UserRow | null>(null)

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
                          onClick={() => { if (confirm(`Delete ${u.name}?`)) delMut.mutate(u.id) }}
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
                      onClick={() => { if (confirm(`Delete stage "${s.name}"?`)) delMut.mutate(s.id) }}
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
      <StageEditDialog stage={editStage} onOpenChange={(o) => !o && setEditStage(null)} />
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

function StageEditDialog({ stage, onOpenChange }: { stage: Stage | null; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient()
  const [name, setName] = React.useState("")
  const [color, setColor] = React.useState("#6366f1")
  const [probability, setProbability] = React.useState(50)
  const [order, setOrder] = React.useState(1)

  React.useEffect(() => {
    if (stage) { setName(stage.name); setColor(stage.color); setProbability(stage.probability); setOrder(stage.order) }
  }, [stage])

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
              <li>Sign up at <a href="https://resend.com" target="_blank" rel="noopener" className="text-foreground underline">resend.com</a></li>
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
