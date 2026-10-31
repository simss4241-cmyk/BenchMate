import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openStore } from "../server/store.mjs";
import { stockAddition } from "../server/stock-addition.mjs";

const request =
  "I also grabbed another small stepper-type sled motor, can you pls add one to our current stash?";
function fixture() {
  const store = openStore(":memory:");
  const item = store.saveItem({
    name: "small stepper-type sled motor with lead screw and plastic carriage clip",
    quantity: 1,
    kind: "part",
    identity: "unresolved",
    condition: "untested",
    photo: null,
    markings: "",
    notes: "",
    evidence: "",
    location: "",
    sources: [],
  });
  const conversation = store.createConversation({});
  return { store, item, conversation };
}
function action(f, draft = stockAddition(request, f.store.snapshot())) {
  return f.store.recordChatAction(
    {
      id: randomUUID(),
      conversationId: f.conversation.id,
      fingerprint: randomUUID(),
      kind: "stock",
      draft,
    },
    request,
    "Review stock addition",
  );
}
test("reported acquisition resolves exact additional units and existing motor, not project or recent photo", () => {
  const f = fixture();
  try {
    const d = stockAddition(request, f.store.snapshot());
    assert.equal(d.itemId, f.item.id);
    assert.equal(d.quantity, 1);
    assert.equal(d.expectedQuantity, 1);
    assert.equal(
      stockAddition(
        "Add two small stepper-type sled motors to Stash",
        f.store.snapshot(),
      ).quantity,
      2,
    );
    for (const text of [
      "Add this to Stash",
      "Return one motor from Juno to Stash",
      "Add one motor to Juno",
      "Don't add one motor to stock",
      "Should I add one motor to stock?",
      "Imagine I add one motor to Stash",
    ])
      assert.equal(stockAddition(text, f.store.snapshot()), null);
    f.store.saveItem(
      { ...f.item, name: "small stepper-type sled motor spare", quantity: 3 },
      randomUUID(),
    );
    const ambiguous = stockAddition(request, f.store.snapshot());
    assert.equal(ambiguous.itemId, "");
    assert.equal(ambiguous.candidateItemIds.length, 2);
  } finally {
    f.store.db.close();
  }
});
test("stock addition saves once, preserves allocations and records delta; stale drafts and oversized totals fail", () => {
  const f = fixture();
  try {
    const project = f.store.saveProject({
      name: "Juno",
      status: "planning",
      goal: "",
      notes: "",
      nextAction: "",
    });
    f.store.allocate(f.item.id, project.id, 1);
    const a = action(f),
      before = f.store.snapshot();
    assert.equal(before.items[0].quantity, 1);
    const done = f.store.commitChatAction(a.id, a.draft);
    assert.match(done.receipt, /Total: 1 → 2/);
    assert.equal(f.store.commitChatAction(a.id, a.draft).id, a.id);
    const after = f.store.snapshot();
    assert.equal(after.items[0].quantity, 2);
    assert.equal(after.items[0].available, 1);
    assert.deepEqual(after.allocations, before.allocations);
    assert.equal(
      after.events.filter((e) => e.type === "stock.added").length,
      1,
    );
    const stale = action(f);
    f.store.saveItem({ ...after.items[0], notes: "Changed" }, f.item.id);
    assert.throws(
      () => f.store.commitChatAction(stale.id, stale.draft),
      /changed/,
    );
    assert.equal(f.store.chatAction(stale.id).status, "draft");
    assert.equal(f.store.snapshot().items[0].quantity, 2);
    const large = action(f);
    assert.throws(
      () =>
        f.store.commitChatAction(large.id, {
          ...large.draft,
          quantity: 100000,
        }),
      /exceed/,
    );
  } finally {
    f.store.db.close();
  }
});
test("added units cannot silently inherit a tested condition or inflate donor/recovery records", () => {
  for (const patch of [
    { condition: "working" },
    { kind: "donor" },
    { boardOrigin: { boardId: "test" } },
    { recoveredFrom: { donorId: "test" } },
  ]) {
    const f = fixture();
    try {
      f.store.db
        .prepare("UPDATE items SET body=? WHERE id=?")
        .run(JSON.stringify({ ...f.item, ...patch }), f.item.id);
      const a = action(f);
      assert.throws(
        () => f.store.commitChatAction(a.id, a.draft),
        /separate untested/,
      );
      assert.equal(f.store.snapshot().items[0].quantity, 1);
    } finally {
      f.store.db.close();
    }
  }
});
