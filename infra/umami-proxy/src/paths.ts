/** Neutral public paths and Umami origin paths. Kept out of the fetch handler so tests run in Node. */

export const SCRIPT_PATH = "/s/x.js";
export const COLLECT_PATH = "/s/e";
export const ORIGIN_SCRIPT = "/script.js";
export const ORIGIN_COLLECT = "/api/send";

export type ProxyRoute = "script" | "collect";

export function originBase(origin: string): string {
  return origin.replace(/\/$/, "");
}

export function rewriteTrackerScript(body: string): string {
  return body.replaceAll(ORIGIN_COLLECT, COLLECT_PATH);
}

export function matchProxyPath(pathname: string): ProxyRoute | null {
  if (pathname === SCRIPT_PATH) return "script";
  if (pathname === COLLECT_PATH) return "collect";
  return null;
}
