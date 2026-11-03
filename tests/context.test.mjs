import test from "node:test";
import assert from "node:assert/strict";
import { buildContext, contextRules } from "../server/context.mjs";
const item = (id, patch = {}) => ({
  id,
  name: `Part ${id}`,
  kind: "part",
  quantity: 1,
  available: 1,
  identity: "unresolved",
  condition: "untested",
  notes: "",
  markings: "",
  evidence: "",
  photo: null,
  sources: [],
  ...patch,
});
const snapshot = (items, patch = {}) => ({
  items,
  projects: [],
  allocations: [],
  messages: [],
  ...patch,
});
test("whole catalog gets priority over long earlier evidence; late parts are not declared missing", () => {
  const items = Array.from({ length: 17 }, (_, i) =>
    item(`item-${i}`, {
      evidence: "Older verbose evidence ".repeat(200),
      notes: "Saved note ".repeat(100),
      photoReview: { uncertainty: "OLD CONDITION: UNTESTED" },
    }),
  );
  items[16] = item("latest-clock", {
    name: "LCD display",
    notes: "Recovered and stored in drawer A",
    condition: "working",
    recoveredFrom: {
      donorId: "clock",
      donorName: "Clock",
      at: "2026-10-28T20:00:00Z",
      specs: "Unknown interface",
      unknowns: "Need controller markings",
    },
  });
  const { packet, report } = buildContext(snapshot(items), {
    mode: "ideas",
    message: "Suggest builds for the LCD display",
  });
  assert.equal(packet.inventory.length, 17);
  assert.equal(packet.omittedInventoryRecords, 0);
  assert.equal(
    packet.inventory.find((i) => i.id === "latest-clock").recovery.status,
    "user-recorded physical recovery",
  );
  assert.equal(
    packet.inventory.find((i) => i.id === "latest-clock").condition,
    "working",
  );
  assert.match(
    packet.details.find((i) => i.itemId === "latest-clock").notes,
    /drawer A/,
  );
  assert.doesNotMatch(JSON.stringify(packet), /OLD CONDITION/);
  assert.ok(report.characters <= 18000);
  assert.match(contextRules, /do not demand a photo/);
});
test("selected and query-matched evidence includes notes, relevant sources and project instructions", () => {
  const items = [
    item("old", { notes: "Unrelated" }),
    item("motor", {
      name: "Motor",
      notes: "padding ".repeat(300) + "encoder requires a separate controller",
      sources: [
        {
          title: "Unrelated",
          url: "https://example.com/a",
          section: "1",
          excerpt: "Other",
        },
        { title: "Unrelated two", excerpt: "Other" },
        {
          title: "Encoder manual",
          url: "https://example.com/encoder",
          section: "Interfaces",
          excerpt: "Encoder output needs a controller.",
        },
      ],
    }),
  ];
  const projects = [
    {
      id: "rover",
      name: "Rover",
      status: "planning",
      goal: "Build a rover",
      notes: "Use removable connectors",
      nextAction: "Measure wheel size",
    },
  ];
  const { packet } = buildContext(
    snapshot(items, {
      projects,
      allocations: [
        { itemId: "motor", projectId: "rover", state: "reserved", quantity: 1 },
      ],
    }),
    {
      itemId: "motor",
      message: "Rover encoder interface",
      photo: "fixture.jpg",
    },
  );
  const detail = packet.details.find((i) => i.itemId === "motor");
  assert.match(detail.notes, /encoder requires/);
  assert.equal(detail.sources[0].title, "Encoder manual");
  assert.equal(packet.projectDetails[0].notes, "Use removable connectors");
  assert.equal(packet.inventory[0].allocations[0].projectId, "rover");
  assert.equal(packet.photoAttached, true);
});
test("salvage hypotheses remain separate from recovered stock and tools", () => {
  const donor = item("donor", {
    kind: "donor",
    dismantledAt: "now",
    salvage: [
      {
        id: "row",
        name: "Speaker",
        quantity: 8,
        specs: "Unknown",
        unknowns: "Inspect",
      },
    ],
    recoveries: [{ rowId: "row", quantity: 1, itemId: "speaker" }],
  });
  const { packet } = buildContext(
    snapshot([
      donor,
      item("speaker", {
        recoveredFrom: { donorId: "donor", donorName: "Donor" },
      }),
      item("tool", { kind: "tool" }),
    ]),
    { itemId: "donor", mode: "salvage" },
  );
  assert.equal(packet.inventory.length, 3);
  assert.equal(packet.inventory[0].available, 0);
  assert.equal(packet.inventory.find((i) => i.id === "tool").kind, "tool");
  assert.equal(packet.details[0].existingAssemblies[0].quantity, 8);
  assert.equal(packet.details[0].existingAssemblies[0].recovered, 1);
});
test("very large catalogs stay bounded, report omissions, and prioritize named items without leaking removed records", () => {
  const items = Array.from({ length: 2000 }, (_, i) =>
    item(`id-${i}`, { name: `Record ${i} ${"long ".repeat(20)}` }),
  );
  items.push(item("removed", { removedAt: "now" }));
  const { packet, report } = buildContext(snapshot(items), {
    itemId: "id-1999",
  });
  assert.equal(packet.inventory[0].id, "id-1999");
  assert.ok(packet.omittedInventoryRecords > 0);
  assert.equal(packet.totalInventoryRecords, 2000);
  assert.ok(report.characters <= 18000);
  assert.ok(!packet.inventory.some((i) => i.id === "removed"));
});
