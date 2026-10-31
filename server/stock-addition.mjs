import { matchingRecords } from "./chat-actions.mjs";

// Only explicit current-user additions to existing stock, never model claims.
export function stockAddition(message, snapshot, context = {}) {
  if (
    /\b(?:don't|do not|not|example|pretend|imagine|what if|how (?:can|do|would)|should I|would these)\b|`|^\s*>/im.test(
      message,
    )
  )
    return null;
  const match = message.match(
    /\badd\s+(.+?)\s+(?:to|into)\s+(?:(?:the|my|our|current|existing)\s+)*(?:stash|inventory|stock)\s*(?:please)?[.!?]?$/i,
  );
  if (!match) return null;
  const counts = {
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
    another: 1,
  };
  const phrase = match[1].replace(/^(?:an?\s+)?additional\s+/i, "");
  const counted = phrase.match(
    /^(\d+|one|two|three|four|five|six|seven|eight|nine|ten|another)\b\s*(?:more\s+)?(?:x\s+)?(.*)$/i,
  );
  if (!counted) return null;
  const quantity = counts[counted[1].toLowerCase()] || Number(counted[1]);
  let name = counted[2].trim();
  if (!name)
    name =
      message
        .slice(0, match.index)
        .match(/\banother\s+([^,?.!]+)[,?.!]/i)?.[1]
        ?.trim() || "";
  if (
    !name ||
    /^(?:one|this|that|it|these|those|of (?:these|those)|(?:the )?same (?:one|motor|item))$/i.test(
      name,
    )
  ) {
    const latestMessage = (snapshot.messages || [])
      .filter((m) => m.conversationId === context.conversationId && m.actionId)
      .at(-1);
    const latest = (snapshot.chatActions || []).find(
      (a) => a.id === latestMessage?.actionId,
    );
    const currentMessage = (snapshot.messages || [])
      .filter((m) => m.conversationId === context.conversationId)
      .at(-1);
    const reference =
      context.selectedId ||
      (currentMessage?.actionId !== latest?.id
        ? null
        : latest?.status === "completed"
          ? latest.itemId
          : latest?.kind === "stock" && latest.status === "draft"
            ? latest.draft.itemId
            : null);
    const item = snapshot.items.find((i) => i.id === reference);
    if (item) name = item.name;
  }
  if (!name || /^(?:this|that|it|these|those)$/i.test(name)) return null;
  const candidates = matchingRecords(snapshot.items, name);
  if (!candidates.length) return null;
  const item = candidates.length === 1 ? candidates[0] : null;
  return {
    itemId: item?.id || "",
    quantity,
    expectedUpdatedAt: item?.updatedAt,
    expectedQuantity: item?.quantity,
    candidateItemIds: candidates.map((i) => i.id),
  };
}
