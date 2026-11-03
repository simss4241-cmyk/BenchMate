import { useEffect, useId, useRef, useState } from "react";
import { Plus, Sparkles, Trash2, Save } from "lucide-react";
import { partsCoverage, type PartsPlan, type PlanItem } from "./project-parts";
import "./project-parts-plan.css";

type Project = {
  id: string;
  name: string;
  goal: string;
  updatedAt?: string;
  suggestedParts?: PartsPlan;
};
type Draft = { plan: PartsPlan; baseUpdatedAt: string };
const blank = (): PartsPlan => ({ summary: "", rows: [] });
export function ProjectPartsPlan({
  project,
  items,
  allocations,
  models,
  disabled,
  onRefresh,
  onReserve,
  onWorkingChange,
}: {
  project: Project;
  items: PlanItem[];
  allocations: {
    itemId: string;
    projectId: string;
    quantity: number;
    state: string;
  }[];
  models: {
    provider?: "meta";
    selected: string;
    connected: boolean;
  };
  disabled: boolean;
  onRefresh: () => Promise<void>;
  onReserve: (itemId: string, quantity: number) => void;
  onWorkingChange: (working: boolean) => void;
}) {
  const key = `benchmate.project.parts.v1.${project.id}`;
  const [draft, setDraft] = useState<Draft | null>(() => {
    try {
      const v = JSON.parse(localStorage.getItem(key) || "null");
      return v?.plan &&
        Array.isArray(v.plan.rows) &&
        typeof v.baseUpdatedAt === "string"
        ? v
        : null;
    } catch {
      return null;
    }
  });
  const [working, setWorking] = useState(false),
    [saving, setSaving] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const [replace, setReplace] = useState(false);
  const [expanded, setExpanded] = useState(!!draft);
  const bodyId = useId();
  const request = useRef<AbortController | null>(null),
    lock = useRef(false);
  useEffect(() => () => request.current?.abort(), []);
  useEffect(() => {
    try {
      if (draft) localStorage.setItem(key, JSON.stringify(draft));
      else localStorage.removeItem(key);
    } catch {}
  }, [key, draft]);
  const plan = draft?.plan || project.suggestedParts || blank();
  const editableItems = items.filter(
    (i) =>
      i.kind === "part" &&
      !i.dismantledAt &&
      !["damaged", "consumed"].includes(i.condition),
  );
  const coverage = partsCoverage(plan, project.id, items, allocations);
  function change(next: PartsPlan) {
    setExpanded(true);
    setDraft((old) => ({
      plan: next,
      baseUpdatedAt: old?.baseUpdatedAt || project.updatedAt || "",
    }));
    setNotice("");
  }
  async function suggest() {
    if (lock.current || disabled) return;
    lock.current = true;
    setWorking(true);
    onWorkingChange(true);
    setError("");
    setNotice("");
    setReplace(false);
    setExpanded(true);
    const controller = new AbortController();
    request.current = controller;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message:
            "Suggest the functional parts needed for this project's goal, using current stock where plausible and identifying missing parts and checks.",
          mode: "ideas",
          proposeParts: true,
          projectId: project.id,
          expectedUpdatedAt: project.updatedAt,
          provider: models.provider || "meta",
          model: models.selected,
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Suggestions failed.");
      if (
        !result.partsProposal ||
        result.partsProposal.projectId !== project.id
      )
        throw new Error("No valid project parts proposal was returned.");
      setDraft({
        plan: result.partsProposal.plan,
        baseUpdatedAt: result.partsProposal.baseUpdatedAt,
      });
      setNotice("Review this draft, then save the list. Nothing was reserved.");
    } catch (e) {
      setError(
        controller.signal.aborted
          ? "Suggestion stopped. Your saved list is unchanged."
          : (e as Error).message,
      );
    } finally {
      request.current = null;
      lock.current = false;
      setWorking(false);
      onWorkingChange(false);
    }
  }
  async function save() {
    if (!draft || lock.current) return;
    lock.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(
        `/api/projects/${project.id}/suggested-parts`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            plan: draft.plan,
            expectedUpdatedAt: draft.baseUpdatedAt,
          }),
        },
      );
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Couldn't save the parts list.");
      await onRefresh();
      setDraft(null);
      setExpanded(false);
      setNotice(
        "Suggested parts list saved. Stock and reservations are unchanged.",
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  const locked = working || saving || disabled;
  return (
    <section
      className="project-parts-plan"
      aria-label={`Suggested parts for ${project.name}`}
    >
      <div className="allocation-title">
        <span>SUGGESTED PARTS</span>
        <button
          type="button"
          className="secondary small"
          disabled={locked || !models.connected}
          onClick={() => {
            if (plan.rows.length) {
              setExpanded(true);
              setReplace(true);
            } else void suggest();
          }}
        >
          <Sparkles size={14} />{" "}
          {working ? "Preparing suggestions…" : "Suggest parts"}
        </button>
      </div>
      <div className="parts-plan-overview">
        <button
          type="button"
          className="secondary small"
          aria-expanded={expanded}
          aria-controls={bodyId}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded
            ? "Hide parts list"
            : plan.rows.length
              ? `Show parts list (${plan.rows.length})`
              : "Add requirements manually"}
        </button>
        <span className="quiet-note">
          {plan.rows.length} requirements ·{" "}
          {
            coverage.filter(
              (c) => !c.item || (c.missing !== null && c.missing > 0),
            ).length
          }{" "}
          still to find or match ·{" "}
          {plan.rows.filter((r) => r.quantity === null).length} quantities to
          confirm{draft ? " · Unsaved draft" : ""}
        </span>
      </div>
      {!expanded && notice && (
        <p role="status" className="quiet-note">
          {notice}
        </p>
      )}
      <div id={bodyId} hidden={!expanded}>
        <div
          className="parts-plan-scroll"
          role="region"
          aria-label={`Parts list for ${project.name}`}
          tabIndex={expanded ? 0 : -1}
        >
          <p className="quiet-note">
            A planning list, separate from reserved stock. Stash matches are
            candidates; compatibility still needs checking.
          </p>
          {working && (
            <p role="status">
              BenchMate is reading the project goal and current Stash.{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => request.current?.abort()}
              >
                Stop
              </button>
            </p>
          )}
          {replace && (
            <div className="hosted-notice">
              <p>
                Replace this list with a new proposal? Your saved list stays
                unchanged until you save the replacement.
              </p>
              <button
                type="button"
                disabled={locked}
                className="secondary"
                onClick={() => void suggest()}
              >
                Generate replacement
              </button>{" "}
              <button
                type="button"
                className="text-button"
                onClick={() => setReplace(false)}
              >
                Keep current list
              </button>
            </div>
          )}
          {!plan.rows.length && !draft && (
            <p>
              No suggested parts yet. Ask BenchMate for a draft, or add
              requirements yourself.
            </p>
          )}
          {notice && (
            <p role="status" className="quiet-note">
              {notice}
            </p>
          )}
          {error && (
            <p role="alert" className="parts-plan-error">
              {error}
            </p>
          )}
          {(plan.rows.length > 0 || draft) && (
            <label>
              Plan notes
              <textarea
                maxLength={2000}
                rows={2}
                disabled={locked}
                value={plan.summary}
                onChange={(e) => change({ ...plan, summary: e.target.value })}
              />
            </label>
          )}
          {coverage.map(({ row, item, covered, reservable, missing }) => (
            <div className="suggested-part" key={row.id}>
              <div className="suggested-part-heading">
                <strong>{row.name || "New requirement"}</strong>
                <button
                  type="button"
                  className="text-button"
                  disabled={locked}
                  aria-label={`Remove suggested part ${row.name || "new requirement"}`}
                  onClick={() =>
                    change({
                      ...plan,
                      rows: plan.rows.filter((r) => r.id !== row.id),
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              </div>
              <p className="parts-plan-status">
                {row.quantity === null
                  ? "Quantity to confirm"
                  : `${covered} reserved/installed · ${reservable} available to reserve · ${missing} still to find or match`}
              </p>
              {item && (
                <p className="quiet-note">
                  Candidate: {item.name} · {item.condition} · verify identity
                  and compatibility
                </p>
              )}
              <details open={!!draft}>
                <summary>Edit requirement &amp; checks</summary>
                <fieldset disabled={locked}>
                  <div className="suggested-part-fields">
                    <label>
                      Part / function
                      <input
                        maxLength={160}
                        required
                        value={row.name}
                        onChange={(e) =>
                          change({
                            ...plan,
                            rows: plan.rows.map((r) =>
                              r.id === row.id
                                ? { ...r, name: e.target.value }
                                : r,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Quantity needed
                      <input
                        type="number"
                        min={1}
                        max={100000}
                        step={1}
                        placeholder="To confirm"
                        value={row.quantity ?? ""}
                        onChange={(e) =>
                          change({
                            ...plan,
                            rows: plan.rows.map((r) =>
                              r.id === row.id
                                ? {
                                    ...r,
                                    quantity:
                                      e.target.value === ""
                                        ? null
                                        : Number(e.target.value),
                                  }
                                : r,
                            ),
                          })
                        }
                      />
                    </label>
                  </div>
                  <label>
                    Purpose
                    <input
                      maxLength={600}
                      value={row.purpose}
                      onChange={(e) =>
                        change({
                          ...plan,
                          rows: plan.rows.map((r) =>
                            r.id === row.id
                              ? { ...r, purpose: e.target.value }
                              : r,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Checks still needed
                    <textarea
                      rows={2}
                      maxLength={1000}
                      value={row.verification}
                      onChange={(e) =>
                        change({
                          ...plan,
                          rows: plan.rows.map((r) =>
                            r.id === row.id
                              ? { ...r, verification: e.target.value }
                              : r,
                          ),
                        })
                      }
                    />
                  </label>
                  <label>
                    Possible match in Stash
                    <select
                      value={row.itemId || ""}
                      onChange={(e) =>
                        change({
                          ...plan,
                          rows: plan.rows.map((r) =>
                            r.id === row.id
                              ? { ...r, itemId: e.target.value || null }
                              : r,
                          ),
                        })
                      }
                    >
                      <option value="">No match / still to find</option>
                      {row.itemId &&
                        !editableItems.some((i) => i.id === row.itemId) && (
                          <option value={row.itemId}>
                            Previous match unavailable — clear or replace
                          </option>
                        )}
                      {editableItems.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name} · {i.available} available
                        </option>
                      ))}
                    </select>
                  </label>
                </fieldset>
              </details>
              {row.purpose && <p>{row.purpose}</p>}
              {row.verification && (
                <p className="quiet-note">Check: {row.verification}</p>
              )}
              {item && (
                <button
                  type="button"
                  className="secondary small"
                  disabled={
                    locked || !!draft || reservable < 1 || row.quantity === null
                  }
                  onClick={() => onReserve(item.id, reservable)}
                >
                  {draft
                    ? "Save list before reserving"
                    : `Reserve ${reservable || "parts"} for project`}
                </button>
              )}
            </div>
          ))}
        </div>
        <div className="chat-action-buttons parts-plan-actions">
          <button
            type="button"
            className="secondary small"
            disabled={locked || plan.rows.length >= 30}
            onClick={() =>
              change({
                ...plan,
                rows: [
                  ...plan.rows,
                  {
                    id: crypto.randomUUID(),
                    name: "",
                    quantity: null,
                    purpose: "",
                    verification: "",
                    itemId: null,
                  },
                ],
              })
            }
          >
            <Plus size={14} /> Add requirement
          </button>
          {draft && (
            <>
              <button
                type="button"
                className="primary small"
                disabled={
                  locked ||
                  plan.rows.some(
                    (r) =>
                      !r.name.trim() ||
                      (r.quantity !== null &&
                        (!Number.isInteger(r.quantity) ||
                          r.quantity < 1 ||
                          r.quantity > 100000)),
                  )
                }
                onClick={() => void save()}
              >
                <Save size={14} /> {saving ? "Saving…" : "Save parts list"}
              </button>
              <button
                type="button"
                disabled={locked}
                className="text-button"
                onClick={async () => {
                  setSaving(true);
                  setError("");
                  try {
                    await onRefresh();
                    setDraft(null);
                    setNotice("Saved list loaded.");
                  } catch (e) {
                    setError((e as Error).message);
                  } finally {
                    setSaving(false);
                  }
                }}
              >
                Discard draft / load saved
              </button>
            </>
          )}
        </div>
        {plan.model && (
          <p className="quiet-note">
            Suggested with {plan.model}. Review and edits do not establish
            electrical compatibility.
          </p>
        )}
      </div>
    </section>
  );
}
