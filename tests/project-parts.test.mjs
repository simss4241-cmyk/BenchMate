import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openStore } from "../server/store.mjs";
import { partsPlanSchema, parsePartsPlan } from "../server/project-parts.mjs";
import { partsCoverage } from "../src/project-parts.ts";
import { buildContext } from "../server/context.mjs";

const row = (patch = {}) => ({
  id: randomUUID(),
  name: "Wheel motor",
  quantity: 2,
  purpose: "Move the rover",
  verification: "Verify driver and motor ratings",
  itemId: null,
  ...patch,
});
const plan = (rows) => ({
  summary: "Plan for mobility, subject to verification",
  rows,
});
function fixture() {
  const store = openStore(":memory:");
  const p = store.saveProject({
    name: "Juno",
    goal: "Move the rover",
    notes: "",
    nextAction: "Check driver needs",
    status: "planning",
  });
  const item = store.saveItem({
    name: "DC motor",
    quantity: 3,
    kind: "part",
    condition: "untested",
    identity: "unresolved",
    location: "",
    notes: "",
    markings: "",
    evidence: "",
    photo: null,
    sources: [],
  });
  return { store, p, item };
}
test("parts proposals preserve unknown counts, clear fake matches and reject malformed or truncated output", () => {
  const f = fixture();
  try {
    const raw = {
      summary: "Candidate needs",
      rows: [
        row({ quantity: null, itemId: f.item.id }),
        row({ name: "Driver", itemId: randomUUID() }),
      ].map(({ id, ...r }) => r),
    };
    const parsed = parsePartsPlan(
      { message: { content: JSON.stringify(raw) } },
      f.store.snapshot(),
      "synthetic",
    );
    assert.equal(parsed.rows[0].quantity, null);
    assert.equal(parsed.rows[0].itemId, f.item.id);
    assert.equal(parsed.rows[1].itemId, null);
    assert.equal(parsed.model, "synthetic");
    assert.ok(parsed.rows[0].id);
    assert.throws(
      () =>
        parsePartsPlan(
          { done_reason: "length", message: { content: JSON.stringify(raw) } },
          f.store.snapshot(),
          "synthetic",
        ),
      /incomplete/,
    );
    for (const quantity of [0, -1, 1.5, 100001])
      assert.throws(() => partsPlanSchema.parse(plan([row({ quantity })])));
    const r = row();
    assert.throws(() => partsPlanSchema.parse(plan([r, r])));
    assert.throws(() =>
      partsPlanSchema.parse(plan(Array.from({ length: 31 }, () => row()))),
    );
  } finally {
    f.store.db.close();
  }
});
test("saved project requirements change no stock or allocations and survive project edits", () => {
  const f = fixture();
  try {
    f.store.allocate(f.item.id, f.p.id, 1);
    const before = f.store.snapshot();
    const saved = f.store.saveProjectParts(
      f.p.id,
      plan([
        row({ itemId: f.item.id }),
        row({ name: "Motor driver", quantity: null }),
      ]),
      f.p.updatedAt,
    );
    assert.equal(saved.suggestedParts.rows.length, 2);
    assert.equal(saved.suggestedParts.rows[1].quantity, null);
    assert.deepEqual(f.store.snapshot().items, before.items);
    assert.deepEqual(f.store.snapshot().allocations, before.allocations);
    assert.throws(
      () => f.store.saveProjectParts(f.p.id, plan([]), f.p.updatedAt),
      /changed/,
    );
    const edited = f.store.saveProject(
      { ...f.p, notes: "Updated notes" },
      f.p.id,
    );
    assert.deepEqual(edited.suggestedParts, saved.suggestedParts);
    f.store.saveProjectParts(f.p.id, plan([]), edited.updatedAt);
    assert.equal(f.store.snapshot().projects[0].suggestedParts.rows.length, 0);
  } finally {
    f.store.db.close();
  }
});
test("removed stock and bench tools cannot become candidate installable parts", () => {
  const f = fixture();
  try {
    const tool = f.store.saveItem(
      { ...f.item, name: "Meter", kind: "tool" },
      randomUUID(),
    );
    assert.throws(
      () =>
        f.store.saveProjectParts(
          f.p.id,
          plan([row({ itemId: tool.id })]),
          f.p.updatedAt,
        ),
      /candidate/i,
    );
    f.store.removeItem(f.item.id);
    assert.throws(
      () =>
        f.store.saveProjectParts(
          f.p.id,
          plan([row({ itemId: f.item.id })]),
          f.p.updatedAt,
        ),
      /candidate/i,
    );
    assert.equal(f.store.snapshot().projects[0].suggestedParts, undefined);
  } finally {
    f.store.db.close();
  }
});
test("coverage counts each project's held stock and free unit once across repeated requirements", () => {
  const item = {
    id: "motor",
    name: "Motor",
    kind: "part",
    quantity: 5,
    available: 2,
    condition: "untested",
  };
  const rows = [
    row({ itemId: "motor", quantity: 2 }),
    row({ itemId: "motor", quantity: 2 }),
    row({ itemId: "motor", quantity: null }),
    row({ name: "Controller", quantity: 1 }),
  ];
  const allocations = [
    { itemId: "motor", projectId: "juno", quantity: 1, state: "reserved" },
    { itemId: "motor", projectId: "other", quantity: 2, state: "reserved" },
  ];
  const c = partsCoverage(plan(rows), "juno", [item], allocations);
  assert.deepEqual(
    c.map((r) => [r.covered, r.reservable, r.missing]),
    [
      [1, 1, 0],
      [0, 1, 1],
      [0, 0, null],
      [0, 0, 1],
    ],
  );
  assert.equal(
    partsCoverage(
      plan([row({ itemId: "motor" })]),
      "juno",
      [{ ...item, condition: "consumed" }],
      [],
    )[0].reservable,
    0,
  );
  assert.equal(
    partsCoverage(plan([row({ itemId: "motor" })]), "juno", [], [])[0].item,
    undefined,
  );
});
test("project chat context labels saved requirements as suggestions rather than reserved stock", () => {
  const f = fixture();
  try {
    f.store.saveProjectParts(
      f.p.id,
      plan([row({ name: "Missing motor driver", quantity: null })]),
      f.p.updatedAt,
    );
    const context = buildContext(f.store.snapshot(), {
      message: "What is missing for Juno?",
      projectId: f.p.id,
      mode: "ideas",
      provider: "meta",
    });
    assert.match(JSON.stringify(context.packet), /Missing motor driver/);
    assert.match(JSON.stringify(context.packet), /not reserved/);
  } finally {
    f.store.db.close();
  }
});
