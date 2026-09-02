"use client"

import * as React from "react"
import { Mic, Square, Loader2, X, CheckCircle2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { toast } from "sonner"

type Phase = "idle" | "recording" | "transcribing" | "review" | "saving"

interface ExtractedCall {
  status: string
  notes: string
  sentiment: "positive" | "neutral" | "negative"
  nextStep: string | null
}

interface VoiceRecorderProps {
  contactId: string
  onLogged: () => void
}

function supportsMediaRecorder(): boolean {
  if (typeof window === "undefined") return false
  return typeof window.MediaRecorder !== "undefined" && !!navigator.mediaDevices?.getUserMedia
}

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, "0")}`
}

function pickMimeType(): string | undefined {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg"]
  if (typeof MediaRecorder === "undefined") return undefined
  for (const c of candidates) {
    try {
      if (MediaRecorder.isTypeSupported(c)) return c
    } catch {
      // ignore
    }
  }
  return undefined
}

export function VoiceRecorder({ contactId, onLogged }: VoiceRecorderProps) {
  const supported = React.useMemo(() => supportsMediaRecorder(), [])
  const [phase, setPhase] = React.useState<Phase>("idle")
  const [duration, setDuration] = React.useState(0)
  const [transcript, setTranscript] = React.useState("")
  const [extracted, setExtracted] = React.useState<ExtractedCall | null>(null)
  const [reviewOpen, setReviewOpen] = React.useState(false)

  const recorderRef = React.useRef<MediaRecorder | null>(null)
  const chunksRef = React.useRef<Blob[]>([])
  const streamRef = React.useRef<MediaStream | null>(null)
  const startTsRef = React.useRef<number>(0)
  const timerRef = React.useRef<ReturnType<typeof setInterval> | null>(null)

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current)
      timerRef.current = null
    }
  }

  function cleanupStream() {
    streamRef.current?.getTracks().forEach((t) => t.stop())
    streamRef.current = null
    recorderRef.current = null
    chunksRef.current = []
  }

  React.useEffect(() => {
    return () => {
      stopTimer()
      cleanupStream()
    }
  }, [])

  async function startRecording() {
    if (!supported) {
      toast.error("Recording is not supported in this browser")
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      streamRef.current = stream
      const mimeType = pickMimeType()
      const rec = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream)
      recorderRef.current = rec
      chunksRef.current = []
      rec.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data)
      }
      rec.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" })
        cleanupStream()
        if (blob.size === 0) {
          setPhase("idle")
          toast.error("No audio captured")
          return
        }
        void uploadAndTranscribe(blob)
      }
      rec.start()
      startTsRef.current = Date.now()
      setDuration(0)
      setPhase("recording")
      timerRef.current = setInterval(() => {
        setDuration(Date.now() - startTsRef.current)
      }, 250)
    } catch (e) {
      toast.error((e as Error).message || "Microphone permission denied")
    }
  }

  function stopRecording() {
    stopTimer()
    const rec = recorderRef.current
    if (rec && rec.state !== "inactive") {
      rec.stop()
      setPhase("transcribing")
    } else {
      cleanupStream()
      setPhase("idle")
    }
  }

  function cancelRecording() {
    stopTimer()
    const rec = recorderRef.current
    if (rec && rec.state !== "inactive") {
      rec.onstop = null
      rec.stop()
    }
    cleanupStream()
    setPhase("idle")
    setDuration(0)
  }

  async function uploadAndTranscribe(blob: Blob) {
    setPhase("transcribing")
    const fd = new FormData()
    const ext = blob.type.includes("ogg") ? "ogg" : blob.type.includes("mp4") ? "m4a" : "webm"
    fd.append("audio", blob, `recording.${ext}`)
    try {
      const res = await fetch("/api/ai/voice-transcribe", { method: "POST", body: fd })
      const data = (await res.json()) as { text?: string; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Transcription failed")
      const text = (data.text ?? "").trim()
      if (!text) {
        toast.error("No speech detected")
        setPhase("idle")
        return
      }
      setTranscript(text)
      setExtracted(null)
      setReviewOpen(true)
      setPhase("review")
    } catch (e) {
      toast.error((e as Error).message)
      setPhase("idle")
    }
  }

  async function confirmAndSave() {
    setPhase("saving")
    try {
      const res = await fetch("/api/ai/voice-to-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId, transcript }),
      })
      const data = (await res.json()) as { extracted?: ExtractedCall; error?: string }
      if (!res.ok) throw new Error(data.error ?? "Save failed")
      setExtracted(data.extracted ?? null)
      toast.success("Call logged from voice note")
      onLogged()
      setTimeout(() => {
        setReviewOpen(false)
        setTranscript("")
        setExtracted(null)
        setDuration(0)
        setPhase("idle")
      }, 600)
    } catch (e) {
      toast.error((e as Error).message)
      setPhase("review")
    }
  }

  if (!supported) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <span>
            <Button size="sm" variant="outline" disabled>
              <Mic className="h-3.5 w-3.5 mr-1.5" /> Voice log
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent>Microphone recording not supported in this browser</TooltipContent>
      </Tooltip>
    )
  }

  return (
    <>
      {phase === "idle" && (
        <Button
          size="sm"
          variant="outline"
          onClick={startRecording}
          className="border-violet-200 text-violet-700 hover:bg-violet-50 hover:text-violet-700"
        >
          <Mic className="h-3.5 w-3.5 mr-1.5" /> Voice log
        </Button>
      )}
      {phase === "recording" && (
        <div className="inline-flex items-center gap-2 rounded-md border border-red-200 bg-red-50 px-2 py-1">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500" />
          </span>
          <span className="text-xs text-red-700 font-mono tabular-nums">{formatDuration(duration)}</span>
          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-red-700" onClick={stopRecording}>
            <Square className="h-3 w-3 mr-1" /> Stop
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-1.5 text-muted-foreground" onClick={cancelRecording}>
            <X className="h-3 w-3" />
          </Button>
        </div>
      )}
      {phase === "transcribing" && (
        <div className="inline-flex items-center gap-2 rounded-md border bg-muted px-2 py-1 text-xs">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Transcribing...
        </div>
      )}

      <Dialog
        open={reviewOpen}
        onOpenChange={(o) => {
          if (!o && phase !== "saving") {
            setReviewOpen(false)
            setTranscript("")
            setExtracted(null)
            setPhase("idle")
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Review voice note</DialogTitle>
            <DialogDescription>
              Edit the transcript if needed, then log the call. The AI will extract status, sentiment, and a next step.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={8}
              className="text-sm"
              disabled={phase === "saving"}
            />
            {extracted && (
              <div className="rounded-md border bg-emerald-50 border-emerald-200 text-emerald-800 p-2 text-xs space-y-1">
                <div className="inline-flex items-center gap-1.5 font-medium">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Logged
                </div>
                <div><span className="font-medium">Status:</span> {extracted.status}</div>
                <div><span className="font-medium">Sentiment:</span> {extracted.sentiment}</div>
                {extracted.nextStep && (
                  <div><span className="font-medium">Next step:</span> {new Date(extracted.nextStep).toLocaleDateString()}</div>
                )}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setReviewOpen(false); setTranscript(""); setPhase("idle") }} disabled={phase === "saving"}>
              Cancel
            </Button>
            <Button onClick={confirmAndSave} disabled={phase === "saving" || !transcript.trim()}>
              {phase === "saving" ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Mic className="h-3.5 w-3.5 mr-1.5" />}
              Log call
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
