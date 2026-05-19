"use client"

import * as React from "react"
import { signIn } from "next-auth/react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Loader2, BarChart3, Users, Zap, ShieldCheck } from "lucide-react"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = React.useState("")
  const [password, setPassword] = React.useState("")
  const [loading, setLoading] = React.useState(false)

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    const res = await signIn("credentials", { email, password, redirect: false })
    setLoading(false)
    if (res?.error) {
      toast.error("Invalid email or password")
      return
    }
    toast.success("Welcome back")
    router.push("/dashboard")
    router.refresh()
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left: Brand panel */}
      <div className="hidden lg:flex lg:w-1/2 relative overflow-hidden bg-gradient-to-br from-amber-50 via-white to-amber-50">
        <div className="relative z-10 flex flex-col justify-between p-12 w-full">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-sm">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3h12l4 6-10 12L2 9z" />
                <path d="M2 9h20" />
                <path d="M10 3l2 6-2 12" />
                <path d="M14 3l-2 6 2 12" />
              </svg>
            </div>
            <span className="font-bold text-[15px] tracking-tight">Karat</span>
          </div>

          <div className="space-y-10 max-w-md">
            <div>
              <h2 className="text-[40px] leading-[1.1] font-medium tracking-[-0.025em] text-foreground">
                The CRM for B2B teams that close.
              </h2>
              <p className="mt-5 text-[15px] text-muted-foreground leading-relaxed">
                Track contacts, manage your pipeline, and close more deals with AI-powered insights.
              </p>
            </div>

            <ul className="space-y-4">
              {[
                { icon: BarChart3, text: "Real-time pipeline analytics", tint: "bg-blue-50 text-blue-600" },
                { icon: Users, text: "Unified contact management", tint: "bg-violet-50 text-violet-600" },
                { icon: Zap, text: "AI-powered deal scoring", tint: "bg-amber-50 text-amber-600" },
                { icon: ShieldCheck, text: "Enterprise-grade security", tint: "bg-emerald-50 text-emerald-600" },
              ].map((f) => (
                <li key={f.text} className="flex items-center gap-3 text-[13px]">
                  <div className={`h-9 w-9 rounded-full flex items-center justify-center ${f.tint}`}>
                    <f.icon className="h-4 w-4" strokeWidth={1.75} />
                  </div>
                  <span className="text-foreground/85 font-medium">{f.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} Karat. All rights reserved.
          </div>
        </div>
      </div>

      {/* Right: Form */}
      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-8">
            <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-sm">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 3h12l4 6-10 12L2 9z" />
                <path d="M2 9h20" />
                <path d="M10 3l2 6-2 12" />
                <path d="M14 3l-2 6 2 12" />
              </svg>
            </div>
            <span className="font-bold text-[15px] tracking-tight">Karat</span>
          </div>

          <div className="mb-8">
            <h1 className="text-[28px] font-semibold tracking-tight">Welcome back</h1>
            <p className="text-[13px] text-muted-foreground mt-2">
              Sign in to your account to continue
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-[13px] font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="you@company.com"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-10"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-[13px] font-medium">
                Password
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-10"
              />
            </div>
            <Button
              type="submit"
              variant="accent"
              className="w-full h-10 mt-2"
              disabled={loading}
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Continue"}
            </Button>
            {process.env.NODE_ENV !== "production" && (
              <div className="text-[11px] text-muted-foreground text-center pt-4 mt-4 border-t border-border">
                Demo credentials: <span className="font-mono">admin@crm.com</span> /{" "}
                <span className="font-mono">Admin1234!</span>
              </div>
            )}
          </form>
        </div>
      </div>
    </div>
  )
}
