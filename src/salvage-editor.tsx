import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
export type SalvageRow = {
  id: string;
  name: string;
  quantity: number;
  evidenceStatus: "potential" | "observed" | "documented";
  evidence: string;
  specs: string;
  unknowns: string;
  reuse: string;
};
export type Recovery = {
  rowId: string;
  itemId: string;
  name: string;
  quantity: number;
  at: string;
};
export type SalvageReview = {
  model: string;
  createdAt: string;
  photo: string | null;
  uncertainty: string;
};
export type SalvageProposal = {
  components: SalvageRow[];
  itemId: string;
  baseUpdatedAt: string;
  model: string;
  createdAt: string;
  photo: string | null;
};
function rowId() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 15) | 64;
  bytes[8] = (bytes[8] & 63) | 128;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join(
    "",
  );
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
export function SalvageEditor({
  rows,
  recoveries,
  onChange,
  onMap,
  onRecover,
  canMap,
  canRecover,
  saved,
  dirty,
  review,
  onOpen,
}: {
  rows: SalvageRow[];
  recoveries: Recovery[];
  onChange: (rows: SalvageRow[]) => void;
  onMap: () => void;
  onRecover: (rowId: string, quantity: number, location: string) => void;
  canMap: boolean;
  canRecover: boolean;
  saved: boolean;
  dirty: boolean;
  review?: SalvageReview;
  onOpen: (id: string) => void;
}) {
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [locations, setLocations] = useState<Record<string, string>>({});
  const proposedUnits = rows.reduce(
    (total, row) => total + (Number.isFinite(row.quantity) ? row.quantity : 0),
    0,
  );
  const recoveredUnits = recoveries.reduce(
    (total, recovery) => total + recovery.quantity,
    0,
  );
  const update = (id: string, patch: Partial<SalvageRow>) =>
    onChange(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <div className="salvage-editor">
      <div className="source-heading">
        <h3>What’s inside?</h3>
        <button
          type="button"
          className="secondary small"
          disabled={!canMap || dirty || !saved}
          onClick={onMap}
        >
          Map salvage
        </button>
      </div>
      <p className="quiet-note">
        Potential assemblies stay inside this donor. They become stock only when
        you record a physical recovery. Each map describes one device; proposed
        quantities are estimates.
      </p>
      <section className="salvage-overview" aria-label="Salvage overview">
        <div className="salvage-totals">
          <div>
            <strong>{rows.length}</strong>
            <span>Component types</span>
          </div>
          <div>
            <strong>{proposedUnits}</strong>
            <span>Proposed units</span>
          </div>
          <div>
            <strong>{recoveredUnits}</strong>
            <span>Recovered units</span>
          </div>
          <div>
            <strong>{Math.max(0, proposedUnits - recoveredUnits)}</strong>
            <span>Units remaining</span>
          </div>
        </div>
        {rows.length > 0 && (
          <details>
            <summary>Component breakdown</summary>
            <ul>
              {rows.map((row) => {
                const recovered = recoveries
                  .filter((r) => r.rowId === row.id)
                  .reduce((total, r) => total + r.quantity, 0);
                return (
                  <li key={row.id}>
                    <span>{row.name || "Unnamed assembly"}</span>
                    <span className="mono">
                      × {row.quantity}
                      {recovered > 0 ? ` · ${recovered} recovered` : ""}
                    </span>
                  </li>
                );
              })}
            </ul>
          </details>
        )}
        <p>
          Proposed units include recovered units. Remaining units are estimates,
          not available stock.
        </p>
      </section>
      {(!saved || dirty) && (
        <p className="inline-note">
          Save this donor and your edits before mapping or recording recovery.
        </p>
      )}
      {review && (
        <p className="inline-note">
          AI proposal / {review.model} ·{" "}
          {new Date(review.createdAt).toLocaleString()}
          <br />
          {review.uncertainty}
        </p>
      )}
      {!rows.length && (
        <div className="salvage-empty">
          <h3>A device full of possibilities.</h3>
          <p>
            Map salvage with the selected model, or start with an assembly you
            can see. Unknown specifications can stay blank.
          </p>
        </div>
      )}
      {rows.map((row, index) => {
        const recovered = recoveries
          .filter((r) => r.rowId === row.id)
          .reduce((n, r) => n + r.quantity, 0);
        const remaining = row.quantity - recovered;
        return (
          <article className="salvage-assembly" key={row.id}>
            <div className="source-heading">
              <strong className="mono">
                ASSEMBLY {String(index + 1).padStart(2, "0")}
              </strong>
              <span>
                {recovered} recovered / {row.quantity} proposed
              </span>
              <button
                type="button"
                className="icon-button"
                aria-label={`Remove assembly ${index + 1}`}
                disabled={recovered > 0}
                onClick={() => onChange(rows.filter((r) => r.id !== row.id))}
              >
                <Trash2 size={16} />
              </button>
            </div>
            <div className="form-grid">
              <label className="wide">
                Assembly name
                <input
                  required
                  maxLength={160}
                  value={row.name}
                  onChange={(e) => update(row.id, { name: e.target.value })}
                />
              </label>
              <label>
                Proposed quantity
                <input
                  type="number"
                  required
                  min={Math.max(1, recovered)}
                  max={1000}
                  value={row.quantity}
                  onChange={(e) =>
                    update(row.id, { quantity: Number(e.target.value) })
                  }
                />
              </label>
              <label>
                Evidence status
                <select
                  value={row.evidenceStatus}
                  onChange={(e) =>
                    update(row.id, {
                      evidenceStatus: e.target
                        .value as SalvageRow["evidenceStatus"],
                    })
                  }
                >
                  <option value="potential">
                    Potential · needs inspection
                  </option>
                  <option value="observed">Observed · visible assembly</option>
                  <option value="documented">
                    Documented · matching excerpt
                  </option>
                </select>
              </label>
              {(["evidence", "specs", "unknowns", "reuse"] as const).map(
                (key) => (
                  <label className="wide" key={key}>
                    {
                      {
                        evidence: "Evidence / source title and section",
                        specs: "Specification claims / dimensions / interfaces",
                        unknowns: "Unknowns / next photo or check",
                        reuse: "Reuse constraints / possible uses",
                      }[key]
                    }
                    <textarea
                      maxLength={3000}
                      value={row[key]}
                      placeholder={
                        key === "specs"
                          ? "Unknown until supported by a label or matching document excerpt."
                          : undefined
                      }
                      onChange={(e) =>
                        update(row.id, { [key]: e.target.value })
                      }
                    />
                  </label>
                ),
              )}
            </div>
            <div className="recovery-box">
              <strong>
                {remaining
                  ? `${remaining} still inside / unverified`
                  : "Proposed quantity recovered"}
              </strong>
              {remaining > 0 && (
                <>
                  <p>
                    Confirm actual removal. The first recovery marks the donor
                    dismantled and unavailable as an intact device. The
                    recovered part starts untested with unresolved identity.
                  </p>
                  <div className="recovery-controls">
                    <label>
                      Recover units
                      <input
                        type="number"
                        min={1}
                        max={remaining}
                        value={counts[row.id] ?? 1}
                        onChange={(e) =>
                          setCounts({
                            ...counts,
                            [row.id]: Number(e.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Put in location
                      <input
                        maxLength={3000}
                        value={locations[row.id] || ""}
                        placeholder="Drawer / bin"
                        onChange={(e) =>
                          setLocations({
                            ...locations,
                            [row.id]: e.target.value,
                          })
                        }
                      />
                    </label>
                    <button
                      type="button"
                      className="secondary"
                      disabled={
                        !canRecover ||
                        dirty ||
                        !Number.isInteger(counts[row.id] ?? 1) ||
                        (counts[row.id] ?? 1) < 1 ||
                        (counts[row.id] ?? 1) > remaining
                      }
                      onClick={() =>
                        onRecover(
                          row.id,
                          counts[row.id] ?? 1,
                          locations[row.id] || "",
                        )
                      }
                    >
                      Record recovery
                    </button>
                  </div>
                </>
              )}
              {recoveries
                .filter((r) => r.rowId === row.id)
                .map((r) => (
                  <button
                    type="button"
                    className="text-button recovery-link"
                    key={r.itemId}
                    onClick={() => onOpen(r.itemId)}
                  >
                    {r.quantity} × {r.name} · {new Date(r.at).toLocaleString()}{" "}
                    →
                  </button>
                ))}
            </div>
          </article>
        );
      })}
      <button
        type="button"
        className="secondary"
        disabled={rows.length >= 30}
        onClick={() =>
          onChange([
            ...rows,
            {
              id: rowId(),
              name: "",
              quantity: 1,
              evidenceStatus: "potential",
              evidence: "",
              specs: "",
              unknowns: "",
              reuse: "",
            },
          ])
        }
      >
        <Plus size={16} /> Add assembly
      </button>
    </div>
  );
}
