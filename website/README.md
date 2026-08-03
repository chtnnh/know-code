# know-code docs

Docusaurus site for [kc.chtnnhfoundation.org](https://kc.chtnnhfoundation.org).

Documents the sealed gate flow:

```text
attest-init → taught → ask → grade → pass → know-code commit
```

```bash
# from repo root
npm install
npm run build:docs
npm run start -w website
```

Deployed by [`.github/workflows/docs.yml`](../.github/workflows/docs.yml) to GitHub Pages. Custom domain: `static/CNAME` → `kc.chtnnhfoundation.org`.
