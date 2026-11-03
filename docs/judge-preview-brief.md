# BenchMate judge preview: implementation brief

Prepared November 2, 2026. Planning artifact only; no preview has been built or deployed.

## Purpose

Give judges a quick, install-free way to understand the four tabs after watching the locked demo. Keep the working BenchMate app and real inventory intact. The preview is a separate static artifact, with curated sample data and recorded examples. It does not perform live model inference.

Use the existing React/Vite design and styling where practical. Avoid a framework migration for this small deliverable. Keep the preview source/output isolated from the server, local database, uploads, and environment configuration. Decide the actual hosting destination after checking the submission portal's access requirements.

## Persistent disclosure

**Interactive preview · sample data · no live AI**

Supporting copy: “Explore BenchMate's workflow using sample records and prerecorded model examples. Preview changes affect this browser only. The full app runs a backend for Meta inference and persistent inventory.”

Use disclosure on every tab and beside any simulated inference/action. Serve assets locally with the preview. Static asset requests are expected; runtime API calls and live provider credentials are not part of this build.

## Four-tab route

1. **Stash — Your parts, donors, and tools.** Show a compact sample collection with quantities, location, condition and identity provenance. A sample motor may be identified but untested. Intact donor devices and tools remain distinct from recovered installable parts.
2. **Boardroom — Keep knowledge with the board.** Use one reviewed board example. Select a number to show the matching name, evidence, confidence and remaining unknowns. Keep mapped components separate from recovered stock. Do not fabricate an 18-part map from a screenshot; use an actual reviewed export or explicitly authored illustrative sample.
3. **Build Ideas — A home for each conversation.** Provide a clearly labeled prerecorded example of reasoning from known stock toward Project Juno. Show the distinction between a suggestion and a saved inventory action. Do not present a canned reply as newly generated output.
4. **Projects — Plans, parts, progress, and next steps.** Show a small saved requirements list, one unresolved requirement, reserved stock, and a next action. An optional “Try a sample reservation” interaction can update a browser-local sample ledger and receipt. It cannot allocate tools, intact donors or unavailable quantities.

## Smallest useful interaction

Select a mapped component, inspect its evidence, open the project plan, reserve an available sample recovered part, read the sample receipt, and reset the preview. Showing identification is distinct from recording physical recovery. A reservation is planning bookkeeping, not proof of working condition or compatibility.

Sample numerical contract: three recovered motor units total; two initially reserved to a sample project; one available. Reserving one more yields three reserved and zero available. A duplicate confirmation must not reserve a fourth unit. Reset restores the initial fixture. These are illustrative numbers, not copied live inventory.

## Assets and copy

- Keep the finished video story: Juno, Boardroom, suggested requirements, and saved allocations.
- Owner-provided overall tab screenshots: `docs/01-2026-11-02 185330.png` through `docs/04-2026-11-02 185443.png`.
- Use only deliberately selected assets in the deploy output. Tonight's staging folder is local and is not a publication decision.
- Use actual reviewed board evidence where available. Do not make technical driver comparisons, guessed ratings, pinouts or wiring claims to fill a screen.
- The full app now uses Meta Model API only. The static preview makes no model calls.
- The full app's documentation grounding uses supplied links/excerpts; automatic datasheet retrieval is not a completed feature.

## Acceptance checks tomorrow

- [ ] Open each tab directly and navigate among all four at desktop and phone sizes.
- [ ] Keep the sample-data/no-live-AI disclosure visible throughout.
- [ ] Select a board number and verify its list/inspector identity matches.
- [ ] Run the sample reservation, duplicate confirmation, insufficient-stock rejection and reset without touching real inventory.
- [ ] Verify sample suggestions and mapped-on-board parts never silently become available stock.
- [ ] Serve all files/assets locally, then test the loaded preview with external API access blocked. No runtime API requests or external scripts/fonts should be needed.
- [ ] Inspect the final deploy output's allowlist; exclude backend code, database, private uploads, environment files and raw recordings. Check for credential patterns without printing secret values.
- [ ] Confirm portal expectations before choosing the demo URL field or describing this preview as satisfying judge-access requirements.

## Deferred

Live chat, provider setup, uploads, real-account sync, automatic datasheet fetching, new electrical advice and hardware control. The preview does not reopen the locked video.
