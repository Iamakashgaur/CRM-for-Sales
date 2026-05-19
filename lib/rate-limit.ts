interface Bucket {
  count: number
  resetAt: number
}

/**
 * Simple in-memory rate limiter. Buckets are keyed by an arbitrary string.
 *
 * WARNING: This is process-local. In a multi-instance deployment (multiple
 * Node processes behind a load balancer, serverless functions, etc.) each
 * instance maintains its own bucket set, so the effective per-user limit is
 * `max * N` where N is the instance count. For production with horizontal
 * scaling, replace with Redis or another shared store.
 */
const buckets = new Map<string, Bucket>()

export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now()
  // Periodic eviction of expired buckets (probabilistic, low cost)
  if (Math.random() < 0.01) {
    for (const [k, v] of buckets) {
      if (v.resetAt < now) buckets.delete(k)
    }
  }
  const b = buckets.get(key)
  if (!b || now > b.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (b.count >= max) return false
  b.count++
  return true
}
