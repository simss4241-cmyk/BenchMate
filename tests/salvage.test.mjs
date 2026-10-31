import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openStore } from "../server/store.mjs";
import { parseSalvage, salvageMap } from "../server/salvage.mjs";
const row = {
  id: randomUUID(),
  name: "Speaker assembly",
  quantity: 2,
  evidenceStatus: "potential",
  evidence: "Synthetic hypothesis",
  specs: "",
  unknowns: "Need interior photo and impedance measurement",
  reuse: "Requires a suitable amplifier",
};
const donor = {
  name: "Synthetic donor",
  kind: "donor",
  quantity: 1,
  identity: "confirmed",
  evidence: "Synthetic label",
  condition: "untested",
  location: "Desk",
  markings: "",
  notes: "",
  photo: null,
  sources: [],
  salvage: [row],
};
test("atomic partial recoveries exclude intact donor, retain provenance and reject replay/over-recovery", () => {
  const store = openStore(":memory:");
  try {
    const d = store.saveItem(donor);
    assert.equal(store.snapshot().items.length, 1);
    const first = store.recover(d.id, row.id, 1, d.updatedAt, "Bin A");
    assert.equal(first.item.identity, "unresolved");
    assert.equal(first.item.condition, "untested");
    assert.equal(first.item.recoveredFrom.donorId, d.id);
    assert.equal(first.item.recoveredFrom.unknowns, row.unknowns);
    assert.equal(
      store.snapshot().items.find((i) => i.id === d.id).available,
      0,
    );
    assert.throws(() => store.recover(d.id, row.id, 1, d.updatedAt), /changed/);
    assert.throws(
      () => store.recover(d.id, row.id, 2, first.donor.updatedAt),
      /remaining/,
    );
    assert.equal(store.snapshot().items.length, 2);
    const p = store.saveProject({
      name: "Test",
      goal: "",
      notes: "",
      nextAction: "",
      status: "planning",
    });
    assert.throws(() => store.allocate(d.id, p.id, 1), /dismantled/);
    assert.throws(
      () => store.saveItem({ ...donor, salvage: [] }, d.id),
      /Keep recovered/,
    );
    const edited = store.saveItem(
      {
        ...first.donor,
        condition: "working",
        recoveries: [],
        recoveredFrom: { donorId: "fake" },
      },
      d.id,
    );
    assert.equal(edited.condition, "consumed");
    assert.equal(edited.recoveries.length, 1);
    assert.equal(edited.recoveredFrom, undefined);
    const second = store.recover(d.id, row.id, 1, edited.updatedAt);
    assert.throws(
      () => store.recover(d.id, row.id, 1, second.donor.updatedAt),
      /remaining/,
    );
    store.removeItem(first.item.id);
    store.restoreItem(first.item.id);
    const child = store.snapshot().items.find((i) => i.id === first.item.id);
    assert.equal(child.recoveredFrom.donorId, d.id);
    assert.equal(
      store.itemEvents(d.id).filter((e) => e.type === "donor.recovered").length,
      2,
    );
    assert.equal(
      store
        .snapshot()
        .items.filter((i) => i.kind === "part")
        .reduce((n, i) => n + i.quantity, 0),
      2,
    );
  } finally {
    store.db.close();
  }
});
test("recovery refuses allocated, removed, batch, and non-donor stock without creating children", () => {
  const store = openStore(":memory:");
  try {
    assert.throws(() => store.saveItem({ ...donor, quantity: 2 }), /one donor/);
    assert.throws(
      () => store.saveItem({ ...donor, kind: "tool" }),
      /one donor/,
    );
    const d = store.saveItem(donor);
    const p = store.saveProject({
      name: "Test",
      goal: "",
      notes: "",
      nextAction: "",
      status: "planning",
    });
    const allocation = store.allocate(d.id, p.id, 1);
    assert.throws(
      () => store.recover(d.id, row.id, 1, d.updatedAt),
      /Return the donor/,
    );
    store.transition(allocation.id, "returned");
    store.removeItem(d.id);
    assert.throws(
      () => store.recover(d.id, row.id, 1, d.updatedAt),
      /active donor/,
    );
    assert.equal(store.snapshot().items.length, 0);
  } finally {
    store.db.close();
  }
});
test("salvage proposals reject malformed, truncated, duplicate or oversized maps", () => {
  const { id, ...component } = row;
  assert.deepEqual(
    parseSalvage({
      message: { content: JSON.stringify({ components: [component] }) },
    }),
    [component],
  );
  assert.throws(
    () => parseSalvage({ done_reason: "length" }),
    /generation limit/,
  );
  assert.throws(
    () =>
      parseSalvage({
        message: { content: '{"components":[{"name":"invented"}]}' },
      }),
    /valid salvage/,
  );
  assert.equal(salvageMap.safeParse([row, row]).success, false);
  assert.throws(
    () =>
      parseSalvage({
        message: {
          content: JSON.stringify({ components: Array(13).fill(component) }),
        },
      }),
    /valid salvage/,
  );
});
