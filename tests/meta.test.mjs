import test from "node:test";
import assert from "node:assert/strict";
import { createMeta, readMetaStream } from "../server/meta.mjs";
const fake = "synthetic-test-key-not-a-credential";
function sse(answer, finish = "stop") {
  return new Response(
    `: heartbeat\r\ndata: ${JSON.stringify({ choices: [{ delta: { content: answer }, finish_reason: null }] })}\r\n\r\ndata: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: finish }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } })}\r\n\r\ndata: [DONE]\r\n\r\n`,
    { headers: { "Content-Type": "text/event-stream" } },
  );
}
test("Meta adapter forwards image, schema and bounded reasoning without Ollama-specific fields", async () => {
  let sent, headers, url;
  const meta = createMeta({
    key: () => fake,
    fetchImpl: async (u, o) => {
      url = u;
      headers = o.headers;
      sent = JSON.parse(o.body);
      return sse("µA visible reply");
    },
  });
  const events = [];
  const body = await meta.generate({
    model: "muse-spark-1.3",
    messages: [
      { role: "system", content: "Test rules" },
      { role: "user", content: "Read this", images: ["YWJj"] },
    ],
    schema: { type: "object" },
    responseMode: "quick",
    imageMime: "image/png",
    onProgress: (e) => events.push(e),
  });
  assert.equal(url, "https://api.meta.ai/v1/chat/completions");
  assert.equal(headers.Authorization, `Bearer ${fake}`);
  assert.equal(
    sent.messages[1].content[1].image_url.url,
    "data:image/png;base64,YWJj",
  );
  assert.equal(sent.reasoning_effort, "minimal");
  assert.equal(sent.max_tokens, 4096);
  assert.equal(sent.response_format.json_schema.strict, true);
  assert.ok(!("options" in sent));
  assert.ok(!("think" in sent));
  assert.equal(body.message.content, "µA visible reply");
  assert.equal(body.usage.totalTokens, 30);
  assert.ok(!JSON.stringify(events).includes(fake));
});
test("missing key makes no request and upstream errors do not expose provider bodies or retry", async () => {
  let calls = 0;
  await assert.rejects(
    createMeta({
      key: () => "",
      fetchImpl: async () => {
        calls++;
      },
    }).models(),
    /key is missing/,
  );
  assert.equal(calls, 0);
  for (const status of [401, 402, 403, 429, 500]) {
    calls = 0;
    const meta = createMeta({
      key: () => fake,
      fetchImpl: async () => {
        calls++;
        return new Response(JSON.stringify({ error: fake }), { status });
      },
    });
    try {
      await meta.models();
      assert.fail("Expected rejection");
    } catch (e) {
      assert.ok(!e.message.includes(fake));
      assert.equal(e.code, `META_HTTP_${status}`);
    }
    assert.equal(calls, 1);
  }
});
test("SSE stream joins split UTF-8 records and rejects incomplete or filtered replies", async () => {
  const text = await sse("µA test").text(),
    bytes = new TextEncoder().encode(text);
  const response = new Response(
    new ReadableStream({
      start(c) {
        for (let n = 0; n < bytes.length; n += 3)
          c.enqueue(bytes.slice(n, n + 3));
        c.close();
      },
    }),
  );
  assert.equal((await readMetaStream(response)).message.content, "µA test");
  await assert.rejects(
    readMetaStream(
      new Response('data: {"choices":[{"delta":{"content":"partial"}}]}\n\n'),
    ),
    /disconnected/,
  );
  await assert.rejects(
    readMetaStream(sse("blocked", "content_filter")),
    /did not complete/,
  );
});
