import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openStore } from "../server/store.mjs";
import {
  parseActionPlan,
  planningMessages,
  resolveActionPlan,
  pendingReservation,
  continueReservation,
  shouldUnderstand,
} from "../server/action-understanding.mjs";

function fixture() {
  const store = openStore(":memory:");
  const project = (name) =>
    store.saveProject({
      name,
      status: "planning",
      goal: "",
      notes: "",
      nextAction: "",
    });
  const juno = project("Project Juno"),
    rover = project("Rover");
  const chat = store.createConversation({ projectId: juno.id });
  const motor = store.saveItem({
    name: "Small DC motor",
    quantity: 5,
    kind: "part",
    identity: "unresolved",
    condition: "untested",
    location: "",
    markings: "",
    notes: "PRIVATE NOTES MUST NOT ENTER PLANNING",
    evidence: "",
    sources: [],
    photo: null,
  });
  const plan = {
    intent: "reservation",
    operation: "reserve",
    item: motor.name,
    destination: "@current",
    source: null,
    quantity: null,
    all: false,
  };
  const publish = (command, parent = null, extra = {}) =>
    store.recordChatAction(
      {
        id: randomUUID(),
        kind: "reservation",
        fingerprint: randomUUID(),
        conversationId: chat.id,
        draft: command.draft,
        prompt: command.prompt,
        ...(parent ? { replacesActionId: parent.id } : {}),
        ...extra,
      },
      "user request",
      command.prompt,
      command.ready,
    );
  return { store, juno, rover, chat, motor, plan, publish };
}
test("model plans are strict bounded proposals, including invalid/truncated results", () => {
  const valid = {
    intent: "chat",
    operation: null,
    item: null,
    destination: null,
    source: null,
    quantity: null,
    all: false,
  };
  assert.deepEqual(
    parseActionPlan({ message: { content: JSON.stringify(valid) } }),
    valid,
  );
  for (const change of [
    { quantity: -1 },
    { quantity: 1.5 },
    { quantity: 100001 },
    { quantity: 3, all: true },
    { operation: "install" },
    { execute: true },
  ])
    assert.throws(() =>
      parseActionPlan({
        message: { content: JSON.stringify({ ...valid, ...change }) },
      }),
    );
  assert.throws(() => parseActionPlan({ message: { content: "not JSON" } }));
  assert.throws(() =>
    parseActionPlan({
      message: { content: JSON.stringify(valid) },
      done_reason: "length",
    }),
  );
});
test("model proposals wait for review; missing quantity continues with an exact number and saves once", () => {
  const f = fixture();
  try {
    const proposal = resolveActionPlan(
      f.plan,
      f.store.snapshot(),
      f.chat,
      null,
      null,
    );
    assert.equal(proposal.ready, false);
    assert.match(proposal.prompt, /how many/i);
    const pending = f.publish(proposal);
    assert.equal(f.store.snapshot().allocations.length, 0);
    const reply = continueReservation(
      "all three",
      f.store.snapshot(),
      f.chat,
      null,
      pending,
    );
    assert.equal(reply.ready, true);
    assert.equal(reply.draft.quantity, 3); // not all five!
    const completed = f.publish(reply, pending);
    assert.equal(completed.status, "completed");
    assert.equal(f.store.snapshot().items[0].available, 2);
    assert.equal(f.store.chatAction(pending.id).supersededBy, completed.id);
    assert.throws(
      () => f.store.commitChatAction(pending.id, pending.draft),
      /cancelled/,
    );
    f.store.commitChatAction(completed.id, completed.draft);
    assert.equal(f.store.snapshot().items[0].available, 2);
  } finally {
    f.store.db.close();
  }
});
test("a complete semantic proposal still requires an explicit confirmation", () => {
  const f = fixture();
  try {
    const proposal = resolveActionPlan(
      { ...f.plan, quantity: 2 },
      f.store.snapshot(),
      f.chat,
      null,
      null,
    );
    assert.equal(proposal.ready, false);
    const pending = f.publish(proposal);
    const correction = continueReservation(
      "Actually, one please.",
      f.store.snapshot(),
      f.chat,
      null,
      pending,
    );
    assert.equal(correction.draft.quantity, 1);
    assert.equal(correction.ready, true);
    const confirm = continueReservation(
      "go ahead",
      f.store.snapshot(),
      f.chat,
      null,
      pending,
    );
    assert.equal(confirm.ready, true);
    assert.equal(confirm.draft.quantity, 2);
    assert.equal(f.store.snapshot().allocations.length, 0);
  } finally {
    f.store.db.close();
  }
});
test("ambiguous parts produce candidates and can be resolved across multiple replies", () => {
  const f = fixture();
  try {
    const other = f.store.saveItem({ ...f.motor, name: "Large DC motor" });
    const proposal = resolveActionPlan(
      { ...f.plan, item: "motor" },
      f.store.snapshot(),
      f.chat,
      null,
      null,
    );
    assert.equal(proposal.draft.itemId, "");
    assert.equal(proposal.draft.candidateItemIds.length, 2);
    assert.match(proposal.prompt, /Small DC motor; Large DC motor/);
    const pending = f.publish(proposal);
    const choice = continueReservation(
      "Small DC motor",
      f.store.snapshot(),
      f.chat,
      null,
      pending,
    );
    assert.equal(choice.ready, false);
    assert.equal(choice.draft.itemId, f.motor.id);
    const next = f.publish(choice, pending);
    const quantity = continueReservation(
      "three",
      f.store.snapshot(),
      f.chat,
      null,
      next,
    );
    assert.equal(quantity.ready, true);
    assert.equal(quantity.draft.quantity, 3);
    assert.equal(
      continueReservation("three", f.store.snapshot(), f.chat, other.id, next),
      null,
    );
  } finally {
    f.store.db.close();
  }
});
test("pending actions are scoped, cancellation is atomic, and superseded requests cannot execute", () => {
  const f = fixture();
  try {
    const pending = f.publish(
      resolveActionPlan(f.plan, f.store.snapshot(), f.chat, null, null),
    );
    const elsewhere = f.store.createConversation({ projectId: f.rover.id });
    assert.equal(pendingReservation(f.store.snapshot(), elsewhere), null);
    assert.equal(
      continueReservation(
        "never mind",
        f.store.snapshot(),
        f.chat,
        null,
        pending,
      ).cancel,
      pending.id,
    );
    const cancelled = f.publish(
      {
        draft: pending.draft,
        ready: false,
        prompt: "Cancelled. No inventory changed.",
      },
      pending,
      { cancelled: true },
    );
    assert.equal(cancelled.status, "cancelled");
    assert.equal(pendingReservation(f.store.snapshot(), f.chat), null);
    assert.throws(
      () => f.publish({ draft: pending.draft, ready: true }, pending),
      /pending action changed/,
    );
    assert.equal(f.store.snapshot().allocations.length, 0);
  } finally {
    f.store.db.close();
  }
});
test("changed inventory and ambiguous operations block automatic confirmation", () => {
  const f = fixture();
  try {
    const pending = f.publish(
      resolveActionPlan(
        { ...f.plan, quantity: 1 },
        f.store.snapshot(),
        f.chat,
        null,
        null,
      ),
    );
    f.store.saveItem({ ...f.motor, quantity: 4 }, f.motor.id);
    const changed = continueReservation(
      "yes",
      f.store.snapshot(),
      f.chat,
      null,
      pending,
    );
    assert.equal(changed.ready, false);
    assert.match(changed.prompt, /changed/);
    const multiple = f.publish(
      resolveActionPlan(
        { ...f.plan, operation: null, quantity: 1 },
        f.store.snapshot(),
        f.chat,
        null,
        null,
      ),
    );
    assert.equal(
      continueReservation(
        "go ahead",
        f.store.snapshot(),
        f.chat,
        null,
        multiple,
      ).ready,
      false,
    );
    const invented = resolveActionPlan(
      { ...f.plan, item: randomUUID() },
      f.store.snapshot(),
      f.chat,
      null,
      null,
    );
    assert.equal(invented.draft.itemId, "");
    assert.equal(invented.ready, false);
  } finally {
    f.store.db.close();
  }
});
test("planner context excludes images, private notes and generated history; ordinary questions remain chat", () => {
  const f = fixture();
  try {
    f.store.exchange(
      f.chat.id,
      "earlier",
      "GENERATED TEXT MUST NOT ENTER PLANNING",
    );
    const messages = planningMessages(
      "Could you earmark two motors for this build?",
      f.store.snapshot(),
      f.chat,
      f.motor.id,
      null,
    );
    const text = JSON.stringify(messages);
    assert.ok(!text.includes("PRIVATE NOTES MUST"));
    assert.ok(!text.includes("GENERATED TEXT MUST"));
    assert.ok(!text.includes('"images"'));
    const large = {
      ...f.store.snapshot(),
      items: Array.from({ length: 500 }, (_, i) => ({
        ...f.motor,
        id: `item-${i}`,
        name: `Long motor ${i} ${"x".repeat(130)}`,
      })).concat(f.motor),
    };
    const bounded = JSON.stringify(
      planningMessages("Assign parts", large, f.chat, f.motor.id, null),
    );
    assert.ok(bounded.length < 16000);
    assert.ok(bounded.includes(f.motor.name));
    assert.equal(
      shouldUnderstand(
        "Could you earmark two motors for this build?",
        f.store.snapshot(),
        f.chat,
        null,
      ),
      true,
    );
    assert.equal(
      shouldUnderstand(
        "I'd like the green motors earmarked for this build",
        f.store.snapshot(),
        f.chat,
        null,
      ),
      true,
    );
    assert.equal(
      shouldUnderstand(
        "What voltage is printed on this motor?",
        f.store.snapshot(),
        f.chat,
        null,
      ),
      false,
    );
    assert.equal(
      resolveActionPlan(
        { ...f.plan, intent: "chat" },
        f.store.snapshot(),
        f.chat,
        null,
        null,
      ),
      null,
    );
  } finally {
    f.store.db.close();
  }
});
