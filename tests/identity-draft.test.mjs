import test from "node:test";
import assert from "node:assert/strict";
import {
  applyIdentityProposal,
  identityStatus,
} from "../src/identity-draft.ts";
const observation = {
  photo: "qa-photo.png",
  model: "test",
  createdAt: "2026-10-27T00:00:00Z",
  candidateName: "Candidate motor",
  markings: "MODEL QA",
  markingsStatus: "readable",
  evidence: "Visible label.",
  uncertainty: "Untested.",
};

test("a saved photo identity completes identification without claiming manual confirmation or changing condition", () => {
  const record = {
    identity: "unresolved",
    condition: "untested",
    quantity: 1,
    photo: observation.photo,
    photoReview: observation,
  };
  assert.equal(identityStatus(record).label, "Identified from photo");
  assert.equal(identityStatus(record).needsIdentification, false);
  assert.equal(record.identity, "unresolved");
  assert.equal(record.condition, "untested");
  assert.equal(record.quantity, 1);
  assert.equal(
    identityStatus({ ...record, reviewPending: true }).label,
    "Review identification",
  );
  assert.equal(
    identityStatus({ ...record, identity: "confirmed" }).label,
    "User-confirmed identity",
  );
});

test("missing identity, unclear review, and a replaced photo still require identification", () => {
  for (const record of [
    { identity: "unresolved", photo: observation.photo },
    {
      photo: observation.photo,
      photoReview: { ...observation, candidateName: "  " },
    },
    { photo: "new-photo.png", photoReview: observation },
    { photo: null, photoReview: observation },
  ])
    assert.equal(identityStatus(record).needsIdentification, true);
  assert.equal(
    identityStatus({
      photo: observation.photo,
      photoReview: { ...observation, candidateName: "" },
    }).label,
    "Photo reviewed · ID unclear",
  );
});
test("inline identity fills a new unsaved form without changing quantity, notes, or confirmation", () => {
  const before = {
    name: "",
    photo: "qa-photo.png",
    markings: "",
    evidence: "",
    notes: "My unsaved notes",
    quantity: 7,
    identity: "unresolved",
    sources: [{ title: "My source" }],
  };
  const after = applyIdentityProposal(before, {
    ...observation,
    itemId: null,
    baseUpdatedAt: null,
  });
  assert.equal(after.name, "Candidate motor");
  assert.equal(after.markings, "MODEL QA");
  assert.equal(after.quantity, 7);
  assert.equal(after.notes, "My unsaved notes");
  assert.equal(after.identity, "unresolved");
  assert.deepEqual(after.sources, before.sources);
  assert.equal(before.markings, "");
  assert.equal(after.id, undefined);
  assert.equal(after.reviewPending, true);
});
test("inline identity preserves an existing working name, evidence, and unsaved edits", () => {
  const before = {
    id: "part",
    updatedAt: "v1",
    name: "My name",
    photo: "qa-photo.png",
    markings: "Old label",
    evidence: "My evidence",
    notes: "Unsaved change",
    quantity: 3,
  };
  const after = applyIdentityProposal(before, {
    ...observation,
    itemId: "part",
    baseUpdatedAt: "v1",
  });
  assert.equal(after.name, "My name");
  assert.equal(after.evidence, "My evidence");
  assert.equal(after.notes, "Unsaved change");
  assert.equal(after.expectedUpdatedAt, "v1");
  assert.equal(after.photoReview.markings, "MODEL QA");
});
test("draft reviews reject mismatched identity, photo, and stale version; unreadable text preserves entered markings", () => {
  const before = {
    id: "part",
    updatedAt: "v1",
    name: "Part",
    photo: "qa-photo.png",
    markings: "Manual label",
    evidence: "",
  };
  for (const override of [
    { itemId: "other" },
    { photo: "different.png" },
    { baseUpdatedAt: "v2" },
  ])
    assert.throws(() =>
      applyIdentityProposal(before, {
        ...observation,
        itemId: "part",
        baseUpdatedAt: "v1",
        ...override,
      }),
    );
  assert.equal(
    applyIdentityProposal(before, {
      ...observation,
      itemId: "part",
      baseUpdatedAt: "v1",
      markings: "",
      markingsStatus: "unreadable",
    }).markings,
    "Manual label",
  );
});
