type LogLevel = "info" | "warn" | "error"

export function log(level: LogLevel, msg: string, meta?: Record<string, unknown>): void {
  const entry = { level, msg, at: new Date().toISOString(), ...meta }
  const out = JSON.stringify(entry)
  if (level === "error") console.error(out)
  else if (level === "warn") console.warn(out)
  else console.log(out)
}
