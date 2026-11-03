import test from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
const fake = "synthetic-http-key-not-a-credential";
test(
  "Meta HTTP flow: Meta-only enforcement, streamed photos, errors, and no credential exposure",
  { timeout: 60000 },
  async () => {
    let sent,
      auth,
      fail = 0,
      metaCalls = 0,
      localCalls = 0;
    const upstream = createServer(async (req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/api/tags") {
        localCalls++;
        res.statusCode = 500;
        return res.end("{}");
      }
      metaCalls++;
      auth = req.headers.authorization;
      if (fail) {
        res.statusCode = fail;
        return res.end(JSON.stringify({ error: { message: fake } }));
      }
      if (req.url === "/v1/models")
        return res.end(
          JSON.stringify({
            data: [{ id: "muse-spark-1.3" }, { id: "muse-wonder-1.0" }],
          }),
        );
      if (req.url === "/v1/chat/completions") {
        let raw = "";
        for await (const chunk of req) raw += chunk;
        sent = JSON.parse(raw);
        const answer = sent.response_format?.json_schema?.schema?.properties
          ?.intent
          ? JSON.stringify({
              intent: "chat",
              operation: null,
              item: null,
              destination: null,
              source: null,
              quantity: null,
              all: false,
            })
          : sent.response_format
            ? JSON.stringify({
                candidateName: "Synthetic label",
                ...(sent.response_format?.json_schema?.schema?.properties
                  ?.benchRelevance
                  ? { benchRelevance: "bench_item" }
                  : {}),
                markings: "MODEL QA",
                markingsStatus: "readable",
                evidence: "Test fixture label.",
                uncertainty: "Not actual hardware.",
              })
            : "Synthetic hosted reply.";
        res.setHeader("Content-Type", "text/event-stream");
        res.write(
          `data: ${JSON.stringify({ choices: [{ delta: { content: answer }, finish_reason: null }] })}\n\n`,
        );
        return res.end(
          `data: ${JSON.stringify({ choices: [{ delta: {}, finish_reason: "stop" }], usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 } })}\n\ndata: [DONE]\n\n`,
        );
      }
      res.statusCode = 404;
      res.end("{}");
    });
    upstream.listen(0, "127.0.0.1");
    await once(upstream, "listening");
    const temp = await mkdtemp(path.join(tmpdir(), "benchmate-meta-http-"));
    const probe = createServer();
    probe.listen(0, "127.0.0.1");
    await once(probe, "listening");
    const port = probe.address().port;
    await new Promise((r) => probe.close(r));
    let child,
      cookie = "",
      output = "";
    const start = async (key, selected = "muse-spark-1.3") => {
      output = "";
      cookie = "";
      child = spawn(process.execPath, ["server/index.mjs", "--production"], {
        env: {
          ...process.env,
          PORT: String(port),
          BENCHMATE_DATA: temp,
          BENCHMATE_SKIP_ENV: "1",
          BENCHMATE_TEST_MODE: "1",
          BENCHMATE_PROVIDER: "ollama",
          MODEL_API_KEY: key,
          META_API_KEY: "",
          META_MODEL: selected,
          BENCHMATE_META_TEST_PORT: String(upstream.address().port),
          BENCHMATE_OLLAMA_PORT: String(upstream.address().port),
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.on("data", (b) => (output += b));
      child.stderr.on("data", (b) => (output += b));
      for (let n = 0; n < 100; n++) {
        try {
          const r = await fetch(`http://127.0.0.1:${port}/api/session`);
          if (r.ok) {
            cookie = r.headers.get("set-cookie").split(";")[0];
            return;
          }
        } catch {}
        if (child.exitCode !== null) throw new Error("Test server exited.");
        await new Promise((r) => setTimeout(r, 50));
      }
      throw new Error("Test server did not start.");
    };
    const stop = async () => {
      if (child?.exitCode === null) {
        const ended = once(child, "exit");
        child.kill();
        await ended;
      }
    };
    const call = async (
      route,
      body,
      method = body === undefined ? "GET" : "POST",
    ) => {
      const r = await fetch(`http://127.0.0.1:${port}/api${route}`, {
        method,
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return { status: r.status, body: await r.json() };
    };
    try {
      await start("");
      assert.equal((await call("/models")).body.configured, false);
      assert.equal(
        (await call("/chat", { message: "No key", photo: null })).status,
        502,
      );
      assert.equal(metaCalls, 0);
      assert.equal(localCalls, 0);
      await stop();
      await start(fake);
      const catalog = await call("/models");
      assert.equal(catalog.body.provider, "meta");
      assert.equal(catalog.body.connected, true);
      assert.equal(catalog.body.selected, "muse-spark-1.3");
      assert.ok(!JSON.stringify(catalog).includes(fake));
      const upload = await call("/photos", {
        image:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLZkAAAAASUVORK5CYII=",
      });
      const raw = await fetch(`http://127.0.0.1:${port}/api/chat`, {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Synthetic extraction",
          provider: "meta",
          model: "muse-spark-1.3",
          photo: upload.body.photo,
          mode: "identify",
          proposeIdentity: true,
          progress: true,
        }),
      });
      const wire = await raw.text(),
        events = wire.trim().split("\n").map(JSON.parse),
        done = events.find((e) => e.type === "done");
      assert.equal(done.provider, "meta");
      assert.equal(done.proposal.markings, "MODEL QA");
      assert.equal(done.usage.totalTokens, 30);
      assert.equal(auth, `Bearer ${fake}`);
      assert.equal(sent.response_format.type, "json_schema");
      assert.equal(sent.reasoning_effort, "low");
      assert.match(
        sent.messages.at(-1).content[1].image_url.url,
        /^data:image\/png;base64,/,
      );
      assert.equal((await call("/state")).body.items.length, 0);
      assert.equal((await call("/state")).body.messages.length, 0);
      assert.ok(!wire.includes(fake));
      assert.equal(localCalls, 0);
      await call("/model", { model: "muse-wonder-1.0" }, "PUT");
      assert.equal((await call("/models")).body.selected, "muse-wonder-1.0");
      fail = 429;
      const failure = await call("/chat", {
        message: "Rate-limit test",
        photo: null,
      });
      assert.equal(failure.status, 502);
      assert.match(failure.body.error, /rate-limiting/);
      assert.ok(!JSON.stringify(failure).includes(fake));
      assert.equal((await call("/state")).body.messages.length, 0);
      assert.equal(localCalls, 0);
      fail = 0;
      const before = metaCalls;
      assert.equal(
        (await call("/provider", { provider: "ollama" }, "PUT")).status,
        400,
      );
      assert.equal(
        (await call("/model", { model: "qwen2.5:14b" }, "PUT")).status,
        400,
      );
      assert.equal(
        (await call("/chat", { message: "Reject local", provider: "ollama" }))
          .status,
        400,
      );
      assert.equal(metaCalls, before);
      assert.equal(localCalls, 0);
      assert.equal((await call("/models")).body.selected, "muse-wonder-1.0");
      const envResponse = await fetch(`http://127.0.0.1:${port}/.env`);
      assert.ok(!(await envResponse.text()).includes(fake));
      const beforeTwoPass = metaCalls;
      const advice = await call("/chat", {
        message: "Could I use a motor for this build?",
        provider: "meta",
        model: "muse-wonder-1.0",
      });
      assert.equal(advice.status, 200);
      assert.equal(advice.body.answer, "Synthetic hosted reply.");
      assert.equal(advice.body.usage.totalTokens, 60);
      assert.equal(metaCalls, beforeTwoPass + 2);
      assert.ok(!output.includes(fake));
      await stop();
      // A corrupt saved selection cannot be advertised or sent to the provider.
      const { DatabaseSync } = await import("node:sqlite");
      const db = new DatabaseSync(path.join(temp, "benchmate.sqlite"));
      db.prepare("UPDATE settings SET value=? WHERE key='meta_model'").run(
        "qwen2.5:14b",
      );
      db.close();
      await start(fake);
      const invalid = await call("/models");
      assert.equal(invalid.body.selected, "");
      assert.ok(!invalid.body.models.includes("qwen2.5:14b"));
      const beforeInvalid = metaCalls;
      const rejected = await call("/chat", {
        message: "Invalid saved selection",
        photo: null,
      });
      assert.equal(rejected.status, 502);
      assert.match(rejected.body.error, /supported Meta model/);
      assert.equal(metaCalls, beforeInvalid);
      assert.equal(localCalls, 0);
    } finally {
      await stop();
      await new Promise((r) => upstream.close(r));
      assert.equal(path.dirname(temp), path.resolve(tmpdir()));
      assert.ok(path.basename(temp).startsWith("benchmate-meta-http-"));
      await rm(temp, { recursive: true, force: true });
    }
  },
);
