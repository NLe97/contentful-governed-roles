// Minimal Contentful Management REST helper using the service token.
// Used by the dev-only demo console (lib/demo/*). The product paths use the
// typed SDK client in ./client.ts; this keeps the demo glue simple and explicit.

const BASE = "https://api.contentful.com";
const CT_JSON = "application/vnd.contentful.management.v1+json";

function token(): string {
  const t = process.env.CF_SERVICE_TOKEN;
  if (!t) throw new Error("CF_SERVICE_TOKEN is not set");
  return t;
}

async function parse(res: Response): Promise<unknown> {
  const text = await res.text();
  const json = text ? JSON.parse(text) : null;
  if (!res.ok) {
    const detail = typeof json === "object" ? JSON.stringify(json) : text;
    throw new Error(`CMA ${res.status} ${res.statusText}: ${detail}`);
  }
  return json;
}

export async function cfGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token()}` },
  });
  return parse(res) as Promise<T>;
}

export async function cfSend<T = any>(
  method: "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
  extraHeaders: Record<string, string> = {},
): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token()}`,
      "Content-Type": CT_JSON,
      ...extraHeaders,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return parse(res) as Promise<T>;
}
