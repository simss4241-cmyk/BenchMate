// Opt-in Meta check: synthetic project/catalog only, no database access or writes.
import { loadEnvFile } from "node:process";
import { createMeta } from "../server/meta.mjs";
import {
  partsPlanFormat,
  partsPlanInstructions,
  parsePartsPlan,
} from "../server/project-parts.mjs";
if (!process.argv.includes("--live-meta")) {
  console.log(
    "Run npm test for offline coverage; add --live-meta for one synthetic project-parts generation.",
  );
  process.exit(0);
}
try {
  loadEnvFile(".env");
} catch (e) {
  if (e.code !== "ENOENT") throw e;
}
const model = process.env.META_MODEL || "muse-spark-1.3";
const item = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Small DC motor",
  kind: "part",
  quantity: 3,
  available: 2,
  identity: "unresolved",
  condition: "untested",
};
const project = {
  name: "Synthetic rover",
  goal: "Plan a small rover that can move; controller, driver and power design are not selected yet.",
  notes: "Only salvaged motors are on hand. No ratings have been verified.",
};
try {
  const body = await createMeta().generate({
    model,
    schema: partsPlanFormat,
    responseMode: "quick",
    maxTokens: 4096,
    signal: AbortSignal.timeout(60000),
    messages: [
      {
        role: "system",
        content:
          partsPlanInstructions +
          "\nACTIVE PROJECT: " +
          JSON.stringify(project) +
          "\nCURRENT SAVED STATE: " +
          JSON.stringify({ inventory: [item], allocations: [] }),
      },
      {
        role: "user",
        content:
          "Propose functional requirements, with missing parts and concrete checks. Use unknown quantities where the design doesn't establish them.",
      },
    ],
  });
  const plan = parsePartsPlan(body, { items: [item] }, model);
  if (
    !plan.rows.length ||
    !plan.rows.some((r) => !r.itemId) ||
    !plan.rows.every((r) => r.verification.trim())
  )
    throw new Error("Incomplete requirements/checks.");
  console.log(
    JSON.stringify({
      result: "PASS",
      rows: plan.rows.length,
      candidateMatches: plan.rows.filter((r) => r.itemId).length,
      unmatchedNeeds: plan.rows.filter((r) => !r.itemId).length,
      unknownQuantities: plan.rows.filter((r) => r.quantity === null).length,
      note: "Synthetic generation only; no real inventory read or changed.",
    }),
  );
} catch {
  console.error(
    "FAIL: project-parts generation or validation failed; provider details omitted.",
  );
  process.exitCode = 1;
}
