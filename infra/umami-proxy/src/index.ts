/**
 * Same-origin proxy for self-hosted Umami.
 *
 * Public paths on kc.chtnnhfoundation.org (neutral names — not on blocklists):
 *   GET  /s/x.js  →  {UMAMI_ORIGIN}/script.js   (rewrites /api/send → /s/e)
 *   POST /s/e     →  {UMAMI_ORIGIN}/api/send
 *
 * Dashboard and other Umami routes are not exposed. Set UMAMI_ORIGIN with
 * `wrangler secret put UMAMI_ORIGIN` (e.g. https://umami.example.com).
 */

const SCRIPT_PATH = "/s/x.js";
const COLLECT_PATH = "/s/e";
const ORIGIN_SCRIPT = "/script.js";
const ORIGIN_COLLECT = "/api/send";

export interface Env {
  UMAMI_ORIGIN: string;
}

function originBase(env: Env): string {
  return env.UMAMI_ORIGIN.replace(/\/$/, "");
}

function visitorIp(request: Request): string {
  return request.headers.get("CF-Connecting-IP") || "";
}

async function proxyScript(request: Request, env: Env): Promise<Response> {
  const url = `${originBase(env)}${ORIGIN_SCRIPT}`;
  const cache = caches.default;
  const cacheKey = new Request(url, { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  const upstream = await fetch(url, {
    headers: { "User-Agent": request.headers.get("User-Agent") || "kc-umami-proxy" },
  });
  if (!upstream.ok) {
    return new Response("tracker unavailable", { status: 502 });
  }

  let body = await upstream.text();
  body = body.replaceAll(ORIGIN_COLLECT, COLLECT_PATH);

  const response = new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
  try {
    await cache.put(cacheKey, response.clone());
  } catch {
    // Cache put is best-effort (quota / disallowed methods).
  }
  return response;
}

async function proxyCollect(request: Request, env: Env): Promise<Response> {
  if (request.method !== "POST" && request.method !== "OPTIONS") {
    return new Response("method not allowed", { status: 405 });
  }
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204 });
  }

  const headers = new Headers();
  headers.set("Content-Type", request.headers.get("Content-Type") || "application/json");
  headers.set("User-Agent", request.headers.get("User-Agent") || "");
  const ip = visitorIp(request);
  if (ip) {
    headers.set("X-Forwarded-For", ip);
    headers.set("X-Real-IP", ip);
  }

  const upstream = await fetch(`${originBase(env)}${ORIGIN_COLLECT}`, {
    method: "POST",
    headers,
    body: request.body,
  });

  return new Response(upstream.body, {
    status: upstream.status,
    headers: {
      "Content-Type": upstream.headers.get("Content-Type") || "application/json",
    },
  });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    if (!env.UMAMI_ORIGIN) {
      return new Response("UMAMI_ORIGIN not configured", { status: 500 });
    }
    const path = new URL(request.url).pathname;
    if (path === SCRIPT_PATH) return proxyScript(request, env);
    if (path === COLLECT_PATH) return proxyCollect(request, env);
    return new Response("not found", { status: 404 });
  },
};
