// Minimal Contentful Management REST helper using the service token, with
// 429-aware retry and a bounded-concurrency mapper for scale operations.
// Used by the governance console (lib/console/*) and the scale scripts.
// The product paths use the typed SDK client in ./client.ts.

const BASE = "https://api.contentful.com";
const CT_JSON = "application/vnd.contentful.management.v1+json";
const RETRYABLE = new Set([429, 500, 502, 503, 504]);

function token(): string {
  const t = process.env.CF_SERVICE_TOKEN;
  if (!t) throw new Error("CF_SERVICE_TOKEN is not set");
  return t;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function request(method: string, path: string, body?: unknown, extraHeaders: Record<string, string> = {}, attempts = 7): Promise<unknown> {
  let lastErr: unknown;
  for (let i = 0; i < attempts; i++) {
    const res = await fetch(`${BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token()}`,
        ...(body === undefined ? {} : { "Content-Type": CT_JSON }),
        ...extraHeaders,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (res.ok) {
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    }
    const text = await res.text();
    if (RETRYABLE.has(res.status) && i < attempts - 1) {
      const retryAfter = Number(res.headers.get("x-contentful-ratelimit-reset") || res.headers.get("retry-after") || 0);
      const backoff = retryAfter > 0 ? retryAfter * 1000 : (2 ** i) * 500 + Math.random() * 250;
      lastErr = new Error(`CMA ${res.status}: ${text}`);
      await sleep(backoff);
      continue;
    }
    throw new Error(`CMA ${res.status} ${res.statusText}: ${text}`);
  }
  throw lastErr;
}

export async function cfGet<T = any>(path: string): Promise<T> {
  return request("GET", path) as Promise<T>;
}

export async function cfSend<T = any>(
  method: "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  return request(method, path, body, extraHeaders) as Promise<T>;
}

/** Run `fn` over `items` with at most `concurrency` in flight. Preserves input order in the result. */
export async function pmap<T, R>(items: T[], fn: (item: T, index: number) => Promise<R>, concurrency = 5): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i]!, i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
