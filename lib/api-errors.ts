export function safeError(err: unknown, fallback = "Internal server error"): string {
  if (process.env.NODE_ENV === "development") {
    return err instanceof Error ? err.message : String(err)
  }
  console.error(err)
  return fallback
}
