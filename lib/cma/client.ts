import { createRequire } from "node:module";
import type { ClientAPI } from "contentful-management";

// contentful-management is CJS-only. A static named import fails under raw Node ESM
// (the `tsx` probe scripts), while a default-import-destructure failed under Next's
// server bundling. createRequire loads the real CJS module in both contexts — it is
// already marked in `serverExternalPackages`, so Next does not bundle it.
const { createClient } = createRequire(import.meta.url)(
  "contentful-management",
) as typeof import("contentful-management");

const RETRYABLE = new Set([429, 500, 502, 503, 504]);

export async function withRetry<T>(
  fn: () => Promise<T>,
  opts: { attempts?: number; baseMs?: number } = {},
): Promise<T> {
  const attempts = opts.attempts ?? 3;
  const baseMs = opts.baseMs ?? 250;
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn();
    } catch (err) {
      const status = (err as { status?: number }).status;
      if (status === undefined || !RETRYABLE.has(status)) throw err;
      lastErr = err;
      const jitter = Math.random() * baseMs;
      await new Promise((r) => setTimeout(r, baseMs * 2 ** i + jitter));
    }
  }
  throw lastErr;
}

let cached: ClientAPI | null = null;
export function cma(): ClientAPI {
  if (cached) return cached;
  const accessToken = process.env.CF_SERVICE_TOKEN;
  if (!accessToken) throw new Error("CF_SERVICE_TOKEN is not set");
  cached = createClient({ accessToken }) as unknown as ClientAPI;
  return cached;
}
