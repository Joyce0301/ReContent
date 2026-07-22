type RateLimitWindow = {
  count: number;
  resetAt: number;
};

const rateLimitStore = new Map<string, RateLimitWindow>();

export function getClientAddress(request: Request) {
  return (
    request.headers.get("cf-connecting-ip") ??
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "unknown"
  );
}

export function consumeRateLimit(input: {
  bucket: string;
  key: string;
  max: number;
  windowMs: number;
}) {
  const now = Date.now();
  const storeKey = `${input.bucket}:${input.key}`;
  const current = rateLimitStore.get(storeKey);

  if (!current || current.resetAt <= now) {
    rateLimitStore.set(storeKey, {
      count: 1,
      resetAt: now + input.windowMs
    });

    return {
      ok: true as const,
      retryAfterSeconds: Math.ceil(input.windowMs / 1000)
    };
  }

  if (current.count >= input.max) {
    return {
      ok: false as const,
      retryAfterSeconds: Math.max(
        1,
        Math.ceil((current.resetAt - now) / 1000)
      )
    };
  }

  current.count += 1;
  rateLimitStore.set(storeKey, current);

  return {
    ok: true as const,
    retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000))
  };
}
