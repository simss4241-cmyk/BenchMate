import test from "node:test";
import assert from "node:assert/strict";
import { openStore } from "../server/store.mjs";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const part = {
  name: "Test motor",
  quantity: 3,
  kind: "part",
  identity: "confirmed",
  condition: "untested",
  evidence: "Synthetic test fixture",
  location: "Test drawer",
  markings: "",
  notes: "",
  photo: null,
  sources: [],
};
const project = {
  name: "Test build",
  goal: "Synthetic allocation test",
  notes: "",
  nextAction: "",
  status: "planning",
};
test("startup retires legacy provider settings while preserving inventory, history and Meta selection", () => {
  const temp = mkdtempSync(path.join(tmpdir(), "benchmate-model-migration-"));
  const file = path.join(temp, "test.sqlite");
  let store = openStore(file);
  try {
    const item = store.saveItem(part),
      p = store.saveProject(project);
    store.allocate(item.id, p.id, 1);
    store.setting("provider", "ollama");
    store.setting("model", "legacy-local-model");
    store.setting("meta_model", "muse-wonder-1.0");
    store.setting("unrelated", "keep");
    const before = JSON.stringify(store.snapshot());
    store.db.close();
    store = openStore(file);
    assert.equal(store.setting("provider"), undefined);
    assert.equal(store.setting("model"), undefined);
    assert.equal(store.setting("meta_model"), "muse-wonder-1.0");
    assert.equal(store.setting("unrelated"), "keep");
    assert.equal(JSON.stringify(store.snapshot()), before);
  } finally {
    store.db.close();
    rmSync(temp, { recursive: true, force: true });
  }
});
test("reservations and installation preserve stock; returns restore it exactly once", () => {
  const store = openStore(":memory:");
  try {
    const item = store.saveItem(part),
      p = store.saveProject(project);
    const a = store.allocate(item.id, p.id, 2);
    assert.equal(store.snapshot().items[0].available, 1);
    assert.throws(() => store.allocate(item.id, p.id, 2), /Not enough/);
    assert.equal(store.snapshot().allocations.length, 1);
    store.transition(a.id, "installed");
    assert.equal(store.snapshot().items[0].available, 1);
    assert.throws(
      () => store.saveItem({ ...part, quantity: 1 }, item.id),
      /Return allocated/,
    );
    assert.throws(
      () => store.saveItem({ ...part, condition: "damaged" }, item.id),
      /Return allocated/,
    );
    store.transition(a.id, "returned");
    assert.equal(store.snapshot().items[0].available, 3);
    assert.throws(() => store.transition(a.id, "returned"), /cannot make/);
    assert.equal(store.snapshot().items[0].available, 3);
    assert.equal(store.snapshot().allocations[0].state, "returned");
  } finally {
    store.db.close();
  }
});
test("unresolved parts can be reserved without confirmation; unavailable stock stays blocked", () => {
  const store = openStore(":memory:");
  try {
    const p = store.saveProject(project);
    const unknown = store.saveItem({ ...part, identity: "unresolved" });
    const reserved = store.allocate(unknown.id, p.id, 2);
    assert.equal(store.snapshot().items[0].available, 1);
    assert.equal(store.snapshot().items[0].identity, "unresolved");
    store.saveItem({ ...unknown, notes: "Planning only" }, unknown.id);
    assert.throws(() => store.allocate(unknown.id, p.id, 2), /Not enough/);
    store.transition(reserved.id, "installed");
    assert.equal(store.snapshot().items[0].identity, "unresolved");
    store.transition(reserved.id, "returned");
    assert.equal(store.snapshot().items[0].available, 3);
    for (const condition of ["damaged", "consumed"]) {
      const item = store.saveItem({ ...part, condition });
      assert.throws(() => store.allocate(item.id, p.id, 1), /unavailable/);
    }
    const item = store.saveItem(part);
    assert.throws(
      () => store.allocate(item.id, "missing-project", 1),
      /Project not found/,
    );
    assert.equal(store.snapshot().allocations.length, 1);
  } finally {
    store.db.close();
  }
});
test("tools remain reusable equipment and cannot enter component allocations", () => {
  const store = openStore(":memory:");
  try {
    const tool = store.saveItem({
        ...part,
        name: "Synthetic soldering station",
        kind: "tool",
        quantity: 1,
      }),
      p = store.saveProject(project);
    assert.throws(
      () => store.allocate(tool.id, p.id, 1),
      /reusable bench equipment/,
    );
    assert.equal(
      store.snapshot().items.find((i) => i.id === tool.id).quantity,
      1,
    );
    assert.equal(store.snapshot().allocations.length, 0);
    const component = store.saveItem(part),
      a = store.allocate(component.id, p.id, 1);
    assert.throws(
      () => store.saveItem({ ...part, kind: "tool" }, component.id),
      /Return allocated parts/,
    );
    store.transition(a.id, "returned");
    store.saveItem({ ...part, kind: "tool" }, component.id);
    assert.equal(
      store.snapshot().items.find((i) => i.id === component.id).kind,
      "tool",
    );
  } finally {
    store.db.close();
  }
});
test("removal is recoverable, excludes stock, and preserves allocation history and evidence", () => {
  const store = openStore(":memory:");
  try {
    const item = store.saveItem({
        ...part,
        markings: "TEST LABEL",
        photo: "synthetic.png",
      }),
      p = store.saveProject(project);
    const allocation = store.allocate(item.id, p.id, 1);
    assert.throws(() => store.removeItem(item.id), /Return this item/);
    store.transition(allocation.id, "installed");
    assert.throws(() => store.removeItem(item.id), /Return this item/);
    store.transition(allocation.id, "returned");
    store.removeItem(item.id);
    assert.equal(store.snapshot().items.length, 0);
    assert.equal(store.snapshot().removedItems[0].quantity, 3);
    assert.equal(store.snapshot().allocations[0].state, "returned");
    assert.throws(() => store.allocate(item.id, p.id, 1), /Restore/);
    assert.throws(() => store.saveItem(part, item.id), /Restore/);
    store.restoreItem(item.id);
    assert.equal(store.snapshot().removedItems.length, 0);
    assert.equal(store.snapshot().items[0].available, 3);
    assert.equal(store.snapshot().items[0].photo, "synthetic.png");
    assert.equal(store.snapshot().items[0].markings, "TEST LABEL");
    assert.throws(() => store.restoreItem(item.id), /already in/);
  } finally {
    store.db.close();
  }
});
