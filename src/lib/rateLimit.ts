type Entry = { count: number; resetAt: number };

const store = new Map<string, Entry>();

export function clientKey(req: Request): string {
  // Vercel / proxies typically set x-forwarded-for
  const xff = req.headers.get("x-forwarded-for");
  const ip = xff?.split(",")[0]?.trim();
  return ip || "unknown";
}

export function rateLimit(args: { key: string; limit: number; windowMs: number }) {
  const now = Date.now();
  const existing = store.get(args.key);

  if (!existing || now >= existing.resetAt) {
    store.set(args.key, { count: 1, resetAt: now + args.windowMs });
    return { ok: true, remaining: args.limit - 1, resetAt: now + args.windowMs };
  }

  if (existing.count >= args.limit) {
    return { ok: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  store.set(args.key, existing);
  return { ok: true, remaining: args.limit - existing.count, resetAt: existing.resetAt };
}
