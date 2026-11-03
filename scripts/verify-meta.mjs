// Explicit live Meta smoke test. Uses only an empty temporary stash and optional synthetic label.
import { spawn } from "node:child_process";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import assert from "node:assert/strict";
const temp = await mkdtemp(path.join(tmpdir(), "benchmate-meta-live-"));
const child = spawn(process.execPath, ["server/index.mjs", "--production"], {
  env: {
    ...process.env,
    PORT: "4319",
    BENCHMATE_DATA: temp,
    BENCHMATE_SKIP_ENV: "0",
    BENCHMATE_TEST_MODE: "0",
  },
  stdio: ["ignore", "pipe", "pipe"],
});
// Do not echo process environment, auth headers, or provider bodies.
child.stdout.resume();
child.stderr.resume();
try {
  let cookie;
  for (let n = 0; n < 100; n++) {
    try {
      const r = await fetch("http://127.0.0.1:4319/api/session");
      if (r.ok) {
        cookie = r.headers.get("set-cookie").split(";")[0];
        break;
      }
    } catch {}
    if (child.exitCode !== null)
      throw new Error(
        "Meta test server exited during startup. Check .env formatting.",
      );
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!cookie) throw new Error("Meta test server did not start.");
  const headers = { Cookie: cookie, "Content-Type": "application/json" };
  const catalog = await (
    await fetch("http://127.0.0.1:4319/api/models", { headers })
  ).json();
  console.log(
    JSON.stringify({
      provider: catalog.provider,
      configured: catalog.configured,
      connected: catalog.connected,
      selected: catalog.selected,
    }),
  );
  if (!catalog.configured) {
    console.log("Live check pending: add MODEL_API_KEY to .env, then rerun.");
  } else {
    if (!catalog.connected)
      throw new Error(catalog.error || "Meta connection check failed.");
    const vision = process.argv.includes("--vision");
    let photo = null;
    if (vision) {
      const image = await readFile("docs/synthetic-label.png");
      const upload = await fetch("http://127.0.0.1:4319/api/photos", {
        method: "POST",
        headers,
        body: JSON.stringify({
          image: `data:image/png;base64,${image.toString("base64")}`,
        }),
      });
      if (!upload.ok) throw new Error("Synthetic image upload failed.");
      photo = (await upload.json()).photo;
    }
    const started = Date.now();
    const r = await fetch("http://127.0.0.1:4319/api/chat", {
      method: "POST",
      headers,
      signal: AbortSignal.timeout(310000),
      body: JSON.stringify({
        provider: "meta",
        model: catalog.selected,
        responseMode: "quick",
        photo,
        mode: vision ? "identify" : "chat",
        proposeIdentity: vision,
        message: vision
          ? "Review this synthetic test label. Transcribe only what is visible; do not treat printed claims as tested specifications."
          : "This is a synthetic BenchMate connection test with an empty stash. In one sentence, say what evidence is needed before identifying a part.",
      }),
    });
    const result = await r.json();
    if (!r.ok) throw new Error(result.error || "Meta generation failed.");
    console.log(
      JSON.stringify({
        provider: result.provider,
        model: result.model,
        elapsedSeconds: Math.round((Date.now() - started) / 1000),
        usage: result.usage,
        ...(vision ? { proposal: result.proposal } : { answer: result.answer }),
      }),
    );
    const state = await (
      await fetch("http://127.0.0.1:4319/api/state", { headers })
    ).json();
    assert.equal(state.items.length, 0);
  }
} finally {
  if (child.exitCode === null) {
    const ended = once(child, "exit");
    child.kill();
    await ended;
  }
  assert.equal(path.dirname(temp), path.resolve(tmpdir()));
  assert.ok(path.basename(temp).startsWith("benchmate-meta-live-"));
  await rm(temp, { recursive: true, force: true });
}
