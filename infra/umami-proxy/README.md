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

`workers_dev` stays off so Cloudflare does not publish
`kc-umami-proxy.<account>.workers.dev` (the hostname would contain `umami`).
Do not attach this Worker as a custom domain on `kc.chtnnhfoundation.org` —
that would steal the host from GitHub Pages. The zone route `/s/*` is enough.

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
   | `CLOUDFLARE_API_TOKEN` | Account-scoped token with **Workers Scripts Edit** (uploads the Worker) and **Workers Routes Edit** (attaches `/s/*`). Routes Edit alone leaves the route defined and the script missing. |
   | `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID |
   | `UMAMI_ORIGIN` | `https://<your-umami-host>` (no trailing slash) |

   First deploy: **Actions → umami-proxy → Run workflow**. Later pushes to
   `infra/umami-proxy/**` on `main` deploy automatically
   (`.github/workflows/umami-proxy.yml`). The workflow **deploys the Worker,
   then** binds `UMAMI_ORIGIN`. Putting the secret first fails when the Worker
   does not exist yet.

   Manual fallback (same order):

   ```bash
   npx wrangler deploy
   npx wrangler secret put UMAMI_ORIGIN
   ```

5. **Docs build.** Repo variable `UMAMI_WEBSITE_ID` (Settings → Secrets and
   variables → Actions → Variables). The docs workflow injects the script
   only when this is set. Redeploy docs (push to `main` that touches
   `website/**`, or `workflow_dispatch`).

6. **Smoke.** Open https://kc.chtnnhfoundation.org/s/x.js — should be
   JavaScript containing `/s/e`, not `/api/send`. Load a docs page with
   ad-blocker on; Umami realtime should show a view.

## Local

```bash
cd infra/umami-proxy
npm install
npm test
npx wrangler deploy --dry-run
```

`docusaurus start` does not inject the script (`data-domains` would also
exclude `localhost`). No events leak from local preview.
