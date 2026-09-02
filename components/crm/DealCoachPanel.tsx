"use client"

import * as React from "react"
import { Sparkles, Send, Loader2, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { toast } from "sonner"
import { cn } from "@/lib/utils"

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

const STARTER_PROMPTS = [
  "What's the best next step right now?",
  "Draft a reply to a price objection.",
  "How likely is this to close, and why?",
  "Identify the top 3 risks for this deal.",
] as const

export function DealCoachPanel({ dealId }: { dealId: string }) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([])
  const [input, setInput] = React.useState("")
  const [loading, setLoading] = React.useState(false)
  const scrollRef = React.useRef<HTMLDivElement | null>(null)

  React.useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, loading])

  async function send(content: string) {
    const trimmed = content.trim()
    if (!trimmed || loading) return
    const next: ChatMessage[] = [...messages, { role: "user", content: trimmed }]
    setMessages(next)
    setInput("")
    setLoading(true)
    try {
      const res = await fetch("/api/ai/deal-coach", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dealId, messages: next }),
      })
      const data = (await res.json()) as { reply?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Coach request failed")
      const reply = (data.reply ?? "").trim() || "(no reply)"
      setMessages((cur) => [...cur, { role: "assistant", content: reply }])
    } catch (e) {
      toast.error((e as Error).message)
      setMessages((cur) => cur.slice(0, -1)) // remove the user message we appended
      setInput(trimmed) // restore so user doesn't lose it
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setMessages([])
    setInput("")
  }

  return (
    <Card className="flex flex-col h-[640px]">
      <CardHeader className="flex flex-row items-center justify-between gap-3 shrink-0 border-b pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-violet-500" /> AI Deal Coach
        </CardTitle>
        {messages.length > 0 && (
          <Button size="sm" variant="ghost" onClick={reset} className="text-muted-foreground">
            <RotateCcw className="h-3.5 w-3.5 mr-1.5" /> Reset
          </Button>
        )}
      </CardHeader>
      <CardContent className="flex-1 min-h-0 flex flex-col p-0">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin">
          {messages.length === 0 && (
            <div className="text-center text-sm text-muted-foreground py-6 space-y-3">
              <div className="text-base font-medium text-foreground">Ask the coach</div>
              <p className="text-xs">Get tactical advice based on this deal&apos;s full context.</p>
              <div className="flex flex-wrap gap-2 justify-center pt-2">
                {STARTER_PROMPTS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => send(p)}
                    className="text-xs rounded-full border border-violet-200 bg-violet-50 text-violet-700 px-3 py-1.5 hover:bg-violet-100 transition-colors"
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, idx) => (
            <div
              key={idx}
              className={cn(
                "flex w-full",
                m.role === "user" ? "justify-end" : "justify-start"
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] rounded-lg px-3 py-2 text-sm whitespace-pre-wrap leading-relaxed",
                  m.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-foreground border"
                )}
              >
                {m.content}
              </div>
            </div>
          ))}
          {loading && (
            <div className="flex justify-start">
              <div className="bg-muted text-foreground border rounded-lg px-3 py-2 text-sm inline-flex items-center gap-2">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Coach is thinking...
              </div>
            </div>
          )}
        </div>
        <div className="shrink-0 border-t p-3 space-y-2">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault()
                send(input)
              }
            }}
            placeholder="Ask anything about this deal..."
            rows={2}
            disabled={loading}
            className="resize-none text-sm"
          />
          <div className="flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">Enter to send, Shift+Enter for new line</span>
            <Button size="sm" onClick={() => send(input)} disabled={loading || !input.trim()}>
              {loading ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Send className="h-3.5 w-3.5 mr-1.5" />}
              Send
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
