import { BenchPhoto } from "./bench-photo";
import React, { useEffect, useRef, useState } from "react";
import { ChatActionCard, type ChatAction } from "./chat-action-card";
import { ProjectInventory } from "./project-inventory";
import {
  ConversationHub,
  ConversationActions,
  ConversationFeed,
  readDraft,
  writeDraft,
  savedConversationId,
  type Conversation,
  type ChatMessage,
} from "./conversation-workspace";
import { createRoot } from "react-dom/client";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Box,
  Camera,
  Check,
  ChevronRight,
  CircuitBoard,
  Cpu,
  Hammer,
  Layers,
  LoaderCircle,
  MessageSquare,
  Plus,
  Radio,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Tag,
  Trash2,
  Unplug,
  X,
  Wrench,
  MapPin,
} from "lucide-react";
import "./style.css";
import { Boardroom, type Board, type BoardComponent } from "./boardroom";
import {
  SalvageEditor,
  type SalvageRow,
  type SalvageReview,
  type SalvageProposal,
  type Recovery,
} from "./salvage-editor";
import {
  applyIdentityProposal,
  identityStatus,
  type IdentityProposal,
  type PhotoReview,
} from "./identity-draft";

type Source = { title: string; url: string; section: string; excerpt: string };
type Item = {
  boardOrigin?: { boardId: string; componentId: string; category: string };
  id: string;
  name: string;
  quantity: number;
  available: number;
  kind: "part" | "donor" | "tool";
  identity: "unresolved" | "confirmed";
  condition: "untested" | "working" | "damaged" | "consumed";
  location: string;
  markings: string;
  notes: string;
  evidence: string;
  photo: string | null;
  sources: Source[];
  salvage?: SalvageRow[];
  salvageReview?: SalvageReview;
  recoveries?: Recovery[];
  dismantledAt?: string;
  recoveredFrom?: {
    donorId: string;
    donorName: string;
    rowId: string;
    at: string;
    specs: string;
    unknowns: string;
    evidenceStatus: string;
  };
  photoReview?: PhotoReview;
  reviewPending?: boolean;
  updatedAt?: string;
  expectedUpdatedAt?: string;
  removedAt?: string;
};
type Project = {
  id: string;
  name: string;
  goal: string;
  notes: string;
  nextAction: string;
  status: "planning" | "building" | "paused" | "complete";
};
type Allocation = {
  id: string;
  itemId: string;
  projectId: string;
  quantity: number;
  state: "reserved" | "installed" | "returned";
};
type Snapshot = {
  chatActions: ChatAction[];
  conversations: Conversation[];
  boards: Board[];
  items: Item[];
  removedItems: Item[];
  projects: Project[];
  allocations: Allocation[];
  messages: ChatMessage[];
  events: {
    id: string;
    type: string;
    name?: string;
    itemId?: string;
    projectId?: string;
    quantity?: number;
    at: string;
  }[];
};
type Models = {
  provider?: "ollama" | "meta";
  configured?: boolean;
  connected: boolean;
  models: string[];
  selected: string;
  error?: string;
};
const empty: Snapshot = {
  chatActions: [],
  conversations: [],
  boards: [],
  items: [],
  removedItems: [],
  projects: [],
  allocations: [],
  messages: [],
  events: [],
};
const blankItem: Omit<Item, "id" | "available"> = {
  name: "",
  quantity: 1,
  kind: "part",
  identity: "unresolved",
  condition: "untested",
  location: "",
  markings: "",
  notes: "",
  evidence: "",
  photo: null,
  sources: [],
};
const blankProject: Omit<Project, "id"> = {
  name: "",
  goal: "",
  notes: "",
  nextAction: "",
  status: "planning",
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
function ComponentDrawing() {
  return (
    <svg className="component-drawing" viewBox="0 0 320 200" aria-hidden="true">
      <defs>
        <pattern id="dots" width="16" height="16" patternUnits="userSpaceOnUse">
          <circle cx="1" cy="1" r="1" fill="#53624d" />
        </pattern>
      </defs>
      <rect width="320" height="200" fill="url(#dots)" />
      <g
        transform="translate(65 23) rotate(-9 100 70)"
        fill="none"
        strokeWidth="1.5"
      >
        <rect
          x="20"
          y="20"
          width="153"
          height="110"
          rx="8"
          stroke="#677d56"
          fill="#202a23"
        />
        {[35, 51, 67, 83, 99, 115, 131, 147].map((x) => (
          <g key={x} stroke="#b2c29a">
            <path d={`M${x} 8v12 M${x} 130v12`} />
          </g>
        ))}
        <rect
          x="65"
          y="46"
          width="65"
          height="55"
          rx="3"
          fill="#121b17"
          stroke="#b6dc6b"
        />
        <path
          d="M35 42h17v22h13 M130 65h25v42h-20 M45 108h25v-7 M98 20v26"
          stroke="#607d4a"
        />
        <circle cx="34" cy="34" r="4" stroke="#92a37d" />
        <circle cx="159" cy="116" r="4" stroke="#92a37d" />
        <text
          x="78"
          y="80"
          fontSize="13"
          fill="#c6f36b"
          stroke="none"
          fontFamily="monospace"
        >
          BM-01
        </text>
      </g>
      <path
        d="M24 162h76 M227 32h65 M267 146v27h-44"
        fill="none"
        stroke="#546445"
      />
      <text x="25" y="179" fill="#7f9470" fontSize="9" fontFamily="monospace">
        POTENTIAL: UNKNOWN
      </text>
    </svg>
  );
}
function App() {
  const chatPhotoInput = useRef<HTMLInputElement>(null);
  const [ready, setReady] = useState(false),
    [paired, setPaired] = useState(false),
    [pairCode, setPairCode] = useState("");
  const [state, setState] = useState<Snapshot>(empty),
    [models, setModels] = useState<Models>({
      connected: false,
      models: [],
      selected: "",
    });
  const [tab, setTab] = useState(() => {
      try {
        const value = localStorage.getItem("benchmate.view.v1");
        return value &&
          ["Stash", "Boardroom", "Build ideas", "Projects"].includes(value)
          ? value
          : "Stash";
      } catch {
        return "Stash";
      }
    }),
    [filter, setFilter] = useState("all"),
    [query, setQuery] = useState("");
  const [boardMapping, setBoardMapping] = useState(false);
  const [activeConversationId, setActiveConversationId] = useState<
    string | null
  >(savedConversationId);
  const conversationInitialized = useRef(false);
  const requestInFlight = useRef(false),
    conversationCreation = useRef(false);
  const [creatingConversation, setCreatingConversation] = useState(false);
  const [projectFromConversation, setProjectFromConversation] = useState<
    string | null
  >(null);
  const [boardPhoto, setBoardPhoto] = useState<{
    photo: string;
    label: string;
  } | null>(() => readDraft(savedConversationId()).boardPhoto);
  const [item, setItem] = useState<
      (Omit<Item, "id" | "available"> & { id?: string }) | null
    >(null),
    [project, setProject] = useState<
      (Omit<Project, "id"> & { id?: string }) | null
    >(null);
  useEffect(() => {
    if (!project) setProjectFromConversation(null);
  }, [Boolean(project)]);
  const [selected, setSelected] = useState<string | null>(
      () => readDraft(savedConversationId()).selected,
    ),
    [message, setMessage] = useState(
      () => readDraft(savedConversationId()).message,
    ),
    [busy, setBusy] = useState(false),
    [saving, setSaving] = useState(false),
    [uploading, setUploading] = useState(false),
    [error, setError] = useState("");
  const [responseMode, setResponseMode] = useState<"quick" | "balanced">(
    "balanced",
  );
  const [phase, setPhase] = useState("preparing"),
    [liveAnswer, setLiveAnswer] = useState(""),
    [pendingText, setPendingText] = useState("");
  const [allocation, setAllocation] = useState<{
      itemId: string;
      projectId: string;
      quantity: number;
    } | null>(null),
    [elapsed, setElapsed] = useState(0),
    [info, setInfo] = useState(false);
  const [lastRun, setLastRun] = useState<{
    provider: string;
    model: string;
    seconds: number;
    usage?: { totalTokens: number } | null;
    context?: {
      inventorySummaries: number;
      totalInventoryRecords: number;
      detailedItems: { id: string; name: string }[];
      projectSummaries: number;
      totalProjectRecords: number;
      photoAttached: boolean;
    };
  } | null>(null);
  const [reviewPrevious, setReviewPrevious] = useState("");
  const [identifying, setIdentifying] = useState(false);
  const [recordTab, setRecordTab] = useState("Details");
  const [itemHistory, setItemHistory] = useState<Snapshot["events"]>([]);
  useEffect(() => {
    let active = true;
    setRecordTab("Details");
    setItemHistory([]);
    if (item?.id)
      api<Snapshot["events"]>(`/items/${item.id}/history`)
        .then((events) => {
          if (active) setItemHistory(events);
        })
        .catch((e) => {
          if (active) setError(e.message);
        });
    return () => {
      active = false;
    };
  }, [item?.id, Boolean(item)]);
  useEffect(() => {
    if (item?.kind !== "donor" && recordTab === "Salvage map")
      setRecordTab("Details");
  }, [item?.kind, recordTab]);
  const [undoRemoved, setUndoRemoved] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const assistantRef = useRef<HTMLElement>(null),
    abortRef = useRef<AbortController | null>(null);
  const refresh = async () => setState(await api<Snapshot>("/state"));
  const refreshModels = async () => setModels(await api<Models>("/models"));
  const load = async () => {
    await Promise.all([refresh(), refreshModels()]);
  };
  useEffect(() => {
    api<{ authenticated: boolean }>("/session")
      .then(async (s) => {
        setPaired(s.authenticated);
        if (s.authenticated) await load();
      })
      .catch((e) => setError(e.message))
      .finally(() => setReady(true));
  }, []);
  useEffect(() => {
    if (!busy) return;
    setElapsed(0);
    const timer = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(timer);
  }, [busy]);
  const activeConversation = (state.conversations || []).find(
    (c) => c.id === activeConversationId,
  );
  const conversationProject = state.projects.find(
    (p) => p.id === activeConversation?.projectId,
  );
  const conversationMessages = state.messages.filter(
    (m) => m.conversationId === activeConversationId,
  );
  useEffect(() => {
    writeDraft(activeConversationId, { message, selected, boardPhoto });
    try {
      if (activeConversationId)
        localStorage.setItem("benchmate.chat.active.v1", activeConversationId);
    } catch {}
  }, [activeConversationId, message, selected, boardPhoto]);
  useEffect(() => {
    try {
      localStorage.setItem("benchmate.view.v1", tab);
    } catch {}
  }, [tab]);
  useEffect(() => {
    if (!ready || conversationInitialized.current) return;
    conversationInitialized.current = true;
    if (activeConversation) return;
    const fallback = state.conversations.find((c) => !c.legacy);
    if (fallback) switchConversation(fallback.id);
  }, [ready, state.conversations, activeConversationId]);
  function switchConversation(id: string) {
    if (busy || boardMapping || uploading) return;
    writeDraft(activeConversationId, { message, selected, boardPhoto });
    const draft = readDraft(id);
    setActiveConversationId(id);
    setMessage(draft.message);
    setSelected(draft.selected);
    setBoardPhoto(draft.boardPhoto);
    setLastRun(null);
  }
  async function newConversation(projectId: string | null = null) {
    if (busy || boardMapping || uploading || conversationCreation.current)
      return null;
    conversationCreation.current = true;
    setCreatingConversation(true);
    try {
      const conversation = await api<Conversation>("/conversations", {
        projectId,
      });
      switchConversation(conversation.id);
      await refresh();
      setTab("Build ideas");
      return conversation.id;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      conversationCreation.current = false;
      setCreatingConversation(false);
    }
  }
  async function updateConversation(fields: {
    title?: string;
    projectId?: string;
  }) {
    if (!activeConversationId || busy) return;
    await perform(async () => {
      await api(`/conversations/${activeConversationId}`, fields, "PUT");
      await refresh();
    });
  }
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving && !uploading && !identifying) {
        setItem(null);
        setProject(null);
        setAllocation(null);
        setInfo(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [saving, uploading, identifying]);
  const modalOpen = Boolean(item || project || allocation || info);
  useEffect(() => {
    if (!modalOpen) return;
    const previous = document.activeElement as HTMLElement | null;
    const priorOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
    const trap = (e: KeyboardEvent) => {
      if (e.key !== "Tab" || !dialog) return;
      const controls = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          "button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]",
        ),
      ).filter((el) => el.offsetParent !== null);
      const first = controls[0],
        last = controls.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    if (dialog && !dialog.contains(document.activeElement))
      dialog.querySelector<HTMLElement>("button,input,select")?.focus();
    document.addEventListener("keydown", trap);
    return () => {
      document.body.style.overflow = priorOverflow;
      document.removeEventListener("keydown", trap);
      previous?.focus();
    };
  }, [modalOpen]);
  async function perform(fn: () => Promise<void>) {
    setSaving(true);
    setError("");
    try {
      await fn();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  }
  async function saveItem(e: React.FormEvent) {
    e.preventDefault();
    if (!item) return;
    await perform(async () => {
      await api(
        item.id ? `/items/${item.id}` : "/items",
        {
          ...item,
          expectedUpdatedAt: item.expectedUpdatedAt || item.updatedAt,
        },
        item.id ? "PUT" : "POST",
      );
      await refresh();
      setItem(null);
    });
  }
  async function identifyItem() {
    if (!item?.photo || busy || saving || uploading) return;
    setIdentifying(true);
    try {
      await ask(
        "Inspect this item photo. Propose an identity, transcribe visible label text, and explain uncertainty. Do not provide wiring instructions.",
        "identify",
        structuredClone(item),
      );
    } finally {
      setIdentifying(false);
    }
  }
  const savedItem = state.items.find((i) => i.id === item?.id);
  const itemDirty = Boolean(
    item &&
    (!savedItem ||
      [
        "name",
        "kind",
        "quantity",
        "identity",
        "condition",
        "location",
        "markings",
        "notes",
        "evidence",
        "photo",
        "sources",
        "salvage",
        "salvageReview",
      ].some(
        (key) =>
          JSON.stringify(
            item[key as keyof typeof item] ??
              (key === "salvage" ? [] : undefined),
          ) !==
          JSON.stringify(
            savedItem[key as keyof Item] ??
              (key === "salvage" ? [] : undefined),
          ),
      )),
  );
  async function recoverAssembly(
    rowId: string,
    quantity: number,
    location: string,
  ) {
    if (!item?.id || itemDirty) return;
    await perform(async () => {
      const result = await api<{ donor: Item }>(`/items/${item.id}/recover`, {
        rowId,
        quantity,
        location,
        expectedUpdatedAt: item.updatedAt,
      });
      setItem(result.donor);
      await refresh();
      setItemHistory(
        await api<Snapshot["events"]>(`/items/${item.id}/history`),
      );
    });
  }
  async function mapSalvage() {
    if (!item?.id || itemDirty) return;
    setIdentifying(true);
    try {
      await ask(
        "Propose a salvage map for this one donor device. Separate visible assemblies from hypotheses. Leave unsupported specifications unknown and request the next evidence needed.",
        "salvage",
        structuredClone(item),
      );
    } finally {
      setIdentifying(false);
    }
  }
  function openLinkedItem(id: string) {
    if (itemDirty) {
      setError("Save your edits before opening a linked record.");
      return;
    }
    const target = state.items.find((i) => i.id === id);
    if (target) setItem({ ...target });
    else
      setError(
        "This linked record is in Removed. Restore it from the Removed filter to open it.",
      );
  }
  async function saveProject(e: React.FormEvent) {
    e.preventDefault();
    if (!project) return;
    await perform(async () => {
      const created = !project.id;
      const saved = await api<Project>(
        project.id ? `/projects/${project.id}` : "/projects",
        {
          ...project,
          ...(created ? { startConversation: true } : {}),
          ...(!project.id && projectFromConversation
            ? { conversationId: projectFromConversation }
            : {}),
        },
        project.id ? "PUT" : "POST",
      );
      const next = await api<Snapshot>("/state");
      setState(next);
      if (created) {
        const conversation = next.conversations.find(
          (c) => c.projectId === saved.id,
        );
        if (conversation) {
          switchConversation(conversation.id);
          setTab("Build ideas");
        }
      }
      setProject(null);
      setProjectFromConversation(null);
    });
  }
  function beginProject(conversationId: string | null = null) {
    if (busy || boardMapping || saving || creatingConversation) return;
    const source = state.conversations.find((c) => c.id === conversationId);
    setProjectFromConversation(conversationId);
    setProject({
      ...blankProject,
      name: source && source.title !== "New exploration" ? source.title : "",
    });
  }
  async function upload(file?: File, chat = false) {
    if (!file || (!chat && !item)) return;
    setUploading(true);
    setError("");
    try {
      if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
        throw new Error("Choose a JPEG, PNG, or WebP photo.");
      if (file.size > 25000000)
        throw new Error("Please choose a photo smaller than 25 MB.");
      const bitmap = await createImageBitmap(file);
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      canvas
        .getContext("2d")!
        .drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close();
      const result = await api<{ photo: string }>("/photos", {
        image: canvas.toDataURL("image/jpeg", 0.88),
      });
      if (chat) {
        setBoardPhoto({ photo: result.photo, label: file.name });
        setSelected(null);
      } else
        setItem((old) =>
          old ? { ...old, photo: result.photo, photoReview: undefined } : old,
        );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setUploading(false);
    }
  }
  async function ask(
    text = message,
    mode: "chat" | "identify" | "ideas" | "salvage" = "chat",
    identifyDraft?: Omit<Item, "id" | "available"> & { id?: string },
    conversationOverride?: string,
    actionMode?: "stash" | "parts",
    photoOverride?: string,
  ) {
    if (
      !text.trim() ||
      busy ||
      uploading ||
      boardMapping ||
      !modelReady ||
      requestInFlight.current
    )
      return;
    const analysis = mode === "identify" || mode === "salvage";
    if (!analysis && activeConversation?.legacy && !conversationOverride)
      return;
    requestInFlight.current = true;
    let conversationId = conversationOverride || activeConversationId;
    if (!analysis && !conversationId) {
      conversationId = await newConversation();
      if (!conversationId) {
        requestInFlight.current = false;
        return;
      }
    }
    setError("");
    setBusy(true);
    if (!analysis) {
      setPendingText(text);
      setLiveAnswer("");
    }
    setPhase("preparing");
    const controller = new AbortController();
    abortRef.current = controller;
    try {
      const requestKey = `benchmate.chat.request.v1.${conversationId || "analysis"}`;
      const fingerprint = JSON.stringify([
        text,
        photoOverride || boardPhoto?.photo,
        selected,
        actionMode,
      ]);
      let requestId = crypto.randomUUID();
      if (!analysis) {
        try {
          const old = JSON.parse(localStorage.getItem(requestKey) || "null");
          if (old?.fingerprint === fingerprint) requestId = old.id;
          else
            localStorage.setItem(
              requestKey,
              JSON.stringify({ fingerprint, id: requestId }),
            );
        } catch {}
      }
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          message: text,
          requestId,
          prepareStash: actionMode === "stash",
          manageParts: actionMode === "parts",
          conversationId: analysis ? null : conversationId,
          provider: models.provider || "ollama",
          model: models.selected,
          itemId: photoOverride
            ? null
            : identifyDraft
              ? identifyDraft.id || null
              : mode === "ideas"
                ? null
                : selected,
          photo:
            photoOverride ||
            identifyDraft?.photo ||
            (mode === "chat" ? boardPhoto?.photo : null) ||
            null,
          expectedUpdatedAt:
            identifyDraft?.expectedUpdatedAt || identifyDraft?.updatedAt,
          mode,
          responseMode,
          progress: true,
          proposeIdentity: mode === "identify",
          proposeSalvage: mode === "salvage",
        }),
      });
      if (!response.ok) throw new Error((await response.json()).error);
      if (!response.body)
        throw new Error("The server did not provide a response stream.");
      const reader = response.body.getReader(),
        decoder = new TextDecoder();
      let buffer = "",
        finished = false;
      let proposal: IdentityProposal | null = null;
      let salvageProposal: SalvageProposal | null = null;
      const accept = (line: string) => {
        if (!line.trim()) return;
        const event = JSON.parse(line);
        if (event.type === "error") throw new Error(event.error);
        if (event.phase) setPhase(event.phase);
        if (event.text && !analysis) setLiveAnswer((old) => old + event.text);
        if (event.type === "done") {
          finished = true;
          if (!analysis && !event.action && event.context)
            setLastRun({
              provider: event.provider || "ollama",
              model: event.model,
              seconds: event.seconds,
              usage: event.usage,
              context: event.context,
            });
          if (event.proposal) proposal = event.proposal;
          if (event.salvageProposal) salvageProposal = event.salvageProposal;
        }
      };
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          let n;
          while ((n = buffer.indexOf("\n")) >= 0) {
            accept(buffer.slice(0, n));
            buffer = buffer.slice(n + 1);
          }
        }
        buffer += decoder.decode();
        if (buffer.trim()) accept(buffer);
        if (!finished)
          throw new Error(
            "The connection ended before the answer completed. Your request is kept for retry.",
          );
      } finally {
        reader.releaseLock();
      }
      await refresh();
      if (!analysis) {
        localStorage.removeItem(requestKey);
        if (!photoOverride) setBoardPhoto(null);
      }
      if (salvageProposal && identifyDraft) {
        const draft = salvageProposal as SalvageProposal;
        const latest = await api<Snapshot>("/state");
        if (
          controller.signal.aborted ||
          latest.items.find((i) => i.id === draft.itemId)?.updatedAt !==
            draft.baseUpdatedAt ||
          identifyDraft.photo !== draft.photo
        )
          throw new Error(
            "This donor changed during mapping. Reopen it before trying again.",
          );
        setItem({
          ...identifyDraft,
          salvage: [...(identifyDraft.salvage || []), ...draft.components],
          expectedUpdatedAt: draft.baseUpdatedAt,
          salvageReview: {
            model: draft.model,
            createdAt: draft.createdAt,
            photo: draft.photo,
            uncertainty:
              "Review every row. AI assemblies start as potential; mark observed or documented only after checking evidence. Hidden assemblies and quantities are hypotheses; specification claims require matching evidence. Existing rows were retained—remove duplicate proposals before saving.",
          },
        });
        setRecordTab("Salvage map");
      }
      if (proposal && identifyDraft) {
        if (controller.signal.aborted)
          throw new DOMException("Request stopped.", "AbortError");
        const draft = proposal as IdentityProposal;
        if (identifyDraft.id) {
          const latest = await api<Snapshot>("/state");
          const saved = latest.items.find((i) => i.id === identifyDraft.id);
          if (!saved || saved.updatedAt !== draft.baseUpdatedAt)
            throw new Error(
              "The item changed during photo review. Reopen it before applying the proposal.",
            );
        }
        setReviewPrevious(identifyDraft.markings);
        setItem(applyIdentityProposal(identifyDraft, draft));
      }
      if (!analysis && !photoOverride) setMessage("");
    } catch (e) {
      setError(
        (e as Error).name === "AbortError"
          ? "Request stopped."
          : (e as Error).message,
      );
    } finally {
      setBusy(false);
      requestInFlight.current = false;
      abortRef.current = null;
    }
  }
  function exportData() {
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(state, null, 2)], { type: "application/json" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `benchmate-inventory-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }
  const modelReady =
    models.connected && models.models.includes(models.selected);
  const unresolved = state.items.filter(
    (i) => identityStatus(i).needsIdentification,
  ).length;
  const stockItems = state.items.filter(
    (i) => i.kind !== "tool" && !i.boardOrigin,
  );
  const tools = state.items.filter((i) => i.kind === "tool");
  const toolMatches = tools.filter(
    (i) =>
      `${i.name} ${i.markings} ${i.location}`
        .toLowerCase()
        .includes(query.toLowerCase()) &&
      (filter !== "unresolved" || identityStatus(i).needsIdentification) &&
      (filter !== "available" ||
        !["damaged", "consumed"].includes(i.condition)),
  );
  const stock = state.items
    .filter(
      (i) =>
        i.kind !== "tool" && !["damaged", "consumed"].includes(i.condition),
    )
    .reduce((n, i) => n + i.available, 0);
  const shown = stockItems.filter(
    (i) =>
      (filter === "all" ||
        (filter === "unresolved" && identityStatus(i).needsIdentification) ||
        (filter === "available" &&
          i.available > 0 &&
          !["damaged", "consumed"].includes(i.condition)) ||
        (filter === "donor" && i.kind === "donor")) &&
      `${i.name} ${i.markings} ${i.location}`
        .toLowerCase()
        .includes(query.toLowerCase()),
  );
  const label = (id: string) =>
    [...state.items, ...(state.removedItems || [])].find((i) => i.id === id)
      ?.name || "Part";
  async function restoreItem(id: string) {
    await perform(async () => {
      await api(`/items/${id}/restore`, {});
      await refresh();
      if (undoRemoved?.id === id) setUndoRemoved(null);
    });
  }
  async function removeItem(id: string, name: string) {
    await perform(async () => {
      await api(`/items/${id}`, {}, "DELETE");
      await refresh();
      setItem(null);
      if (selected === id) setSelected(null);
      setUndoRemoved({ id, name });
    });
  }
  const errorBanner = error && (
    <div className="error-banner" role="alert">
      <span>{error}</span>
      <button
        className="icon-button"
        aria-label="Dismiss error"
        onClick={() => setError("")}
      >
        <X size={18} />
      </button>
    </div>
  );
  if (!ready)
    return (
      <main className="pair-screen">
        <LoaderCircle className="spin" />
        <p>Opening the salvage bay…</p>
        {errorBanner}
      </main>
    );
  if (!paired)
    return (
      <main className="pair-screen">
        <div className="pair-card">
          <CircuitBoard size={34} />
          <p className="eyebrow">BENCHMATE / PRIVATE WORKBENCH</p>
          <h1>Pull up a chair.</h1>
          <p>
            Enter the pairing code shown in BenchMate’s terminal on your PC.
            Your stash stays on that machine.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void perform(async () => {
                await api("/pair", { code: pairCode });
                setPaired(true);
                await load();
              });
            }}
          >
            <label>
              Pairing code
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={pairCode}
                onChange={(e) => setPairCode(e.target.value)}
                required
                maxLength={8}
              />
            </label>
            <button className="primary" disabled={saving}>
              Connect to bench <ArrowRight size={17} />
            </button>
          </form>
          {errorBanner}
        </div>
      </main>
    );
  return (
    <div className="app-shell">
      <aside className="sidebar metal">
        <div className="screw top" />
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            setTab("Stash");
          }}
        >
          <span className="brand-icon">
            <CircuitBoard size={25} />
          </span>
          <span>
            BENCH<span className="brand-light">MATE</span>
            <small>SALVAGE BAY / 001</small>
          </span>
        </a>
        <div className="sidebar-label">YOUR WORKBENCH</div>
        <nav aria-label="Main navigation">
          {[
            { name: "Stash", icon: Layers, desc: "Your parts, possibilities" },
            {
              name: "Boardroom",
              icon: CircuitBoard,
              desc: "Follow the traces",
            },
            {
              name: "Build ideas",
              icon: Sparkles,
              desc: "Find the next thing",
            },
            { name: "Projects", icon: Hammer, desc: "Bring it together" },
          ].map((n) => (
            <button
              key={n.name}
              className={`nav-item ${tab === n.name ? "active" : ""}`}
              onClick={() => setTab(n.name)}
            >
              <n.icon size={20} />
              <span>
                {n.name}
                <small>{n.desc}</small>
              </span>
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="bench-note">
            <Unplug size={22} />
            <p>
              Nothing is junk.
              <br />
              <span>Some things just need a plan.</span>
            </p>
          </div>
          <div className="model-box">
            <label className="sr-only" htmlFor="provider">
              Model provider
            </label>
            <select
              id="provider"
              value={models.provider || "ollama"}
              disabled={busy || boardMapping || saving}
              onChange={(e) => {
                const provider = e.target.value;
                void perform(async () => {
                  await api("/provider", { provider }, "PUT");
                  await refreshModels();
                });
              }}
            >
              <option value="ollama">Local Ollama</option>
              <option value="meta">Meta hosted API</option>
            </select>
            <div className="model-heading">
              <span className={`led ${models.connected ? "on" : ""}`} />
              <span>
                {models.provider === "meta"
                  ? models.connected
                    ? "META CONNECTED"
                    : "META NOT CONNECTED"
                  : models.connected
                    ? "OLLAMA CONNECTED"
                    : "OLLAMA OFFLINE"}
              </span>
              <button
                className="icon-button"
                aria-label="Refresh model connection"
                onClick={() =>
                  void refreshModels().catch((e) => setError(e.message))
                }
              >
                <Radio size={16} />
              </button>
            </div>
            <label className="sr-only" htmlFor="model">
              AI model
            </label>
            <select
              id="model"
              value={models.selected}
              disabled={!models.connected || busy || boardMapping || saving}
              onChange={(e) => {
                const value = e.target.value;
                void perform(async () => {
                  await api("/model", { model: value }, "PUT");
                  setModels((m) => ({ ...m, selected: value }));
                });
              }}
            >
              {!models.models.length && (
                <option value="">No models available</option>
              )}
              {models.selected && !models.models.includes(models.selected) && (
                <option value={models.selected} disabled>
                  {models.selected} (unavailable)
                </option>
              )}
              {models.models.map((m) => (
                <option key={m}>{m}</option>
              ))}
            </select>
            <small>
              {models.provider === "meta"
                ? "Hosted model · local inventory"
                : "Local model · local inventory"}
            </small>
            {models.error && <p className="provider-error">{models.error}</p>}
          </div>
          <button className="settings-link" onClick={() => setInfo(true)}>
            <Settings2 size={16} /> Bench settings <ArrowUpRight size={14} />
          </button>
        </div>
        <div className="screw bottom" />
      </aside>
      <div className="work-area">
        <header className="topbar">
          <div className="breadcrumb">
            WORKBENCH <ChevronRight size={13} />
            <span>{tab.toUpperCase()}</span>
          </div>
          <div className="top-status">
            <span className="led on" /> LOCAL STORAGE{" "}
            <span className="divider">/</span>{" "}
            <span className="desktop-label">MAKE SOMETHING OF IT.</span>
            <button
              className="icon-button top-settings"
              aria-label="Bench settings"
              onClick={() => setInfo(true)}
            >
              <Settings2 size={14} />
            </button>
          </div>
        </header>
        <div className="workspace-content">
          <div className="page-heading">
            <div>
              <p className="eyebrow">COLLECT. UNDERSTAND. CREATE.</p>
              <h1>
                {tab === "Stash"
                  ? "A little scrap. A lot of potential."
                  : tab === "Build ideas"
                    ? "What could this become?"
                    : tab === "Boardroom"
                      ? "Get to know your boards."
                      : "From spare parts to something real."}
              </h1>
              <p className="page-subtitle">
                {tab === "Stash"
                  ? "Your finds, all in one place. The next good idea starts here."
                  : tab === "Build ideas"
                    ? "Start with what you have. Find out what you still need."
                    : tab === "Boardroom"
                      ? "Explore the components. Keep the knowledge. Recover the possibilities."
                      : "Keep the parts, progress, and next steps together."}
              </p>
            </div>
            <div className="quick-actions">
              <button
                className="secondary explore-shortcut"
                disabled={busy || !modelReady || !state.items.length}
                onClick={async () => {
                  setTab("Build ideas");
                  setSelected(null);
                  const id = await newConversation();
                  if (!id) return;
                  void ask(
                    "Suggest up to three modest electronics projects based on my actual available inventory. For each list usable parts, missing parts, and identity or documentation checks. Use recorded recoveries as current stock while keeping identity, condition and compatibility separate. If inventory is too limited, explain the useful next step. No pin-level instructions.",
                    "ideas",
                    undefined,
                    id,
                  );
                }}
              >
                <Sparkles size={16} /> Explore my stash
              </button>
              <button
                className="secondary ask-shortcut"
                onClick={() =>
                  assistantRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  })
                }
              >
                <MessageSquare size={16} /> Ask BenchMate
              </button>
              <button
                className="primary"
                hidden={tab === "Boardroom" || tab === "Build ideas"}
                onClick={() =>
                  tab === "Projects"
                    ? beginProject()
                    : setItem({ ...blankItem, sources: [] })
                }
              >
                <Plus size={17} />
                {tab === "Projects" ? "New project" : "Add salvage"}
              </button>
            </div>
          </div>
          {errorBanner}
          <div className="stats-strip" hidden={tab === "Build ideas"}>
            <div>
              <Box size={18} />
              <strong>{stock.toString().padStart(2, "0")}</strong>
              <span>AVAILABLE STOCK</span>
            </div>
            <div>
              <Search size={18} />
              <strong>{unresolved.toString().padStart(2, "0")}</strong>
              <span>TO IDENTIFY</span>
            </div>
            <div>
              <Hammer size={18} />
              <strong>
                {state.projects
                  .filter((p) => p.status !== "complete")
                  .length.toString()
                  .padStart(2, "0")}
              </strong>
              <span>OPEN PROJECTS</span>
            </div>
            <div>
              <Wrench size={18} />
              <strong>
                {tools
                  .reduce((n, i) => n + i.quantity, 0)
                  .toString()
                  .padStart(2, "0")}
              </strong>
              <span>TOOL UNITS</span>
            </div>
          </div>
          <div
            className={`bench-layout ${tab === "Build ideas" ? "conversation-workspace" : ""} ${tab === "Boardroom" ? "boardroom-layout" : ""}`}
          >
            <main className="main-panel">
              {tab === "Build ideas" && (
                <ConversationHub
                  conversations={state.conversations || []}
                  projects={state.projects}
                  activeId={activeConversationId}
                  busy={
                    busy ||
                    boardMapping ||
                    saving ||
                    creatingConversation ||
                    uploading
                  }
                  onOpen={switchConversation}
                  onNew={() => void newConversation()}
                  onNewProject={() => beginProject()}
                  onProject={(id) => void newConversation(id)}
                />
              )}
              <div hidden={tab !== "Boardroom"}>
                <Boardroom
                  boards={state.boards || []}
                  items={state.items}
                  model={models.selected}
                  provider={models.provider || "ollama"}
                  modelReady={modelReady}
                  chatBusy={busy}
                  onRefresh={refresh}
                  onMappingChange={setBoardMapping}
                  onEditItem={(id) => {
                    const found = state.items.find((i) => i.id === id);
                    if (found) setItem({ ...found });
                  }}
                  onReserve={(id) =>
                    setAllocation({
                      itemId: id,
                      projectId:
                        state.projects.find((p) => p.status !== "complete")
                          ?.id || "",
                      quantity: 1,
                    })
                  }
                  onExplain={async (
                    board: Board,
                    component?: BoardComponent,
                  ) => {
                    if (!activeConversationId || activeConversation?.legacy) {
                      if (!(await newConversation())) return;
                    }
                    setSelected(board.linkedItemId);
                    const photo = component?.photo || board.photos[0];
                    setBoardPhoto(photo ? { photo, label: board.name } : null);
                    setMessage(
                      `Help me understand ${component ? `this component on ${board.name}` : `this board: ${board.name}`}.\nBoard notes: ${board.notes}\n${component ? JSON.stringify({ name: component.name, markings: component.markings, category: component.category, likelyPurpose: component.description, visibleEvidence: component.evidence, uncertainty: component.uncertainty, sources: component.sources }) : JSON.stringify(board.components.map((c) => ({ name: c.name, markings: c.markings, category: c.category, likelyPurpose: c.description, evidence: c.evidence, uncertainty: c.uncertainty, sources: c.sources })))}\nThese are tentative photo observations. Distinguish likely function from verified facts. Ask for specific close-ups or documentation where needed.`.slice(
                        0,
                        6000,
                      ),
                    );
                    assistantRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }}
                />
              </div>
              {tab === "Stash" && (
                <>
                  <div className="section-title">
                    <h2>
                      The stash{" "}
                      <span>
                        {state.items.filter((i) => !i.boardOrigin).length}
                      </span>
                    </h2>
                    <span className="mono faint">INVENTORY / LIVE</span>
                  </div>
                  <div className="inventory-tools">
                    <div className="filters">
                      {[
                        ["all", "All finds"],
                        ["available", "Available"],
                        ["unresolved", "Unidentified"],
                        ["donor", "Donors"],
                        ["tools", `Tools (${tools.length})`],
                        [
                          "removed",
                          `Removed (${(state.removedItems || []).length})`,
                        ],
                      ].map(([key, title]) => (
                        <button
                          key={key}
                          className={filter === key ? "selected" : ""}
                          onClick={() => setFilter(key)}
                        >
                          {title}
                        </button>
                      ))}
                    </div>
                    <label className="search-box">
                      <Search size={15} />
                      <input
                        aria-label="Search stash"
                        placeholder="Search your stash…"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                      />
                    </label>
                  </div>
                  {filter !== "removed" && filter !== "donor" && (
                    <section
                      className="equipment-section"
                      aria-labelledby="equipment-title"
                    >
                      <div className="equipment-heading">
                        <div className="equipment-heading-icon">
                          <Wrench size={19} />
                        </div>
                        <div>
                          <h2 id="equipment-title">
                            Tools & equipment <span>{tools.length}</span>
                          </h2>
                          <p>The gear that makes your builds possible.</p>
                        </div>
                        <button
                          className="secondary small"
                          onClick={() =>
                            setItem({ ...blankItem, kind: "tool", sources: [] })
                          }
                        >
                          <Plus size={14} /> Add tool
                        </button>
                      </div>
                      {toolMatches.length ? (
                        <ul className="equipment-list">
                          {toolMatches.map((tool) => (
                            <li key={tool.id}>
                              <button
                                className="equipment-row"
                                onClick={() => setItem({ ...tool })}
                              >
                                <span className="equipment-photo">
                                  {tool.photo ? (
                                    <BenchPhoto
                                      src={`/api/photos/${tool.photo}`}
                                      alt=""
                                    />
                                  ) : (
                                    <Wrench size={23} />
                                  )}
                                </span>
                                <span className="equipment-details">
                                  <strong>{tool.name}</strong>
                                  <span className="equipment-meta">
                                    <span
                                      className={`equipment-condition ${tool.condition}`}
                                    >
                                      {tool.condition === "working"
                                        ? "Working · user reported"
                                        : tool.condition === "damaged"
                                          ? "Needs repair"
                                          : tool.condition === "consumed"
                                            ? "Unavailable"
                                            : "Untested"}
                                    </span>
                                    <span>
                                      <MapPin size={11} />
                                      {tool.location || "Location not set"}
                                    </span>
                                  </span>
                                  {identityStatus(tool).needsIdentification && (
                                    <small className="equipment-unidentified">
                                      {identityStatus(tool).label}
                                    </small>
                                  )}
                                </span>
                                <span className="equipment-quantity">
                                  <strong>{tool.quantity}</strong>
                                  <small>
                                    {tool.quantity === 1 ? "unit" : "units"}
                                  </small>
                                </span>
                                <ChevronRight size={15} />
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : (
                        <div className="equipment-empty">
                          <Wrench size={26} />
                          <p>
                            {tools.length
                              ? "No tools match this view."
                              : "Give your bench gear a home."}
                            <small>
                              {tools.length
                                ? "Try another filter or search."
                                : "Soldering irons, meters, thermal detectors—record what you can work with."}
                            </small>
                          </p>
                        </div>
                      )}
                      <p className="equipment-footnote">
                        Reusable bench gear · tracked separately from parts to
                        install.
                      </p>
                    </section>
                  )}
                  {filter !== "removed" &&
                    filter !== "tools" &&
                    stockItems.length > 0 && (
                      <div className="parts-heading">
                        <h3>Parts & donor devices</h3>
                        <span>{stockItems.length} records</span>
                      </div>
                    )}
                  {filter === "tools" ? null : filter === "removed" ? (
                    <div className="removed-list">
                      <p className="quiet-note">
                        Removed records keep their photos and history. Restore
                        them to make them available again.
                      </p>
                      {(state.removedItems || [])
                        .filter((i) =>
                          `${i.name} ${i.markings} ${i.location}`
                            .toLowerCase()
                            .includes(query.toLowerCase()),
                        )
                        .map((i) => (
                          <article className="removed-row" key={i.id}>
                            <div>
                              <strong>{i.name}</strong>
                              <small>
                                {i.quantity} unit{i.quantity !== 1 ? "s" : ""} ·
                                removed{" "}
                                {i.removedAt
                                  ? new Date(i.removedAt).toLocaleDateString()
                                  : ""}
                              </small>
                            </div>
                            <button
                              className="secondary small"
                              disabled={saving}
                              onClick={() => void restoreItem(i.id)}
                            >
                              Restore to stash
                            </button>
                          </article>
                        ))}
                      {!(state.removedItems || []).length && (
                        <p className="quiet-note">No removed records.</p>
                      )}
                    </div>
                  ) : shown.length ? (
                    <div className="item-grid">
                      {shown.map((i) => (
                        <button
                          className="salvage-card"
                          key={i.id}
                          onClick={() => setItem({ ...i })}
                        >
                          <div className="part-photo">
                            {i.photo ? (
                              <BenchPhoto
                                src={`/api/photos/${i.photo}`}
                                alt={i.name}
                              />
                            ) : (
                              <div className="photo-placeholder">
                                {i.kind === "donor" ? (
                                  <Unplug size={48} />
                                ) : i.kind === "tool" ? (
                                  <Hammer size={48} />
                                ) : (
                                  <Cpu size={48} />
                                )}
                                <span>
                                  {i.kind === "donor"
                                    ? "DONOR DEVICE"
                                    : "PHOTO PENDING"}
                                </span>
                              </div>
                            )}
                            <span className="salvage-id">
                              BM / {i.id.slice(0, 6).toUpperCase()}
                            </span>
                            <span
                              className={`badge ${identityStatus(i).stage}`}
                            >
                              {!identityStatus(i).needsIdentification ? (
                                <Check size={11} />
                              ) : (
                                <Search size={11} />
                              )}{" "}
                              {identityStatus(i).label}
                            </span>
                          </div>
                          <div className="card-body">
                            <div className="card-kind">
                              {i.kind.toUpperCase()} <span>{i.condition}</span>
                            </div>
                            <h3>{i.name}</h3>
                            <p title={i.markings}>
                              {i.markings || "No markings entered yet"}
                            </p>
                            <div className="card-footer">
                              <span>
                                <Box size={13} />{" "}
                                {i.location || "Location not set"}
                              </span>
                              <strong>
                                {["damaged", "consumed"].includes(i.condition)
                                  ? 0
                                  : i.available}
                                <small> / {i.quantity} free</small>
                              </strong>
                            </div>
                            {state.allocations
                              .filter(
                                (a) =>
                                  a.itemId === i.id && a.state !== "returned",
                              )
                              .map((a) => (
                                <div className="stash-allocation" key={a.id}>
                                  {a.quantity} {a.state} ·{" "}
                                  {state.projects.find(
                                    (p) => p.id === a.projectId,
                                  )?.name || "Project"}
                                </div>
                              ))}
                          </div>
                        </button>
                      ))}
                      <button
                        className="add-card"
                        onClick={() => setItem({ ...blankItem, sources: [] })}
                      >
                        <Plus size={26} />
                        <span>One more find?</span>
                        <small>Add it to the stash</small>
                      </button>
                    </div>
                  ) : (
                    <div className="empty-stash">
                      <div className="empty-art">
                        <ComponentDrawing />
                        <span className="art-tag">UNCLAIMED POTENTIAL</span>
                      </div>
                      <p className="eyebrow">
                        EVERY GREAT BUILD STARTS SOMEWHERE
                      </p>
                      <h2>
                        {stockItems.length
                          ? "Nothing in this drawer."
                          : "Your junk drawer has a future."}
                      </h2>
                      <p>
                        {stockItems.length
                          ? "Try another filter or search for a different marking."
                          : "An old board. A mystery motor. That cable you kept for a reason. Give it a home, and we’ll work out what comes next."}
                      </p>
                      <button
                        className="primary"
                        onClick={() => setItem({ ...blankItem, sources: [] })}
                      >
                        <Camera size={17} /> Add your first find{" "}
                        <ArrowRight size={16} />
                      </button>
                      <small>Upload a photo or start with the markings.</small>
                    </div>
                  )}
                </>
              )}
              {tab === "Projects" && (
                <>
                  <div className="section-title">
                    <h2>
                      On the bench <span>{state.projects.length}</span>
                    </h2>
                    <button
                      className="text-button"
                      onClick={() => beginProject()}
                    >
                      <Plus size={15} /> New
                    </button>
                  </div>
                  {state.projects.length ? (
                    state.projects.map((p) => (
                      <article className="project-card" key={p.id}>
                        <div className="project-header">
                          <span className="project-symbol">
                            <Hammer size={22} />
                          </span>
                          <div>
                            <span className="eyebrow">{p.status}</span>
                            <h3>{p.name}</h3>
                          </div>
                          <button
                            className="secondary small"
                            onClick={() => setProject({ ...p })}
                          >
                            Edit
                          </button>
                        </div>
                        <p>{p.goal || "No goal recorded."}</p>
                        <button
                          className="secondary project-chat-button"
                          disabled={busy || boardMapping}
                          onClick={() => void newConversation(p.id)}
                        >
                          <MessageSquare size={15} /> Open project chat
                        </button>
                        <div className="next-action">
                          <span className="mono">NEXT UP</span>
                          <p>
                            {p.nextAction || "Choose your next small step."}
                          </p>
                        </div>
                        {p.notes && <p className="project-notes">{p.notes}</p>}
                        <div className="allocation-title">
                          <span>PARTS ON THIS PROJECT</span>
                          <button
                            className="text-button"
                            onClick={() =>
                              setAllocation({
                                itemId: "",
                                projectId: p.id,
                                quantity: 1,
                              })
                            }
                          >
                            <Plus size={14} /> Reserve parts
                          </button>
                        </div>
                        {state.allocations
                          .filter(
                            (a) =>
                              a.projectId === p.id && a.state !== "returned",
                          )
                          .map((a) => (
                            <div className="allocation-row" key={a.id}>
                              <div>
                                <strong>{label(a.itemId)}</strong>
                                <small>
                                  {a.quantity} unit{a.quantity !== 1 ? "s" : ""}{" "}
                                  · {a.state}
                                </small>
                                <small>
                                  {
                                    identityStatus(
                                      state.items.find(
                                        (i) => i.id === a.itemId,
                                      ),
                                    ).label
                                  }{" "}
                                  ·{" "}
                                  {
                                    state.items.find((i) => i.id === a.itemId)
                                      ?.condition
                                  }
                                </small>
                              </div>
                              {a.state === "reserved" && (
                                <button
                                  disabled={saving}
                                  className="secondary small"
                                  onClick={() =>
                                    void perform(async () => {
                                      await api(
                                        `/allocations/${a.id}`,
                                        { state: "installed" },
                                        "PATCH",
                                      );
                                      await refresh();
                                    })
                                  }
                                >
                                  Mark installed
                                </button>
                              )}
                              <button
                                disabled={saving}
                                className="text-button"
                                onClick={() =>
                                  void perform(async () => {
                                    await api(
                                      `/allocations/${a.id}`,
                                      { state: "returned" },
                                      "PATCH",
                                    );
                                    await refresh();
                                  })
                                }
                              >
                                Return
                              </button>
                            </div>
                          ))}
                        {!state.allocations.some(
                          (a) => a.projectId === p.id && a.state !== "returned",
                        ) && (
                          <p className="quiet-note">
                            No parts reserved. Your available stash is
                            unchanged.
                          </p>
                        )}
                      </article>
                    ))
                  ) : (
                    <div className="compact-empty">
                      <Hammer size={38} />
                      <h2>Make room for your next build.</h2>
                      <p>
                        A project keeps its parts, progress, and next action
                        together. Start with an idea; add the hardware as you
                        find it.
                      </p>
                      <button
                        className="primary"
                        onClick={() => beginProject()}
                      >
                        Start a project <Plus size={16} />
                      </button>
                    </div>
                  )}
                </>
              )}
              <div className="bench-log" hidden={tab === "Build ideas"}>
                <div className="section-title">
                  <h2>Bench log</h2>
                  <span className="mono faint">RECENT MOVEMENTS</span>
                </div>
                {state.events.length ? (
                  state.events.slice(0, 5).map((e) => (
                    <div className="log-row" key={e.id}>
                      <span className="log-dot" />
                      <p>
                        {e.type.replaceAll(".", " ").replaceAll("_", " ")}{" "}
                        <strong>{e.name || label(e.itemId || "")}</strong>
                        {e.quantity ? ` × ${e.quantity}` : ""}
                      </p>
                      <time>
                        {new Date(e.at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </time>
                    </div>
                  ))
                ) : (
                  <p className="quiet-note">
                    A clean bench. Your finds and parts movements will appear
                    here.
                  </p>
                )}
              </div>
            </main>
            <aside
              className={`assistant-panel ${activeConversation?.legacy ? "legacy-conversation" : ""}`}
              ref={assistantRef}
              role={tab === "Build ideas" ? "main" : "complementary"}
              aria-label={
                tab === "Build ideas"
                  ? "Build ideas conversation"
                  : "Bench partner conversation"
              }
            >
              <div className="assistant-heading">
                <div className="assistant-icon">
                  <CircuitBoard size={21} />
                </div>
                <div>
                  <h2>
                    {conversationProject?.name ||
                      activeConversation?.title ||
                      "New exploration"}
                  </h2>
                  <span>
                    <span className={`led ${models.connected ? "on" : ""}`} />
                    {models.provider === "meta"
                      ? models.connected
                        ? "META HOSTED"
                        : "META NOT CONNECTED"
                      : models.connected
                        ? "OLLAMA ONLINE"
                        : "WAITING FOR OLLAMA"}
                  </span>
                </div>
                <div className="assistant-header-actions">
                  {conversationProject && (
                    <ProjectInventory
                      key={conversationProject.id}
                      project={conversationProject}
                      allocations={state.allocations}
                      items={state.items}
                      onOpen={(id) => {
                        const found = state.items.find((i) => i.id === id);
                        if (found)
                          setItem({
                            ...found,
                            expectedUpdatedAt: found.updatedAt,
                          });
                      }}
                    />
                  )}
                  <button
                    className="text-button chat-size-toggle"
                    aria-label={
                      tab === "Build ideas"
                        ? "Return to Stash with side chat"
                        : "Expand conversation in Build ideas"
                    }
                    onClick={() =>
                      setTab(tab === "Build ideas" ? "Stash" : "Build ideas")
                    }
                  >
                    {tab === "Build ideas" ? (
                      "Back to Stash"
                    ) : (
                      <>
                        <ArrowUpRight size={16} /> Expand
                      </>
                    )}
                  </button>
                </div>
              </div>
              <div className="conversation-context-bar">
                <span>
                  {activeConversation?.legacy
                    ? "EARLIER BENCH HISTORY · READ-ONLY"
                    : conversationProject
                      ? "PROJECT CHAT · YOUR BENCH PARTNER"
                      : "EXPLORATION · YOUR BENCH PARTNER"}
                </span>
                {tab !== "Build ideas" && (
                  <button
                    className="text-button"
                    onClick={() => setTab("Build ideas")}
                  >
                    All conversations
                  </button>
                )}
              </div>
              {tab === "Build ideas" && (
                <ConversationActions
                  key={`actions:${activeConversationId || "new"}`}
                  conversation={activeConversation}
                  projects={state.projects.filter(
                    (p) =>
                      !(state.conversations || []).some(
                        (c) =>
                          c.projectId === p.id && c.id !== activeConversationId,
                      ),
                  )}
                  busy={
                    busy ||
                    boardMapping ||
                    saving ||
                    creatingConversation ||
                    uploading
                  }
                  onRename={(title) => void updateConversation({ title })}
                  onLink={(projectId) => void updateConversation({ projectId })}
                  onPromote={() => beginProject(activeConversationId)}
                />
              )}
              <ConversationFeed
                key={`feed:${activeConversationId || "new"}`}
                conversationId={activeConversationId}
                messages={conversationMessages}
                busy={busy && !identifying}
                pendingText={pendingText}
                liveAnswer={liveAnswer}
                phase={phase}
                elapsed={elapsed}
                project={conversationProject}
                legacy={activeConversation?.legacy}
                layout={tab}
                onStop={() => abortRef.current?.abort()}
                onPreparePhoto={(photo) =>
                  void ask(
                    "Prepare a Stash card from this photo.",
                    "chat",
                    undefined,
                    undefined,
                    "stash",
                    photo,
                  )
                }
                photoActionDisabled={
                  busy || uploading || boardMapping || !modelReady
                }
                renderAction={(id) => {
                  const action = state.chatActions?.find((a) => a.id === id);
                  return action ? (
                    <ChatActionCard
                      key={action.id}
                      action={action}
                      items={state.items}
                      projects={state.projects}
                      allocations={state.allocations}
                      onRefresh={refresh}
                      onOpen={(id) => {
                        const found = state.items.find((i) => i.id === id);
                        if (found)
                          setItem({
                            ...found,
                            expectedUpdatedAt: found.updatedAt,
                          });
                      }}
                    />
                  ) : null;
                }}
              />
              <div className="composer">
                {boardPhoto && (
                  <p className="hosted-notice">
                    <BenchPhoto
                      className="chat-photo"
                      src={`/api/photos/${boardPhoto.photo}`}
                      alt="Photo attached to your next message"
                    />
                    Photo attached: {boardPhoto.label}{" "}
                    <button
                      className="text-button"
                      disabled={busy || uploading}
                      onClick={() => setBoardPhoto(null)}
                    >
                      Clear
                    </button>
                    <button
                      className="secondary"
                      disabled={
                        busy ||
                        uploading ||
                        !modelReady ||
                        !!activeConversation?.legacy
                      }
                      onClick={() =>
                        void ask(
                          message.trim() ||
                            "Prepare a Stash card from this photo.",
                          "chat",
                          undefined,
                          undefined,
                          "stash",
                        )
                      }
                    >
                      Prepare Stash card
                    </button>
                  </p>
                )}
                {models.provider === "meta" && (
                  <p className="hosted-notice">
                    Meta hosted · sends your message, stash context, and
                    selected photo.
                  </p>
                )}
                <details className="reply-settings">
                  <summary>
                    Reply settings ·{" "}
                    {responseMode === "quick" ? "Quick" : "Balanced"} ·{" "}
                    {selected ? "Item attached" : "Shared stash"}
                  </summary>
                  {models.provider === "meta" && (
                    <p>
                      Meta free-credit terms may permit product improvement.
                    </p>
                  )}
                  {lastRun && (
                    <p className="last-run">
                      Last reply:{" "}
                      {lastRun.provider === "meta" ? "Meta" : "Local"} ·{" "}
                      {lastRun.seconds}s
                      {lastRun.usage?.totalTokens
                        ? ` · ${lastRun.usage.totalTokens.toLocaleString()} tokens`
                        : ""}
                    </p>
                  )}
                  {lastRun?.context && (
                    <details className="model-context">
                      <summary>
                        Model context · {lastRun.context.inventorySummaries}/
                        {lastRun.context.totalInventoryRecords} stash records
                      </summary>
                      <p>
                        {lastRun.context.detailedItems.length} items with
                        detailed evidence · {lastRun.context.projectSummaries}/
                        {lastRun.context.totalProjectRecords} project summaries
                        ·{" "}
                        {lastRun.context.photoAttached
                          ? "one photo attached"
                          : "no photo attached"}
                        .
                      </p>
                      <p>
                        Detailed items:{" "}
                        {lastRun.context.detailedItems
                          .map((i) => i.name)
                          .join(", ") || "None"}
                        . Other included records have summaries. Select an item
                        or name it in your question to prioritize its details.
                      </p>
                    </details>
                  )}
                  <label className="context-select">
                    Response mode
                    <select
                      aria-label="Response mode"
                      value={responseMode}
                      disabled={busy || !!activeConversation?.legacy}
                      onChange={(e) =>
                        setResponseMode(e.target.value as "quick" | "balanced")
                      }
                    >
                      <option value="balanced">
                        Balanced · light reasoning
                      </option>
                      <option value="quick">
                        Quick reply · less reasoning
                      </option>
                    </select>
                  </label>
                  <label className="context-select">
                    <Tag size={14} />
                    <select
                      aria-label="Attach an inventory item to the conversation"
                      disabled={busy || !!activeConversation?.legacy}
                      value={selected || ""}
                      onChange={(e) => {
                        setSelected(e.target.value || null);
                        setBoardPhoto(null);
                      }}
                    >
                      <option value="">Context: entire stash</option>
                      {state.items.map((i) => (
                        <option key={i.id} value={i.id}>
                          {i.name}
                          {i.photo ? " · photo attached" : ""}
                        </option>
                      ))}
                    </select>
                  </label>
                </details>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void ask();
                  }}
                >
                  <textarea
                    aria-label="Message BenchMate"
                    placeholder={
                      models.connected
                        ? "Ask about a part or your next build…"
                        : "Connect a model provider to chat…"
                    }
                    value={message}
                    disabled={!!activeConversation?.legacy}
                    maxLength={6000}
                    onChange={(e) => setMessage(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        void ask();
                      }
                    }}
                  />
                  <div className="composer-actions">
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Add a find with a photo"
                      disabled={
                        busy || uploading || !!activeConversation?.legacy
                      }
                      onClick={() => chatPhotoInput.current?.click()}
                    >
                      <Camera size={18} />
                    </button>
                    <input
                      ref={chatPhotoInput}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        e.target.value = "";
                        void upload(file, true);
                      }}
                    />
                    <button
                      type="button"
                      className="text-button"
                      disabled={
                        busy ||
                        uploading ||
                        !modelReady ||
                        !!activeConversation?.legacy
                      }
                      onClick={() =>
                        void ask(
                          "Help me manage project parts.",
                          "chat",
                          undefined,
                          undefined,
                          "parts",
                        )
                      }
                    >
                      Project parts
                    </button>
                    <span>ASK. CHECK. BUILD.</span>
                    <button
                      type="submit"
                      className="send-button"
                      aria-label="Send message"
                      disabled={
                        busy ||
                        uploading ||
                        boardMapping ||
                        !!activeConversation?.legacy ||
                        !modelReady ||
                        !message.trim()
                      }
                    >
                      <Send size={17} />
                    </button>
                  </div>
                </form>
                <p>
                  Photo cards need your review. Clear parts requests can update
                  reservations; saved changes show a receipt.
                </p>
              </div>
            </aside>
          </div>
          <footer className="workspace-footer">
            <span>BENCHMATE / BUILT FOR SECOND CHANCES</span>
            <span>YOUR STASH. YOUR MACHINE.</span>
          </footer>
        </div>
      </div>
      {item && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="item-title"
          >
            <div className="record-header">
              <div className="modal-heading">
                <div>
                  <p className="eyebrow">SALVAGE RECORD</p>
                  <h2 id="item-title">
                    {item.photoReview
                      ? "Review proposed details."
                      : item.id
                        ? "A closer look."
                        : "Give your find a home."}
                  </h2>
                </div>
                <button
                  className="icon-button"
                  aria-label="Close part editor"
                  disabled={saving || uploading || identifying}
                  onClick={() => setItem(null)}
                >
                  <X />
                </button>
              </div>
              {identifying && (
                <div className="inline-identifying" role="status">
                  <LoaderCircle size={16} className="spin" />
                  <span>
                    {phase === "thinking"
                      ? "Examining the evidence"
                      : phase === "answering"
                        ? "Preparing the form"
                        : "Loading model / reading evidence"}
                    … {elapsed}s
                  </span>
                  <button
                    className="secondary small"
                    onClick={() => abortRef.current?.abort()}
                  >
                    Stop
                  </button>
                </div>
              )}
              <div
                className="record-tabs"
                role="tablist"
                aria-label="Record sections"
                onKeyDown={(e) => {
                  const buttons = Array.from(
                    e.currentTarget.querySelectorAll<HTMLButtonElement>(
                      "button:not(:disabled)",
                    ),
                  );
                  const index = buttons.indexOf(e.target as HTMLButtonElement);
                  const next =
                    e.key === "ArrowRight"
                      ? (index + 1) % buttons.length
                      : e.key === "ArrowLeft"
                        ? (index + buttons.length - 1) % buttons.length
                        : e.key === "Home"
                          ? 0
                          : e.key === "End"
                            ? buttons.length - 1
                            : -1;
                  if (next >= 0) {
                    e.preventDefault();
                    buttons[next]?.click();
                    buttons[next]?.focus();
                  }
                }}
              >
                {[
                  "Details",
                  ...(item.kind === "donor" ? ["Salvage map"] : []),
                  "Specs & sources",
                  "History",
                ].map((name) => (
                  <button
                    key={name}
                    id={`record-tab-${name.replace(/\W/g, "")}`}
                    type="button"
                    role="tab"
                    tabIndex={recordTab === name ? 0 : -1}
                    aria-selected={recordTab === name}
                    aria-controls={`record-panel-${name.replace(/\W/g, "")}`}
                    disabled={identifying || saving || uploading}
                    onClick={() => setRecordTab(name)}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
            <form
              onSubmit={saveItem}
              onInvalidCapture={(e) => {
                const target = e.target as HTMLElement;
                const panel = target.closest<HTMLElement>("[data-record-tab]");
                if (panel?.hidden) {
                  e.preventDefault();
                  setRecordTab(panel.dataset.recordTab!);
                  requestAnimationFrame(() => target.focus());
                }
              }}
            >
              <fieldset className="item-fields" disabled={identifying}>
                <div className="modal-body">
                  <div
                    hidden={recordTab !== "Details"}
                    data-record-tab="Details"
                    role="tabpanel"
                    id="record-panel-Details"
                    aria-labelledby="record-tab-Details"
                  >
                    {item.reviewPending && (
                      <p className="inline-note">
                        Identification ready to review. Check the details, then
                        save to update this record’s identification status.
                        Working condition is tracked separately.
                      </p>
                    )}
                    {item.id && item.kind !== "tool" && (
                      <section
                        className="item-projects"
                        aria-label="Project allocations"
                      >
                        <div className="source-heading">
                          <h3>Project allocations</h3>
                          <button
                            type="button"
                            className="secondary small"
                            disabled={
                              saving ||
                              uploading ||
                              busy ||
                              itemDirty ||
                              !savedItem?.available ||
                              Boolean(item.dismantledAt) ||
                              ["damaged", "consumed"].includes(
                                item.condition,
                              ) ||
                              !state.projects.length
                            }
                            onClick={() => {
                              setAllocation({
                                itemId: item.id!,
                                projectId: state.projects[0]?.id || "",
                                quantity: 1,
                              });
                              setItem(null);
                            }}
                          >
                            Reserve for project
                          </button>
                        </div>
                        <p className="quiet-note">
                          {savedItem?.available || 0} free / {item.quantity}{" "}
                          total. Reservations track where parts are set aside;
                          they do not confirm identity, condition, or
                          compatibility.
                        </p>
                        {!state.projects.length && (
                          <p className="quiet-note">
                            Create a project first to set parts aside.
                          </p>
                        )}
                        {itemDirty && (
                          <p className="quiet-note">
                            Save your edits before reserving or returning parts.
                          </p>
                        )}
                        {state.allocations
                          .filter(
                            (a) =>
                              a.itemId === item.id && a.state !== "returned",
                          )
                          .map((a) => (
                            <div className="allocation-row" key={a.id}>
                              <div>
                                <strong>
                                  {state.projects.find(
                                    (p) => p.id === a.projectId,
                                  )?.name || "Project"}
                                </strong>
                                <small>
                                  {a.quantity} units · {a.state}
                                </small>
                              </div>
                              <button
                                type="button"
                                className="text-button"
                                disabled={saving || itemDirty}
                                onClick={() =>
                                  void perform(async () => {
                                    await api(
                                      `/allocations/${a.id}`,
                                      { state: "returned" },
                                      "PATCH",
                                    );
                                    await refresh();
                                    setItemHistory(
                                      await api<Snapshot["events"]>(
                                        `/items/${item.id}/history`,
                                      ),
                                    );
                                  })
                                }
                              >
                                Return to stash
                              </button>
                            </div>
                          ))}
                      </section>
                    )}
                    {item.dismantledAt && (
                      <p className="inline-note">
                        Dismantled donor · unavailable as an intact device.
                        Remaining assemblies are tracked in Salvage map.
                      </p>
                    )}
                    {item.recoveredFrom && (
                      <div className="review-proposal">
                        <strong>
                          Recovered from {item.recoveredFrom.donorName}
                        </strong>
                        <p>
                          {new Date(item.recoveredFrom.at).toLocaleString()} ·
                          starts untested and unresolved.
                        </p>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            openLinkedItem(item.recoveredFrom!.donorId)
                          }
                        >
                          Open donor record →
                        </button>
                      </div>
                    )}
                    <label className="photo-upload">
                      {item.photo ? (
                        <BenchPhoto
                          src={`/api/photos/${item.photo}`}
                          alt="Part preview"
                        />
                      ) : (
                        <>
                          <Camera size={30} />
                          <strong>A photo is a good start.</strong>
                          <span>Choose a photo · JPEG, PNG, WebP</span>
                        </>
                      )}
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp"
                        aria-label="Upload part photo"
                        disabled={uploading}
                        onChange={(e) => void upload(e.target.files?.[0])}
                      />
                      {uploading && (
                        <span className="upload-status">Saving photo…</span>
                      )}
                    </label>
                    <p className="quiet-note">
                      Photos are resized on your device and stored on this PC.{" "}
                      {models.provider === "meta" &&
                        "Identify sends this photo and limited stash context to Meta."}
                    </p>
                    <div className="form-grid">
                      <label className="wide">
                        Name / working label
                        <input
                          autoFocus
                          required
                          maxLength={160}
                          value={item.name}
                          onChange={(e) =>
                            setItem({ ...item, name: e.target.value })
                          }
                          placeholder="Mystery motor, blue controller board…"
                        />
                      </label>
                      <label>
                        Record type
                        <select
                          value={item.kind}
                          onChange={(e) =>
                            setItem({
                              ...item,
                              kind: e.target.value as Item["kind"],
                            })
                          }
                        >
                          <option value="part">Recovered / loose part</option>
                          <option value="donor">Donor device</option>
                          <option value="tool">Tool / equipment</option>
                        </select>
                      </label>
                      <label>
                        Total quantity
                        <input
                          type="number"
                          min={1}
                          max={100000}
                          required
                          value={item.quantity}
                          onChange={(e) =>
                            setItem({
                              ...item,
                              quantity: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                      <label>
                        Condition
                        <select
                          value={item.condition}
                          onChange={(e) =>
                            setItem({
                              ...item,
                              condition: e.target.value as Item["condition"],
                            })
                          }
                        >
                          <option value="untested">Untested</option>
                          <option value="working">
                            Working (user reported)
                          </option>
                          <option value="damaged">Damaged / unavailable</option>
                          <option value="consumed">
                            Consumed / unavailable
                          </option>
                        </select>
                      </label>
                      <label>
                        Physical location
                        <input
                          value={item.location}
                          onChange={(e) =>
                            setItem({ ...item, location: e.target.value })
                          }
                          placeholder="Drawer A / bin 03"
                        />
                      </label>
                      <label className="wide">
                        Visible markings / label transcription
                        <textarea
                          value={item.markings}
                          onChange={(e) =>
                            setItem({ ...item, markings: e.target.value })
                          }
                          placeholder="Copy visible text, numbers, units, and qualifiers exactly. Label claims are not tested specifications."
                        />
                      </label>
                      <label className="wide">
                        Source, donor, and notes
                        <textarea
                          value={item.notes}
                          onChange={(e) =>
                            setItem({ ...item, notes: e.target.value })
                          }
                          placeholder="Where it came from, what you observed, what remains unknown…"
                        />
                      </label>
                      <label className="wide">
                        Identity evidence (optional)
                        <textarea
                          value={item.evidence}
                          onChange={(e) =>
                            setItem({ ...item, evidence: e.target.value })
                          }
                          placeholder="Markings matched to a source, packaging, or your own confirmation…"
                        />
                      </label>
                    </div>
                    <label className="confirm-box">
                      <input
                        type="checkbox"
                        checked={item.identity === "confirmed"}
                        onChange={(e) =>
                          setItem({
                            ...item,
                            identity: e.target.checked
                              ? "confirmed"
                              : "unresolved",
                          })
                        }
                      />
                      <span>
                        <strong>
                          I have independently confirmed this identity.
                        </strong>
                        <small>
                          Optional: photo identification is tracked when you
                          save. This does not confirm electrical compatibility
                          or working condition.
                        </small>
                      </span>
                    </label>
                    {item.kind === "donor" && (
                      <p className="inline-note">
                        Use Salvage map to propose assemblies, then record
                        actual recovery. Map one physical donor per record to
                        keep quantities traceable.
                      </p>
                    )}
                  </div>
                  <div
                    hidden={recordTab !== "Specs & sources"}
                    data-record-tab="Specs & sources"
                    role="tabpanel"
                    id="record-panel-Specssources"
                    aria-labelledby="record-tab-Specssources"
                  >
                    {item.photoReview && (
                      <div className="review-proposal">
                        <p className="eyebrow">
                          PHOTO OBSERVATION / {item.photoReview.model}
                        </p>
                        <h3>
                          {item.reviewPending
                            ? "Review before saving."
                            : "Saved photo-review provenance"}
                        </h3>
                        <p>
                          Suggested identity:{" "}
                          {item.photoReview.candidateName || "Unresolved"}
                        </p>
                        <p>
                          Proposed label text:{" "}
                          <span className="mono">
                            {item.photoReview.markings ||
                              `Not transcribed (${item.photoReview.markingsStatus})`}
                          </span>
                        </p>
                        <p>{item.photoReview.evidence}</p>
                        <p>
                          Uncertainty:{" "}
                          {item.photoReview.uncertainty ||
                            "Check against the original photo."}
                        </p>
                        {item.reviewPending && (
                          <>
                            <p>
                              Markings before identification:{" "}
                              {reviewPrevious || "None entered"}
                            </p>
                            <p>
                              Correct the editable fields in Details, then save.
                              Printed ratings remain label claims; identity and
                              working condition are separate.
                            </p>
                            {item.photoReview.candidateName && (
                              <button
                                type="button"
                                className="secondary small"
                                onClick={() =>
                                  setItem({
                                    ...item,
                                    name: item.photoReview!.candidateName,
                                    identity: "unresolved",
                                  })
                                }
                              >
                                Use suggested name (requires identity review)
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    {item.recoveredFrom && (
                      <div className="review-proposal">
                        <h3>Inherited salvage claims</h3>
                        <p>
                          Evidence status: {item.recoveredFrom.evidenceStatus}
                        </p>
                        <p>
                          {item.recoveredFrom.specs ||
                            "Specifications unknown."}
                        </p>
                        <p>
                          Checks:{" "}
                          {item.recoveredFrom.unknowns ||
                            "Inspect, identify and test before use."}
                        </p>
                        <p>
                          These came from the donor map and are not
                          independently verified.
                        </p>
                      </div>
                    )}
                    <div className="source-heading">
                      <h3>Documentation</h3>
                      <button
                        className="text-button"
                        type="button"
                        onClick={() =>
                          setItem({
                            ...item,
                            sources: [
                              ...item.sources,
                              { title: "", url: "", section: "", excerpt: "" },
                            ],
                          })
                        }
                      >
                        <Plus size={14} /> Add source
                      </button>
                    </div>
                    <p className="quiet-note">
                      Attach a source and paste the relevant excerpt. BenchMate
                      has not fetched or verified the URL.
                    </p>
                    {item.sources.map((s, index) => (
                      <div className="source-form" key={index}>
                        <button
                          className="icon-button source-remove"
                          type="button"
                          aria-label={`Remove source ${index + 1}`}
                          onClick={() =>
                            setItem({
                              ...item,
                              sources: item.sources.filter(
                                (_, n) => n !== index,
                              ),
                            })
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                        {(["title", "url", "section", "excerpt"] as const).map(
                          (key) => (
                            <label key={key}>
                              {
                                {
                                  title: "Document title",
                                  url: "Source URL",
                                  section: "Page / section",
                                  excerpt: "Relevant excerpt",
                                }[key]
                              }
                              {key === "excerpt" ? (
                                <textarea
                                  value={s[key]}
                                  onChange={(e) =>
                                    setItem({
                                      ...item,
                                      sources: item.sources.map((v, n) =>
                                        n === index
                                          ? { ...v, [key]: e.target.value }
                                          : v,
                                      ),
                                    })
                                  }
                                />
                              ) : (
                                <input
                                  type={key === "url" ? "url" : "text"}
                                  required={key === "url" || key === "title"}
                                  value={s[key]}
                                  onChange={(e) =>
                                    setItem({
                                      ...item,
                                      sources: item.sources.map((v, n) =>
                                        n === index
                                          ? { ...v, [key]: e.target.value }
                                          : v,
                                      ),
                                    })
                                  }
                                />
                              )}
                            </label>
                          ),
                        )}
                      </div>
                    ))}
                  </div>
                  {item.kind === "donor" && (
                    <div
                      hidden={recordTab !== "Salvage map"}
                      data-record-tab="Salvage map"
                      role="tabpanel"
                      id="record-panel-Salvagemap"
                      aria-labelledby="record-tab-Salvagemap"
                    >
                      {item.quantity !== 1 ? (
                        <p className="inline-note">
                          Split this batch into individual donor records before
                          mapping salvage. Each map describes one physical
                          device.
                        </p>
                      ) : (
                        <SalvageEditor
                          rows={item.salvage || []}
                          recoveries={item.recoveries || []}
                          review={item.salvageReview}
                          saved={Boolean(item.id)}
                          dirty={itemDirty}
                          canMap={
                            modelReady &&
                            !busy &&
                            !saving &&
                            !uploading &&
                            (item.salvage?.length || 0) <= 18
                          }
                          canRecover={
                            Boolean(item.id) && !saving && !busy && !uploading
                          }
                          onChange={(salvage) => setItem({ ...item, salvage })}
                          onMap={() => void mapSalvage()}
                          onRecover={(...args) => void recoverAssembly(...args)}
                          onOpen={openLinkedItem}
                        />
                      )}
                      {models.provider === "meta" && (
                        <p className="quiet-note">
                          Map salvage uses Meta hosted API when selected and
                          sends this donor photo and limited context. Choose
                          Local Ollama for local testing.
                        </p>
                      )}
                    </div>
                  )}
                  <div
                    hidden={recordTab !== "History"}
                    role="tabpanel"
                    id="record-panel-History"
                    aria-labelledby="record-tab-History"
                  >
                    <h3>The trail so far.</h3>
                    <p className="quiet-note">
                      Saved actions for this record. Potential assemblies are
                      not stock, and recovery does not confirm identity or
                      working condition.
                    </p>
                    {!itemHistory.length && <p>No saved history yet.</p>}
                    {itemHistory.map((event) => (
                      <div className="record-event" key={event.id}>
                        <strong>
                          {event.type.replaceAll(".", " ")}
                          {event.quantity ? ` · ${event.quantity} units` : ""}
                        </strong>
                        <span>{event.name}</span>
                        <time>{new Date(event.at).toLocaleString()}</time>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="modal-footer">
                  {item.id &&
                    state.allocations.some(
                      (a) => a.itemId === item.id && a.state !== "returned",
                    ) && (
                      <p className="removal-help">
                        Return this item’s reserved or installed parts from
                        their projects before removing it.
                      </p>
                    )}
                  {item.id && (
                    <button
                      type="button"
                      className="secondary danger"
                      disabled={
                        saving ||
                        uploading ||
                        state.allocations.some(
                          (a) => a.itemId === item.id && a.state !== "returned",
                        )
                      }
                      title={
                        state.allocations.some(
                          (a) => a.itemId === item.id && a.state !== "returned",
                        )
                          ? "Return reserved or installed parts from their projects first."
                          : "Moves this record to Removed. Restore it anytime."
                      }
                      onClick={() => void removeItem(item.id!, item.name)}
                    >
                      <Trash2 size={15} /> Remove from stash
                    </button>
                  )}
                  <button
                    type="button"
                    className="secondary"
                    disabled={
                      busy || saving || uploading || !modelReady || !item.photo
                    }
                    onClick={() => void identifyItem()}
                    title={
                      !item.photo
                        ? "Add a photo first."
                        : "Propose identity and label text in this form."
                    }
                  >
                    <Search size={16} /> Identify
                  </button>
                  <button className="primary" disabled={saving || uploading}>
                    {saving ? (
                      <LoaderCircle size={16} className="spin" />
                    ) : (
                      <Check size={16} />
                    )}{" "}
                    {item.reviewPending
                      ? "Save identification"
                      : item.id
                        ? "Save record"
                        : "Add to stash"}
                  </button>
                </div>
              </fieldset>
            </form>
          </section>
        </div>
      )}
      {project && (
        <div className="modal-backdrop">
          <section
            className="modal narrow"
            role="dialog"
            aria-modal="true"
            aria-labelledby="project-title"
          >
            <div className="modal-heading">
              <h2 id="project-title">
                {project.id ? "Project notes" : "Start something."}
              </h2>
              <button
                className="icon-button"
                aria-label="Close project editor"
                disabled={saving}
                onClick={() => setProject(null)}
              >
                <X />
              </button>
            </div>
            <form onSubmit={saveProject}>
              <div className="modal-body form-grid">
                <label className="wide">
                  Project name
                  <input
                    autoFocus
                    required
                    maxLength={160}
                    value={project.name}
                    onChange={(e) =>
                      setProject({ ...project, name: e.target.value })
                    }
                  />
                </label>
                <label className="wide">
                  What are you building?
                  <textarea
                    value={project.goal}
                    onChange={(e) =>
                      setProject({ ...project, goal: e.target.value })
                    }
                  />
                </label>
                <label className="wide">
                  Status
                  <select
                    value={project.status}
                    onChange={(e) =>
                      setProject({
                        ...project,
                        status: e.target.value as Project["status"],
                      })
                    }
                  >
                    {["planning", "building", "paused", "complete"].map((s) => (
                      <option key={s}>{s}</option>
                    ))}
                  </select>
                </label>
                <label className="wide">
                  Next action
                  <input
                    value={project.nextAction}
                    onChange={(e) =>
                      setProject({ ...project, nextAction: e.target.value })
                    }
                  />
                </label>
                <label className="wide">
                  Progress / user-reported tests
                  <textarea
                    value={project.notes}
                    onChange={(e) =>
                      setProject({ ...project, notes: e.target.value })
                    }
                    placeholder="What is connected, what you tested, and what remains unresolved…"
                  />
                </label>
              </div>
              <div className="modal-footer">
                <button className="primary" disabled={saving}>
                  <Check size={16} />{" "}
                  {project.id ? "Save project" : "Create project"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {allocation && (
        <div className="modal-backdrop">
          <section
            className="modal narrow"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reserve-title"
          >
            <div className="modal-heading">
              <h2 id="reserve-title">Set parts aside.</h2>
              <button
                className="icon-button"
                aria-label="Close reservation"
                disabled={saving}
                onClick={() => setAllocation(null)}
              >
                <X />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void perform(async () => {
                  await api("/allocations", allocation);
                  await refresh();
                  setAllocation(null);
                });
              }}
            >
              <div className="modal-body">
                <label>
                  Available part
                  <select
                    required
                    value={allocation.itemId}
                    onChange={(e) =>
                      setAllocation({ ...allocation, itemId: e.target.value })
                    }
                  >
                    <option value="">Choose a part</option>
                    {state.items
                      .filter(
                        (i) =>
                          i.kind !== "tool" &&
                          i.available > 0 &&
                          !["damaged", "consumed"].includes(i.condition),
                      )
                      .map((i) => (
                        <option value={i.id} key={i.id}>
                          {i.name} · {i.available} free
                          {` · ${identityStatus(i).label}`} · {i.condition}
                        </option>
                      ))}
                  </select>
                </label>
                <label>
                  Project
                  <select
                    required
                    value={allocation.projectId}
                    onChange={(e) =>
                      setAllocation({
                        ...allocation,
                        projectId: e.target.value,
                      })
                    }
                  >
                    <option value="">Choose a project</option>
                    {state.projects.map((p) => (
                      <option value={p.id} key={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Quantity
                  <input
                    type="number"
                    required
                    min={1}
                    max={
                      state.items.find((i) => i.id === allocation.itemId)
                        ?.available || 1
                    }
                    value={allocation.quantity}
                    onChange={(e) =>
                      setAllocation({
                        ...allocation,
                        quantity: Number(e.target.value),
                      })
                    }
                  />
                </label>
                <p className="quiet-note">
                  Reservation removes these units from available stock. It does
                  not verify identity, working condition, or compatibility.
                  Unresolved and untested parts can be set aside for planning.
                </p>
              </div>
              <div className="modal-footer">
                <button
                  className="primary"
                  disabled={
                    saving || !allocation.itemId || !allocation.projectId
                  }
                >
                  Reserve parts <ArrowRight size={16} />
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {info && (
        <div className="modal-backdrop">
          <section
            className="modal narrow"
            role="dialog"
            aria-modal="true"
            aria-labelledby="settings-title"
          >
            <div className="modal-heading">
              <h2 id="settings-title">Your local bench.</h2>
              <button
                className="icon-button"
                aria-label="Close settings"
                onClick={() => setInfo(false)}
              >
                <X />
              </button>
            </div>
            <div className="modal-body settings-body">
              <h3>Phone access</h3>
              <p>
                Connect to the same home network and open the Phone URL printed
                in the PC terminal. Enter the pairing code there. Localhost
                works on the PC only.
              </p>
              <h3>Model provider</h3>
              <p>
                Meta reads MODEL_API_KEY (or META_API_KEY) from the backend .env
                at startup. Restart BenchMate after changing it. The key is
                never sent to the browser.
              </p>
              <p>
                {models.error ||
                  `Selected: ${models.provider === "meta" ? "Meta hosted" : "Local Ollama"} / ${models.selected}`}
              </p>
              <p>
                Choose a provider and model from the sidebar. Photo review
                requires a vision-capable model. Local Ollama uses an 8K
                context; both providers receive limited inventory context and at
                most one selected image per request. Provider switching is
                explicit and saved; failures do not trigger automatic cloud
                fallback.
              </p>
              <h3>Your records</h3>
              <p>
                SQLite inventory and photos live in the project’s data folder.
                Back up that whole folder while BenchMate is stopped. JSON
                export contains records and photo filenames, not the image
                files.
              </p>
              <button className="secondary" onClick={exportData}>
                <ArrowDownToLine size={16} /> Export records as JSON
              </button>
              <h3>Scaffold boundaries</h3>
              <p>
                Manual documentation excerpts are supported. Automatic datasheet
                retrieval, verified wiring plans, donor teardown tracking, and
                installable app support are not implemented yet.
              </p>
            </div>
          </section>
        </div>
      )}
      {undoRemoved && (
        <div className="undo-banner" role="status">
          <span>Removed “{undoRemoved.name}” from stash.</span>
          <button
            className="text-button"
            disabled={saving}
            onClick={() => void restoreItem(undoRemoved.id)}
          >
            Undo
          </button>
          <button
            className="icon-button"
            aria-label="Dismiss removal notice"
            onClick={() => setUndoRemoved(null)}
          >
            <X size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
