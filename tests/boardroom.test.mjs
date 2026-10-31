import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { openStore } from "../server/store.mjs";
import { boardSchema, parseBoardMap } from "../server/boardroom.mjs";
import { buildContext } from "../server/context.mjs";
import {
  mergeBoardRegions,
  numberedBoardRegions,
  boardRegionAtPoint,
  layoutBoardBadges,
} from "../src/board-map.ts";

test("nested component number badges use free corners instead of covering each other", () => {
  const region = (number, x, y, width, height) => ({
    number,
    component: { photo: "front", bounds: { x, y, width, height } },
  });
  const positions = [
    ...layoutBoardBadges(
      [
        region(14, 0.68, 0.209, 0.21, 0.66),
        region(11, 0.68, 0.21, 0.12, 0.08),
        region(13, 0.68, 0.25, 0.08, 0.03),
      ],
      660,
      370,
    ).values(),
  ];
  for (let i = 0; i < positions.length; i++)
    for (let j = i + 1; j < positions.length; j++) {
      const a = positions[i],
        b = positions[j];
      const overlap =
        Math.max(
          0,
          Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x),
        ) *
        Math.max(
          0,
          Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y),
        );
      assert.equal(overlap, 0);
    }
});

test("component numbers match the board list across photos and overlay draw order", () => {
  const components = [
    {
      id: "first",
      photo: "front",
      bounds: { x: 0, y: 0, width: 1, height: 1 },
    },
    {
      id: "back",
      photo: "back",
      bounds: { x: 0, y: 0, width: 0.5, height: 0.5 },
    },
    {
      id: "nested",
      photo: "front",
      bounds: { x: 0.2, y: 0.2, width: 0.1, height: 0.1 },
    },
  ];
  assert.deepEqual(
    numberedBoardRegions(components, "front").map((r) => [
      r.component.id,
      r.number,
    ]),
    [
      ["first", 1],
      ["nested", 3],
    ],
  );
  assert.deepEqual(
    numberedBoardRegions(components, "back").map((r) => r.number),
    [2],
  );
});

test("small components remain selectable inside large overlapping boxes regardless of ordering", () => {
  const shield = {
    id: "shield",
    photo: "front",
    bounds: { x: 0.1, y: 0.1, width: 0.8, height: 0.8 },
  };
  const connector = {
    id: "connector",
    photo: "front",
    bounds: { x: 0.2, y: 0.2, width: 0.1, height: 0.1 },
  };
  const back = {
    ...connector,
    id: "back",
    photo: "back",
    bounds: { x: 0.2, y: 0.2, width: 0.01, height: 0.01 },
  };
  for (const components of [
    [connector, shield, back],
    [back, shield, connector],
  ]) {
    assert.equal(
      boardRegionAtPoint(components, "front", { x: 0.25, y: 0.25 }).id,
      "connector",
    );
    assert.equal(
      boardRegionAtPoint(components, "front", { x: 0.8, y: 0.8 }).id,
      "shield",
    );
    assert.equal(
      boardRegionAtPoint(components, "front", { x: 0.95, y: 0.95 }),
      undefined,
    );
  }
});

test("repeat mapping preserves edited components and skips duplicate footprints on the same photo", () => {
  const original = {
    photo: "front",
    name: "User corrected",
    bounds: { x: 0.1, y: 0.1, width: 0.2, height: 0.2 },
  };
  const repeated = { ...original, name: "AI guess" };
  const back = { ...repeated, photo: "back" };
  const nearby = {
    ...repeated,
    bounds: { x: 0.5, y: 0.1, width: 0.2, height: 0.2 },
  };
  const result = mergeBoardRegions(
    [original],
    [repeated, back, nearby, nearby],
  );
  assert.equal(result.skipped, 2);
  assert.equal(result.components.length, 3);
  assert.equal(result.components[0].name, "User corrected");
});

const photo = `${randomUUID()}.jpg`;
const component = () => ({
  id: randomUUID(),
  name: "Candidate capacitor",
  category: "Capacitors",
  photo,
  quantity: 2,
  markings: "100 16V",
  description: "Possible filtering",
  evidence: "Cylindrical package",
  uncertainty: "Condition untested",
  confidence: "medium",
  bounds: { x: 0.1, y: 0.2, width: 0.2, height: 0.1 },
  sources: [],
});
const board = (patch = {}) => ({
  name: "Test board",
  notes: "Synthetic fixture",
  photos: [photo],
  linkedItemId: null,
  components: [component()],
  ...patch,
});
const item = {
  name: "Test donor",
  kind: "donor",
  quantity: 1,
  condition: "untested",
  identity: "unresolved",
  photo,
  sources: [],
  notes: "",
  markings: "",
  location: "",
  evidence: "",
};
const project = {
  name: "Test project",
  status: "planning",
  notes: "",
  goal: "",
  nextAction: "",
};

test("board maps reject malformed geometry, duplicate IDs, missing photos and truncated inference", () => {
  const fixture = board();
  assert.equal(boardSchema.parse(fixture).components.length, 1);
  assert.throws(() =>
    boardSchema.parse({
      ...fixture,
      components: [...fixture.components, fixture.components[0]],
    }),
  );
  assert.throws(() =>
    boardSchema.parse({ ...fixture, photos: [`${randomUUID()}.jpg`] }),
  );
  const c = fixture.components[0];
  const { id, photo: p, quantity, sources, ...region } = c;
  assert.equal(
    parseBoardMap({
      message: {
        content: JSON.stringify({ regions: [region], summary: "Test map" }),
      },
    }).regions.length,
    1,
  );
  assert.throws(
    () => parseBoardMap({ done_reason: "length" }),
    /generation limit/,
  );
  assert.throws(
    () =>
      parseBoardMap({
        message: {
          content: JSON.stringify({
            regions: [
              {
                ...region,
                bounds: { x: 0.95, y: 0.2, width: 0.2, height: 0.1 },
              },
            ],
            summary: "Invalid",
          }),
        },
      }),
    /invalid board map/,
  );
});

test("mapping adds no stock; recovery is atomic, bounded and usable by existing Projects", () => {
  const store = openStore(":memory:");
  try {
    const b = store.saveBoard(boardSchema.parse(board()));
    const c = b.components[0];
    assert.equal(store.snapshot().items.length, 0);
    const recovered = store.recoverBoard(
      b.id,
      c.id,
      1,
      b.updatedAt,
      "Drawer C",
    );
    assert.equal(recovered.boardOrigin.boardId, b.id);
    assert.equal(recovered.condition, "untested");
    assert.equal(recovered.identity, "unresolved");
    assert.equal(recovered.location, "Drawer C");
    assert.match(recovered.notes, /Condition untested/);
    assert.throws(
      () => store.saveItem({ ...recovered, kind: "donor" }, recovered.id),
      /remain parts/,
    );
    assert.throws(
      () => store.recoverBoard(b.id, c.id, 1, b.updatedAt),
      /changed/,
    );
    let next = store.snapshot().boards[0];
    assert.throws(
      () => store.recoverBoard(b.id, c.id, 2, next.updatedAt),
      /exceeds/,
    );
    assert.equal(store.snapshot().items.length, 1);
    assert.throws(
      () =>
        store.saveBoard(
          { ...next, components: [], expectedUpdatedAt: next.updatedAt },
          b.id,
        ),
      /Keep recovered/,
    );
    const p = store.saveProject(project);
    const a = store.allocate(recovered.id, p.id, 1);
    assert.equal(store.snapshot().items[0].available, 0);
    store.transition(a.id, "installed");
    store.transition(a.id, "returned");
    assert.equal(store.snapshot().items[0].available, 1);
    assert.throws(() => store.transition(a.id, "returned"), /cannot make/);
    store.saveItem(
      { ...recovered, name: "Edited cache capacitor" },
      recovered.id,
    );
    assert.equal(store.snapshot().items[0].boardOrigin.componentId, c.id);
    const context = buildContext(store.snapshot(), {
      mode: "ideas",
      message: "capacitor",
      itemId: recovered.id,
    });
    assert.equal(
      context.packet.inventory[0].boardroomRecovery.status,
      "user-recorded physical recovery",
    );
    store.recoverBoard(b.id, c.id, 1, next.updatedAt);
    next = store.snapshot().boards[0];
    assert.throws(
      () => store.recoverBoard(b.id, c.id, 1, next.updatedAt),
      /exceeds/,
    );
  } finally {
    store.db.close();
  }
});

test("linked board recovery blocks allocated donors, retires intact stock and prevents duplicate recovery paths", () => {
  const store = openStore(":memory:");
  try {
    const donor = store.saveItem(item);
    const b = store.saveBoard(board({ linkedItemId: donor.id }));
    assert.throws(
      () => store.saveBoard(board({ linkedItemId: donor.id })),
      /already has/,
    );
    assert.throws(
      () => store.saveItem({ ...item, quantity: 2 }, donor.id),
      /linked Boardroom/,
    );
    const p = store.saveProject(project);
    const a = store.allocate(donor.id, p.id, 1);
    assert.throws(
      () => store.recoverBoard(b.id, b.components[0].id, 1, b.updatedAt),
      /cannot be dismantled/,
    );
    assert.equal(store.snapshot().boards[0].recoveries.length, 0);
    assert.equal(store.snapshot().items.length, 1);
    store.transition(a.id, "returned");
    store.recoverBoard(b.id, b.components[0].id, 1, b.updatedAt);
    assert.equal(
      store.snapshot().items.find((i) => i.id === donor.id).available,
      0,
    );
    assert.throws(() => store.allocate(donor.id, p.id, 1), /dismantled/);
    assert.throws(
      () => store.recover(donor.id, randomUUID(), 1, donor.updatedAt),
      /Boardroom recoveries/,
    );
    const next = store.snapshot().boards[0];
    assert.throws(
      () =>
        store.saveBoard(
          { ...next, linkedItemId: null, expectedUpdatedAt: next.updatedAt },
          b.id,
        ),
      /Keep the source link/,
    );
    assert.equal(
      store.saveBoard(
        { ...next, notes: "Updated", expectedUpdatedAt: next.updatedAt },
        b.id,
      ).notes,
      "Updated",
    );
  } finally {
    store.db.close();
  }
});

test("a board cannot become a second recovery path for an already dismantled donor", () => {
  const store = openStore(":memory:");
  try {
    const donor = store.saveItem({
      ...item,
      salvage: [
        {
          id: randomUUID(),
          name: "Assembly",
          quantity: 1,
          evidence: "",
          specs: "",
          unknowns: "",
          reuse: "",
          evidenceStatus: "potential",
        },
      ],
    });
    const b = store.saveBoard(board({ linkedItemId: donor.id }));
    store.recover(donor.id, donor.salvage[0].id, 1, donor.updatedAt);
    assert.throws(
      () => store.recoverBoard(b.id, b.components[0].id, 1, b.updatedAt),
      /cannot be dismantled/,
    );
    assert.equal(store.snapshot().boards[0].recoveries.length, 0);
  } finally {
    store.db.close();
  }
});
