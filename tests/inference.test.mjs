import test from "node:test";
import assert from "node:assert/strict";
import { completedAnswer } from "../server/inference.mjs";
test("thinking-only, generation exhaustion and partial answers are distinct", () => {
  assert.throws(
    () =>
      completedAnswer({
        done_reason: "length",
        message: { thinking: "private test trace" },
      }),
    /generation budget/,
  );
  assert.throws(
    () =>
      completedAnswer({
        done_reason: "stop",
        message: { thinking: "private test trace" },
      }),
    /without a visible answer/,
  );
  assert.throws(
    () => completedAnswer({ done_reason: "stop", message: {} }),
    /without a visible answer/,
  );
  assert.match(
    completedAnswer({
      done_reason: "length",
      message: { content: "Partial reply" },
    }),
    /Incomplete response/,
  );
});
