import test from "node:test";
import assert from "node:assert/strict";
import { createPhotoRecovery, photoRetryUrl } from "../src/photo-recovery.ts";

test("simultaneous failed thumbnails share a session renewal, later failures can renew again", async () => {
  let calls = 0,
    finish;
  const recover = createPhotoRecovery(async (url, options) => {
    calls++;
    assert.equal(url, "/api/session");
    assert.equal(options.cache, "no-store");
    await new Promise((resolve) => {
      finish = resolve;
    });
    return Response.json({ authenticated: true });
  });
  const grid = Array.from({ length: 24 }, () => recover());
  assert.equal(calls, 1);
  finish();
  assert.ok((await Promise.all(grid)).every(Boolean));
  const later = recover();
  assert.equal(calls, 2);
  finish();
  assert.equal(await later, true);
});

test("unpaired, unavailable and malformed session responses do not claim recovery", async () => {
  for (const request of [
    async () => Response.json({ authenticated: false }),
    async () => new Response("offline", { status: 503 }),
    async () => new Response("not json"),
    async () => {
      throw new TypeError("offline");
    },
  ])
    assert.equal(await createPhotoRecovery(request)(), false);
});

test("image retries bypass failed cached responses without dropping existing query parameters", () => {
  assert.equal(
    photoRetryUrl("/api/photos/a.jpg", 1),
    "/api/photos/a.jpg?photoRetry=1",
  );
  assert.equal(
    photoRetryUrl("/api/photos/a.jpg?size=small", 2),
    "/api/photos/a.jpg?size=small&photoRetry=2",
  );
});
