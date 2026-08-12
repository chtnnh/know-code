# know-code docs

Docusaurus site for [kc.chtnnhfoundation.org](https://kc.chtnnhfoundation.org).

```text
attest-init → range begin → taught → questions → ask → grade → pass
  → commit → range seal → push
```

```bash
# from repo root
npm install
npm run build:docs
npm run start -w website
```

Deployed by [`.github/workflows/docs.yml`](../.github/workflows/docs.yml) to GitHub Pages on pushes to `main` that touch `website/**` (and `workflow_dispatch`). Custom domain: `static/CNAME` → `kc.chtnnhfoundation.org`.

## Versions

| URL | Source | What it is |
|-----|--------|------------|
| `/` | `versioned_docs/version-<latest>/` | Latest released CLI (default) |
| `/HEAD/` | `docs/` | Unreleased docs on `main` |
| `/0.2.0/` | `versioned_docs/version-0.2.0/` | Older cuts |

The navbar dropdown switches versions. HEAD is labeled and bannered as unreleased; it is not the default.

Cut a new docs version **when you tag a release whose docs actually changed** (skip patch-only releases):

```bash
npm run docs:version -w website -- 0.4.0
```

That copies `docs/` → `versioned_docs/version-0.4.0/` and prepends `0.4.0` to `versions.json`, which makes it the new default at `/`. Commit those generated files with the release. Do not set `lastVersion: "current"` in `docusaurus.config.ts`.

Link between pages with relative `foo.md` paths, not `/foo` — absolute site paths always resolve to the default version.

Privacy-friendly pageviews go through a same-origin Umami proxy (`/s/x.js`, `/s/e`) so ad blockers that list third-party analytics hosts do not strip the tracker. See [`infra/umami-proxy/README.md`](../infra/umami-proxy/README.md).
