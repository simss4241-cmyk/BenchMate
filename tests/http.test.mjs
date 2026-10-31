import test from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { once } from "node:events";
import { identityStatus } from "../src/identity-draft.ts";
import { randomUUID } from "node:crypto";

test(
  "authenticated HTTP flow: photos, persistence, allocation, model context and origin boundary",
  { timeout: 60000 },
  async () => {
    let chatBody,
      failChat = false,
      thinkingOnly = false,
      slowReply = false,
      actionPlan = {
        intent: "chat",
        operation: null,
        item: null,
        destination: null,
        source: null,
        quantity: null,
        all: false,
      },
      planCalls = 0,
      photoRelevance = "bench_item";
    const mock = createServer(async (req, res) => {
      res.setHeader("Content-Type", "application/json");
      if (req.url === "/api/tags")
        return res.end(JSON.stringify({ models: [{ name: "test-glimmer" }] }));
      if (req.url === "/api/show")
        return res.end(
          JSON.stringify({
            thinking: { values: [false, "low", "high"], default: "high" },
          }),
        );
      if (req.url === "/api/chat") {
        let body = "";
        for await (const chunk of req) body += chunk;
        chatBody = JSON.parse(body);
        if (chatBody.format?.properties?.intent) {
          planCalls++;
          return res.end(
            JSON.stringify({
              message: {
                content:
                  typeof actionPlan === "string"
                    ? actionPlan
                    : JSON.stringify(actionPlan),
              },
              done: true,
              done_reason: "stop",
            }) + "\n",
          );
        }
        if (chatBody.format?.properties?.regions)
          return res.end(
            JSON.stringify({
              message: {
                content: JSON.stringify({
                  summary: "Synthetic board map",
                  regions: [
                    {
                      name: "Test IC",
                      category: "Other chips",
                      markings: "TEST-123",
                      description: "Candidate chip",
                      evidence: "Visible package",
                      uncertainty: "Not electrically tested",
                      confidence: "medium",
                      bounds: { x: 0.2, y: 0.3, width: 0.2, height: 0.1 },
                    },
                  ],
                }),
              },
              done: true,
              done_reason: "stop",
            }),
          );
        if (chatBody.format?.properties?.components)
          return res.end(
            JSON.stringify({
              message: {
                content: JSON.stringify({
                  components: [
                    {
                      name: "Synthetic speaker",
                      quantity: 2,
                      evidenceStatus: "observed",
                      evidence: "Test hypothesis",
                      specs: "",
                      unknowns: "Need interior photo",
                      reuse: "Needs an amplifier",
                    },
                  ],
                }),
              },
              done: true,
              done_reason: "stop",
            }),
          );
        if (chatBody.format)
          return res.end(
            JSON.stringify({
              message: {
                content: JSON.stringify({
                  candidateName: "Synthetic power bank",
                  ...(chatBody.format?.properties?.benchRelevance
                    ? { benchRelevance: photoRelevance }
                    : {}),
                  markings:
                    "MODEL TEST-703955\n10000 mAh / 37 Wh\n5 V ⎓ 2 A in\n2.1 A out on each port",
                  markingsStatus: "readable",
                  evidence: "Printed label visible in synthetic fixture.",
                  uncertainty:
                    "Label claims have not been electrically tested.",
                }),
              },
              done: true,
              done_reason: "stop",
            }),
          );
        if (slowReply) {
          res.write(
            JSON.stringify({
              message: { thinking: "private synthetic trace" },
            }) + "\n",
          );
          const timer = setTimeout(
            () =>
              res.end(
                JSON.stringify({
                  message: { content: "Late reply" },
                  done: true,
                  done_reason: "stop",
                }),
              ),
            2000,
          );
          res.on("close", () => clearTimeout(timer));
          return;
        }
        if (thinkingOnly)
          return res.end(
            JSON.stringify({
              message: { thinking: "private synthetic trace" },
              done: true,
              done_reason: "length",
            }),
          );
        res.statusCode = failChat ? 503 : 200;
        return res.end(
          JSON.stringify(
            failChat
              ? {
                  error:
                    failChat === "cuda"
                      ? "llama-server process has terminated: exit status 0xc0000409: CUDA error: shared object initialization failed"
                      : "Synthetic model failure",
                }
              : {
                  message: {
                    content:
                      "Synthetic answer: identity unresolved; please provide a close-up.",
                  },
                  total_duration: 1000000000,
                  done: true,
                  done_reason: "stop",
                },
          ),
        );
      }
      res.statusCode = 404;
      res.end("{}");
    });
    mock.listen(0, "127.0.0.1");
    await once(mock, "listening");
    const temp = await mkdtemp(path.join(tmpdir(), "benchmate-http-"));
    const port = await new Promise((resolve) => {
      const probe = createServer();
      probe.listen(0, "127.0.0.1", () => {
        const p = probe.address().port;
        probe.close(() => resolve(p));
      });
    });
    let child,
      output = "";
    const start = async () => {
      output = "";
      child = spawn(process.execPath, ["server/index.mjs", "--production"], {
        cwd: process.cwd(),
        env: {
          ...process.env,
          BENCHMATE_SKIP_ENV: "1",
          BENCHMATE_PROVIDER: "ollama",
          PORT: String(port),
          BENCHMATE_DATA: temp,
          BENCHMATE_OLLAMA_PORT: String(mock.address().port),
        },
        stdio: ["ignore", "pipe", "pipe"],
      });
      child.stdout.on("data", (b) => (output += b));
      child.stderr.on("data", (b) => (output += b));
      for (let n = 0; n < 100; n++) {
        try {
          if ((await fetch(`http://127.0.0.1:${port}/api/session`)).ok) return;
        } catch {}
        if (child.exitCode !== null) throw new Error(output);
        await new Promise((r) => setTimeout(r, 100));
      }
      throw new Error("Test server did not start.");
    };
    const stop = async () => {
      if (child && child.exitCode === null) {
        const exited = once(child, "exit");
        child.kill();
        await exited;
      }
    };
    let cookie = "";
    const call = async (
      endpoint,
      body,
      method = body === undefined ? "GET" : "POST",
      extra = {},
    ) => {
      const response = await fetch(`http://127.0.0.1:${port}/api${endpoint}`, {
        method,
        headers: {
          ...(cookie ? { Cookie: cookie } : {}),
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
          ...extra,
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
      return {
        status: response.status,
        headers: response.headers,
        body: await response.json(),
      };
    };
    try {
      await start();
      const health = await call("/health");
      assert.equal(health.status, 200);
      assert.deepEqual(health.body, { app: "benchmate", status: "ready" });
      assert.equal(health.headers.get("set-cookie"), null);
      assert.equal((await call("/state")).status, 401);
      assert.equal((await call("/pair", { code: "éééééééé" })).status, 401);
      const session = await call("/session");
      cookie = session.headers.get("set-cookie").split(";")[0];
      assert.equal((await call("/state")).status, 200);
      assert.equal(
        (
          await call("/projects", { name: "Blocked" }, "POST", {
            Origin: "https://untrusted.example",
          })
        ).status,
        403,
      );
      const fakeImage = await call("/photos", {
        image: "data:image/png;base64,aGVsbG8=",
      });
      assert.equal(fakeImage.status, 400);
      const photo = await call("/photos", {
        image:
          "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aLZkAAAAASUVORK5CYII=",
      });
      assert.equal(photo.status, 200);
      const item = {
        name: "Synthetic motor",
        quantity: 2,
        kind: "part",
        identity: "unresolved",
        condition: "untested",
        location: "Test drawer",
        markings: "TEST",
        notes: "Synthetic fixture",
        evidence: "",
        photo: photo.body.photo,
        sources: [],
      };
      const saved = await call("/items", item);
      assert.equal(saved.status, 200);
      const id = saved.body.id;
      const project = await call("/projects", {
        name: "Synthetic build",
        goal: "Test only",
        notes: "",
        nextAction: "Inspect",
        status: "planning",
      });
      assert.equal(project.status, 200);
      const unconfirmedReservation = await call("/allocations", {
        itemId: id,
        projectId: project.body.id,
        quantity: 1,
      });
      assert.equal(unconfirmedReservation.status, 200);
      assert.equal((await call("/state")).body.items[0].identity, "unresolved");
      await call(
        `/allocations/${unconfirmedReservation.body.id}`,
        { state: "returned" },
        "PATCH",
      );
      assert.equal(
        (
          await call(
            `/items/${id}`,
            {
              ...item,
              identity: "confirmed",
              evidence: "Synthetic identity evidence",
            },
            "PUT",
          )
        ).status,
        200,
      );
      const allocation = await call("/allocations", {
        itemId: id,
        projectId: project.body.id,
        quantity: 1,
      });
      assert.equal(allocation.status, 200);
      assert.equal((await call("/state")).body.items[0].available, 1);
      await call(
        `/allocations/${allocation.body.id}`,
        { state: "installed" },
        "PATCH",
      );
      assert.equal((await call("/state")).body.items[0].available, 1);
      await call(
        `/allocations/${allocation.body.id}`,
        { state: "returned" },
        "PATCH",
      );
      assert.equal((await call("/state")).body.items[0].available, 2);
      assert.equal(
        (
          await call(
            `/allocations/${allocation.body.id}`,
            { state: "returned" },
            "PATCH",
          )
        ).status,
        400,
      );
      assert.equal((await call("/models")).body.selected, "test-glimmer");
      const answer = await call("/chat", {
        message: "Review this synthetic part.",
        itemId: id,
        mode: "identify",
        photo: null,
      });
      assert.equal(answer.status, 200);
      assert.equal(answer.body.context.inventorySummaries, 1);
      assert.equal(answer.body.context.totalInventoryRecords, 1);
      assert.equal(answer.body.context.photoAttached, true);
      assert.equal(answer.body.context.detailedItems[0].id, id);
      assert.match(chatBody.messages[0].content, /CURRENT SAVED STATE/);
      assert.match(chatBody.messages[0].content, /Synthetic fixture/);
      assert.equal(chatBody.think, "low");
      assert.equal(chatBody.options.num_predict, 4096);
      assert.equal(chatBody.stream, true);
      assert.equal(chatBody.messages.at(-1).images.length, 1);
      assert.match(chatBody.messages[0].content, /Synthetic motor/);
      assert.equal((await call("/state")).body.messages.length, 0);
      const streamed = await fetch(`http://127.0.0.1:${port}/api/chat`, {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Stream test",
          photo: null,
          responseMode: "quick",
          progress: true,
        }),
      });
      const events = (await streamed.text())
        .trim()
        .split("\n")
        .map((s) => JSON.parse(s));
      assert.equal(chatBody.think, false);
      assert.ok(
        events.some((e) => e.type === "progress" && e.phase === "answering"),
      );
      assert.ok(
        events.some(
          (e) => e.type === "done" && e.answer.includes("Synthetic answer"),
        ),
      );
      assert.ok(!events.some((e) => "thinking" in e));
      const proposed = await call("/chat", {
        message: "Propose visible label details",
        photo: null,
        itemId: id,
        mode: "identify",
        proposeIdentity: true,
      });
      assert.equal(proposed.status, 200);
      assert.match(proposed.body.proposal.markings, /10000 mAh \/ 37 Wh/);
      assert.match(proposed.body.proposal.markings, /2.1 A out on each port/);
      const beforeReview = (await call("/state")).body.items[0];
      assert.equal(beforeReview.markings, "TEST");
      assert.equal(beforeReview.quantity, 2);
      const {
        itemId: proposalItemId,
        baseUpdatedAt,
        ...photoReview
      } = proposed.body.proposal;
      const applyReview = {
        ...beforeReview,
        markings: photoReview.markings,
        photoReview,
        expectedUpdatedAt: baseUpdatedAt,
      };
      assert.equal(
        (await call(`/items/${id}`, applyReview, "PUT")).status,
        200,
      );
      const reviewed = (await call("/state")).body.items[0];
      assert.equal(reviewed.markings, photoReview.markings);
      assert.equal(reviewed.photoReview.photo, photo.body.photo);
      assert.equal(
        (
          await call(
            `/items/${id}`,
            { ...applyReview, expectedUpdatedAt: "stale-version" },
            "PUT",
          )
        ).status,
        409,
      );
      thinkingOnly = false;
      const draftReview = await call("/chat", {
        message: "Review unsaved photo",
        photo: photo.body.photo,
        mode: "identify",
        proposeIdentity: true,
      });
      assert.equal(draftReview.status, 200);
      assert.equal(draftReview.body.proposal.itemId, null);
      assert.equal(draftReview.body.proposal.baseUpdatedAt, null);
      assert.equal((await call("/state")).body.items.length, 1);
      const staleReview = await call("/chat", {
        message: "Review stale form",
        photo: photo.body.photo,
        itemId: id,
        mode: "identify",
        proposeIdentity: true,
        expectedUpdatedAt: "old-version",
      });
      assert.equal(staleReview.status, 502);
      assert.match(staleReview.body.error, /changed since you opened/);
      thinkingOnly = true;
      const limited = await call("/chat", {
        message: "Budget exhaustion test",
        photo: null,
      });
      assert.equal(limited.status, 502);
      assert.match(limited.body.error, /generation budget/);
      assert.equal((await call("/state")).body.messages.length, 2);
      thinkingOnly = false;
      slowReply = true;
      const cancelled = await fetch(`http://127.0.0.1:${port}/api/chat`, {
        method: "POST",
        headers: { Cookie: cookie, "Content-Type": "application/json" },
        body: JSON.stringify({
          message: "Cancel test",
          photo: null,
          progress: true,
        }),
      });
      assert.equal(
        (await call("/chat", { message: "Concurrent request", photo: null }))
          .status,
        409,
      );
      await cancelled.body.cancel();
      // Wait for cancellation to release the request slot; no model output is persisted.
      for (let n = 0; n < 50; n++) {
        const s = await call("/state");
        assert.equal(s.body.messages.length, 2);
        await new Promise((r) => setTimeout(r, 10));
      }
      slowReply = false;
      failChat = true;
      assert.equal(
        (await call("/chat", { message: "Failure test", photo: null })).status,
        502,
      );
      assert.equal((await call("/state")).body.messages.length, 2);
      failChat = "cuda";
      const gpuFailure = await call("/chat", {
        message: "GPU failure test",
        photo: null,
      });
      assert.equal(gpuFailure.status, 502);
      assert.equal(gpuFailure.body.code, "OLLAMA_CUDA_INITIALIZATION");
      assert.match(gpuFailure.body.error, /initialize the GPU/);
      assert.equal((await call("/state")).body.messages.length, 2);
      assert.equal(
        (await call(`/items/${id}`, undefined, "DELETE")).status,
        200,
      );
      assert.equal((await call("/state")).body.items.length, 0);
      assert.equal(
        (await call("/state")).body.removedItems[0].photo,
        photo.body.photo,
      );
      assert.equal(
        (await call(`/items/${id}`, applyReview, "PUT")).status,
        404,
      );
      await stop();
      await start();
      // A server restart invalidates the open browser's cookie, including photos.
      assert.equal((await call(`/photos/${photo.body.photo}`)).status, 401);
      const next = await call("/session");
      cookie = next.headers.get("set-cookie").split(";")[0];
      const restoredPhoto = await fetch(
        `http://127.0.0.1:${port}/api/photos/${photo.body.photo}?photoRetry=1`,
        { headers: { Cookie: cookie } },
      );
      assert.equal(restoredPhoto.status, 200);
      assert.match(restoredPhoto.headers.get("content-type"), /image\/png/);
      assert.ok((await restoredPhoto.arrayBuffer()).byteLength > 0);
      assert.equal((await call("/state")).body.items.length, 0);
      assert.equal(
        (await call("/state")).body.removedItems[0].name,
        "Synthetic motor",
      );
      assert.equal((await call(`/items/${id}/restore`, {})).status, 200);
      assert.equal((await call("/state")).body.items[0].available, 2);
      assert.equal(
        (await call("/state")).body.projects[0].name,
        "Synthetic build",
      );
      failChat = false;
      const donor = await call("/items", {
        ...item,
        name: "Synthetic donor",
        quantity: 1,
        kind: "donor",
      });
      assert.equal(donor.status, 200);
      const before = (await call("/state")).body.items;
      const mapped = await call("/chat", {
        message: "Map this synthetic donor",
        mode: "salvage",
        proposeSalvage: true,
        itemId: donor.body.id,
        expectedUpdatedAt: donor.body.updatedAt,
        photo: photo.body.photo,
      });
      assert.equal(mapped.status, 200);
      assert.equal(mapped.body.salvageProposal.components[0].quantity, 2);
      assert.equal(
        mapped.body.salvageProposal.components[0].evidenceStatus,
        "potential",
      );
      assert.ok(chatBody.messages[0].content.includes("existingAssemblies"));
      assert.match(chatBody.messages[0].content, /never recovered stock/);
      assert.deepEqual((await call("/state")).body.items, before);
      const savedDonor = await call(
        `/items/${donor.body.id}`,
        {
          ...donor.body,
          salvage: mapped.body.salvageProposal.components,
          expectedUpdatedAt: donor.body.updatedAt,
        },
        "PUT",
      );
      assert.equal(saved.status, 200);
      const recovery = {
        rowId: savedDonor.body.salvage[0].id,
        quantity: 1,
        location: "Test bin",
        expectedUpdatedAt: savedDonor.body.updatedAt,
      };
      const recovered = await call(`/items/${donor.body.id}/recover`, recovery);
      assert.equal(recovered.status, 200);
      assert.equal(recovered.body.item.identity, "unresolved");
      assert.equal(
        (await call(`/items/${donor.body.id}/recover`, recovery)).status,
        400,
      );
      assert.equal(
        (
          await call(
            `/items/${donor.body.id}`,
            {
              ...savedDonor.body,
              expectedUpdatedAt: savedDonor.body.updatedAt,
            },
            "PUT",
          )
        ).status,
        409,
      );
      const history = await call(`/items/${donor.body.id}/history`);
      assert.ok(history.body.some((e) => e.type === "donor.recovered"));
      const beforeBoard = (await call("/state")).body.items.length;
      const boardMapped = await call("/chat", {
        message: "Map board",
        photo: photo.body.photo,
        proposeBoard: true,
      });
      assert.equal(boardMapped.status, 200);
      assert.equal(
        boardMapped.body.boardProposal.regions[0].markings,
        "TEST-123",
      );
      assert.ok(chatBody.messages[0].content.includes("normalized"));
      assert.equal((await call("/state")).body.items.length, beforeBoard);
      const board = await call("/boards", {
        name: "Synthetic board",
        notes: "",
        photos: [photo.body.photo],
        components: boardMapped.body.boardProposal.regions.map((r) => ({
          ...r,
          id: "f016077f-70bd-44e1-927d-f369c5c9ca85",
          photo: photo.body.photo,
          quantity: 1,
          sources: [],
        })),
      });
      assert.equal(board.status, 200);
      assert.equal(
        (
          await call(
            `/boards/${board.body.id}`,
            { ...board.body, name: "Stale" },
            "PUT",
          )
        ).status,
        400,
      );
      const recoveryBody = {
        componentId: board.body.components[0].id,
        quantity: 1,
        location: "Cache drawer",
        expectedUpdatedAt: board.body.updatedAt,
      };
      const cache = await call(
        `/boards/${board.body.id}/recover`,
        recoveryBody,
      );
      assert.equal(cache.status, 200);
      assert.equal(cache.body.boardOrigin.boardId, board.body.id);
      assert.equal(
        (await call(`/boards/${board.body.id}/recover`, recoveryBody)).status,
        400,
      );
      await stop();
      cookie = "";
      await start();
      cookie = (await call("/session")).headers.get("set-cookie").split(";")[0];
      const persisted = (await call("/state")).body.items;
      assert.equal(
        (await call("/state")).body.boards.find((b) => b.id === board.body.id)
          .recoveries.length,
        1,
      );
      assert.equal(
        persisted.find((i) => i.id === cache.body.id).boardOrigin.componentId,
        recoveryBody.componentId,
      );
      assert.equal(persisted.find((i) => i.id === donor.body.id).available, 0);
      assert.equal(
        persisted.find((i) => i.id === recovered.body.item.id).recoveredFrom
          .donorId,
        donor.body.id,
      );
      // A title and photo can be saved with optional evidence blank,
      // including when the user explicitly confirms the identity.
      for (const identity of ["unresolved", "confirmed"]) {
        const quickFind = await call("/items", {
          ...item,
          name: "Title and photo only",
          quantity: 1,
          identity,
          evidence: "",
          markings: "",
          notes: "",
          location: "",
          sources: [],
          photo: photo.body.photo,
        });
        assert.equal(quickFind.status, 200);
        assert.equal(quickFind.body.identity, identity);
        assert.equal(quickFind.body.evidence, "");
        const edited = await call(
          `/items/${quickFind.body.id}`,
          {
            ...quickFind.body,
            name: "Edited quick find",
            expectedUpdatedAt: quickFind.body.updatedAt,
          },
          "PUT",
        );
        assert.equal(edited.status, 200);
      }
      const identifiedRecord = await call("/items", {
        ...item,
        name: "Photo-identified component",
        identity: "unresolved",
        condition: "untested",
        photoReview,
        reviewPending: true,
      });
      assert.equal(identifiedRecord.status, 200);
      const savedIdentification = (await call("/state")).body.items.find(
        (i) => i.id === identifiedRecord.body.id,
      );
      assert.equal(savedIdentification.reviewPending, undefined);
      assert.equal(savedIdentification.identity, "unresolved");
      assert.equal(savedIdentification.condition, "untested");
      assert.equal(savedIdentification.quantity, item.quantity);
      assert.equal(
        identityStatus(savedIdentification).label,
        "Identified from photo",
      );
      assert.equal(
        identityStatus(savedIdentification).needsIdentification,
        false,
      );
      const roverChat = await call("/conversations", {
        projectId: project.body.id,
      });
      const audioChat = await call("/conversations", {
        title: "Audio exploration",
      });
      assert.equal(roverChat.status, 200);
      assert.equal(audioChat.status, 200);
      assert.equal(
        (await call("/conversations", { projectId: project.body.id })).body.id,
        roverChat.body.id,
      );
      await call("/chat", {
        message: "ONLY_ROVER_CONTEXT: remember the gear train",
        conversationId: roverChat.body.id,
      });
      await call("/chat", {
        message: "ONLY_AUDIO_CONTEXT: remember the speaker",
        conversationId: audioChat.body.id,
      });
      await call("/chat", {
        message: "What is our next rover step?",
        conversationId: roverChat.body.id,
      });
      assert.ok(
        chatBody.messages.some((m) => m.content.includes("ONLY_ROVER_CONTEXT")),
      );
      assert.ok(
        !chatBody.messages.some((m) =>
          m.content.includes("ONLY_AUDIO_CONTEXT"),
        ),
      );
      assert.ok(
        chatBody.messages[0].content.includes(
          '"activeProjectId":"' + project.body.id + '"',
        ),
      );
      const beforeAnalysis = (await call("/state")).body.messages.length;
      await call("/chat", {
        message: "Photo analysis only",
        photo: photo.body.photo,
        proposeIdentity: true,
        mode: "identify",
        conversationId: roverChat.body.id,
      });
      assert.equal(chatBody.messages.length, 2);
      assert.equal((await call("/state")).body.messages.length, beforeAnalysis);
      const promotedProject = await call("/projects", {
        name: "Audio project",
        goal: "Synthetic audio fixture",
        notes: "",
        nextAction: "Inspect",
        status: "planning",
        conversationId: audioChat.body.id,
      });
      assert.equal(promotedProject.status, 200);
      assert.equal(
        (await call("/state")).body.conversations.find(
          (c) => c.id === audioChat.body.id,
        ).projectId,
        promotedProject.body.id,
      );
      assert.equal(
        (await call("/state")).body.messages.filter(
          (m) => m.conversationId === audioChat.body.id,
        ).length,
        2,
      );
      assert.equal(
        (
          await call("/chat", {
            message: "Unknown chat",
            conversationId: "43d7d306-736e-4b85-97c4-4d6c1399cbf5",
          })
        ).status,
        502,
      );
      await stop();
      cookie = "";
      await start();
      cookie = (await call("/session")).headers.get("set-cookie").split(";")[0];
      const persistedChats = (await call("/state")).body;
      const freshProject = await call("/projects", {
        name: "Setup-first project",
        goal: "New project fixture",
        notes: "",
        nextAction: "",
        status: "planning",
        startConversation: true,
      });
      assert.equal(freshProject.status, 200);
      const freshChat = (await call("/state")).body.conversations.find(
        (c) => c.projectId === freshProject.body.id,
      );
      assert.equal(freshChat.title, "Setup-first project");
      assert.equal(freshChat.messageCount, 0);
      assert.equal(
        (await call("/state")).body.messages.length,
        persistedChats.messages.length,
      );
      assert.equal(
        persistedChats.conversations.find((c) => c.id === audioChat.body.id)
          .projectId,
        promotedProject.body.id,
      );
      assert.equal(
        persistedChats.messages.filter(
          (m) => m.conversationId === roverChat.body.id,
        ).length,
        4,
      );
      assert.equal(
        persistedChats.messages.filter(
          (m) => m.conversationId === audioChat.body.id,
        ).length,
        2,
      );
      assert.ok(!persistedChats.conversations.some((c) => c.legacy));
      // Photo chat prepares a persistent card; committing it is an explicit,
      // authenticated, idempotent application operation, not model output.
      const beforeCard = (await call("/state")).body.items.length;
      const actionsBeforeIrrelevant = (await call("/state")).body.chatActions
        .length;
      for (const relevance of ["off_topic", "unclear"]) {
        photoRelevance = relevance;
        const rejected = await call("/chat", {
          message: "Prepare a Stash card from this photo.",
          photo: photo.body.photo,
          conversationId: freshChat.id,
          requestId: randomUUID(),
        });
        assert.equal(rejected.status, 200);
        assert.equal(rejected.body.photoReviewOutcome, relevance);
        assert.equal(rejected.body.action, undefined);
        assert.equal(rejected.body.proposal, undefined);
        assert.equal((await call("/state")).body.items.length, beforeCard);
        assert.equal(
          (await call("/state")).body.chatActions.length,
          actionsBeforeIrrelevant,
        );
      }
      photoRelevance = "bench_item";
      // Existing stock additions never reach image inference or allocations.
      const sled = await call("/items", {
        ...item,
        name: "small stepper-type sled motor with lead screw",
        quantity: 1,
        photo: null,
      });
      const stockRequest = {
        message:
          "I also grabbed another small stepper-type sled motor, can you pls add one to our current stash?",
        conversationId: freshChat.id,
        requestId: randomUUID(),
      };
      const stockCard = await call("/chat", stockRequest);
      assert.equal(stockCard.body.action.kind, "stock");
      assert.equal(stockCard.body.action.draft.itemId, sled.body.id);
      assert.equal(stockCard.body.action.draft.quantity, 1);
      assert.equal(
        (await call("/state")).body.items.find((i) => i.id === sled.body.id)
          .quantity,
        1,
      );
      const stockSaved = await call(
        `/chat-actions/${stockCard.body.action.id}/commit`,
        stockCard.body.action.draft,
      );
      assert.equal(stockSaved.status, 200);
      assert.match(stockSaved.body.receipt, /Total: 1 → 2/);
      assert.equal(
        (await call("/chat", stockRequest)).body.action.status,
        "completed",
      );
      assert.equal(
        (await call("/state")).body.items.find((i) => i.id === sled.body.id)
          .quantity,
        2,
      );
      // Remove only this synthetic fixture to retain subsequent count assertions.
      await call(`/items/${sled.body.id}`, undefined, "DELETE");
      // An ordinary photo question followed by an inventory request must create
      // a new Stash draft, never a form requiring that unsaved item to exist.
      const dvdChat = await call("/conversations", {});
      await call("/chat", {
        message: "What's this?",
        photo: photo.body.photo,
        conversationId: dvdChat.body.id,
      });
      const mistakenParts = await call("/chat", {
        message: "Open project parts",
        manageParts: true,
        conversationId: dvdChat.body.id,
        requestId: randomUUID(),
      });
      const dvdRequest = {
        message:
          "Can you please add the dvd rw drive to inventory? I plan to pull motors and such from it.",
        conversationId: dvdChat.body.id,
        requestId: randomUUID(),
      };
      const dvdDraft = await call("/chat", dvdRequest);
      assert.equal(dvdDraft.status, 200);
      assert.equal(dvdDraft.body.action.kind, "stash");
      assert.equal(dvdDraft.body.action.status, "draft");
      assert.equal(dvdDraft.body.action.photo, photo.body.photo);
      assert.equal(dvdDraft.body.action.draft.kind, "donor");
      assert.equal((await call("/state")).body.items.length, beforeCard);
      assert.equal(
        (await call("/chat", dvdRequest)).body.action.id,
        dvdDraft.body.action.id,
      );
      assert.equal(
        (await call("/state")).body.chatActions.find(
          (a) => a.id === mistakenParts.body.action.id,
        ).status,
        "cancelled",
      );
      const otherChat = await call("/conversations", {});
      const noPhoto = await call("/chat", {
        message: "Add this to inventory",
        conversationId: otherChat.body.id,
        requestId: randomUUID(),
      });
      assert.equal(noPhoto.body.action, null);
      assert.match(noPhoto.body.answer, /Attach a photo/);
      const cardRequest = {
        message: "Please add this to Stash",
        photo: photo.body.photo,
        conversationId: freshChat.id,
        requestId: randomUUID(),
      };
      const card = await call("/chat", cardRequest);
      assert.equal(card.status, 200);
      assert.equal(card.body.action.status, "draft");
      assert.equal(card.body.action.draft.condition, "untested");
      assert.equal((await call("/state")).body.items.length, beforeCard);
      assert.equal(
        (await call("/chat", cardRequest)).body.action.id,
        card.body.action.id,
      );
      const committed = await call(
        `/chat-actions/${card.body.action.id}/commit`,
        { name: "Edited photo find", quantity: 3 },
      );
      assert.equal(committed.status, 200);
      assert.equal(committed.body.status, "completed");
      const committedAgain = await call(
        `/chat-actions/${card.body.action.id}/commit`,
        { name: "Edited photo find", quantity: 3 },
      );
      assert.equal(committedAgain.body.itemId, committed.body.itemId);
      assert.equal((await call("/state")).body.items.length, beforeCard + 1);
      const photoFind = (await call("/state")).body.items.find(
        (i) => i.id === committed.body.itemId,
      );
      assert.equal(photoFind.quantity, 3);
      assert.equal(photoFind.photoReview.photo, photo.body.photo);
      assert.equal(photoFind.identity, "unresolved");
      const imageAssignment = await call("/chat", {
        message: "Reserve 3 Edited photo find for this project",
        photo: photo.body.photo,
        conversationId: freshChat.id,
        requestId: randomUUID(),
      });
      assert.equal(imageAssignment.status, 200);
      assert.equal(imageAssignment.body.action, undefined);
      assert.equal(
        (await call("/state")).body.items.find((i) => i.id === photoFind.id)
          .available,
        3,
      );
      assert.ok(
        chatBody.messages[0].content.includes(
          "Sent user photos have a Prepare Stash card button",
        ),
      );
      failChat = true; // Reservation changes do not depend on generative claims.
      const addWithoutCount = await call("/chat", {
        message: "Can you add the finds we just added to this project please?",
        conversationId: freshChat.id,
        requestId: randomUUID(),
      });
      assert.equal(addWithoutCount.body.action.status, "draft");
      assert.equal(addWithoutCount.body.action.draft.itemId, photoFind.id);
      const reserveRequest = {
        message: "Go ahead and add all three to this project please.",
        conversationId: freshChat.id,
        requestId: randomUUID(),
      };
      const reserved = await call("/chat", reserveRequest);
      assert.equal(reserved.status, 200);
      assert.equal(reserved.body.action.status, "completed");
      assert.match(reserved.body.answer, /Reserved 3/);
      const messageCount = (await call("/state")).body.messages.length;
      assert.equal((await call("/chat", reserveRequest)).status, 200);
      assert.equal((await call("/state")).body.messages.length, messageCount);
      assert.equal(
        (await call("/state")).body.items.find((i) => i.id === photoFind.id)
          .available,
        0,
      );
      const moved = await call("/chat", {
        message:
          'Ok, we just gave you a boat load of ability in here. Can you try again to move 1x Edited photo find to the "Audio project" from "Setup-first project"?',
        conversationId: freshChat.id,
        requestId: randomUUID(),
      });
      assert.equal(moved.body.action.status, "completed");
      assert.match(moved.body.answer, /Moved 1/);
      assert.equal(
        (await call("/state")).body.items.find((i) => i.id === photoFind.id)
          .available,
        0,
      );
      const returned = await call("/chat", {
        message: "Return 1 Edited photo find from Audio project to Stash",
        conversationId: freshChat.id,
        requestId: randomUUID(),
      });
      assert.equal(returned.body.action.status, "completed");
      assert.equal(
        (await call("/state")).body.items.find((i) => i.id === photoFind.id)
          .available,
        1,
      );
      const ambiguous = await call("/chat", {
        message: "Reserve the find for this project",
        conversationId: freshChat.id,
        requestId: randomUUID(),
      });
      assert.equal(ambiguous.body.action.status, "draft");
      assert.equal(
        (await call(`/chat-actions/${ambiguous.body.action.id}/cancel`, {}))
          .status,
        200,
      );
      assert.equal(
        (await call(`/chat-actions/${ambiguous.body.action.id}/commit`, {}))
          .status,
        400,
      );
      {
        // Semantic fallback proposes a card; conversation replies finish the
        // persisted pending request without invoking the model again.
        const plannerProject = await call("/projects", {
          name: "Understanding tests",
          goal: "Synthetic",
          notes: "",
          nextAction: "",
          status: "planning",
          startConversation: true,
        });
        const plannerConversation = (
          await call("/state")
        ).body.conversations.find(
          (c) => c.projectId === plannerProject.body.id,
        ).id;
        const beforeProposalCalls = planCalls;
        const spare = await call("/items", {
          ...item,
          name: "Green motor",
          quantity: 5,
          photo: null,
        });
        actionPlan = {
          intent: "reservation",
          operation: "reserve",
          item: "Green motor",
          destination: "@current",
          source: null,
          quantity: null,
          all: false,
        };
        const proposed = await call("/chat", {
          message: "I'd like these green motors earmarked for this build",
          conversationId: plannerConversation,
          requestId: randomUUID(),
        });
        assert.equal(proposed.body.action.status, "draft");
        assert.equal(planCalls, beforeProposalCalls + 1);
        assert.match(proposed.body.answer, /how many/i);
        assert.equal(
          (await call("/state")).body.items.find((i) => i.id === spare.body.id)
            .available,
          5,
        );
        const beforeFollowup = planCalls;
        const followupRequest = {
          message: "all three",
          conversationId: plannerConversation,
          requestId: randomUUID(),
        };
        const followed = await call("/chat", followupRequest);
        assert.equal(followed.body.action.status, "completed");
        assert.match(followed.body.answer, /Reserved 3/);
        assert.equal(planCalls, beforeFollowup);
        assert.equal(
          (await call("/chat", followupRequest)).body.action.id,
          followed.body.action.id,
        );
        assert.equal(
          (
            await call(
              "/chat-actions/" + proposed.body.action.id + "/commit",
              proposed.body.action.draft,
            )
          ).status,
          400,
        );
        assert.equal(
          (await call("/state")).body.items.find((i) => i.id === spare.body.id)
            .available,
          2,
        );
        // Insufficient stock is a useful pending card, not an unsaved refusal.
        const tooMany = await call("/chat", {
          message: "Reserve 9 Green motor for this project",
          conversationId: plannerConversation,
          requestId: randomUUID(),
        });
        assert.equal(tooMany.body.action.status, "draft");
        assert.match(tooMany.body.answer, /Not enough available/);
        const corrected = await call("/chat", {
          message: "Actually, one please.",
          conversationId: plannerConversation,
          requestId: randomUUID(),
        });
        assert.equal(corrected.body.action.status, "completed");
        assert.match(corrected.body.answer, /Reserved 1/);
        // A failed planner cannot fabricate a stock change or leave no way forward.
        actionPlan = "invalid model output";
        const malformed = await call("/chat", {
          message: "Please earmark the remaining motor for Juno",
          conversationId: plannerConversation,
          requestId: randomUUID(),
        });
        assert.equal(malformed.body.action.status, "draft");
        assert.match(malformed.body.answer, /couldn't reliably interpret/);
        const cancelled = await call("/chat", {
          message: "never mind",
          conversationId: plannerConversation,
          requestId: randomUUID(),
        });
        assert.equal(cancelled.body.action.status, "cancelled");
        assert.equal(
          (await call("/state")).body.items.find((i) => i.id === spare.body.id)
            .available,
          1,
        );
      }
    } finally {
      await stop();
      await new Promise((r) => mock.close(r));
      assert.equal(path.dirname(temp), path.resolve(tmpdir()));
      assert.ok(path.basename(temp).startsWith("benchmate-http-"));
      await rm(temp, { recursive: true, force: true });
    }
  },
);
