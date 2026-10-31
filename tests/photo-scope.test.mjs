import test from "node:test";
import assert from "node:assert/strict";
import { parseStashPhoto, unsuitablePhotoAnswer } from "../server/identity.mjs";
const candidate = {
  candidateName: "Iron Valiant ex Pokémon card",
  markings: "",
  markingsStatus: "not_visible",
  evidence: "A printed trading card",
  uncertainty: "",
  benchRelevance: "off_topic",
};
test("irrelevant and unclear Stash photos produce an honest non-inventory outcome", () => {
  for (const benchRelevance of ["off_topic", "unclear"]) {
    const parsed = parseStashPhoto({
      message: { content: JSON.stringify({ ...candidate, benchRelevance }) },
    });
    assert.equal(parsed.benchRelevance, benchRelevance);
    assert.match(
      unsuitablePhotoAnswer(parsed),
      /No Stash card|haven't prepared a Stash card/,
    );
  }
  assert.throws(
    () =>
      parseStashPhoto({
        message: {
          content: JSON.stringify({ ...candidate, benchRelevance: "probably" }),
        },
      }),
    /could not reliably classify/,
  );
  const { benchRelevance, ...missing } = candidate;
  assert.throws(
    () => parseStashPhoto({ message: { content: JSON.stringify(missing) } }),
    /could not reliably classify/,
  );
  assert.throws(
    () =>
      parseStashPhoto({
        message: { content: JSON.stringify(candidate) },
        done_reason: "length",
      }),
    /incomplete/,
  );
});
