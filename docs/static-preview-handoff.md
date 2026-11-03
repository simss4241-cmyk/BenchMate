# BenchMate preview: handoff for Claude

The static preview is built and packaged. The working app and locked video are unchanged.

## Deliverable

- ZIP: `C:/Projects/NeuroForge/BenchMate/data/submission-ready/BenchMate-static-preview.zip`
- Source folder: `C:/Projects/NeuroForge/BenchMate/judge-preview/`
- Checksums: `data/submission-ready/preview-manifest.json`

Unzip the **contents** directly into the existing site's static folder for:

`https://neuroforged.net/lab/benchmate/preview/`

For a repository whose published static directory is `public`, that would be `public/lab/benchmate/preview/index.html` plus its sibling JS/CSS/assets. Use the actual site's publish root; do not assume the repository root is public. No npm install, build step, API service, environment variable or secret is needed.

Replace the existing “preview is being prepared” placeholder with an iframe or link. For example:

```html
<iframe
  src="./preview/"
  title="BenchMate interactive sample-data preview"
  loading="lazy"
  style="width:100%;height:1000px;border:0;border-radius:12px;background:#171e1a"
></iframe>
<p><a href="./preview/" target="_blank" rel="noopener">Open the full preview ↗</a></p>
```

Keep the existing parent-page sample-data/no-live-AI label and video. The preview has its own sticky disclosure banner. Do not merge its CSS or JS into the parent page; the iframe keeps the two designs separate. All local asset/module URLs are relative, so the preview works in the subdirectory. If the site applies restrictive iframe policies, allow this same-origin frame; no additional external service needs permission.

## What visitors can do

- Browse/search/filter four sample Stash records; inspect identity, condition and stock separately.
- Select any of 18 annotations from the ECU map already shown in the public video, including low-confidence candidates and unknown markings.
- Choose among three explicitly scripted conversation examples.
- Review and save a sample suggested-parts list without reserving stock.
- Reserve the one remaining sample motor for Juno. See the count move from 2 to 3 reserved, 1 to 0 available, and read the receipt.
- Reload to retain sample state or use **Reset sample**. No fourth motor, donor, tool or mapped-on-board component can be reserved as available recovered stock.

The inventory quantities are illustrative. The board annotations are a curated recorded example. Only the two selected, already-demonstrated photos and their relevant annotations were exported; photo metadata was stripped. No private notes, conversation records, database IDs, settings or live inventory allocations are included.

## Credential boundary

The package contains seven allowlisted static files. Its content policy includes `connect-src 'none'`, with no runtime request APIs, provider configuration or key fields. It cannot call the user's Meta backend or use the user's credits. The full BenchMate application remains separate and uses backend-only configuration.

The audit of the existing public repository and live site is recorded in `docs/public-exposure-audit.md`. Do not upload the whole BenchMate workspace, `data/`, a database, `.env`, server files or raw recordings. Deploy only the static preview ZIP contents into the existing site.

## Verification before calling the preview live

1. Open `/lab/benchmate/preview/` directly and confirm all four tabs and both photos load.
2. Open the embedded copy and check desktop and phone widths.
3. Follow Boardroom → Build Ideas → review/save plan → Projects → confirm one motor reservation. Confirm the receipt and counts.
4. Reset. Check the preview remains clearly labeled as sample data with no live AI.
5. Check the Network panel for unexpected runtime API requests. Static HTML, JS, CSS and image requests are normal.
6. Confirm the new static URL is accessible without an account and the existing video/page still work.

This package has been tested locally. Production publication and the existing site's deployment are handled separately by Claude; a local package is not evidence of a live preview.

Local verification: 79/79 offline tests passed. Browser checks covered component-number/inspector agreement, review/save without stock mutation, exact reservation/receipt counts, reload persistence, over-allocation prevention, reset, and responsive layout at 390 pixels. The sticky disclosure remained visible in the scrolled phone view. ZIP is approximately 352 KB. The preview server used only for QA has been stopped; production should serve the packaged files.
