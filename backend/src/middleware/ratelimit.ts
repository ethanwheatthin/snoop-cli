import type { MiddlewareHandler } from "hono";

interface CounterRecord {
  count: number;
  resetAt: number;
}

const DAILY_LIMIT = 10;
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const counters = new Map<string, CounterRecord>();

function getClientIp(headers: Headers): string {
  return (
    headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    headers.get("x-real-ip") ||
    "unknown"
  );
}

export function rateLimit(): MiddlewareHandler {
  return async (c, next) => {
    const ip = getClientIp(c.req.raw.headers);
    const now = Date.now();

    const existing = counters.get(ip);
    if (!existing || now >= existing.resetAt) {
      counters.set(ip, { count: 1, resetAt: now + ONE_DAY_MS });
      await next();
      return;
    }

    if (existing.count >= DAILY_LIMIT) {
      const resetInSeconds = Math.max(1, Math.floor((existing.resetAt - now) / 1000));
      c.header("Retry-After", String(resetInSeconds));
      return c.json(
        {
          error: `Rate limit exceeded. Free tier allows ${DAILY_LIMIT} requests/day per IP.`,
        },
        429,
      );
    }

    existing.count += 1;
    counters.set(ip, existing);
    await next();
  };
}
