interface MetaCacheEntry {
  data: unknown
  expiresAt: number
}

/**
 * Shared in-memory cache for contact metadata aggregations.
 * Exposed via this module so route handlers and other API routes can
 * invalidate it after mutations without coupling to a route file (Next.js
 * forbids non-route exports from route handler files).
 */
const cache = new Map<string, MetaCacheEntry>()

export function metaCacheGet<T>(key: string): T | undefined {
  const hit = cache.get(key)
  if (!hit) return undefined
  if (hit.expiresAt <= Date.now()) {
    cache.delete(key)
    return undefined
  }
  return hit.data as T
}

export function metaCacheSet<T>(key: string, data: T, ttlMs: number): void {
  cache.set(key, { data, expiresAt: Date.now() + ttlMs })
}

export function invalidateMetaCache(): void {
  cache.clear()
}
