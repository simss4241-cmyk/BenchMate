import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openStore } from "../server/store.mjs";
import { parseActionPlan } from "../server/action-understanding.mjs";
import {
  pendingAction,
  resolveIntent,
  continueAction,
} from "../server/chat-routing.mjs";
import { stockAddition } from "../server/stock-addition.mjs";

const empty = {
  intent: "chat",
  operation: null,
  item: null,
  destination: null,
  source: null,
  quantity: null,
  all: false,
};
function fixture() {
  const store = openStore(":memory:");
  const chat = store.createConversation({});
  const item = store.saveItem({
    name: "Small DC motor",
    quantity: 5,
    kind: "part",
    identity: "unresolved",
    condition: "untested",
    location: "",
    photo: null,
    notes: "",
    markings: "",
    evidence: "",
    sources: [],
  });
  const publish = (r, parent = null) =>
    store.recordChatAction(
      {
        id: randomUUID(),
        conversationId: chat.id,
        fingerprint: randomUUID(),
        kind: r.kind,
        draft: r.draft,
        prompt: r.prompt,
        ...(parent ? { replacesActionId: parent.id } : {}),
      },
      "request",
      r.prompt,
      !!r.ready,
    );
  return { store, chat, item, publish };
}
test("unified plans distinguish new cards, existing-stock additions, allocations, advice and uncertainty", () => {
  const f = fixture();
  try {
    const snap = f.store.snapshot();
    for (const intent of ["chat", "stash", "stock", "reservation", "clarify"]) {
      const plan = parseActionPlan({
        message: {
          content: JSON.stringify({
            ...empty,
            intent,
            item: f.item.name,
            quantity: 2,
            operation: intent === "reservation" ? "reserve" : null,
          }),
        },
      });
      const result = resolveIntent(plan, snap, f.chat, null, null);
      if (intent === "chat") assert.equal(result, null);
      else assert.equal(result.kind, intent);
      if (intent === "stock") {
        assert.equal(result.draft.expectedQuantity, 5);
        assert.equal(result.draft.quantity, 2);
        assert.equal(result.ready, false);
      }
    }
    assert.equal(
      resolveIntent(
        { ...empty, intent: "reservation" },
        snap,
        f.chat,
        null,
        null,
      ).kind,
      "clarify",
    );
    assert.throws(() =>
      parseActionPlan({
        message: {
          content: JSON.stringify({
            ...empty,
            intent: "stock",
            operation: "reserve",
          }),
        },
      }),
    );
    assert.equal(f.store.snapshot().items[0].quantity, 5);
  } finally {
    f.store.db.close();
  }
});
test("stock follow-ups ask one missing detail, correct counts, confirm once, and reject superseded forms", () => {
  const f = fixture();
  try {
    const route = resolveIntent(
      { ...empty, intent: "stock", item: f.item.name },
      f.store.snapshot(),
      f.chat,
      null,
      null,
    );
    assert.match(route.prompt, /How many additional/);
    const initial = f.publish(route);
    assert.equal(
      continueAction(
        "go ahead",
        f.store.snapshot(),
        f.chat,
        "different-selection",
        initial,
      ),
      null,
    );
    let r = continueAction(
      "actually two",
      f.store.snapshot(),
      f.chat,
      null,
      initial,
    );
    assert.equal(r.ready, false);
    assert.equal(r.draft.quantity, 2);
    const revised = f.publish(r, initial);
    assert.throws(
      () => f.store.commitChatAction(initial.id, initial.draft),
      /cancelled/,
    );
    const done = f.publish(
      continueAction("go ahead", f.store.snapshot(), f.chat, null, revised),
      revised,
    );
    assert.equal(done.status, "completed");
    assert.equal(f.store.snapshot().items[0].quantity, 7);
    assert.equal(pendingAction(f.store.snapshot(), f.chat), null);
    f.store.commitChatAction(done.id, done.draft);
    assert.equal(f.store.snapshot().items[0].quantity, 7);
    assert.equal(
      continueAction("another one", f.store.snapshot(), f.chat, null, revised)
        ?.ready,
      undefined,
    );
  } finally {
    f.store.db.close();
  }
});
test("ambiguous stock asks which item then how many; unrelated advice does not continue a change", () => {
  const f = fixture();
  try {
    f.store.saveItem({ ...f.item, name: "Large DC motor" }, randomUUID());
    const r = resolveIntent(
      { ...empty, intent: "stock", item: "motor" },
      f.store.snapshot(),
      f.chat,
      null,
      null,
    );
    assert.equal(r.draft.itemId, "");
    assert.match(r.prompt, /Which existing/);
    const p = f.publish(r);
    const chosen = continueAction(
      f.item.name,
      f.store.snapshot(),
      f.chat,
      null,
      p,
    );
    assert.equal(chosen.draft.itemId, f.item.id);
    assert.match(chosen.prompt, /How many additional/);
    assert.equal(
      continueAction(
        "Would that work with Juno?",
        f.store.snapshot(),
        f.chat,
        null,
        p,
      ),
      null,
    );
    f.store.exchange(
      f.chat.id,
      "What about the weather?",
      "Ordinary unrelated answer",
    );
    assert.equal(
      continueAction("go ahead", f.store.snapshot(), f.chat, null, p),
      null,
    );
    for (const kind of ["stock", "stash", "clarify", "reservation"])
      assert.equal(
        continueAction("cancel that", f.store.snapshot(), f.chat, null, {
          ...p,
          kind,
        }).cancel,
        p.id,
      );
    const other = f.store.createConversation({});
    assert.equal(
      continueAction("go ahead", f.store.snapshot(), other, null, p),
      null,
    );
  } finally {
    f.store.db.close();
  }
});
test("same-item references stay within the conversation and stale stock cannot confirm", () => {
  const f = fixture();
  try {
    const p = f.publish(
      resolveIntent(
        { ...empty, intent: "stock", item: f.item.name, quantity: 1 },
        f.store.snapshot(),
        f.chat,
        null,
        null,
      ),
    );
    f.store.saveItem({ ...f.item, notes: "updated" }, f.item.id);
    const stale = continueAction(
      "go ahead",
      f.store.snapshot(),
      f.chat,
      null,
      p,
    );
    assert.equal(stale.ready, false);
    assert.match(stale.prompt, /changed/);
    const snap = f.store.snapshot();
    assert.equal(
      stockAddition("Add another one to Stash", snap, {
        conversationId: f.chat.id,
      }).itemId,
      f.item.id,
    );
    assert.equal(
      stockAddition("Add another one to Stash", snap, {
        conversationId: "different",
      }),
      null,
    );
  } finally {
    f.store.db.close();
  }
});
