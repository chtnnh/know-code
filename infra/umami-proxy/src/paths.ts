/** Neutral public paths and Umami origin paths. Kept out of the fetch handler so tests run in Node. */

export const SCRIPT_PATH = "/s/x.js";
export const COLLECT_PATH = "/s/e";
export const ORIGIN_SCRIPT = "/script.js";
export const ORIGIN_COLLECT = "/api/send";
// Umami appends this suffix to the directory containing its tracker script.
// With /s/x.js, /e produces the public collector endpoint /s/e.
export const TRACKER_COLLECT_SUFFIX = "/e";

// Bump this whenever the Worker changes the transformed tracker response.
// Cache API entries outlive Worker deployments, so this avoids serving a
// response produced by an older transform.
export const TRACKER_CACHE_VERSION = "v2";

export type ProxyRoute = "script" | "collect";

export function originBase(origin: string): string {
  return origin.replace(/\/$/, "");
}

export function rewriteTrackerScript(body: string): string {
  return body.replaceAll(ORIGIN_COLLECT, TRACKER_COLLECT_SUFFIX);
}

/** Versioned Cache API key; never use this URL for the upstream fetch. */
export function trackerCacheKeyUrl(upstreamUrl: string): string {
  const cacheUrl = new URL(upstreamUrl);
  cacheUrl.searchParams.set("__kc_proxy_transform", TRACKER_CACHE_VERSION);
  return cacheUrl.toString();
}

export function matchProxyPath(pathname: string): ProxyRoute | null {
  if (pathname === SCRIPT_PATH) return "script";
  if (pathname === COLLECT_PATH) return "collect";
  return null;
}
