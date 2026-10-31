# BenchMate

Your scavenging partner for turning forgotten electronics into your next build.

Photograph electronic parts and donor devices, confirm their identities, maintain a reusable inventory, and create build plans grounded in matching datasheets and board documentation.

## Product foundation

- Inventory persists across projects; the product is not restricted to one kit or build.
- Photos produce candidate identities, not automatic confirmation. Ask for close-ups, markings, documentation, or user confirmation when needed.
- Keep component identity, condition, and electrical compatibility separate. Identifying an IC does not identify its carrier board or pinout.
- Suggest builds from available stock, distinguishing buildable now, needs verification, and missing parts.
- Reserve parts for projects; installed parts leave available stock but remain recorded in the project. Return recovered reusable parts to stock when dismantled.
- Record quantities and movements without double-counting donor devices and their recovered components. Potential salvage is not available stock until recovered.
- Ground component-specific electrical and wiring claims in the matching source, including page or section references. Unresolved details remain explicit.
- Save assembly progress, user-reported test results, and next actions. A user report or photo is not independent electrical verification.

## Boardroom and Parts Cache

Open **Boardroom** to add a board card, optionally link it to one unallocated Stash board or donor, and upload front/back photos or close-ups. Board records and component outlines persist in the local SQLite database. **Map with BenchMate** sends the selected photo to the selected provider and returns candidate components for review; it does not save a map or add stock. Add candidates to the draft, correct identities and outlines, and explicitly save. Strongly overlapping detections on the same photo are skipped when applying another proposal. Review close-ups and other views for duplicate physical components yourself.

Use **Draw component** to drag a rectangle manually; the inspector supports editable names, categories, exact markings, likely purpose, visible evidence, uncertainty, quantities, documentation excerpts, and outline coordinates. Each photo has its own map. Zoom and scroll to inspect small parts. Model provenance is retained on applied candidates. **Explain this component** and **Walk through this board** prepare a message and attach the board photo in the active conversation; review it and press Send. Changing tabs keeps the conversation and board draft mounted.

The **Parts Cache** groups matching readable markings for browsing and offers the ten component categories in **On boards** and **Recovered** views. Grouping does not confirm that parts are interchangeable. Mapped parts are potential salvage, not available stock. A photo alone cannot verify working condition, hidden connections, or exact electrical specifications.

After physically removing a component, save the board and use **Record recovery** with the quantity removed and storage location. Recovery atomically records provenance, deducts the on-board quantity, and adds unresolved, untested cache inventory. Recovered cache parts stay out of the main Stash grid, but use the existing inventory ledger for project reservation, installation, returns, edits, history, and export. Linked Stash sources become dismantled and unavailable intact after recovery. Stale writes, duplicate recovery requests, over-recovery, and recovery from allocated sources are rejected. Donor salvage recovery and Boardroom recovery cannot both be used for the same source after either has started.

Boardroom uses the existing Ollama/Meta connection, pairing, photo access controls, generation limits, and explicit hosted-provider selection. Mapping requires a vision-capable model. Real-model localization accuracy must be evaluated on actual board photos; synthetic HTTP tests validate the application flow and inventory boundaries, not recognition quality.

## Inventory lifecycle

**Identify → review → Save identification** records a completed photo identification. Saved results with a candidate name show **Identified from photo** and leave the **To identify / Unidentified** queue. Existing saved photo reviews receive the same display status automatically. An unclear result or a replacement photo still needs identification. **User-confirmed identity** is a separate, optional confirmation; identification never changes condition, quantity, or electrical compatibility.

Needs identification -> Available -> Reserved -> Installed

Recovered parts can return to Available. Consumed or damaged parts remain in history but are unavailable. Identity and condition are separate fields; an identified part may still be untested.

Each salvage tag should include a photo, candidate or confirmed identity, identification evidence, quantity, condition, source/donor, physical storage location, and linked documentation where available.

## Initial implementation direction

BenchMate supports Meta Model API and optional local Ollama inference. Local model performance depends on the installed model and hardware; BenchMate does not reconfigure CPU/GPU placement.

Store inventory and project state in an application database. Models propose changes through validated application tools; conversation history is not the stock ledger.

Choose demonstration hardware from reviewed Stash records. Identity, user-reported condition, and electrical compatibility are tracked separately; the app does not certify recovered hardware.

## Hackathon scope

Demonstrate the complete photo -> identification review -> inventory -> build suggestion -> sourced plan -> project allocation/recovery workflow. Support an extensible inventory while validating detailed technical guidance against a small documented evaluation set. Do not imply universal component recognition or physically verified builds before testing.

## Run the scaffold

Requires Node.js 24+. Use either local Ollama (normally port 11434) or Meta Model API with a backend key.

Double-click **Start-BenchMate.cmd**. It installs missing dependencies, builds the app, starts the server, waits for readiness, and opens the browser. Keep its terminal open. If BenchMate is already running on port 4317, the launcher opens that instance instead.

Readiness uses `http://127.0.0.1:4317/api/health` to avoid Windows PowerShell's slow `localhost` address fallback. The browser may still use `localhost`. To check the launcher without opening a browser, run `powershell.exe -NoProfile -File .\Start-BenchMate.ps1 -VerifyOnly`; this stops only the server it starts for that check and leaves an already-running BenchMate alone.

For development:

```powershell
npm.cmd install
npm.cmd run dev
```

For a production build:

```powershell
npm.cmd run build
npm.cmd start
```

## Meta hosted setup

Add your key to the project-root `.env` file (an empty template is provided):

```dotenv
MODEL_API_KEY=your-key-here
META_MODEL=muse-spark-1.3
```

`META_API_KEY` is accepted as an alias. Restart BenchMate after adding or changing the key. The backend loads it; do not use a `VITE_` variable, place it in frontend code, or paste it into the conversation. `.env*` files are ignored except `.env.example`. Never commit your key. Server environment variables take precedence over `.env` values.

Use the sidebar provider selector to choose Meta hosted API or Local Ollama. When no provider has been saved, the app starts on Meta if a key is configured, otherwise Ollama. You can override that initial choice with `BENCHMATE_PROVIDER=meta` or `ollama`; subsequent UI choices are saved. Each provider keeps its own model selection. Meta defaults to `muse-spark-1.3`; available Standard-mode Spark versions and `muse-wonder-1.0` are offered after an authenticated model-list check. If a selected model is unavailable, choose another explicitly; the app does not silently substitute one.

Hosted mode sends your question, bounded inventory/project context, up to six recent messages from the active conversation, and any selected photo to Meta. Inventory and photos remain stored locally, but these request contents leave the PC. The UI marks hosted mode beside the model selector and composer and notes that free-credit terms may allow product improvement. Cloud calls are made only by the backend to `https://api.meta.ai/v1`; the browser never receives the key. Meta API credentials, configuration errors, and provider error bodies are not returned verbatim to the browser.

Streaming chat and structured photo extraction share the existing edit/review/save workflow. Meta Quick reply uses minimal reasoning; Balanced uses low reasoning. Every generation is capped at 4,096 output/reasoning tokens, which is a per-request bound rather than an account spending limit. No automatic retries or fallback from Ollama to a paid/hosted provider occur. Usage tokens are shown for the last reply when supplied by the provider. Keep using Meta’s dashboard to monitor actual credit usage and billing.

Synthetic tests never load the real `.env` and route Meta requests to an isolated loopback stub. Explicit live smoke tests use only an empty temporary stash and optional generated test label:

```powershell
node scripts/verify-meta.mjs
node scripts/verify-meta.mjs --vision
```

See Meta’s [authentication](https://dev.meta.ai/docs/authentication), [chat completion](https://dev.meta.ai/docs/protocols/chat-completions), [image understanding](https://dev.meta.ai/docs/image-understanding), and [structured output](https://dev.meta.ai/docs/structured-output) documentation. The older `verify-live.mjs` remains explicitly Ollama-only, even when a cloud key exists.

Open `http://localhost:4317` on the PC. For a phone, use the same home network and the Phone URL printed in the terminal. Enter the eight-digit pairing code from that terminal. The code changes when the server restarts; paired sessions last up to twelve hours and end on restart. Windows Firewall or Wi-Fi client isolation may prevent phone access; no firewall rule is changed by the scaffold. Use this on a trusted home network; remote HTTPS hosting is not configured.

The phone uses its photo picker. Browser camera capture, HTTPS, and installable PWA packaging are not configured yet. Ollama remains on PC loopback; phones communicate with the BenchMate backend. Installed models are discovered automatically; Glimmer is selected by default when its name is present. Choosing another model is saved. Models must support images for photo review.

## What works now

- Responsive React/TypeScript interface with Salvage Bay styling and a CSS weathered-metal casing; no external fonts or asset requests.
- SQLite records with photo upload, manual identification evidence, condition, quantity, storage location, and manual documentation links/excerpts.
- Persistent projects, progress notes, next actions, reservation, installation, recovery, and movement history.
- Local Ollama or Meta hosted chat with inventory context, selected-item photo, identification prompts, build-idea prompts, and separate saved model selections.
- Photo review produces a validated, editable proposal for label text and identity observations. The user must save it to update the inventory card. Photo/model provenance and uncertainty are retained; model proposals never set identity to confirmed. The badge explicitly says “User-confirmed identity.”
- JSON record export. To back up photos and the actual database, stop the server and copy the entire `data/` directory. JSON export alone is not a complete backup or an import format.

The real inventory starts empty. No example parts are silently inserted. Quantity counts represent available units, while the “to identify” count represents unresolved records. Damaged and consumed stock is unavailable. Unresolved and untested parts may be reserved for planning; reservation does not confirm identity, compatibility, or working condition.

Project reservations accept available unresolved parts and show their identity/condition status. Tools, damaged/consumed stock, and dismantled donors are excluded. Open a saved Stash item → Details → Project allocations → Reserve for project to select a project and quantity. Save any item edits first. Stash cards show active reserved/installed quantities with project names; the editor also provides Return to stash. Projects retain Mark installed and Return controls. Returns restore available units without increasing total owned stock. An isolated browser check reserved two of three unresolved motor units, verified both views, and returned them to restore all three; no real inventory or model generation was used.

To remove a stash record, open its card and select Remove from stash. Undo restores the latest removal; the Removed filter provides persistent access to all removed records. Removal retains photos, evidence, and movement history, and excludes the record from stock and model inventory context. Reserved or installed parts must first be returned from their projects. This is recoverable removal, not permanent file deletion.

Stash has a Tools & equipment list with photo/thumbnail, condition, physical location, identity-review status, and quantity. Add tool presets the existing tool/equipment record type. Tools remain reusable bench resources, separate from parts/donor cards and the Available stock count; they have their own unit count and Tools filter. Clicking a tool opens the same editable form with Identify, remove/restore, and documentation support. Tools cannot be newly reserved or installed through component allocation. Existing historical allocations are retained; return them before changing an allocated record between component and equipment types. Build suggestions receive the tool classification and are instructed to distinguish equipment from components needed for a build.

An isolated browser check verified Add tool, search/filter, opening tool records, and separate totals: adding two equipment units increased the tool-unit count without changing three available component units. These were synthetic fixtures, not records inserted into the user's inventory.

Donor records support reviewable salvage maps and atomic recovery into linked child components. See the donor workflow below. Uploaded images that are abandoned before saving a record remain in the local photos directory; cleanup is not implemented yet.

## Donor salvage workflow

Open a Stash record to use Details, Specs & sources, and History. Donor devices also have a Salvage map tab. Photo-review provenance now lives under Specs & sources; editing details and identifying a photo still require explicit Save.

1. Add one physical device with record type Donor device and quantity 1. Add photos, exact markings, notes, and any matching document excerpts. Batch donor records must be split manually before mapping; the app does not silently change their quantities.
2. Save and reopen the donor, then choose Salvage map. Map salvage asks the selected model for up to 12 concrete assembly proposals; Add assembly works without a model. Existing rows are retained. Review duplicates, names, proposed quantities, evidence status, specification claims, unknowns, and reuse constraints before saving. All AI rows start as potential; observed/documented status requires user review. Hidden assemblies are hypotheses, and the map is not a complete teardown bill of materials.
3. After physically recovering an assembly, choose its actual quantity and storage location, then Record recovery. Unsaved edits must be saved first. Recovery creates a linked part with unresolved identity and untested condition, retains the map's claims and donor sources as unverified provenance, and records events for both records.
4. The first recovery marks the donor dismantled/consumed and unavailable as an intact device. Other proposed assemblies remain recoverable. The backend prevents exceeding each row's remaining quantity, stale/replayed recoveries, recovery from allocated/removed donors, and deletion or reduction of rows below their recovered totals. Changes are committed together in one SQLite transaction.

Potential assemblies never enter component stock or allocation lists. Removed recovered parts retain provenance; removing a child does not undo physical recovery or replenish the donor's map. The linked donor/child records can be opened from the editor when active; removed records must first be restored from Removed. Save keeps the normal editor behavior of committing and closing the record.

Map salvage uses the explicitly selected provider, with no cloud fallback. Local Qwen can map text/notes; a photo requires a model that supports images. No new Meta generation was used to test this feature. All 22 automated tests and the production build passed after this addition. Automated checks use synthetic fixtures and local model stubs. An isolated browser check exercised editable local Qwen proposals, manual corrections, save, partial recovery, parent/child provenance, history, and persistence across restart; it did not modify the real stash. This checks the workflow, not component-recognition or specification accuracy. Datasheet retrieval remains unfinished.

## Build Ideas conversation workspace

**New project** opens the setup form before creating a project or chat. **Create project** saves both together and opens the named project conversation; closing setup creates nothing. **New exploration** is a separate action for brainstorming before committing to a project. Existing explorations can still use **Make this a project** without losing their messages.

Build Ideas is the conversation hub: start an exploration, resume a project chat, or open the read-only earlier bench history. Each project has one conversation. Open project chat from Projects creates or resumes it. Make this a project opens a project draft and saves the new project and conversation link atomically; existing messages remain in the same conversation. An exploration can also link to an existing project that does not already have a chat. Names are editable.

Project chats show **Project inventory** beside Back to Stash / Expand. Its counts track reserved and installed units in the active project. Open it to see the assigned parts, grouped by Stash record; returned allocations are excluded. Click a part to open its existing record. The tracker refreshes with saved inventory changes, works in both conversation layouts, and closes with Escape or a click outside without navigating away from chat.

The side panel identifies the active exploration/project and Expand opens that same conversation in Build Ideas. Each conversation keeps its own composer draft, item/photo attachment, and scroll position in this browser. The active view and chat survive reload. Near the bottom, new replies follow automatically; when reading earlier messages, the position stays put and a New reply button appears. Moving between wide and side views keeps the active request mounted. Switching conversations waits for the current request to finish or stop.

Identify, donor salvage mapping, and Boardroom mapping return reviewable results to their item/board editors without adding scripted questions or responses to any chat, changing the chat draft, or scrolling it. Saving an item remains an explicit action. Existing global messages migrate without deletion into Earlier bench history; they are not silently assigned to a project and never enter new conversations' model history.

Explore my stash creates a fresh exploration in Build Ideas and starts the whole-stash ideas request. Reply mode, attachments, and model-context/usage details live under Reply settings. Hosted mode still identifies the provider and what leaves the PC. Merely opening a conversation or changing views does not call a model.

Synthetic tests cover legacy migration, history isolation, project context, promotion, identification separation, persistence, and existing inventory boundaries. Browser checks use an isolated database and delayed local model stub to verify drafts, reload position, new-reply behavior, inline Identify, and promotion without spending API credits or changing the real stash.

## Chat inventory actions

The camera in chat attaches a JPEG, PNG or WebP to the composer; it does not create stock or call a model. **Prepare Stash card**, or a request such as “Please add this to Stash”, sends that photo for a candidate identity and places an editable card in the conversation. Review the name, type, quantity, location, markings and notes, then choose **Add to Stash**. New photo cards start unresolved and untested, retain their source photo/model evidence, and warn about possible matching records. Quantity starts at one for review rather than being inferred from the picture. Card edits survive reload in this browser.

Clear current-user commands can update reservations directly: “Reserve 2 buzzer for Juno”, “Move 1 buzzer from Rover to this project”, or “Return 1 buzzer from Juno to Stash”. “Add three motors to Juno” also reserves parts. After saving a photo card, references such as “the motors we just added” or “Go ahead and add all three to Juno please” use the recent saved card in that conversation. Named parts accept regular singular/plural forms. Explicit “all” uses currently available units; number words one through twelve are accepted. Without a quantity, a review card asks you to choose. A unique one-unit reservation can omit the count when moving or returning. Otherwise choose the exact item, reservation, project and quantity in the review card. **Project parts** opens that form directly. Matching is deliberately conservative; unsupported wording can use the form. Examples, negated requests, quoted text, model output, photo contents and old chat messages cannot authorize direct execution.

Transfers and returns operate on reserved units only, including partial quantities. Installed parts require a separate physical recovery record. All stock checks, mutations, audit events and receipts commit together. Replaying an action or double-clicking its save returns the existing result without adding stock or moving it again. Dismissed cards cannot execute. Saved receipts remain in their originating conversation with a link to the Stash item. These actions do not automate physical recovery, installation, condition changes, project updates or Boardroom mapping.

## Model context

Every request builds a fresh compact catalog before adding detailed evidence. For a normal bench-sized stash this includes every active record's name, kind, total/free quantity, identity, condition, photo availability, active project allocations, dismantled state, and user-recorded recovery origin. Removed stock stays excluded. Project summaries include names, statuses and goals. Larger catalogs remain bounded and report exact omission counts instead of implying that missing detail means missing inventory.

The selected item, names/topics in the question, project allocations, and recovered components influence which detailed records receive space. Details can include saved notes, label text, identity evidence, recovery specification claims/unknowns, and matching excerpts from the most relevant supplied sources. Relevant project notes and next actions are included. Long fields/excerpts may be shortened around query terms. This is local deterministic retrieval, not an extra model call, autonomous browsing, or datasheet fetching. Selecting an item or naming it in a follow-up prioritizes its evidence. The model is instructed to request a specific missing photo, measurement, interface detail, or document section only when it materially affects the answer.

Current saved fields and notes override older AI observations. A recorded recovery is accepted as the user's physical-recovery bookkeeping, without claiming it verifies identity, electrical ratings, compatibility or working condition. Ordinary chat/build ideas do not receive old photo-review uncertainty; identification can receive a clearly historical observation for the selected item. Potential donor assemblies remain separate from actual stock. At most one explicitly selected/uploaded image is attached; seeing a photoAvailable flag does not mean the model sees that image.

Context data is bounded to 12,500 characters for local Ollama and 18,000 for Meta, plus system instructions, the current question and up to six shortened messages from the active conversation only. Both adapters use the same context builder. The Model context disclosure after a reply shows included/total inventory summaries, detailed item names, project-summary coverage, and whether a photo was attached. It describes the just-completed request and resets with the session's last-reply metrics on page reload.

All 26 tests passed, including long early evidence versus late recovered components, relevant notes/source selection, recorded-recovery precedence, bounded oversized catalogs, and HTTP report/image forwarding. Validation uses isolated synthetic data; it does not measure real component-recognition accuracy. A live local Qwen/browser check supplied 17/17 synthetic item summaries, 12 detailed records and one project. The reply accepted recorded LCD/speaker recovery and asked for interface evidence; the context disclosure correctly reported no attached photo. No Meta generation was used for this addition.

## Model and document boundaries

Generated replies provide advice and cannot mutate inventory. BenchMate separately handles the explicit chat inventory actions described above through validated application operations. Photo cards require an explicit save; clear reservation commands can execute directly and show a saved receipt. Chat is saved after a successful response; failed/cancelled requests do not create a successful chat record. Each exploration/project conversation has its own message history; earlier global history is read-only.

Stash includes identification directly in the item editor. Open a record, or add a new find and upload a photo, then select Identify. A structured photo review fills editable name/markings/evidence fields in that same form. Compare with the photo, correct the transcription, and save. Previously entered evidence is retained, and unreadable output does not erase previously saved markings. For a new unnamed find the candidate name fills the empty name field. Existing names and evidence are preserved; Use suggested name explicitly replaces an existing name and resets identity to unresolved for user review. Quantity, condition, notes, location, and sources are preserved. Identification does not create or update an inventory record until you save. The form stays open and locked while inference runs, with progress and Stop controls. Proposals are rejected if the record changes before application. Replacing the photo clears its old photo-review provenance. Printed capacities and output labels are treated as label claims, not tested electrical specifications or independently retrieved datasheet facts.

An earlier live Glimmer/browser check used `docs/synthetic-label.png` in an isolated stash: all six lines were transcribed, the inventory remained unchanged before Save, and the saved card retained the transcription while identity remained unresolved. This is a synthetic integration check, not an electronics-recognition accuracy evaluation. Online/connected status refers to a provider connection check, not proof of answer quality or that a local model is loaded.

The merged Stash workflow was also checked with live Glimmer in an isolated browser session: Identify populated the open form while preserving an unsaved quantity and note; Save then committed both the reviewed metadata and those edits. Automated checks cover new unsaved photo drafts, existing forms, unreadable labels, and stale versions.

Local Ollama requests use an 8K context. Both providers receive bounded context, at most one attached photo, a 4,096-token generation cap, and a five-minute timeout. Balanced mode requests low reasoning if the model advertises it; Quick reply requests reasoning off if supported. Otherwise the adapter uses only supported controls or leaves the model default unchanged. These settings apply per request and do not change Ollama's model defaults or CPU/GPU layer placement.

The conversation streams visible answer text and reports loading, reasoning, and writing phases without displaying internal reasoning. Failed requests retain the question for retry. Generation exhaustion, an empty answer, a disconnected stream, cancellation, and the five-minute deadline have distinct handling; truncated visible answers are marked incomplete. A local post-fix text smoke test completed in about 13 seconds; this is not a workload benchmark. Provider adapters live in `server/index.mjs`, `server/inference.mjs`, and `server/meta.mjs`. Local Ollama requests use no API credits. Selecting Meta hosted sends bounded context and any selected image to Meta and uses the account’s API credits/billing.

Ollama GPU initialization failures, memory allocation failures, and model-process crashes get concise actionable messages and a diagnostic code. This error handling does not repair the underlying runtime. A CUDA shared-object initialization crash was observed during model warm-up on this Windows machine; do not assume every such crash is out-of-memory. Try one fresh request, then restart Ollama or select another installed model if it repeats. BenchMate does not automatically restart Ollama, switch models, change drivers, or retry inference after a runtime crash. Ollama's own logs remain the source for low-level diagnostics.

Datasheet retrieval, source authenticity checks, PDF extraction, structured build plans, wiring verification, and a proven electronics-recognition evaluation set remain unfinished. Pasted excerpts are user-supplied evidence, not independently verified sources. Prompt instructions request uncertainty and source grounding; they do not guarantee model correctness.

## Verification

The initial public source snapshot passes all 46 automated tests and the production build. Tests cover conversation isolation, photo review, Boardroom recovery, inventory accounting, chat-created Stash cards, reservation transfers/returns, and duplicate-request protection. They use synthetic inventory and local provider stubs; they do not establish real-world component-recognition accuracy.

Meta integration was checked with 19 passing automated tests and a production build. Live `muse-spark-1.3` checks used an isolated empty stash: a short text response completed in about one second, and structured photo review transcribed all six lines of `docs/synthetic-label.png` in about two seconds without creating inventory. A browser check verified provider switching, preserved model selections, a streamed reply, and displayed token usage. These are individual synthetic integration checks, not performance benchmarks or electronics-identification accuracy results. No real stash records or photos were sent during these checks.

```powershell
npm.cmd test
npm.cmd run build
# Optional: makes a real local Ollama request using an isolated temporary stash.
node scripts/verify-live.mjs
node scripts/verify-live.mjs --vision
```

Automated tests use synthetic stock and a stub Ollama server to check allocation invariants, persistence across restart, image validation, model/photo context forwarding, inference errors, and the cross-origin boundary. Live smoke scripts do not populate the real stash. A live text smoke test with the installed `muse-glimmer:30b-q4_K_M` answered in about 57 seconds. A separate synthetic blank-image request answered in about 35 seconds and reported no identifiable components. These smoke checks establish connectivity, not real-component recognition quality or benchmark performance. Browser checks in a narrow viewport exercised adding a synthetic record, confirming identity, creating a project, reserving, installing, and returning a component; test stock was kept in a separate database. Access from a physical phone has not been verified.

Selected stack: React + TypeScript + Vite, Express, Node's built-in SQLite, local Ollama, and optional Meta Model API. Local data is excluded from source control. Open decisions: document retrieval, supported demonstration hardware, exact submission requirements, and how much inference latency is acceptable.

See [DESIGN.md](DESIGN.md) for the visual direction. BenchMate uses your existing Ollama installation; it does not install or reconfigure a model runtime.
