import { BenchPhoto } from "./bench-photo";
import React, { useEffect, useRef, useState } from "react";
import {
  CircuitBoard,
  Plus,
  ArrowLeft,
  ScanLine,
  Save,
  X,
  ZoomIn,
  Package,
  Link2,
  Pencil,
  Trash2,
  LoaderCircle,
} from "lucide-react";
import "./boardroom.css";
import {
  mergeBoardRegions,
  numberedBoardRegions,
  boardRegionAtPoint,
  layoutBoardBadges,
} from "./board-map";

export const categories = [
  "Capacitors",
  "Resistors",
  "Diodes",
  "Transistors",
  "Power chips",
  "Other chips",
  "Magnetics",
  "Timing parts",
  "Connectors",
  "Other useful parts",
] as const;
type Source = { title: string; url: string; section: string; excerpt: string };
export type BoardComponent = {
  id: string;
  name: string;
  category: (typeof categories)[number];
  photo: string;
  quantity: number;
  markings: string;
  description: string;
  evidence: string;
  uncertainty: string;
  confidence: "low" | "medium" | "high";
  detection?: { model: string; createdAt: string };
  bounds: { x: number; y: number; width: number; height: number };
  sources: Source[];
};
export type Board = {
  id?: string;
  name: string;
  notes: string;
  linkedItemId: string | null;
  photos: string[];
  components: BoardComponent[];
  updatedAt?: string;
  recoveries?: {
    componentId: string;
    itemId: string;
    quantity: number;
    at: string;
  }[];
};
type CacheItem = {
  id: string;
  name: string;
  kind: string;
  quantity: number;
  available: number;
  condition: string;
  photo: string | null;
  location: string;
  markings: string;
  boardOrigin?: { boardId: string; componentId: string; category: string };
};
type Proposal = {
  regions: Omit<BoardComponent, "id" | "photo" | "quantity" | "sources">[];
  photo: string;
  summary: string;
  model: string;
  createdAt: string;
};
async function api<T>(
  url: string,
  body?: unknown,
  method = "POST",
): Promise<T> {
  const response = await fetch(
    `/api${url}`,
    body === undefined
      ? {}
      : {
          method,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        },
  );
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed.");
  return data;
}
const photoUrl = (photo: string) => `/api/photos/${photo}`;
const emptyBoard = (): Board => ({
  name: "",
  notes: "",
  linkedItemId: null,
  photos: [],
  components: [],
});
const newComponent = (photo: string): BoardComponent => ({
  id: crypto.randomUUID(),
  name: "Unidentified component",
  category: "Other useful parts",
  photo,
  quantity: 1,
  markings: "",
  description: "",
  evidence: "Manually marked on board photo.",
  uncertainty: "Identity and condition need checking.",
  confidence: "low",
  bounds: { x: 0.4, y: 0.4, width: 0.15, height: 0.1 },
  sources: [],
});

export function Boardroom({
  boards,
  items,
  model,
  provider,
  modelReady,
  chatBusy,
  onRefresh,
  onEditItem,
  onReserve,
  onExplain,
  onMappingChange,
}: {
  boards: Board[];
  items: CacheItem[];
  model: string;
  provider: "meta" | "ollama";
  modelReady: boolean;
  chatBusy: boolean;
  onRefresh: () => Promise<void>;
  onEditItem: (id: string) => void;
  onReserve: (id: string) => void;
  onExplain: (board: Board, component?: BoardComponent) => void;
  onMappingChange: (mapping: boolean) => void;
}) {
  const [view, setView] = useState<"boards" | "cache">("boards");
  const [draft, setDraft] = useState<Board | null>(null);
  const [dirty, setDirty] = useState(false);
  const [photoIndex, setPhotoIndex] = useState(0);
  const [selected, setSelected] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [mapping, setMapping] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [proposal, setProposal] = useState<Proposal | null>(null);
  const [zoom, setZoom] = useState(1);
  const [draw, setDraw] = useState(false);
  const [drawing, setDrawing] = useState<BoardComponent["bounds"] | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const abort = useRef<AbortController | null>(null);
  const [cacheView, setCacheView] = useState("On boards");
  const [category, setCategory] = useState("All components");
  const [query, setQuery] = useState("");
  const [recoveryQty, setRecoveryQty] = useState(1);
  const [location, setLocation] = useState("");
  const [leave, setLeave] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasSize, setCanvasSize] = useState({ width: 1, height: 1 });
  const justDrew = useRef(false);
  const photo = draft?.photos[photoIndex];
  const component = draft?.components.find((c) => c.id === selected);
  const visibleRegions =
    draft && photo ? numberedBoardRegions(draft.components, photo) : [];
  const hoverRegion = visibleRegions.find(
    (entry) => entry.component.id === hovered,
  );
  const badges = layoutBoardBadges(
    visibleRegions,
    canvasSize.width,
    canvasSize.height,
  );
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(([entry]) =>
      setCanvasSize({
        width: entry.contentRect.width || 1,
        height: entry.contentRect.height || 1,
      }),
    );
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [photo, view]);
  const allBoards = () => {
    setView("boards");
    if (dirty) setLeave(true);
    else {
      setDraft(null);
      setProposal(null);
      setLeave(false);
    }
  };
  const recovered = (c: BoardComponent, b = draft) =>
    (b?.recoveries || [])
      .filter((r) => r.componentId === c.id)
      .reduce((n, r) => n + r.quantity, 0);
  const change = (fields: Partial<Board>) => {
    setDraft((b) => (b ? { ...b, ...fields } : b));
    setDirty(true);
    setNotice("");
  };
  const editComponent = (fields: Partial<BoardComponent>) => {
    if (draft && component)
      change({
        components: draft.components.map((c) =>
          c.id === component.id ? { ...c, ...fields } : c,
        ),
      });
  };
  const open = (board: Board) => {
    setDraft(structuredClone(board));
    setDirty(false);
    setSelected(null);
    setPhotoIndex(0);
    setZoom(1);
    setProposal(null);
    setError("");
    setNotice("");
    setDraw(false);
    setLeave(false);
    setHovered(null);
  };
  const choose = (c: BoardComponent) => {
    setSelected(c.id);
    setPhotoIndex(draft?.photos.indexOf(c.photo) || 0);
    setDraw(false);
    setRecoveryQty(1);
    setLocation("");
  };
  async function save() {
    if (!draft) return;
    setPending(true);
    setError("");
    try {
      const saved = await api<Board>(
        draft.id ? `/boards/${draft.id}` : "/boards",
        { ...draft, expectedUpdatedAt: draft.updatedAt },
        draft.id ? "PUT" : "POST",
      );
      setDraft(saved);
      setDirty(false);
      setNotice("Board saved.");
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function upload(file?: File) {
    if (!file || !draft) return;
    setPending(true);
    setError("");
    try {
      if (
        !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
        file.size > 25000000
      )
        throw new Error(
          "Choose a JPEG, PNG, or WebP photo smaller than 25 MB.",
        );
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 2400 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(bitmap.width * scale);
      canvas.height = Math.round(bitmap.height * scale);
      canvas
        .getContext("2d")!
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const result = await api<{ photo: string }>("/photos", {
        image: canvas.toDataURL("image/jpeg", 0.92),
      });
      change({ photos: [...draft.photos, result.photo] });
      setPhotoIndex(draft.photos.length);
      setSelected(null);
      setZoom(1);
      setProposal(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  async function map() {
    if (!photo) return;
    setMapping(true);
    onMappingChange(true);
    setError("");
    setNotice("");
    const controller = new AbortController();
    abort.current = controller;
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message:
            "Map the visible components on this board photo. Return candidate identities and normalized bounding boxes for review.",
          photo,
          proposeBoard: true,
          provider,
          model,
          responseMode: "balanced",
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw new Error(result.error || "Board mapping failed.");
      setProposal(result.boardProposal);
      await onRefresh();
    } catch (e) {
      setError(
        controller.signal.aborted
          ? "Mapping stopped. Your board is unchanged."
          : (e as Error).message,
      );
    } finally {
      setMapping(false);
      onMappingChange(false);
      abort.current = null;
    }
  }
  async function recover() {
    if (!draft?.id || !component) return;
    setPending(true);
    setError("");
    try {
      await api(`/boards/${draft.id}/recover`, {
        componentId: component.id,
        quantity: recoveryQty,
        expectedUpdatedAt: draft.updatedAt,
        location,
      });
      // Refresh from the server after the atomic inventory transaction.
      const state = await api<{ boards: Board[] }>("/state");
      setDraft(state.boards.find((b) => b.id === draft.id) || draft);
      setDirty(false);
      setNotice(
        "Recovery recorded in Parts Cache. Condition remains untested.",
      );
      await onRefresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setPending(false);
    }
  }
  const matches = (c: { name: string; markings: string; category: string }) =>
    (category === "All components" || c.category === category) &&
    `${c.name} ${c.markings}`.toLowerCase().includes(query.toLowerCase());
  const occurrences = boards
    .flatMap((b) => b.components.map((c) => ({ board: b, component: c })))
    .filter((o) => matches(o.component));
  const groups = new Map<string, typeof occurrences>();
  for (const occurrence of occurrences) {
    const c = occurrence.component;
    const key =
      c.markings && !c.markings.includes("[unclear]")
        ? `${c.category}:${c.markings.toLowerCase().trim()}`
        : c.id;
    groups.set(key, [...(groups.get(key) || []), occurrence]);
  }
  const cacheItems = items.filter(
    (i) => i.boardOrigin && matches({ ...i, category: i.boardOrigin.category }),
  );
  function point(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }
  function rectangle(a: { x: number; y: number }, b: { x: number; y: number }) {
    return {
      x: Math.min(a.x, b.x),
      y: Math.min(a.y, b.y),
      width: Math.abs(a.x - b.x),
      height: Math.abs(a.y - b.y),
    };
  }
  return (
    <section className="boardroom" aria-label="Boardroom workspace">
      <div className="br-tabs" role="group" aria-label="Boardroom views">
        <button
          className={view === "boards" ? "active" : ""}
          disabled={mapping || pending}
          onClick={allBoards}
        >
          <CircuitBoard size={17} /> Boards <span>{boards.length}</span>
        </button>
        <button
          className={view === "cache" ? "active" : ""}
          disabled={mapping || pending || dirty}
          title={
            dirty
              ? "Save or discard the board changes before opening Parts Cache."
              : "Open Parts Cache"
          }
          onClick={() => setView("cache")}
        >
          <Package size={17} /> Parts Cache{" "}
          <span>
            {items
              .filter(
                (i) =>
                  i.boardOrigin &&
                  !["damaged", "consumed"].includes(i.condition),
              )
              .reduce((n, i) => n + i.available, 0)}
          </span>
        </button>
      </div>
      {error && (
        <p className="br-error" role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="br-notice" role="status">
          {notice}
        </p>
      )}
      {view === "boards" && !draft && (
        <>
          <div className="br-intro">
            <div>
              <p className="eyebrow">FOLLOW THE TRACES</p>
              <h2>Every board has a story.</h2>
              <p>
                Map the parts. Understand the possibilities. Keep the knowledge
                here.
              </p>
            </div>
            <button className="primary" onClick={() => open(emptyBoard())}>
              <Plus size={17} /> Add board
            </button>
          </div>
          <div className="br-board-grid">
            {boards.map((b) => (
              <button
                key={b.id}
                className="br-board-card"
                onClick={() => open(b)}
              >
                <div className="br-board-photo">
                  <BenchPhoto
                    src={photoUrl(b.photos[0])}
                    alt={b.name}
                    loading="lazy"
                  />
                  <span>{b.components.length} mapped</span>
                </div>
                <div className="br-card-body">
                  <h3>{b.name}</h3>
                  <p>
                    {b.linkedItemId ? (
                      <>
                        <Link2 size={13} />{" "}
                        {items.find((i) => i.id === b.linkedItemId)?.name ||
                          "Linked Stash item"}
                      </>
                    ) : (
                      "Independent board"
                    )}
                  </p>
                  <small>
                    {b.photos.length} photo{b.photos.length === 1 ? "" : "s"} ·{" "}
                    {(b.recoveries || []).reduce((n, r) => n + r.quantity, 0)}{" "}
                    recovered
                  </small>
                </div>
              </button>
            ))}
          </div>
          {!boards.length && (
            <div className="br-empty">
              <CircuitBoard size={52} />
              <h3>A closer look at what you have.</h3>
              <p>
                Add a front photo, a back photo, or a close-up. Map components
                with BenchMate or draw your own outlines.
              </p>
              <p className="quiet-note">
                Mapping a component adds knowledge. Recording a recovery adds
                available stock.
              </p>
            </div>
          )}
        </>
      )}
      {view === "boards" && draft && (
        <>
          <div className="br-toolbar">
            <button
              className="text-button"
              disabled={pending || mapping}
              onClick={allBoards}
            >
              <ArrowLeft size={16} /> All boards
            </button>
            <span className="br-save-state">
              {dirty
                ? "Unsaved changes"
                : draft.id
                  ? "Saved locally"
                  : "New board"}
            </span>
            <button
              className="primary"
              disabled={
                pending || mapping || !draft.name.trim() || !draft.photos.length
              }
              onClick={() => void save()}
            >
              <Save size={16} /> {pending ? "Saving…" : "Save board"}
            </button>
          </div>
          {leave && (
            <div className="br-review" role="alert">
              <p>This board has unsaved changes.</p>
              <button className="secondary" onClick={() => setLeave(false)}>
                Keep editing
              </button>{" "}
              <button
                className="secondary"
                onClick={() => {
                  setDraft(null);
                  setLeave(false);
                }}
              >
                Discard changes
              </button>
            </div>
          )}
          <fieldset className="br-editor-fields" disabled={pending || mapping}>
            <div className="br-metadata">
              <label>
                Board name
                <input
                  value={draft.name}
                  maxLength={160}
                  placeholder="e.g. Optical drive controller board"
                  onChange={(e) => change({ name: e.target.value })}
                />
              </label>
              <label>
                Link to Stash
                <select
                  value={draft.linkedItemId || ""}
                  onChange={(e) =>
                    change({ linkedItemId: e.target.value || null })
                  }
                >
                  <option value="">Independent board</option>
                  {items
                    .filter(
                      (i) =>
                        !i.boardOrigin && i.kind !== "tool" && i.quantity === 1,
                    )
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.name}
                      </option>
                    ))}
                </select>
              </label>
            </div>
            <label>
              Board notes
              <textarea
                value={draft.notes}
                placeholder="Where it came from, symptoms, measurements, or what you want to learn."
                onChange={(e) => change({ notes: e.target.value })}
              />
            </label>
            <div className="br-toolbar">
              <div className="br-photo-tabs">
                {draft.photos.map((p, i) => (
                  <button
                    key={p}
                    className={photoIndex === i ? "active" : ""}
                    onClick={() => {
                      setPhotoIndex(i);
                      setSelected(null);
                      setZoom(1);
                      setDraw(false);
                    }}
                  >
                    <BenchPhoto src={photoUrl(p)} alt={`Photo ${i + 1}`} />
                  </button>
                ))}
              </div>
              <label className="secondary br-upload">
                <Plus size={15} /> Add photo
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={draft.photos.length >= 12}
                  onChange={(e) => {
                    void upload(e.target.files?.[0]);
                    e.target.value = "";
                  }}
                />
              </label>
              {draft.linkedItemId &&
                !draft.photos.includes(
                  items.find((i) => i.id === draft.linkedItemId)?.photo || "",
                ) &&
                items.find((i) => i.id === draft.linkedItemId)?.photo && (
                  <button
                    className="secondary"
                    disabled={draft.photos.length >= 12}
                    onClick={() => {
                      const p = items.find(
                        (i) => i.id === draft.linkedItemId,
                      )!.photo!;
                      change({ photos: [...draft.photos, p] });
                      setPhotoIndex(draft.photos.length);
                    }}
                  >
                    Use Stash photo
                  </button>
                )}
            </div>
          </fieldset>
          {photo && (
            <>
              <div className="br-toolbar br-map-tools">
                <button
                  className="primary"
                  disabled={
                    pending || mapping || chatBusy || !modelReady || !!proposal
                  }
                  onClick={() => void map()}
                >
                  {mapping ? (
                    <LoaderCircle size={16} className="spin" />
                  ) : (
                    <ScanLine size={16} />
                  )}{" "}
                  {mapping ? "Mapping components…" : "Map with BenchMate"}
                </button>
                {mapping && (
                  <button
                    className="secondary"
                    onClick={() => abort.current?.abort()}
                  >
                    Stop
                  </button>
                )}
                <button
                  className="secondary"
                  disabled={pending || mapping}
                  onClick={() => {
                    setSelected(null);
                    setDraw(!draw);
                  }}
                >
                  {" "}
                  <Plus size={16} />{" "}
                  {draw && !selected ? "Cancel outline" : "Draw component"}
                </button>
                <label className="br-zoom">
                  <ZoomIn size={16} />
                  <input
                    aria-label="Photo zoom"
                    type="range"
                    min="1"
                    max="3"
                    step=".25"
                    value={zoom}
                    onChange={(e) => setZoom(Number(e.target.value))}
                  />
                  <span>{zoom}×</span>
                </label>
              </div>
              <p className="quiet-note">
                {provider === "meta"
                  ? `Mapping sends this photo to Meta using ${model}.`
                  : `Mapping uses the selected local model: ${model || "choose a vision model"}.`}{" "}
                Outlines and identities are candidates for your review.
              </p>
              {proposal && (
                <div className="br-review">
                  <h3>
                    {proposal.regions.length} candidate components · review
                    before saving
                  </h3>
                  <p>{proposal.summary}</p>
                  <small>
                    {proposal.model} ·{" "}
                    {new Date(proposal.createdAt).toLocaleString()}
                  </small>
                  <div className="br-toolbar">
                    <button
                      className="primary"
                      disabled={
                        pending ||
                        mapping ||
                        draft.components.length + proposal.regions.length > 300
                      }
                      onClick={() => {
                        const additions = proposal.regions.map((r) => ({
                          ...r,
                          id: crypto.randomUUID(),
                          photo: proposal.photo,
                          quantity: 1,
                          sources: [],
                          detection: {
                            model: proposal.model,
                            createdAt: proposal.createdAt,
                          },
                        }));
                        const merged = mergeBoardRegions<BoardComponent>(
                          draft.components,
                          additions,
                        );
                        if (merged.added.length)
                          change({ components: merged.components });
                        setSelected(merged.added[0]?.id || selected);
                        setPhotoIndex(draft.photos.indexOf(proposal.photo));
                        setProposal(null);
                        setNotice(
                          `${merged.added.length} candidates added; ${merged.skipped} overlapping detections skipped. Check and correct the outlines, then save.`,
                        );
                      }}
                    >
                      Add candidates to draft
                    </button>
                    <button
                      className="secondary"
                      onClick={() => setProposal(null)}
                    >
                      <X size={15} /> Discard proposal
                    </button>
                  </div>
                  <p className="quiet-note">
                    Existing components stay in place. Strongly overlapping
                    detections are skipped; check for remaining duplicates
                    before saving.
                  </p>
                </div>
              )}
              <div className="br-map-layout">
                <div>
                  <div className="br-canvas-scroll">
                    <div
                      className={`br-canvas ${draw ? "drawing" : ""}`}
                      ref={canvasRef}
                      style={{ width: `${zoom * 100}%` }}
                      title={
                        hoverRegion
                          ? `#${hoverRegion.number} ${hoverRegion.component.name} — ${hoverRegion.component.confidence} confidence`
                          : undefined
                      }
                      onClick={(e) => {
                        if (justDrew.current) {
                          justDrew.current = false;
                          return;
                        }
                        if (draw || pending || mapping) return;
                        const target = boardRegionAtPoint(
                          draft.components,
                          photo,
                          point(e),
                        );
                        if (target) choose(target);
                      }}
                      onPointerDown={(e) => {
                        justDrew.current = false;
                        if (!draw) return;
                        e.preventDefault();
                        start.current = point(e);
                        e.currentTarget.setPointerCapture(e.pointerId);
                      }}
                      onPointerMove={(e) => {
                        if (start.current)
                          setDrawing(rectangle(start.current, point(e)));
                        else if (!draw)
                          setHovered(
                            boardRegionAtPoint(
                              draft.components,
                              photo,
                              point(e),
                            )?.id || null,
                          );
                      }}
                      onPointerLeave={() => setHovered(null)}
                      onPointerUp={(e) => {
                        if (!start.current) return;
                        const box = rectangle(start.current, point(e));
                        start.current = null;
                        setDrawing(null);
                        if (box.width < 0.008 || box.height < 0.008) return;
                        justDrew.current = true;
                        if (component && draw) editComponent({ bounds: box });
                        else {
                          const c = { ...newComponent(photo), bounds: box };
                          change({ components: [...draft.components, c] });
                          setSelected(c.id);
                        }
                        setDraw(false);
                      }}
                      onPointerCancel={() => {
                        start.current = null;
                        setDrawing(null);
                      }}
                    >
                      <BenchPhoto
                        src={photoUrl(photo)}
                        alt={`${draft.name || "Board"}, photo ${photoIndex + 1}`}
                        draggable={false}
                      />
                      {[...visibleRegions]
                        .sort(
                          (a, b) =>
                            b.component.bounds.width *
                              b.component.bounds.height -
                            a.component.bounds.width *
                              a.component.bounds.height,
                        )
                        .map(({ component: c, number }, layer) => (
                          <button
                            key={c.id}
                            disabled={draw || pending || mapping}
                            aria-label={`Select component ${number}: ${c.name}`}
                            aria-pressed={selected === c.id}
                            className={`br-outline ${selected === c.id ? "selected" : ""} ${recovered(c) >= c.quantity ? "recovered" : ""}`}
                            style={{
                              left: `${c.bounds.x * 100}%`,
                              top: `${c.bounds.y * 100}%`,
                              width: `${c.bounds.width * 100}%`,
                              height: `${c.bounds.height * 100}%`,
                              zIndex: layer + 1,
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              choose(c);
                            }}
                          >
                            <span
                              style={{
                                left: `${(((badges.get(number)?.x || 0) - c.bounds.x * canvasSize.width) / (c.bounds.width * canvasSize.width)) * 100}%`,
                                top: `${(((badges.get(number)?.y || 0) - c.bounds.y * canvasSize.height) / (c.bounds.height * canvasSize.height)) * 100}%`,
                                width: badges.get(number)?.width,
                                height: 18,
                              }}
                            >
                              {number}
                            </span>
                          </button>
                        ))}
                      {drawing && (
                        <div
                          className="br-outline selected"
                          style={{
                            left: `${drawing.x * 100}%`,
                            top: `${drawing.y * 100}%`,
                            width: `${drawing.width * 100}%`,
                            height: `${drawing.height * 100}%`,
                          }}
                        />
                      )}
                    </div>
                  </div>
                  <p className="quiet-note">
                    {draw
                      ? "Drag a rectangle around the component. Use zoom for small parts."
                      : "Select an outline or a component below. Dashed outlines mark recovered parts."}
                  </p>
                  <div className="br-component-list">
                    {draft.components.map((c, index) => (
                      <button
                        key={c.id}
                        className={selected === c.id ? "active" : ""}
                        aria-pressed={selected === c.id}
                        onClick={() => choose(c)}
                      >
                        <span className="br-component-number">{index + 1}</span>
                        <span>
                          <strong>{c.name}</strong>
                          <small>
                            {draft.photos.length > 1
                              ? `Photo ${draft.photos.indexOf(c.photo) + 1} · `
                              : ""}
                            {c.category} · {c.confidence} confidence ·{" "}
                            {c.quantity - recovered(c)} on board
                          </small>
                        </span>
                      </button>
                    ))}
                  </div>
                  {!draft.components.length && (
                    <p className="br-empty-small">
                      Map with BenchMate or draw an outline to start identifying
                      components.
                    </p>
                  )}
                </div>
                <div className="br-inspector">
                  {component ? (
                    <>
                      <p className="eyebrow">
                        COMPONENT #
                        {draft.components.findIndex((c) => c.id === selected) +
                          1}{" "}
                        · INSPECTOR
                      </p>
                      {component.detection && (
                        <p className="quiet-note">
                          Originally mapped by {component.detection.model} ·{" "}
                          {new Date(
                            component.detection.createdAt,
                          ).toLocaleDateString()}
                          . Editable candidate; condition untested.
                        </p>
                      )}
                      <fieldset
                        disabled={pending || mapping}
                        className="br-editor-fields"
                      >
                        <label>
                          Candidate name
                          <input
                            value={component.name}
                            maxLength={160}
                            onChange={(e) =>
                              editComponent({ name: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Category
                          <select
                            value={component.category}
                            onChange={(e) =>
                              editComponent({
                                category: e.target
                                  .value as BoardComponent["category"],
                              })
                            }
                          >
                            {categories.map((c) => (
                              <option key={c}>{c}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Visible markings
                          <textarea
                            value={component.markings}
                            onChange={(e) =>
                              editComponent({ markings: e.target.value })
                            }
                            placeholder="Exact text, or leave unknown"
                          />
                        </label>
                        <label>
                          Likely purpose
                          <textarea
                            value={component.description}
                            onChange={(e) =>
                              editComponent({ description: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Visible evidence
                          <textarea
                            value={component.evidence}
                            onChange={(e) =>
                              editComponent({ evidence: e.target.value })
                            }
                          />
                        </label>
                        <label>
                          Still unknown
                          <textarea
                            value={component.uncertainty}
                            onChange={(e) =>
                              editComponent({ uncertainty: e.target.value })
                            }
                          />
                        </label>
                        <div className="br-metadata">
                          <label>
                            Visual confidence
                            <select
                              value={component.confidence}
                              onChange={(e) =>
                                editComponent({
                                  confidence: e.target
                                    .value as BoardComponent["confidence"],
                                })
                              }
                            >
                              <option>low</option>
                              <option>medium</option>
                              <option>high</option>
                            </select>
                          </label>
                          <label>
                            Mapped quantity
                            <input
                              type="number"
                              min={Math.max(1, recovered(component))}
                              max={1000}
                              value={component.quantity}
                              onChange={(e) =>
                                editComponent({
                                  quantity: Number(e.target.value),
                                })
                              }
                            />
                          </label>
                        </div>
                        <details>
                          <summary>Outline position</summary>
                          <div className="br-bounds">
                            {(["x", "y", "width", "height"] as const).map(
                              (key) => (
                                <label key={key}>
                                  {key} %
                                  <input
                                    type="number"
                                    step=".1"
                                    min={
                                      key === "width" || key === "height"
                                        ? 0.1
                                        : 0
                                    }
                                    max={100}
                                    value={
                                      Math.round(component.bounds[key] * 1000) /
                                      10
                                    }
                                    onChange={(e) =>
                                      editComponent({
                                        bounds: {
                                          ...component.bounds,
                                          [key]: Number(e.target.value) / 100,
                                        },
                                      })
                                    }
                                  />
                                </label>
                              ),
                            )}
                          </div>
                          <button
                            className="secondary"
                            onClick={() => setDraw(!draw)}
                          >
                            <Pencil size={14} />{" "}
                            {draw ? "Cancel redraw" : "Redraw outline"}
                          </button>
                        </details>
                        <details>
                          <summary>
                            Documentation ({component.sources.length})
                          </summary>
                          <p className="quiet-note">
                            Attach matching excerpts to support electrical
                            claims. A URL alone does not verify a specification.
                          </p>
                          {component.sources.map((s, index) => (
                            <div key={index} className="br-source">
                              {(
                                ["title", "url", "section", "excerpt"] as const
                              ).map((key) => (
                                <label key={key}>
                                  {key}
                                  <input
                                    value={s[key]}
                                    onChange={(e) =>
                                      editComponent({
                                        sources: component.sources.map(
                                          (source, i) =>
                                            i === index
                                              ? {
                                                  ...source,
                                                  [key]: e.target.value,
                                                }
                                              : source,
                                        ),
                                      })
                                    }
                                  />
                                </label>
                              ))}
                              <button
                                className="text-button"
                                onClick={() =>
                                  editComponent({
                                    sources: component.sources.filter(
                                      (_, i) => i !== index,
                                    ),
                                  })
                                }
                              >
                                Remove source
                              </button>
                            </div>
                          ))}
                          <button
                            className="secondary"
                            disabled={component.sources.length >= 20}
                            onClick={() =>
                              editComponent({
                                sources: [
                                  ...component.sources,
                                  {
                                    title: "",
                                    url: "",
                                    section: "",
                                    excerpt: "",
                                  },
                                ],
                              })
                            }
                          >
                            <Plus size={14} /> Add source
                          </button>
                        </details>
                        <button
                          className="text-button"
                          disabled={!!recovered(component)}
                          onClick={() => {
                            change({
                              components: draft.components.filter(
                                (c) => c.id !== component.id,
                              ),
                            });
                            setSelected(null);
                          }}
                        >
                          <Trash2 size={14} /> Remove component
                        </button>
                      </fieldset>
                      <button
                        className="secondary"
                        disabled={chatBusy || mapping || !modelReady}
                        onClick={() => onExplain(draft, component)}
                      >
                        Explain this component
                      </button>
                      <div className="br-recovery">
                        <h3>Recover to Parts Cache</h3>
                        <p>
                          {component.quantity - recovered(component)} on board ·{" "}
                          {recovered(component)} recovered
                        </p>
                        <p className="quiet-note">
                          Record only parts you have physically removed.{" "}
                          {draft.linkedItemId
                            ? "The linked Stash item will be marked dismantled."
                            : "The board will retain the recovery history."}
                        </p>
                        <label>
                          Quantity removed
                          <input
                            type="number"
                            min={1}
                            max={component.quantity - recovered(component)}
                            value={recoveryQty}
                            onChange={(e) =>
                              setRecoveryQty(Number(e.target.value))
                            }
                          />
                        </label>
                        <label>
                          Storage location
                          <input
                            value={location}
                            onChange={(e) => setLocation(e.target.value)}
                            placeholder="e.g. Drawer C / capacitors"
                          />
                        </label>
                        <button
                          className="primary"
                          disabled={
                            dirty ||
                            !draft.id ||
                            pending ||
                            mapping ||
                            !Number.isInteger(recoveryQty) ||
                            recoveryQty < 1 ||
                            recoveryQty >
                              component.quantity - recovered(component)
                          }
                          onClick={() => void recover()}
                        >
                          <Package size={15} /> Record recovery
                        </button>
                        {dirty && (
                          <p className="quiet-note">
                            Save the board before recording recovery.
                          </p>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="br-empty-small">
                      <ScanLine size={32} />
                      <h3>Follow your curiosity.</h3>
                      <p>
                        Select a component to inspect its markings, likely
                        purpose, and what still needs checking.
                      </p>
                      <button
                        className="secondary"
                        disabled={mapping || chatBusy || !modelReady}
                        onClick={() => onExplain(draft)}
                      >
                        Walk through this board
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
          {!photo && (
            <div className="br-empty">
              <CircuitBoard size={48} />
              <h3>Start with a clear board photo.</h3>
              <p>
                Front, back, and close-ups live on the same card. Each photo
                keeps its own component outlines.
              </p>
            </div>
          )}
        </>
      )}
      {view === "cache" && (
        <>
          <div className="br-intro">
            <div>
              <p className="eyebrow">SMALL PARTS. SHARED KNOWLEDGE.</p>
              <h2>Your Parts Cache</h2>
              <p>
                Find components where they live, and keep recovered stock ready
                for Projects.
              </p>
            </div>
          </div>
          <div className="br-cache-controls">
            <input
              aria-label="Search Parts Cache"
              placeholder="Search names or markings…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
            <select
              aria-label="Component category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option>All components</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </div>
          <div className="br-categories">
            {categories.map((c) => (
              <button
                key={c}
                className={category === c ? "active" : ""}
                onClick={() =>
                  setCategory(category === c ? "All components" : c)
                }
              >
                {c}
                <span>
                  {boards.reduce(
                    (n, b) =>
                      n +
                      b.components.filter((part) => part.category === c).length,
                    0,
                  )}
                </span>
              </button>
            ))}
          </div>
          <div
            className="br-tabs"
            role="group"
            aria-label="Cache inventory status"
          >
            {["On boards", "Recovered"].map((v) => (
              <button
                key={v}
                className={cacheView === v ? "active" : ""}
                onClick={() => setCacheView(v)}
              >
                {v}
              </button>
            ))}
          </div>
          {cacheView === "On boards" && (
            <>
              <p className="quiet-note">
                Matching readable markings are grouped for browsing; this does
                not confirm interchangeability. Components still attached to
                boards are potential salvage.
              </p>
              {[...groups.entries()].map(([key, group]) => (
                <article className="br-cache-entry" key={key}>
                  <div>
                    <span className="eyebrow">
                      {group[0].component.category}
                    </span>
                    <h3>{group[0].component.name}</h3>
                    <p className="mono">
                      {group[0].component.markings || "Markings unknown"}
                    </p>
                    <p>
                      {group[0].component.description ||
                        "Purpose needs identification."}
                    </p>
                  </div>
                  <div className="br-locations">
                    {group.map(({ board: b, component: c }) => (
                      <button
                        key={`${b.id}:${c.id}`}
                        className="secondary"
                        onClick={() => {
                          open(b);
                          setSelected(c.id);
                          setPhotoIndex(b.photos.indexOf(c.photo));
                          setView("boards");
                        }}
                      >
                        {b.name}
                        <small>
                          {c.quantity - recovered(c, b)} on board ·{" "}
                          {c.confidence} confidence
                        </small>
                      </button>
                    ))}
                  </div>
                </article>
              ))}
              {!groups.size && (
                <p className="br-empty-small">
                  No mapped components match. Add a board and identify its parts
                  to start the cache.
                </p>
              )}
            </>
          )}
          {cacheView === "Recovered" && (
            <>
              <p className="quiet-note">
                These parts share the inventory ledger with Projects.
                Reservations and installed quantities are already deducted from
                availability.
              </p>
              {cacheItems.map((i) => (
                <article className="br-cache-entry" key={i.id}>
                  <div>
                    <span className="eyebrow">{i.boardOrigin!.category}</span>
                    <h3>{i.name}</h3>
                    <p>
                      {i.available} available / {i.quantity} total ·{" "}
                      {i.condition}
                    </p>
                    <p>
                      {i.markings || "Markings unknown"} ·{" "}
                      {i.location || "Location not recorded"}
                    </p>
                    <button
                      className="text-button"
                      onClick={() => {
                        const b = boards.find(
                          (b) => b.id === i.boardOrigin!.boardId,
                        );
                        if (b) {
                          open(b);
                          const c = b.components.find(
                            (c) => c.id === i.boardOrigin!.componentId,
                          );
                          if (c) {
                            setSelected(c.id);
                            setPhotoIndex(b.photos.indexOf(c.photo));
                          }
                          setView("boards");
                        }
                      }}
                    >
                      View source board
                    </button>
                  </div>
                  <div className="br-locations">
                    <button
                      className="secondary"
                      onClick={() => onEditItem(i.id)}
                    >
                      Edit part / evidence
                    </button>
                    <button
                      className="primary"
                      disabled={
                        i.available < 1 ||
                        ["damaged", "consumed"].includes(i.condition)
                      }
                      onClick={() => onReserve(i.id)}
                    >
                      Reserve for project
                    </button>
                  </div>
                </article>
              ))}
              {!cacheItems.length && (
                <p className="br-empty-small">
                  No recovered parts match. Record a physical recovery from a
                  saved component to add stock here.
                </p>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
