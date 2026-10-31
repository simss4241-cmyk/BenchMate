// Only the current user's bounded command can authorize a reservation change.
// Image contents, model output and conversation history never enter this parser.
const normalize = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
function unique(records, phrase) {
  const singular = (w) =>
    w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w;
  const words = normalize(phrase)
    .split(" ")
    .filter((w) => !["the", "project", "please", "my"].includes(w));
  if (!words.length) return null;
  const exact = records.filter((r) => normalize(r.name) === words.join(" "));
  const matches = exact.length
    ? exact
    : records.filter((r) =>
        words.every((w) =>
          normalize(r.name).split(" ").map(singular).includes(singular(w)),
        ),
      );
  return matches.length === 1 ? matches[0].id : null;
}
export function reservationCommand(
  message,
  snapshot,
  conversation,
  selectedId,
) {
  if (
    /\b(?:example|hypothetical|pretend|imagine|don['’]?t|do not|shouldn['’]?t|what if|how (?:do|would|can))\b/i.test(
      message,
    ) ||
    /`|^\s*>/m.test(message)
  )
    return null;
  const commandPattern =
    /^(?:(?:can|could|would|will) you\s+)?(?:please\s+)?(?:(?:try(?: again)?\s+(?:to\s+)?|go ahead and\s+))?(reserve|set aside|add|assign|put|move|transfer|return|release)\s+(.+)$/i;
  const commands = message
    .trim()
    .split(/(?<=[.!?])\s+/)
    .map((s) =>
      s
        .replace(/[?.!]$/, "")
        .replace(/\s+please$/i, "")
        .match(commandPattern),
    )
    .filter(Boolean);
  const match = commands[0];
  if (!match) return null;
  const operation = /move|transfer/i.test(match[1])
    ? "transfer"
    : /return|release/i.test(match[1])
      ? "return"
      : "reserve";
  let parts = match[2].match(
    operation === "reserve"
      ? /^(.+?)\s+(?:for|to)\s+(.+)$/i
      : operation === "transfer"
        ? /^(.+?)\s+from\s+(.+?)\s+to\s+(.+)$/i
        : /^(.+?)\s+from\s+(.+?)(?:\s+(?:back )?(?:to|into)\s+(?:the )?(?:stash|stock))?$/i,
  );
  // Both orders are ordinary requests: "from Rover to Juno" and
  // "to Juno from Rover". Resolve each named role before touching stock.
  if (!parts && operation === "transfer") {
    const reversed = match[2].match(/^(.+?)\s+to\s+(.+?)\s+from\s+(.+)$/i);
    if (reversed) parts = [reversed[0], reversed[1], reversed[3], reversed[2]];
  }
  const draft = {
    operation,
    itemId: "",
    projectId: "",
    sourceProjectId: "",
    allocationId: "",
    quantity: 1,
  };
  if (!parts) return { draft, ready: false };
  const actionMessage = (snapshot.messages || [])
    .filter((m) => m.conversationId === conversation.id)
    .slice(-8)
    .filter((m) => m.role === "assistant" && m.actionId)
    .at(-1);
  const recentAction = (snapshot.chatActions || []).find(
    (a) => a.id === actionMessage?.actionId,
  );
  const recentId =
    recentAction?.status === "completed"
      ? recentAction.itemId
      : recentAction?.kind === "reservation" && recentAction.status === "draft"
        ? recentAction.draft.itemId
        : null;
  const recent = snapshot.items.find((i) => i.id === recentId);
  let phrase = parts[1].replace(/^the\s+/i, ""),
    quantity = null;
  const all = /^all(?:\s|$)/i.test(phrase);
  if (all) phrase = phrase.replace(/^all\b(?:\s+of\b)?(?:\s+the\b)?\s*/i, "");
  const numbers = {
    a: 1,
    an: 1,
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
  const count = phrase.match(
    /^(\d+|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|a|an)(?:\s*[x×])?(?:\s+(.+))?$/i,
  );
  if (count) {
    quantity = /^\d+$/.test(count[1])
      ? Number(count[1])
      : numbers[count[1].toLowerCase()];
    phrase = count[2] || "";
  }
  const justAdded = /\s+(?:we|i)\s+just\s+(?:added|saved|created)$/i.test(
    phrase,
  );
  phrase = phrase.replace(/\s+(?:we|i)\s+just\s+(?:added|saved|created)$/i, "");
  const reference =
    /^(?:(?:of\s+)?(?:this|that|it|them|these|those)(?:\s+(?:parts?|items?|motors?))?)?$/i.test(
      phrase,
    );
  const itemId = reference
    ? selectedId || recent?.id
    : justAdded
      ? recent && unique([recent], phrase)
      : unique(snapshot.items, phrase);
  const projectId = (p) =>
    /^(?:this(?: one| project)?|here|current project)$/i.test(p.trim())
      ? conversation.projectId
      : unique(snapshot.projects, p);
  draft.itemId = itemId || "";
  if (operation === "reserve") draft.projectId = projectId(parts[2]) || "";
  else {
    draft.sourceProjectId = projectId(parts[2]) || "";
    if (operation === "transfer") draft.projectId = projectId(parts[3]) || "";
    const allocations = snapshot.allocations.filter(
      (a) =>
        a.itemId === itemId &&
        a.projectId === draft.sourceProjectId &&
        a.state === "reserved",
    );
    if (allocations.length === 1) {
      draft.allocationId = allocations[0].id;
      draft.expectedQuantity = allocations[0].quantity;
      if (quantity === null && allocations[0].quantity === 1) quantity = 1;
      if (all && quantity === null) quantity = allocations[0].quantity;
    }
  }
  if (all && quantity === null && operation === "reserve")
    quantity = snapshot.items.find((i) => i.id === itemId)?.available || null;
  draft.quantity = quantity || 1;
  draft.expectedUpdatedAt = snapshot.items.find(
    (i) => i.id === itemId,
  )?.updatedAt;
  return {
    draft,
    ready: !!(
      commands.length === 1 &&
      itemId &&
      quantity &&
      (operation === "reserve"
        ? draft.projectId
        : draft.allocationId && (operation === "return" || draft.projectId))
    ),
  };
}
export const requestsStash = (message) =>
  /^(?:(?:can|could|would) you\s+)?(?:please\s+)?(?:prepare\b[\s\S]*\bstash card\b|(?:add|save|put)\b[\s\S]*\b(?:to|into|in)\s+(?:(?:the|my)\s+)?stash(?:\s+please)?[.!?]?$)/i.test(
    message.trim(),
  );
