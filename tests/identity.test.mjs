import test from "node:test";
import assert from "node:assert/strict";
import { parseIdentity, identitySummary } from "../server/identity.mjs";
const proposal = {
  candidateName: "Candidate power bank",
  markings: "703955\n10000 mAh / 37 Wh\n5 V 2 A in; 2.1 A out on each port",
  markingsStatus: "readable",
  evidence: "Text visible on the case label.",
  uncertainty: "Capacity is a printed claim, not a measured result.",
};
test("photo proposals preserve exact units and qualifiers without asserting confirmation", () => {
  const parsed = parseIdentity({
    message: { content: JSON.stringify(proposal) },
    done_reason: "stop",
  });
  assert.equal(parsed.markings, proposal.markings);
  assert.equal(parsed.identity, undefined);
  assert.match(identitySummary(parsed), /does not save inventory changes/);
  assert.match(
    identitySummary(parsed),
    /not a verified electrical specification/,
  );
});
test("malformed and truncated proposals cannot be applied", () => {
  for (const body of [
    { message: { content: "not json" } },
    { message: { content: JSON.stringify({ ...proposal, markings: 42 }) } },
    { message: { content: JSON.stringify({ ...proposal, markings: "" }) } },
    {
      message: {
        content: JSON.stringify({ ...proposal, identity: "confirmed" }),
      },
    },
    { message: { content: JSON.stringify(proposal) }, done_reason: "length" },
  ])
    assert.throws(
      () => parseIdentity(body),
      /No inventory fields were changed/,
    );
});
