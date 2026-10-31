import test from "node:test";
import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { openStore } from "../server/store.mjs";
import { buildContext } from "../server/context.mjs";
const project = {
  name: "Rover",
  goal: "A small rover",
  notes: "User decisions",
  nextAction: "Check motor markings",
  status: "planning",
};

test("old global messages migrate intact into one read-only history, once", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "benchmate-conversations-"));
  const file = path.join(dir, "test.sqlite");
  let store;
  try {
    const old = new DatabaseSync(file);
    old.exec(
      "CREATE TABLE messages(id TEXT PRIMARY KEY, at TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL)",
    );
    old
      .prepare("INSERT INTO messages VALUES(?,?,?,?)")
      .run("old-user", "2026-10-29T10:00:00Z", "user", "Earlier question");
    old
      .prepare("INSERT INTO messages VALUES(?,?,?,?)")
      .run("old-answer", "2026-10-29T10:00:01Z", "assistant", "Earlier answer");
    old.close();
    store = openStore(file);
    const first = store.snapshot();
    assert.equal(first.conversations.length, 1);
    assert.equal(first.conversations[0].legacy, true);
    assert.deepEqual(
      first.messages.map((m) => m.id),
      ["old-user", "old-answer"],
    );
    assert.ok(
      first.messages.every(
        (m) => m.conversationId === first.conversations[0].id,
      ),
    );
    assert.throws(
      () => store.exchange(first.conversations[0].id, "new", "new"),
      /read-only/,
    );
    assert.throws(
      () => store.saveProject(project, undefined, first.conversations[0].id),
      /exploration/,
    );
    assert.equal(store.snapshot().projects.length, 0);
    store.db.close();
    store = openStore(file);
    assert.equal(store.snapshot().conversations.length, 1);
    assert.equal(store.snapshot().messages.length, 2);
  } finally {
    store?.db.close();
    assert.equal(path.dirname(dir), path.resolve(tmpdir()));
    rmSync(dir, { recursive: true, force: true });
  }
});

test("explorations keep their messages when promoted; project chat creation is idempotent", () => {
  const store = openStore(":memory:");
  try {
    const a = store.createConversation(),
      b = store.createConversation({ title: "Audio idea" });
    store.exchange(a.id, "Rover decisions", "Keep the gear train");
    store.exchange(b.id, "Audio decisions", "Inspect the amplifier");
    const p = store.saveProject(project, undefined, a.id, true);
    assert.equal(store.createConversation({ projectId: p.id }).id, a.id);
    assert.equal(store.conversation(a.id).projectId, p.id);
    assert.equal(
      store.snapshot().messages.filter((m) => m.conversationId === a.id).length,
      2,
    );
    assert.throws(
      () => store.updateConversation(b.id, { projectId: p.id }),
      /already has/,
    );
    const before = store.snapshot().projects.length;
    assert.throws(
      () => store.saveProject(project, undefined, a.id),
      /existing project/,
    );
    assert.equal(store.snapshot().projects.length, before);
    assert.equal(
      store.updateConversation(b.id, { title: "Speaker experiment" }).title,
      "Speaker experiment",
    );
    assert.equal(store.conversation(a.id).title, "Rover decisions");
    assert.equal(
      store.snapshot().conversations.find((c) => c.id === b.id).preview,
      "Inspect the amplifier",
    );
  } finally {
    store.db.close();
  }
});

test("project setup creates its project and chat together, without leaving partial records on failure", () => {
  const store = openStore(":memory:");
  try {
    store.db.exec(
      "CREATE TEMP TRIGGER reject_chat BEFORE INSERT ON conversations BEGIN SELECT RAISE(ABORT, 'synthetic chat failure'); END",
    );
    assert.throws(
      () => store.saveProject(project, undefined, null, true),
      /synthetic chat failure/,
    );
    assert.equal(store.snapshot().projects.length, 0);
    assert.equal(store.snapshot().conversations.length, 0);
    assert.equal(store.snapshot().events.length, 0);
    store.db.exec("DROP TRIGGER reject_chat");
    const p = store.saveProject(project, undefined, null, true);
    const chat = store.snapshot().conversations[0];
    assert.equal(chat.projectId, p.id);
    assert.equal(chat.title, project.name);
    assert.equal(chat.messageCount, 0);
    store.saveProject({ ...project, name: "Edited rover" }, p.id, null, true);
    assert.equal(store.snapshot().conversations.length, 1);
  } finally {
    store.db.close();
  }
});

test("the current project takes precedence even when another project matches the question", () => {
  const snapshot = {
    items: [],
    allocations: [],
    projects: [
      { ...project, id: "rover" },
      { ...project, id: "speaker", name: "Speaker", goal: "Audio speaker" },
    ],
  };
  const { packet } = buildContext(snapshot, {
    message: "speaker audio",
    projectId: "rover",
  });
  assert.equal(packet.activeProjectId, "rover");
  assert.equal(packet.projects[0].id, "rover");
  assert.ok(packet.projectDetails.some((p) => p.projectId === "rover"));
});
