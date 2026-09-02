"use client"

import * as React from "react"
import { useMutation } from "@tanstack/react-query"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Sparkles, Send, Loader2, Wrench, User, Bot, AlertCircle } from "lucide-react"
import { cn } from "@/lib/utils"

interface ChatMsg {
  role: "user" | "assistant"
  content: string
  toolCalls?: Array<{ name: string; input: Record<string, unknown>; isError: boolean }>
}

interface CopilotResponse {
  ok: boolean
  text: string
  toolCalls: Array<{ name: string; input: Record<string, unknown>; isError: boolean }>
  iterations: number
  provider: string
  model: string
  error?: string
}

const STARTERS = [
  "What are my hot leads in Maharashtra?",
  "Show me deals likely to close this month",
  "Summarise my overdue follow-ups",
  "How is my pipeline doing this quarter?",
]

export function CopilotClient({ userName }: { userName: string }) {
  const [messages, setMessages] = React.useState<ChatMsg[]>([])
  const [input, setInput] = React.useState("")
  const scrollRef = React.useRef<HTMLDivElement>(null)

  const sendMut = useMutation<CopilotResponse, Error, string>({
    mutationFn: async (text: string) => {
      const next: ChatMsg[] = [...messages, { role: "user", content: text }]
      setMessages(next)
      const r = await fetch("/api/ai/copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      })
      const data = (await r.json()) as CopilotResponse & { error?: string }
      if (!r.ok) throw new Error(data.error ?? "Copilot failed")
      return data
    },
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.text || "(no response)", toolCalls: data.toolCalls },
      ])
    },
    onError: (e) => {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Sorry — ${e.message}`, toolCalls: [] },
      ])
    },
  })

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [messages, sendMut.isPending])

  function submit(text?: string) {
    const value = (text ?? input).trim()
    if (!value || sendMut.isPending) return
    setInput("")
    sendMut.mutate(value)
  }

  function handleKey(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      submit()
    }
  }

  return (
    <div className="space-y-4 max-w-3xl mx-auto">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-violet-500" /> Copilot
          </h1>
          <p className="text-sm text-muted-foreground">
            Chat with your CRM. {userName ? `Hi ${userName.split(" ")[0]}!` : ""} Ask about contacts, deals, analytics — or instruct it to log calls and create tasks.
          </p>
        </div>
        {messages.length > 0 && (
          <Button size="sm" variant="outline" onClick={() => setMessages([])}>Clear</Button>
        )}
      </div>

      <Card className="flex flex-col" style={{ minHeight: "60vh" }}>
        <CardContent className="flex-1 p-0 flex flex-col">
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-3 scrollbar-thin" style={{ maxHeight: "65vh" }}>
            {messages.length === 0 && (
              <div className="py-8 text-center space-y-4">
                <div className="inline-flex h-12 w-12 rounded-full items-center justify-center bg-violet-50">
                  <Sparkles className="h-6 w-6 text-violet-500" />
                </div>
                <div>
                  <p className="text-sm font-medium">How can I help?</p>
                  <p className="text-xs text-muted-foreground mt-1">Try one of these starters:</p>
                </div>
                <div className="flex flex-wrap gap-2 justify-center">
                  {STARTERS.map((s) => (
                    <button
                      key={s}
                      onClick={() => submit(s)}
                      className="text-[12px] px-3 py-1.5 rounded-full border border-violet-200 bg-violet-50/50 text-violet-700 hover:bg-violet-100 transition-colors"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) => (
              <MessageRow key={i} msg={m} />
            ))}

            {sendMut.isPending && (
              <div className="flex items-start gap-2">
                <div className="h-7 w-7 rounded-full bg-violet-50 flex items-center justify-center shrink-0">
                  <Bot className="h-4 w-4 text-violet-500" />
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Thinking...
                </div>
              </div>
            )}
          </div>

          <div className="border-t p-3">
            <div className="flex gap-2">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKey}
                placeholder="Ask anything about your CRM..."
                rows={2}
                className="resize-none text-sm"
                disabled={sendMut.isPending}
              />
              <Button onClick={() => submit()} disabled={!input.trim() || sendMut.isPending} className="self-end">
                {sendMut.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-[10px] text-muted-foreground mt-1.5">
              Enter to send · Shift+Enter for new line · Copilot can read your CRM and log calls / tasks on your behalf.
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function MessageRow({ msg }: { msg: ChatMsg }) {
  const isUser = msg.role === "user"
  return (
    <div className={cn("flex items-start gap-2", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "h-7 w-7 rounded-full flex items-center justify-center shrink-0",
          isUser ? "bg-foreground/5" : "bg-violet-50"
        )}
      >
        {isUser ? <User className="h-4 w-4 text-foreground/70" /> : <Bot className="h-4 w-4 text-violet-500" />}
      </div>
      <div className={cn("max-w-[80%] space-y-1.5", isUser && "items-end flex flex-col")}>
        {msg.toolCalls && msg.toolCalls.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {msg.toolCalls.map((t, i) => (
              <Badge
                key={i}
                variant={t.isError ? "destructive" : "outline"}
                className="text-[10px] font-mono gap-1"
              >
                {t.isError ? <AlertCircle className="h-3 w-3" /> : <Wrench className="h-3 w-3" />}
                {t.name}
              </Badge>
            ))}
          </div>
        )}
        <div
          className={cn(
            "rounded-lg px-3 py-2 text-sm whitespace-pre-wrap break-words leading-relaxed",
            isUser ? "bg-violet-600 text-white" : "bg-muted text-foreground"
          )}
        >
          {msg.content}
        </div>
      </div>
    </div>
  )
}
