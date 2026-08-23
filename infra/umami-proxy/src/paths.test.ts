import { strict as assert } from "node:assert";
import { describe, it } from "node:test";
import {
  COLLECT_PATH,
  ORIGIN_COLLECT,
  matchProxyPath,
  originBase,
  rewriteTrackerScript,
  TRACKER_CACHE_VERSION,
  trackerCacheKeyUrl,
} from "./paths.ts";

describe("originBase", () => {
  it("strips a trailing slash", () => {
    assert.equal(originBase("https://umami.example.com/"), "https://umami.example.com");
  });

  it("leaves a slash-free origin unchanged", () => {
    assert.equal(originBase("https://umami.example.com"), "https://umami.example.com");
  });
});

describe("rewriteTrackerScript", () => {
  it("points collect calls at the same-origin path", () => {
    const src = `fetch("${ORIGIN_COLLECT}",{method:"POST"})`;
    assert.equal(rewriteTrackerScript(src), `fetch("${COLLECT_PATH}",{method:"POST"})`);
  });

  it("rewrites every occurrence", () => {
    const src = `${ORIGIN_COLLECT} ${ORIGIN_COLLECT}`;
    assert.equal(rewriteTrackerScript(src), `${COLLECT_PATH} ${COLLECT_PATH}`);
  });

  it("does not rewrite other Umami routes", () => {
    const src = 'fetch("/api/websites")';
    assert.equal(rewriteTrackerScript(src), src);
  });
});

describe("trackerCacheKeyUrl", () => {
  it("versions transformed responses without changing the upstream fetch URL", () => {
    const upstreamUrl = "https://umami.example.com/script.js";
    assert.equal(
      trackerCacheKeyUrl(upstreamUrl),
      `https://umami.example.com/script.js?__kc_proxy_transform=${TRACKER_CACHE_VERSION}`,
    );
    assert.equal(upstreamUrl, "https://umami.example.com/script.js");
  });

  it("preserves upstream query parameters", () => {
    assert.equal(
      trackerCacheKeyUrl("https://umami.example.com/script.js?locale=en"),
      `https://umami.example.com/script.js?locale=en&__kc_proxy_transform=${TRACKER_CACHE_VERSION}`,
    );
  });
});

describe("matchProxyPath", () => {
  it("routes the tracker and collect paths", () => {
    assert.equal(matchProxyPath("/s/x.js"), "script");
    assert.equal(matchProxyPath("/s/e"), "collect");
  });

  it("does not expose the dashboard or origin names", () => {
    assert.equal(matchProxyPath("/s/other"), null);
    assert.equal(matchProxyPath("/script.js"), null);
    assert.equal(matchProxyPath("/api/send"), null);
  });
});
