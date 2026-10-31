import test from "node:test";
import assert from "node:assert/strict";
import {
  requestsStash,
  reservationCommand,
  recentStashPhoto,
} from "../server/chat-actions.mjs";

test("new inventory requests stay separate from project allocations", () => {
  for (const message of [
    "Can you please add the dvd rw drive to inventory? I plan to pull motors and such from it.",
    "Save this to my inventory please.",
    "Put this in stock",
    "Please add this to Stash",
  ]) {
    assert.equal(requestsStash(message), true);
    assert.equal(reservationCommand(message, {}, {}), null);
  }
  for (const message of [
    "Add the motors to Juno",
    "Return the buzzer from Juno to Stash",
    "Don't add this to inventory",
    "How can I add this to inventory?",
    "Would these work for Juno?",
  ])
    assert.equal(requestsStash(message), false);
});

test("follow-up photo scope is recent, user supplied and conversation specific", () => {
  const messages = [
    { conversationId: "a", role: "user", photo: "old.png" },
    { conversationId: "b", role: "user", photo: "other.png" },
    { conversationId: "a", role: "user", photo: "dvd.png" },
    { conversationId: "a", role: "assistant", photo: "invented.png" },
  ];
  assert.equal(recentStashPhoto({ messages }, { id: "a" }), "dvd.png");
  assert.equal(recentStashPhoto({ messages }, { id: "c" }), null);
  messages.push(
    ...Array.from({ length: 6 }, () => ({
      conversationId: "a",
      role: "user",
      content: "unrelated",
    })),
  );
  assert.equal(recentStashPhoto({ messages }, { id: "a" }), null);
});
