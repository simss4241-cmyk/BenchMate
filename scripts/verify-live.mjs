// Opt-in smoke test against the user's running Ollama. Never modifies the real stash.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import assert from "node:assert/strict";
const temp = await mkdtemp(path.join(tmpdir(), "benchmate-live-"));
const child = spawn(process.execPath, ["server/index.mjs", "--production"], {
  env: {
    ...process.env,
    BENCHMATE_SKIP_ENV: "1",
    BENCHMATE_PROVIDER: "ollama",
    PORT: "4319",
    BENCHMATE_DATA: temp,
  },
  stdio: ["ignore", "pipe", "pipe"],
});
let log = "";
child.stdout.on("data", (b) => (log += b));
child.stderr.on("data", (b) => (log += b));
try {
  let cookie;
  for (let n = 0; n < 100; n++) {
    try {
      const r = await fetch("http://localhost:4319/api/session");
      if (r.ok) {
        cookie = r.headers.get("set-cookie").split(";")[0];
        break;
      }
    } catch {}
    if (child.exitCode !== null) throw new Error(log);
    await new Promise((r) => setTimeout(r, 100));
  }
  if (!cookie) throw new Error("Live test server did not start.");
  const headers = { Cookie: cookie, "Content-Type": "application/json" };
  const models = await (
    await fetch("http://localhost:4319/api/models", { headers })
  ).json();
  console.log(
    JSON.stringify({ selected: models.selected, connected: models.connected }),
  );
  const vision = process.argv.includes("--vision");
  let photo = null;
  if (vision) {
    const upload = await fetch("http://localhost:4319/api/photos", {
      method: "POST",
      headers,
      body: JSON.stringify({
        image:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLZkAAAAASUVORK5CYII=",
      }),
    });
    if (!upload.ok) throw new Error("Synthetic image upload failed.");
    photo = (await upload.json()).photo;
  }
  const start = Date.now();
  const response = await fetch("http://localhost:4319/api/chat", {
    method: "POST",
    headers,
    signal: AbortSignal.timeout(310000),
    body: JSON.stringify({
      message: vision
        ? "This is a synthetic blank image used to test the image adapter. In one or two sentences describe whether any identifiable electronics or readable markings are visible. Do not invent components."
        : "This is a scaffold smoke test. My inventory is empty. In one or two sentences, state whether you have enough confirmed parts to propose a build and what I should do next.",
      photo,
      mode: vision ? "identify" : "chat",
    }),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  console.log(
    JSON.stringify({
      model: result.model,
      elapsedSeconds: Math.round((Date.now() - start) / 1000),
      answer: result.answer,
    }),
  );
} finally {
  if (child.exitCode === null) {
    const exited = once(child, "exit");
    child.kill();
    await exited;
  }
  assert.equal(path.dirname(temp), path.resolve(tmpdir()));
  assert.ok(path.basename(temp).startsWith("benchmate-live-"));
  await rm(temp, { recursive: true, force: true });
}
