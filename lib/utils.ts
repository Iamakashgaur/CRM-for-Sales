import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)) }

export function formatCurrency(value: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency, minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(value)
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

export function avatarColor(name: string): string {
  const colors = ["bg-red-500", "bg-orange-500", "bg-amber-500", "bg-yellow-500", "bg-lime-500", "bg-green-500", "bg-emerald-500", "bg-teal-500", "bg-cyan-500", "bg-sky-500", "bg-blue-500", "bg-indigo-500", "bg-violet-500", "bg-purple-500", "bg-fuchsia-500", "bg-pink-500", "bg-rose-500"]
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash << 5) - hash + name.charCodeAt(i)
  return colors[Math.abs(hash) % colors.length]
}
