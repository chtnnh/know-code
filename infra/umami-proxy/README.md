# Same-origin Umami proxy

GitHub Pages cannot reverse-proxy. This Worker sits on `kc.chtnnhfoundation.org`
and forwards only the tracker + ingest paths to the self-hosted Umami origin,
so the browser never talks to a third-party analytics host (ad-blocker bypass).

| Public (docs domain) | Upstream |
|----------------------|----------|
| `GET /s/x.js` | `{UMAMI_ORIGIN}/script.js` |
| `POST /s/e` | `{UMAMI_ORIGIN}/api/send` |

Neutral path names (`/s/x.js`, `/s/e`) avoid EasyPrivacy hits on `umami`,
`analytics`, `script.js`, and `/api/send`. The dashboard is **not** proxied.

## One-time setup

1. **DNS.** `kc.chtnnhfoundation.org` must be orange-clouded on Cloudflare
   (proxied CNAME to GitHub Pages). SSL mode: **Full (strict)**.
2. **Umami website.** In the Umami dashboard, add website
   `kc.chtnnhfoundation.org` and copy the website ID.
3. **Umami IP header.** Set `CLIENT_IP_HEADER=x-forwarded-for` (or
   `cf-connecting-ip` if Umami itself sits behind Cloudflare) so country
   stats work.
4. **GitHub secrets** (Settings → Secrets and variables → Actions):

   | Secret | Value |
   |--------|--------|
   | `CLOUDFLARE_API_TOKEN` | Token with Workers Scripts Edit + Workers Routes Edit on this account |
   | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
   | `UMAMI_ORIGIN` | `https://<your-umami-host>` (no trailing slash) |

   First deploy: **Actions → umami-proxy → Run workflow**. Later pushes to
   `infra/umami-proxy/**` on `main` deploy automatically
   (`.github/workflows/umami-proxy.yml`). The action syncs `UMAMI_ORIGIN` as a
   Worker secret on each run.

   Manual fallback:

   ```bash
   npx wrangler secret put UMAMI_ORIGIN
   npx wrangler deploy
   ```

5. **Docs build.** Repo variable `UMAMI_WEBSITE_ID` (Settings → Secrets and
   variables → Actions → Variables). The docs workflow injects the script
   only when this is set. Redeploy docs (push to `main` that touches
   `website/**`, or `workflow_dispatch`).

6. **Smoke.** Open https://kc.chtnnhfoundation.org/s/x.js — should be
   JavaScript containing `/s/e`, not `/api/send`. Load a docs page with
   ad-blocker on; Umami realtime should show a view.

## Local docs

`docusaurus start` does not inject the script (`data-domains` would also
exclude `localhost`). No events leak from local preview.
