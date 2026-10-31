import { useEffect, useRef, useState } from "react";
import "./chat-action-card.css";

export type ChatAction = {
  id: string;
  kind: "stash" | "reservation";
  status: "draft" | "completed" | "cancelled";
  photo?: string;
  receipt?: string;
  itemId?: string;
  draft: {
    name?: string;
    quantity: number;
    kind?: "part" | "donor" | "tool";
    condition?: string;
    location?: string;
    markings?: string;
    notes?: string;
    evidence?: string;
    photoReview?: { uncertainty: string };
    operation?: string;
    itemId?: string;
    projectId?: string;
    allocationId?: string;
    expectedUpdatedAt?: string;
    expectedQuantity?: number;
  };
};
type ItemSummary = {
  id: string;
  name: string;
  quantity: number;
  available: number;
  markings: string;
  photo: string | null;
  updatedAt?: string;
};
type AllocationSummary = {
  id: string;
  itemId: string;
  projectId: string;
  quantity: number;
  state: string;
};

export function ChatActionCard({
  action,
  items,
  projects,
  allocations,
  onRefresh,
  onOpen,
}: {
  action: ChatAction;
  items: ItemSummary[];
  projects: { id: string; name: string }[];
  allocations: AllocationSummary[];
  onRefresh: () => Promise<void>;
  onOpen: (id: string) => void;
}) {
  const draftKey = `benchmate.chat.action.v1.${action.id}`;
  const [draft, setDraft] = useState(() => {
    try {
      return {
        ...action.draft,
        ...JSON.parse(localStorage.getItem(draftKey) || "{}"),
      } as typeof action.draft;
    } catch {
      return action.draft;
    }
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    try {
      if (action.status === "draft")
        localStorage.setItem(draftKey, JSON.stringify(draft));
      else localStorage.removeItem(draftKey);
    } catch {}
  }, [action.status, draft, draftKey]);
  const patch = (fields: Partial<typeof draft>) =>
    setDraft((old) => ({ ...old, ...fields }));
  async function submit(cancel = false) {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await fetch(
        `/api/chat-actions/${action.id}/${cancel ? "cancel" : "commit"}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(draft),
        },
      );
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Action failed.");
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  if (action.status === "completed")
    return (
      <section
        className="chat-action receipt"
        aria-label="Completed inventory action"
      >
        <strong>✓ Saved to your bench</strong>
        <p>{action.receipt}</p>
        {action.itemId && (
          <button className="secondary" onClick={() => onOpen(action.itemId!)}>
            Open Stash item
          </button>
        )}
      </section>
    );
  if (action.status === "cancelled")
    return (
      <p className="chat-action">Draft dismissed. No inventory changed.</p>
    );
  const duplicates =
    action.kind === "stash"
      ? items.filter(
          (i) =>
            i.photo === action.photo ||
            (draft.markings?.trim() &&
              i.markings.trim() === draft.markings.trim()) ||
            i.name.toLowerCase() === draft.name?.toLowerCase(),
        )
      : [];
  const reservations = allocations.filter(
    (a) => a.itemId === draft.itemId && a.state === "reserved",
  );
  return (
    <form
      className="chat-action"
      aria-label={
        action.kind === "stash" ? "Review Stash card" : "Review project parts"
      }
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
    >
      <p className="eyebrow">
        {action.kind === "stash"
          ? "STASH DRAFT · REVIEW BEFORE ADDING"
          : "PROJECT PARTS · REVIEW ACTION"}
      </p>
      <fieldset disabled={busy}>
        {action.kind === "stash" ? (
          <>
            {action.photo && (
              <img
                className="chat-photo"
                src={`/api/photos/${action.photo}`}
                alt="Photo for this Stash draft"
              />
            )}
            <label>
              Name
              <input
                required
                maxLength={160}
                value={draft.name || ""}
                onChange={(e) => patch({ name: e.target.value })}
              />
            </label>
            <div className="chat-action-grid">
              <label>
                Type
                <select
                  value={draft.kind}
                  onChange={(e) =>
                    patch({ kind: e.target.value as "part" | "donor" | "tool" })
                  }
                >
                  <option value="part">Part</option>
                  <option value="donor">Donor device</option>
                  <option value="tool">Tool / equipment</option>
                </select>
              </label>
              <label>
                Location
                <input
                  maxLength={6000}
                  value={draft.location || ""}
                  onChange={(e) => patch({ location: e.target.value })}
                />
              </label>
            </div>
            <p>
              Photo identification · untested. Confirm how many physical items
              you have; the photo does not establish a count.
            </p>
            <details>
              <summary>Identification &amp; notes</summary>
              <label>
                Visible markings
                <textarea
                  maxLength={6000}
                  value={draft.markings || ""}
                  onChange={(e) => patch({ markings: e.target.value })}
                />
              </label>
              <label>
                Evidence
                <textarea
                  maxLength={6000}
                  value={draft.evidence || ""}
                  onChange={(e) => patch({ evidence: e.target.value })}
                />
              </label>
              <p>{draft.photoReview?.uncertainty}</p>
              <label>
                Notes
                <textarea
                  maxLength={6000}
                  value={draft.notes || ""}
                  onChange={(e) => patch({ notes: e.target.value })}
                />
              </label>
            </details>
            {!!duplicates.length && (
              <div className="hosted-notice">
                <strong>Possible existing Stash item</strong>
                {duplicates.map((i) => (
                  <p key={i.id}>
                    <button
                      className="secondary"
                      type="button"
                      onClick={() => onOpen(i.id)}
                    >
                      {i.name} · {i.quantity} recorded
                    </button>
                  </p>
                ))}
                Check these before adding another record.
              </div>
            )}
          </>
        ) : (
          <>
            <label>
              Action
              <select
                value={draft.operation}
                onChange={(e) =>
                  patch({
                    operation: e.target.value,
                    allocationId: "",
                    expectedQuantity: undefined,
                  })
                }
              >
                <option value="reserve">Reserve available stock</option>
                <option value="transfer">Move a reservation</option>
                <option value="return">Return a reservation to stock</option>
              </select>
            </label>
            <label>
              Stash item
              <select
                required
                value={draft.itemId}
                onChange={(e) =>
                  patch({
                    itemId: e.target.value,
                    allocationId: "",
                    expectedQuantity: undefined,
                    expectedUpdatedAt: items.find(
                      (i) => i.id === e.target.value,
                    )?.updatedAt,
                  })
                }
              >
                <option value="">Choose an item</option>
                {items.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name} · {i.available} available
                  </option>
                ))}
              </select>
            </label>
            {draft.operation !== "reserve" && (
              <label>
                From reservation
                <select
                  required
                  value={draft.allocationId}
                  onChange={(e) => {
                    const a = reservations.find((a) => a.id === e.target.value);
                    patch({
                      allocationId: e.target.value,
                      expectedQuantity: a?.quantity,
                    });
                  }}
                >
                  <option value="">Choose a reservation</option>
                  {reservations.map((a) => (
                    <option key={a.id} value={a.id}>
                      {projects.find((p) => p.id === a.projectId)?.name} ·{" "}
                      {a.quantity} reserved
                    </option>
                  ))}
                </select>
              </label>
            )}
            {draft.operation !== "return" && (
              <label>
                {draft.operation === "transfer" ? "To project" : "For project"}
                <select
                  required
                  value={draft.projectId}
                  onChange={(e) => patch({ projectId: e.target.value })}
                >
                  <option value="">Choose a project</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            <p>
              Reservation changes only. Installation and physical recovery are
              recorded separately.
            </p>
          </>
        )}
        <label>
          Quantity
          <input
            type="number"
            required
            min={1}
            max={100000}
            step={1}
            value={draft.quantity}
            onChange={(e) => patch({ quantity: Number(e.target.value) })}
          />
        </label>
        {error && (
          <div role="alert">
            <p>{error}</p>
            {action.kind === "reservation" && (
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  void onRefresh()
                    .then(() => {
                      patch({
                        itemId: "",
                        allocationId: "",
                        expectedUpdatedAt: undefined,
                        expectedQuantity: undefined,
                      });
                      setError("");
                    })
                    .catch((e) => setError((e as Error).message));
                }}
              >
                Refresh stock &amp; review again
              </button>
            )}
          </div>
        )}
        <div className="chat-action-buttons">
          <button className="primary" type="submit">
            {busy
              ? "Saving…"
              : action.kind === "stash"
                ? "Add to Stash"
                : "Apply parts change"}
          </button>
          <button
            className="secondary"
            type="button"
            onClick={() => void submit(true)}
          >
            Dismiss
          </button>
        </div>
      </fieldset>
    </form>
  );
}
