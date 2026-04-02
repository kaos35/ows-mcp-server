/**
 * Rate Limiter — Prevents excessive tool calls
 */

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

const limits = new Map<string, RateLimitEntry>();

const MAX_CALLS_PER_MINUTE = Number(process.env.OWS_RATE_LIMIT) || 30;
const WINDOW_MS = 60_000; // 1 minute

/**
 * Check if a tool call is within rate limits
 * @returns true if allowed, false if rate limited
 */
export function checkRateLimit(toolName: string): boolean {
  const now = Date.now();
  const key = toolName;

  const entry = limits.get(key);

  if (!entry || now > entry.resetAt) {
    limits.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (entry.count >= MAX_CALLS_PER_MINUTE) {
    return false;
  }

  entry.count++;
  return true;
}

/**
 * Get rate limit status for a tool
 */
export function getRateLimitStatus(toolName: string): {
  remaining: number;
  resetsIn: number;
} {
  const now = Date.now();
  const entry = limits.get(toolName);

  if (!entry || now > entry.resetAt) {
    return { remaining: MAX_CALLS_PER_MINUTE, resetsIn: 0 };
  }

  return {
    remaining: Math.max(0, MAX_CALLS_PER_MINUTE - entry.count),
    resetsIn: Math.max(0, Math.ceil((entry.resetAt - now) / 1000)),
  };
}
