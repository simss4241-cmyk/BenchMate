# BenchMate public exposure audit

Checked November 3, 2026. Result: **no exposed credentials or private runtime-data files found in the surfaces checked**. This is a scoped inspection, not a guarantee against every secret format or every possible external exposure.

## Public repository

- Repository: https://github.com/simss4241-cmyk/BenchMate
- GitHub main and a newly downloaded public Git mirror agreed on `7c19bee0f18083027baf98f1c9a709aea861fc01`.
- Scanned all 3 reachable public commits / 90 unique published blobs with provider-token, private-key and high-entropy credential-assignment patterns. No findings.
- No published `.env`, database, private-key file or `data/`/photo runtime paths were found in that history.
- `.env`, `data/`, SQLite databases and local build output are ignored locally. `.env.example` is the tracked configuration template; `.env` is not tracked.
- Scanned current non-ignored working text files and the built frontend bundle. No credential-pattern findings.
- The actual local `.env` was never opened, printed, uploaded or compared by this audit. No secret values appear in the reports.

Source code refers to backend environment variables (`MODEL_API_KEY` / `META_API_KEY`); referring to a variable name does not expose its value. `server/meta.mjs` reads the configured value on the backend and uses it for the Meta request. The frontend does not receive the key. Existing synthetic HTTP tests cover error/credential exposure using a fake credential, not the owner's live key.

Someone cloning the published repository does not acquire the owner's local environment file or API credential. They need their own provider configuration to run the live model features.

## Current public website

The actual page at https://neuroforged.net/lab/benchmate/ returned HTTP 200. These requests returned HTTP 404 rather than an environment file, database, backend source or BenchMate API response:

| Public path | Result |
| --- | --- |
| `/.env` | 404 |
| `/lab/benchmate/.env` | 404 |
| `/data/benchmate.sqlite` | 404 |
| `/server/meta.mjs` | 404 |
| `/api/models` | 404 |
| `/api/state` | 404 |
| `/lab/benchmate/api/models` | 404 |

The HTML checked did not contain a literal Meta key assignment. These bounded path probes do not enumerate every file, deployment, hostname or Netlify account setting. No change was made to the live site by this audit.

## New static preview

- Exact package allowlist: `index.html`, `style.css`, `app.js`, `state.js`, `sample.js`, `assets/ecu.jpg`, `assets/motors.jpg`.
- No server code, environment file, API credentials, database, account tokens, real chat history or raw recordings.
- No runtime request API (`fetch`, XHR, WebSocket, EventSource, sendBeacon), provider configuration, localhost backend reference or credential-like value passed the packaging checks.
- HTML content policy includes `connect-src 'none'`; assets and scripts are same-origin files. No remote fonts, analytics or provider SDK is used.
- Two deliberately selected photos already demonstrated in the public video are included with metadata stripped. The curated recorded ECU annotations omit internal database IDs, settings and private notes. Inventory records/quantities are explicitly illustrative.
- Reservations and plan saves affect only the preview's browser-local sample state. No interaction can spend the owner's Meta credits or mutate the real inventory through this package.

## Verification

- 3 focused state tests passed: exact quantity changes and duplicate confirmation; stale/invalid/over-stock requests and ineligible item types; invalid persisted-state rejection.
- Complete offline regression suite passed: **79/79** tests, including the existing synthetic HTTP/provider-boundary tests and the three new preview state tests. No live Meta requests or real inventory changes were used for this run.
- Browser flow passed: select board component #10 → matching low-confidence inspector; review/save plan with no stock change; confirm the remaining motor → 3 reserved/0 available and a receipt; reload retains state; a fourth motor is disabled; reset restores 2 reserved/1 available.
- At 390-pixel phone width, document width equaled scroll width (375 pixels after the scrollbar), with no horizontal overflow. Selecting a component brings its inspector into view; sample-data disclosure remains visible while scrolled.
- Browser error-log check returned no errors. Local server access logs for the exercised flow contained static resources and the browser's favicon request; no `/api` requests occurred.
- ZIP file inventory and integrity passed. SHA-256 hashes are recorded in `data/submission-ready/preview-manifest.json`.

## Boundaries and next step

No key rotation is indicated by these findings. This audit did not inspect Meta account permissions, unrelated repositories, other historic deployments, or keys shared elsewhere. It does not establish that exposing the full local backend to the internet would be safe; that is a separate deployment task.

Deploy **only the preview ZIP contents** into the existing site's preview subdirectory. After Claude deploys, verify the real production URL, iframe behavior and lack of API calls. The existing public repository is behind the current local Boardroom/project-parts changes; reviewing/pushing those changes is a separate outstanding step.

Machine-readable reports stay local: `data/security-audit/credential-scan.json` and `data/security-audit/live-check.json`.
