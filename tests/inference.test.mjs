import test from "node:test";
import assert from "node:assert/strict";
import {
  thinkingFor,
  completedAnswer,
  readOllamaStream,
  inferenceFailure,
} from "../server/inference.mjs";
test("runtime crash messages are actionable without forwarding the Windows stack-overrun boilerplate", () => {
  const raw =
    "llama-server process has terminated: exit status 0xc0000409: The system detected an overrun of a stack-based buffer in this application. This overrun could potentially allow a malicious user to gain control of this application.: CUDA error: shared object initialization failed";
  const result = inferenceFailure(new Error(raw));
  assert.equal(result.code, "OLLAMA_CUDA_INITIALIZATION");
  assert.match(result.error, /initialize the GPU/);
  assert.ok(!result.error.includes("malicious"));
  assert.equal(inferenceFailure("CUDA out of memory").code, "OLLAMA_MEMORY");
  assert.equal(
    inferenceFailure("llama-server process has terminated").code,
    "OLLAMA_RUNNER_CRASH",
  );
  assert.equal(
    inferenceFailure("A normal validation error").error,
    "A normal validation error",
  );
});
test("reasoning controls use only model-advertised values", () => {
  const model = {
    thinking: { values: [false, "low", "high"], default: "high" },
  };
  assert.equal(thinkingFor(model, "balanced"), "low");
  assert.equal(thinkingFor(model, "quick"), false);
  assert.equal(thinkingFor({}), undefined);
  assert.equal(thinkingFor({ thinking: { values: [false] } }), false);
  assert.equal(thinkingFor({ thinking: { values: ["high"] } }), undefined);
});
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
test("stream parser joins split records and exposes progress without reasoning text", async () => {
  const text = [
    { message: { thinking: "private synthetic trace" } },
    { message: { content: "Visible " } },
    {
      message: { content: "answer" },
      done: true,
      done_reason: "stop",
      eval_count: 20,
    },
  ]
    .map((v) => JSON.stringify(v))
    .join("\n");
  const encoder = new TextEncoder(),
    bytes = encoder.encode(text),
    events = [];
  const response = new Response(
    new ReadableStream({
      start(c) {
        c.enqueue(bytes.slice(0, 17));
        c.enqueue(bytes.slice(17, 63));
        c.enqueue(bytes.slice(63));
        c.close();
      },
    }),
  );
  const result = await readOllamaStream(response, (e) => events.push(e));
  assert.equal(completedAnswer(result), "Visible answer");
  assert.equal(result.eval_count, 20);
  assert.deepEqual(
    events.map((e) => e.phase),
    ["thinking", "answering", "answering"],
  );
  assert.ok(!JSON.stringify(events).includes("private synthetic trace"));
});
test("premature stream ending cannot be saved as a completed answer", async () => {
  await assert.rejects(
    readOllamaStream(
      new Response(JSON.stringify({ message: { content: "partial" } })),
    ),
    /before Ollama completed/,
  );
});
