import {
  latestAction,
  resolveActionPlan,
  continueReservation,
} from "./action-understanding.mjs";
import { matchingRecords } from "./chat-actions.mjs";

export function pendingAction(snapshot, conversation) {
  const latest = latestAction(snapshot, conversation);
  return latest?.status === "draft" ? latest : null;
}
export function stockPrompt(draft, snapshot) {
  const item = snapshot.items.find((i) => i.id === draft.itemId);
  if (!item)
    return "Which existing Stash item did you get more of? Choose it below or reply with its name.";
  if (draft.quantityKnown === false)
    return `How many additional ${item.name} did you get? This is the number to add, not the new total.`;
  return `Review adding ${draft.quantity} more × ${item.name}: total ${draft.expectedQuantity} → ${draft.expectedQuantity + draft.quantity}. Confirm below or reply ‘go ahead’.`;
}
export function resolveIntent(
  plan,
  snapshot,
  conversation,
  selectedId,
  pending,
) {
  if (plan.intent === "chat") return null;
  if (plan.intent === "reservation" && !plan.operation)
    return { kind: "clarify" };
  if (plan.intent === "reservation")
    return {
      kind: "reservation",
      ...resolveActionPlan(plan, snapshot, conversation, selectedId, pending),
    };
  if (plan.intent === "stash")
    return { kind: "stash", quantity: plan.quantity };
  if (plan.intent === "clarify") return { kind: "clarify" };
  const latest = latestAction(snapshot, conversation);
  const reference =
    plan.item === "@selected"
      ? selectedId
      : plan.item === "@pending"
        ? pending?.draft.itemId
        : plan.item === "@recent"
          ? latest?.status === "completed"
            ? latest.itemId
            : null
          : null;
  const matches = reference
    ? snapshot.items.filter((i) => i.id === reference)
    : plan.item && !plan.item.startsWith("@")
      ? matchingRecords(snapshot.items, plan.item)
      : [];
  const item = matches.length === 1 ? matches[0] : null;
  const draft = {
    itemId: item?.id || "",
    quantity: plan.quantity || 1,
    quantityKnown: plan.quantity !== null,
    expectedUpdatedAt: item?.updatedAt,
    expectedQuantity: item?.quantity,
    candidateItemIds: matches.map((i) => i.id),
  };
  return {
    kind: "stock",
    draft,
    prompt: stockPrompt(draft, snapshot),
    ready: false,
  };
}

const numberWords = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
};
export function continueAction(
  message,
  snapshot,
  conversation,
  selectedId,
  pending,
) {
  if (
    !pending ||
    pending.status !== "draft" ||
    pending.conversationId !== conversation.id
  )
    return null;
  const text = message
    .trim()
    .toLowerCase()
    .replace(/[.!?]$/, "")
    .replace(/^(?:actually[, ]*|make (?:it|that)\s+)/, "")
    .replace(/\s+please$/, "");
  if (
    /^(?:cancel(?: (?:it|that|this|that change|this change|the pending action))?|never mind|nevermind|stop|no|nope|no thanks|don['’]?t do it|do not do it|leave it)$/.test(
      text,
    )
  )
    return { cancel: pending.id };
  if (selectedId && pending.draft.itemId && selectedId !== pending.draft.itemId)
    return null;
  // After an unrelated exchange, a bare "go ahead" no longer names the old
  // card. Let the interpreter ask for review rather than executing old context.
  const latestMessage = snapshot.messages
    .filter((m) => m.conversationId === conversation.id)
    .at(-1);
  if (latestMessage?.actionId !== pending.id) return null;
  if (pending.kind === "reservation") {
    const result = continueReservation(
      message,
      snapshot,
      conversation,
      selectedId,
      pending,
    );
    return result ? { kind: "reservation", ...result } : null;
  }
  if (!["stock", "stash"].includes(pending.kind)) return null;
  const draft = { ...pending.draft };
  const confirm = /^(?:yes|go ahead|do it|apply it|confirm)$/.test(text);
  const count = text.match(
    /^(?:all\s+)?(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)(?:\s+(?:additional|more|units?|parts?|of (?:them|those)))?$/,
  );
  if (count) {
    draft.quantity = numberWords[count[1]] || Number(count[1]);
    draft.quantityKnown = draft.quantity > 0 && draft.quantity <= 100000;
  }
  let chosen = false;
  if (!confirm && !count && pending.kind === "stock") {
    const matches = matchingRecords(snapshot.items, message);
    if (matches.length === 1) {
      const item = matches[0];
      const changed = draft.itemId && draft.itemId !== item.id;
      Object.assign(draft, {
        itemId: item.id,
        expectedUpdatedAt: item.updatedAt,
        expectedQuantity: item.quantity,
      });
      if (changed) draft.quantityKnown = false;
      chosen = true;
    }
  }
  if (!confirm && !count && !chosen) return null;
  if (pending.kind === "stash")
    return {
      kind: "stash",
      draft,
      photo: pending.photo,
      prompt:
        "Review the revised Stash card, then choose Add to Stash. Nothing has been added.",
      ready: false,
    };
  const item = snapshot.items.find((i) => i.id === draft.itemId);
  const stale =
    item &&
    (draft.expectedUpdatedAt !== item.updatedAt ||
      draft.expectedQuantity !== item.quantity);
  return {
    kind: "stock",
    draft,
    ready: !!(confirm && item && draft.quantityKnown !== false && !stale),
    prompt: stale
      ? "This item changed. Refresh stock and review again before adding units."
      : stockPrompt(draft, snapshot),
  };
}
