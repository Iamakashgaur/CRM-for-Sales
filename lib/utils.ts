import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }

export function formatCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(value)
}

export function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "—"
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(date))
}

export function formatRelativeDate(date: Date | string): string {
  const d = new Date(date), now = new Date()
  const days = Math.floor((now.getTime() - d.getTime()) / 86400000)
  if (days === 0) return "Today"
  if (days === 1) return "Yesterday"
  if (days < 7) return `${days}d ago`
  if (days < 30) return `${Math.floor(days / 7)}w ago`
  if (days < 365) return `${Math.floor(days / 30)}mo ago`
  return `${Math.floor(days / 365)}y ago`
}

export function parseTags(tags: string): string[] {
  try { const v = JSON.parse(tags); return Array.isArray(v) ? v : [] } catch { return [] }
}

export function stringifyTags(tags: string[]): string { return JSON.stringify(tags) }

export function getInitials(name: string): string {
  return name.split(/\s+/).filter(Boolean).map(w => w[0]).join("").toUpperCase().slice(0, 2)
}

export function daysBetween(a: Date | string, b: Date | string = new Date()): number {
  return Math.floor((new Date(b).getTime() - new Date(a).getTime()) / 86400000)
}

const AVATAR_COLORS = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308", "#84cc16", "#22c55e",
  "#10b981", "#14b8a6", "#06b6d4", "#0ea5e9", "#3b82f6", "#6366f1",
  "#8b5cf6", "#a855f7", "#d946ef", "#ec4899", "#f43f5e",
]

export function avatarColor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i)
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length]
}

export function avatarStyle(name: string): { backgroundColor: string } {
  return { backgroundColor: avatarColor(name) }
}

/** Normalize Indian phone numbers: strip non-digits; if 10-digit, prepend 91. */
export function normalizePhone(s: string): string {
  if (!s) return s
  const digits = s.replace(/\D/g, "")
  if (digits.length === 10) return `91${digits}`
  if (digits.length === 11 && digits.startsWith("0")) {
    const rest = digits.slice(1)
    return `91${rest}`
  }
  return digits
}
