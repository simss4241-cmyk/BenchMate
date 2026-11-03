# Submission model boundary

Updated November 3, 2026. The owner chose **Meta Model API only**.

## Enforced behavior

- Generation and model discovery use the backend Meta adapter only. The local runtime client, model discovery, stream parser and live smoke script have been removed.
- Supported Muse Spark/Wonder model IDs are explicitly allowlisted in `server/meta.mjs`. Unsupported model changes and stale non-Meta provider requests are rejected before any model call.
- Missing keys, quotas and upstream failures never activate another provider or trigger automatic retries. A corrupt saved Meta selection cannot be sent upstream or advertised in the selector.
- The sidebar and setup documentation expose Meta Model API only. The old provider environment override has no effect.
- Startup deletes only the obsolete `provider` and `model` settings. It preserves `meta_model`, unrelated settings, inventory, boards, photos, allocations and conversation history. An already-running old process needs a restart to apply this migration and the new backend.
- No installed system models are deleted, and prior Git history is not rewritten. Historical model names remain in negative tests to verify rejection.
- The separate static judge preview still uses sample data and recorded examples, with no live model connection or API credentials.

## Verification

- Production TypeScript/Vite build passed.
- 76 automated tests passed using synthetic credentials and temporary databases. Coverage includes Meta HTTP/SSE photo forwarding, missing keys, quota failures, provider/model rejection, corrupt saved selections, and legacy-settings migration with identical inventory/history snapshots.
- Four tests specific to the deleted local adapter were retired; a settings-preservation regression was added. The previous 79-test count is therefore not the current suite size.
- No real `.env` contents were read, no live Meta generations were requested, and the user's live database was not modified during these checks.

## Event wording

The authenticated [participant guide](https://cerebralvalley.ai/e/meta-ai-developer-hackathon/details) requires incorporation of Meta models and also permits Meta open weights. API-only is the owner's chosen product boundary; it should not be described as a categorical event ban on all local models.
