import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openStore } from "../server/store.mjs";
import { reservationCommand, requestsStash } from "../server/chat-actions.mjs";

function fixture() {
  const store = openStore(":memory:");
  const item = store.saveItem({
    name: "Piezo buzzer",
    quantity: 4,
    kind: "part",
    condition: "untested",
    identity: "unresolved",
    photo: null,
    markings: "BZ1",
    notes: "",
    evidence: "",
    location: "",
    sources: [],
  });
  const project = (name) =>
    store.saveProject({
      name,
      status: "planning",
      notes: "",
      goal: "",
      nextAction: "",
    });
  const rover = project("Rover for my AI friends"),
    juno = project("Project Juno");
  const chat = store.createConversation({ projectId: juno.id });
  const action = (draft) => ({
    id: randomUUID(),
    kind: "reservation",
    conversationId: chat.id,
    fingerprint: "fixture",
    draft,
  });
  return { store, item, rover, juno, chat, action };
}

test("only bounded current-user requests resolve; ambiguous names, counts and projects need a card", () => {
  const f = fixture();
  try {
    f.store.allocate(f.item.id, f.rover.id, 1);
    let state = f.store.snapshot();
    const resolve = (s) => reservationCommand(s, state, f.chat, null);
    for (const request of [
      "Ok, we just gave you a boat load of ability in here. Can you try again to move the buzzer to the Juno project from Rover?",
      'Move 1x Piezo buzzer from "Rover for my AI friends" to "Project Juno"',
      "Move 1 × Piezo buzzer to “Project Juno” from “Rover for my AI friends”.",
    ]) {
      const result = resolve(request);
      assert.equal(result.ready, true, request);
      assert.equal(result.draft.itemId, f.item.id);
      assert.equal(result.draft.sourceProjectId, f.rover.id);
      assert.equal(result.draft.projectId, f.juno.id);
      assert.equal(result.draft.quantity, 1);
    }
    assert.equal(
      resolve(
        "Can you please move the buzzer from the Rover project to this one?",
      ).ready,
      true,
    );
    assert.equal(
      resolve(
        "Beep boop! Can you please move the buzzer from the Rover project to this one? Thanks!",
      ).ready,
      true,
    );
    assert.equal(
      resolve("Reserve 1 buzzer for Juno. Return 1 buzzer from Rover.").ready,
      false,
    );
    assert.equal(resolve("For example. Reserve 1 buzzer for Juno."), null);
    assert.equal(
      resolve("Don't change anything. Reserve 1 buzzer for Juno."),
      null,
    );
    assert.equal(
      resolve('The label reads. "Reserve 1 buzzer for Juno."'),
      null,
    );
    assert.equal(resolve("Reserve 2 buzzers for Juno").ready, true);
    assert.equal(
      resolve("Reserve 2 buzzer for Juno").draft.projectId,
      f.juno.id,
    );
    assert.equal(resolve("Return the buzzer from Rover to Stash").ready, true);
    assert.equal(resolve("How do I move the buzzer from Rover to Juno?"), null);
    assert.equal(resolve("The image says reserve 4 buzzer for Juno"), null);
    assert.equal(resolve("Reserve the buzzer for Juno").ready, false);
    assert.equal(
      resolve("Move the buzzer from Rover to an unknown project").ready,
      false,
    );
    assert.equal(requestsStash("What is this?"), false);
    assert.equal(requestsStash("Please add this to Stash"), true);
    assert.equal(requestsStash("Add three motors from Stash to Juno"), false);
    f.store.saveItem({ ...f.item, name: "Magnetic buzzer" });
    state = f.store.snapshot();
    assert.equal(resolve("Reserve 1 buzzer for Juno").ready, false);
  } finally {
    f.store.db.close();
  }
});

test("newly saved cards resolve add-to-project requests and explicit word quantities in their own conversation", () => {
  const f = fixture();
  try {
    const { id: _id, ...fields } = f.item;
    const action = {
      id: randomUUID(),
      kind: "stash",
      conversationId: f.chat.id,
      fingerprint: "motor-photo",
      photo: null,
      draft: { ...fields, name: "small DC can motors", quantity: 1 },
    };
    f.store.recordChatAction(action, "Prepare a Stash card", "Review card");
    f.store.commitChatAction(action.id, { ...action.draft, quantity: 3 });
    const state = f.store.snapshot();
    const saved = state.items.find((i) => i.name === "small DC can motors");
    const first = reservationCommand(
      "Can you add the motors we just added to the Juno project please?",
      state,
      f.chat,
      null,
    );
    assert.equal(first.draft.itemId, saved.id);
    assert.equal(first.draft.projectId, f.juno.id);
    assert.equal(first.ready, false); // No quantity was specified yet.
    for (const request of [
      "Go ahead and add all three to Juno please.",
      "Add all of them to Juno",
      "Please assign three motors to Juno",
      "Put 3 small DC can motor to this project",
    ]) {
      const result = reservationCommand(request, state, f.chat, null);
      assert.equal(result.ready, true, request);
      assert.equal(result.draft.itemId, saved.id);
      assert.equal(result.draft.quantity, 3);
      assert.equal(result.draft.projectId, f.juno.id);
    }
    const elsewhere = f.store.createConversation({ projectId: f.rover.id });
    assert.equal(
      reservationCommand("Add all three to Juno", state, elsewhere, null).ready,
      false,
    );
    const manyMessages = [
      ...state.messages,
      ...Array.from({ length: 9 }, () => ({
        role: "assistant",
        conversationId: f.chat.id,
        content: "Other discussion",
      })),
    ];
    assert.equal(
      reservationCommand(
        "Add all three to Juno",
        { ...state, messages: manyMessages },
        f.chat,
        null,
      ).ready,
      false,
    );
    const draft = { ...action, id: randomUUID() };
    f.store.recordChatAction(draft, "Another photo", "Unsaved card");
    assert.equal(
      reservationCommand(
        "Add all three to Juno",
        f.store.snapshot(),
        f.chat,
        null,
      ).ready,
      false,
    );
    assert.equal(f.store.snapshot().allocations.length, 0);
  } finally {
    f.store.db.close();
  }
});

test("partial reservation transfers and returns conserve stock and replay without duplication", () => {
  const f = fixture();
  try {
    const source = f.store.allocate(f.item.id, f.rover.id, 3);
    const move = f.action({
      operation: "transfer",
      itemId: f.item.id,
      projectId: f.juno.id,
      allocationId: source.id,
      quantity: 2,
      expectedQuantity: 3,
      expectedUpdatedAt: f.item.updatedAt,
    });
    const receipt = f.store.recordChatAction(move, "move 2", "review", true);
    assert.equal(receipt.status, "completed");
    assert.match(receipt.receipt, /Moved 2/);
    assert.equal(f.store.snapshot().items[0].available, 1);
    assert.equal(
      f.store.snapshot().allocations.find((a) => a.id === source.id).quantity,
      1,
    );
    f.store.recordChatAction(move, "move 2", "review", true);
    f.store.commitChatAction(move.id, move.draft);
    assert.equal(f.store.snapshot().messages.length, 2);
    assert.equal(
      f.store.snapshot().allocations.filter((a) => a.state === "reserved")
        .length,
      2,
    );
    const returned = f.action({
      operation: "return",
      itemId: f.item.id,
      allocationId: receipt.allocationId,
      quantity: 1,
      expectedQuantity: 2,
    });
    f.store.recordChatAction(returned, "return 1", "review", true);
    assert.equal(f.store.snapshot().items[0].available, 2);
    assert.equal(
      f.store
        .snapshot()
        .allocations.filter((a) => a.state !== "returned")
        .reduce((n, a) => n + a.quantity, 0),
      2,
    );
    assert.throws(
      () =>
        f.store.recordChatAction(
          { ...move, fingerprint: "changed request" },
          "other",
          "review",
        ),
      /another request/,
    );
  } finally {
    f.store.db.close();
  }
});

test("failed, installed, stale and excessive actions roll back stock, receipts and messages together", () => {
  const f = fixture();
  try {
    const source = f.store.allocate(f.item.id, f.rover.id, 2);
    const attempt = (fields) =>
      f.store.recordChatAction(
        f.action({
          operation: "transfer",
          itemId: f.item.id,
          projectId: f.juno.id,
          allocationId: source.id,
          quantity: 1,
          ...fields,
        }),
        "move",
        "review",
        true,
      );
    const baseline = JSON.stringify(f.store.snapshot());
    assert.throws(() => attempt({ quantity: 3 }), /exceeds/);
    assert.throws(() => attempt({ expectedQuantity: 1 }), /changed/);
    assert.throws(() => attempt({ expectedUpdatedAt: "stale" }), /changed/);
    assert.throws(() => attempt({ projectId: f.rover.id }), /different/);
    assert.equal(JSON.stringify(f.store.snapshot()), baseline);
    f.store.transition(source.id, "installed");
    assert.throws(() => attempt({}), /physical recovery/);
    assert.equal(f.store.snapshot().chatActions.length, 0);
    assert.equal(f.store.snapshot().messages.length, 0);
  } finally {
    f.store.db.close();
  }
});

test("photo Stash drafts add nothing until committed, retain provenance and save only once", () => {
  const f = fixture();
  try {
    const draft = {
      ...f.item,
      name: "Photo candidate",
      quantity: 1,
      photo: "source.jpg",
      photoReview: {
        photo: "source.jpg",
        model: "synthetic",
        uncertainty: "Untested",
      },
    };
    delete draft.id;
    const action = {
      id: randomUUID(),
      kind: "stash",
      conversationId: f.chat.id,
      fingerprint: "photo",
      photo: "source.jpg",
      draft,
    };
    f.store.recordChatAction(action, "add photo to stash", "Review card");
    assert.equal(f.store.snapshot().items.length, 1);
    const saved = f.store.commitChatAction(action.id, {
      ...draft,
      name: "Edited candidate",
      quantity: 2,
      photo: "wrong.jpg",
      photoReview: null,
    });
    f.store.commitChatAction(action.id, { ...draft, quantity: 99 });
    assert.equal(f.store.snapshot().items.length, 2);
    const item = f.store.snapshot().items.find((i) => i.id === saved.itemId);
    assert.equal(item.name, "Edited candidate");
    assert.equal(item.quantity, 2);
    assert.equal(item.photo, "source.jpg");
    assert.equal(item.photoReview.model, "synthetic");
    assert.equal(item.condition, "untested");
    assert.equal(item.identity, "unresolved");
    assert.equal(
      f.store.snapshot().messages.find((m) => m.role === "assistant").actionId,
      action.id,
    );
    const dismissed = { ...action, id: randomUUID() };
    f.store.recordChatAction(dismissed, "new", "draft");
    f.store.cancelChatAction(dismissed.id);
    assert.throws(
      () => f.store.commitChatAction(dismissed.id, draft),
      /cancelled/,
    );
    assert.equal(f.store.snapshot().items.length, 2);
  } finally {
    f.store.db.close();
  }
});

test("failure while writing receipt rolls back the inventory mutation", () => {
  const f = fixture();
  try {
    f.store.db.exec(
      "CREATE TRIGGER fail_receipt BEFORE INSERT ON messages BEGIN SELECT RAISE(ABORT, 'receipt fixture'); END;",
    );
    assert.throws(
      () =>
        f.store.recordChatAction(
          f.action({
            operation: "reserve",
            itemId: f.item.id,
            projectId: f.juno.id,
            quantity: 1,
          }),
          "reserve",
          "review",
          true,
        ),
      /receipt fixture/,
    );
    assert.equal(f.store.snapshot().allocations.length, 0);
    assert.equal(f.store.snapshot().chatActions.length, 0);
    assert.equal(f.store.snapshot().items[0].available, 4);
  } finally {
    f.store.db.close();
  }
});
