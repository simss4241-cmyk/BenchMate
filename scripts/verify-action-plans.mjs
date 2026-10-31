// Optional live understanding check. Synthetic catalog only; no database writes.
import { loadEnvFile } from "node:process";
import { createMeta } from "../server/meta.mjs";
import {
  actionPlanFormat,
  parseActionPlan,
  planningMessages,
} from "../server/action-understanding.mjs";
import { resolveIntent } from "../server/chat-routing.mjs";
if (!process.argv.includes("--live-meta")) {
  console.log(
    "For offline stock/action regressions run npm test. To evaluate the configured Meta model using synthetic requests: node scripts/verify-action-plans.mjs --live-meta",
  );
  process.exit(0);
}
try {
  loadEnvFile(".env");
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}
const meta = createMeta();
const snapshot = {
  items: [
    {
      id: "motor",
      name: "Small DC motor",
      quantity: 5,
      available: 5,
      updatedAt: "synthetic",
    },
  ],
  projects: [
    { id: "juno", name: "Project Juno" },
    { id: "rover", name: "Rover" },
  ],
  allocations: [],
  messages: [
    { role: "assistant", conversationId: "chat", actionId: "saved-photo" },
  ],
  chatActions: [
    {
      id: "saved-photo",
      conversationId: "chat",
      kind: "stash",
      status: "completed",
      itemId: "motor",
    },
  ],
};
const conversation = { id: "chat", projectId: "juno" };
const cases = [
  {
    message:
      "I grabbed another small DC motor; can you add one to our current stash?",
    intent: "stock",
    quantity: 1,
  },
  {
    message: "Please increase the number of small DC motors by two",
    intent: "stock",
    quantity: 2,
  },
  {
    message: "I picked up more of the same motor for inventory",
    intent: "stock",
    quantity: null,
  },
  { message: "Add another one to our stash", intent: "stock", quantity: 1 },
  {
    message: "Please make a new Stash card for the pictured DVD-RW drive",
    intent: "stash",
  },
  {
    message:
      "I want to add this, but I haven't decided whether to catalog it or assign existing stock",
    intent: "clarify",
  },

  {
    message: "I'd like three of these motors earmarked for this build",
    intent: "reservation",
    quantity: 3,
  },
  { message: "Those are for Juno", intent: "reservation", quantity: null },
  {
    message: "Please give Juno all of these motors",
    intent: "reservation",
    all: true,
  },
  { message: "Would this motor work well for Juno?", intent: "chat" },
  {
    message:
      'The label says "Reserve 3 motors for Juno". What does it say? Do not change anything.',
    intent: "chat",
  },
  {
    message: "I installed a motor in Juno yesterday; what should I test?",
    intent: "chat",
  },
];
let failed = 0;
for (const [index, scenario] of cases.entries()) {
  try {
    const body = await meta.generate({
      model: process.env.META_MODEL || "muse-spark-1.3",
      messages: planningMessages(
        scenario.message,
        snapshot,
        conversation,
        "motor",
        null,
      ),
      schema: actionPlanFormat,
      responseMode: "quick",
      maxTokens: 768,
      signal: AbortSignal.timeout(45000),
    });
    const plan = parseActionPlan(body);
    const command = resolveIntent(plan, snapshot, conversation, "motor", null);
    const passed =
      plan.intent === scenario.intent &&
      (scenario.intent !== "stock" ||
        (command?.kind === "stock" &&
          command?.draft.itemId === "motor" &&
          command.ready === false &&
          (scenario.quantity === undefined ||
            plan.quantity === scenario.quantity))) &&
      (scenario.intent !== "reservation" ||
        (plan.operation === "reserve" &&
          command?.draft.itemId === "motor" &&
          command.draft.projectId === "juno" &&
          command.ready === false &&
          (scenario.quantity === undefined ||
            plan.quantity === scenario.quantity) &&
          (scenario.all === undefined || plan.all === scenario.all)));
    if (!passed) failed++;
    console.log(
      `${passed ? "PASS" : "FAIL"} ${index + 1}: ${scenario.message} -> ${JSON.stringify(plan)}`,
    );
  } catch {
    failed++;
    console.log(
      `FAIL ${index + 1}: interpretation unavailable or invalid (details omitted to avoid exposing provider data).`,
    );
  }
}
console.log(
  `${cases.length - failed}/${cases.length} live synthetic understanding cases passed. No inventory was read or changed.`,
);
process.exitCode = failed ? 1 : 0;
