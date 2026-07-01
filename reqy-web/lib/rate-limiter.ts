/**
 * Reusable rate limiter primitives.
 *
 * `RateLimiter` is an abstract base class that defines the contract for any
 * rate-limiter implementation. `InMemoryRateLimiter` is the default,
 * process-local implementation backed by a `Map` with periodic cleanup.
 */

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  resetAt: number
}

export type InMemoryRateLimiterOptions = {
  windowMs: number
  maxRequests: number
  /** How often the background sweeper runs. Defaults to 5 minutes. */
  cleanupIntervalMs?: number
}

export abstract class RateLimiter {
  abstract check(key: string): RateLimitResult
}

type Entry = { count: number; resetAt: number }

export class InMemoryRateLimiter extends RateLimiter {
  private readonly windowMs: number
  private readonly maxRequests: number
  private readonly entries = new Map<string, Entry>()
  private readonly cleanupTimer: ReturnType<typeof setInterval> | undefined

  constructor(options: InMemoryRateLimiterOptions) {
    super()
    this.windowMs = options.windowMs
    this.maxRequests = options.maxRequests

    const cleanupIntervalMs = options.cleanupIntervalMs ?? 300_000
    if (typeof setInterval !== "undefined") {
      this.cleanupTimer = setInterval(() => this.sweep(), cleanupIntervalMs)
      // Don't keep the Node.js event loop alive solely for cleanup.
      if (typeof this.cleanupTimer === "object" && this.cleanupTimer !== null && "unref" in this.cleanupTimer) {
        (this.cleanupTimer as { unref?: () => void }).unref?.()
      }
    }
  }

  check(key: string): RateLimitResult {
    const now = Date.now()
    let entry = this.entries.get(key)
    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + this.windowMs }
      this.entries.set(key, entry)
    }
    entry.count++
    return {
      allowed: entry.count <= this.maxRequests,
      remaining: Math.max(0, this.maxRequests - entry.count),
      resetAt: entry.resetAt,
    }
  }

  /** Remove entries whose window has already expired. */
  private sweep(): void {
    const now = Date.now()
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) {
        this.entries.delete(key)
      }
    }
  }

  /** Stop the background cleanup timer. Useful for tests and graceful shutdown. */
  dispose(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer)
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Edge-safe distributed rate limiter (Upstash REST). Only instantiated when
// UPSTASH_REDIS_REST_URL is present in the environment. Falls back to
// InMemoryRateLimiter otherwise.
// ─────────────────────────────────────────────────────────────────────────

export type DistributedRateLimiter = {
  check(key: string): Promise<RateLimitResult>
}

interface UpstashResponse {
  success: boolean
  limit: number
  remaining: number
  reset: number
}

export class UpstashRateLimiter implements DistributedRateLimiter {
  private readonly url: string
  private readonly token: string
  private readonly windowMs: number
  private readonly maxRequests: number

  constructor(opts: { url: string; token: string; windowMs: number; maxRequests: number }) {
    this.url = opts.url.replace(/\/$/, "")
    this.token = opts.token
    this.windowMs = opts.windowMs
    this.maxRequests = opts.maxRequests
  }

  async check(key: string): Promise<RateLimitResult> {
    const windowSec = Math.ceil(this.windowMs / 1000)
    const body = JSON.stringify({
      algorithm: "sliding_window",
      window: `${windowSec}s`,
      limit: this.maxRequests,
      key,
    })
    try {
      const res = await fetch(`${this.url}/v2/ratelimit/_`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          "Content-Type": "application/json",
        },
        body,
      })
      if (!res.ok) {
        // Fail-open: do not block legitimate traffic if Upstash is down
        return { allowed: true, remaining: this.maxRequests, resetAt: Date.now() + this.windowMs }
      }
      const data = (await res.json()) as UpstashResponse
      return { allowed: data.success, remaining: data.remaining, resetAt: data.reset * 1000 }
    } catch {
      return { allowed: true, remaining: this.maxRequests, resetAt: Date.now() + this.windowMs }
    }
  }
}
