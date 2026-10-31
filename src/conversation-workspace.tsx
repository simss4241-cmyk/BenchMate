import { BenchPhoto } from "./bench-photo";
import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, Hammer, MessageSquare, Plus, Sparkles } from "lucide-react";
import "./conversation-workspace.css";
import { ChatMarkdown } from "./chat-markdown";

export type Conversation = {
  id: string;
  title: string;
  projectId: string | null;
  legacy: boolean;
  createdAt: string;
  updatedAt: string;
  messageCount: number;
  preview: string;
};
export type ChatMessage = {
  id: string;
  role: string;
  content: string;
  conversationId?: string;
  actionId?: string;
  photo?: string;
};
type ProjectSummary = {
  id: string;
  name: string;
  goal: string;
  nextAction: string;
};
export type ConversationDraft = {
  message: string;
  selected: string | null;
  boardPhoto: { photo: string; label: string } | null;
};
export const blankConversationDraft: ConversationDraft = {
  message: "",
  selected: null,
  boardPhoto: null,
};
export function readDraft(id: string | null): ConversationDraft {
  try {
    const value = JSON.parse(
      localStorage.getItem(`benchmate.chat.draft.v1.${id || "new"}`) || "null",
    );
    return value && typeof value.message === "string"
      ? { ...blankConversationDraft, ...value }
      : { ...blankConversationDraft };
  } catch {
    return { ...blankConversationDraft };
  }
}
export function writeDraft(id: string | null, draft: ConversationDraft) {
  try {
    localStorage.setItem(
      `benchmate.chat.draft.v1.${id || "new"}`,
      JSON.stringify(draft),
    );
  } catch {
    /* The current draft remains usable if browser storage is full. */
  }
}
export function savedConversationId() {
  try {
    return localStorage.getItem("benchmate.chat.active.v1");
  } catch {
    return null;
  }
}

export function ConversationHub({
  conversations,
  projects,
  activeId,
  busy,
  onOpen,
  onNew,
  onNewProject,
  onProject,
}: {
  conversations: Conversation[];
  projects: ProjectSummary[];
  activeId: string | null;
  busy: boolean;
  onOpen: (id: string) => void;
  onNew: () => void;
  onNewProject: () => void;
  onProject: (id: string) => void;
}) {
  return (
    <section className="conversation-hub" aria-label="Conversation hub">
      <p className="eyebrow">A PLACE FOR EACH POSSIBILITY</p>
      <h2>Build Ideas</h2>
      <p className="hub-intro">Set up a project, or explore an idea first.</p>
      <button className="primary" disabled={busy} onClick={onNewProject}>
        <Plus size={16} /> New project
      </button>
      <h3>
        <Hammer size={14} /> Project conversations
      </h3>
      {projects.map((p) => {
        const chat = conversations.find((c) => c.projectId === p.id);
        return (
          <button
            key={p.id}
            className={`hub-chat ${chat?.id === activeId ? "active" : ""}`}
            disabled={busy}
            onClick={() => (chat ? onOpen(chat.id) : onProject(p.id))}
          >
            <Hammer size={16} />
            <span>
              <strong>{p.name}</strong>
              <small>
                {chat?.preview || p.goal || "Plan the next step together."}
              </small>
              <time>
                {chat ? `${chat.messageCount} messages` : "Start project chat"}
              </time>
            </span>
          </button>
        );
      })}
      {!projects.length && (
        <p className="hub-empty">
          Project chats appear here. Turn an exploration into a project, or open
          a chat from Projects.
        </p>
      )}
      <h3>
        <Sparkles size={14} /> Explorations
      </h3>
      <button
        className="secondary hub-new-exploration"
        disabled={busy}
        onClick={onNew}
      >
        <Plus size={14} /> New exploration
      </button>
      {conversations
        .filter((c) => !c.projectId && !c.legacy)
        .map((c) => (
          <button
            key={c.id}
            className={`hub-chat ${c.id === activeId ? "active" : ""}`}
            disabled={busy}
            onClick={() => onOpen(c.id)}
          >
            <MessageSquare size={16} />
            <span>
              <strong>{c.title}</strong>
              <small>{c.preview || "A fresh space to think."}</small>
              <time>
                {c.messageCount} messages ·{" "}
                {new Date(c.updatedAt).toLocaleDateString()}
              </time>
            </span>
          </button>
        ))}
      {!conversations.some((c) => !c.projectId && !c.legacy) && (
        <p className="hub-empty">Your next idea starts with a conversation.</p>
      )}
      {conversations
        .filter((c) => c.legacy)
        .map((c) => (
          <button
            key={c.id}
            className={`hub-history ${c.id === activeId ? "active" : ""}`}
            disabled={busy}
            onClick={() => onOpen(c.id)}
          >
            Earlier bench history{" "}
            <small>Read-only · {c.messageCount} messages</small>
          </button>
        ))}
      {busy && (
        <p className="hub-empty">
          Finish or stop the active request before switching conversations.
        </p>
      )}
    </section>
  );
}

export function ConversationActions({
  conversation,
  projects,
  busy,
  onRename,
  onLink,
  onPromote,
}: {
  conversation: Conversation | undefined;
  projects: ProjectSummary[];
  busy: boolean;
  onRename: (title: string) => void;
  onLink: (projectId: string) => void;
  onPromote: () => void;
}) {
  const [renaming, setRenaming] = useState(false),
    [title, setTitle] = useState("");
  const [linking, setLinking] = useState(false);
  if (!conversation || conversation.legacy) return null;
  return (
    <div className="conversation-actions">
      {renaming ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (title.trim()) {
              onRename(title.trim());
              setRenaming(false);
            }
          }}
        >
          <input
            aria-label="Conversation title"
            maxLength={160}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
          <button className="secondary" disabled={busy || !title.trim()}>
            Save name
          </button>
          <button
            type="button"
            className="text-button"
            onClick={() => setRenaming(false)}
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          className="text-button"
          disabled={busy}
          onClick={() => {
            setTitle(conversation.title);
            setRenaming(true);
          }}
        >
          Rename
        </button>
      )}
      {!conversation.projectId && (
        <>
          <button
            className="secondary small"
            disabled={busy}
            onClick={onPromote}
          >
            <Hammer size={14} /> Make this a project
          </button>
          {!!projects.length && (
            <button
              className="text-button"
              disabled={busy}
              onClick={() => setLinking(!linking)}
            >
              Link existing project
            </button>
          )}
          {linking && (
            <label>
              Move this conversation into a project
              <select
                aria-label="Link conversation to project"
                value=""
                disabled={busy}
                onChange={(e) => {
                  if (e.target.value) {
                    onLink(e.target.value);
                    setLinking(false);
                  }
                }}
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
        </>
      )}
    </div>
  );
}

export function ConversationFeed({
  conversationId,
  messages,
  busy,
  pendingText,
  liveAnswer,
  phase,
  elapsed,
  project,
  legacy,
  layout,
  onStop,
  renderAction,
  onPreparePhoto,
  photoActionDisabled,
}: {
  conversationId: string | null;
  messages: ChatMessage[];
  busy: boolean;
  pendingText: string;
  liveAnswer: string;
  phase: string;
  elapsed: number;
  project?: ProjectSummary;
  legacy?: boolean;
  layout: string;
  onStop: () => void;
  renderAction?: (id: string) => React.ReactNode;
  onPreparePhoto?: (photo: string) => void;
  photoActionDisabled?: boolean;
}) {
  const feed = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const savedTop = useRef(0);
  const [newReply, setNewReply] = useState(false);
  const previous = useRef({ count: messages.length, liveAnswer });
  const key = `benchmate.chat.scroll.v1.${conversationId || "new"}`;
  useLayoutEffect(() => {
    const element = feed.current;
    if (!element) return;
    try {
      const saved = JSON.parse(localStorage.getItem(key) || "null");
      follow.current = saved?.follow !== false;
      element.scrollTop = follow.current
        ? element.scrollHeight
        : Math.max(0, Number(saved?.top) || 0);
      savedTop.current = element.scrollTop;
    } catch {
      element.scrollTop = element.scrollHeight;
    }
    const persist = () => {
      try {
        localStorage.setItem(
          key,
          JSON.stringify({ top: savedTop.current, follow: follow.current }),
        );
      } catch {}
    };
    window.addEventListener("pagehide", persist);
    return () => {
      persist();
      window.removeEventListener("pagehide", persist);
    };
  }, [key]);
  useLayoutEffect(() => {
    const element = feed.current;
    if (!element) return;
    if (follow.current) {
      element.scrollTop = element.scrollHeight;
      savedTop.current = element.scrollTop;
    } else if (
      messages.length > previous.current.count ||
      liveAnswer !== previous.current.liveAnswer
    )
      setNewReply(true);
    previous.current = { count: messages.length, liveAnswer };
  }, [messages.length, liveAnswer, busy, layout]);
  useEffect(() => {
    const element = feed.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      if (follow.current) element.scrollTop = element.scrollHeight;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return (
    <>
      <div
        className="conversation"
        ref={feed}
        tabIndex={0}
        aria-label="Conversation messages"
        onScroll={() => {
          const element = feed.current!;
          savedTop.current = element.scrollTop;
          follow.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            70;
          if (follow.current) setNewReply(false);
          try {
            localStorage.setItem(
              key,
              JSON.stringify({ top: savedTop.current, follow: follow.current }),
            );
          } catch {}
        }}
      >
        {!messages.length && (
          <div className="assistant-welcome">
            <p className="eyebrow">
              {project
                ? "ONE PROJECT. ONE CONVERSATION."
                : "ROOM FOR A NEW POSSIBILITY."}
            </p>
            <h3>
              {project
                ? `What’s next for ${project.name}?`
                : "What could we build?"}
            </h3>
            <p>
              {project?.goal ||
                "Bring a question, a rough idea, or a few parts. We’ll work through it here."}
            </p>
            {project?.nextAction && (
              <p>
                <strong>Next step:</strong> {project.nextAction}
              </p>
            )}
          </div>
        )}
        {legacy && (
          <p className="conversation-history-note">
            Earlier bench history is preserved here. Start a new exploration or
            open a project chat to continue.
          </p>
        )}
        {messages.map((m) => (
          <div key={m.id} className={`chat-message ${m.role}`}>
            <span className="message-author">
              {m.role === "user" ? "YOU" : "BENCHMATE"}
            </span>
            {!m.actionId &&
              (m.role === "assistant" ? (
                <ChatMarkdown content={m.content} />
              ) : (
                <p>{m.content}</p>
              ))}
            {m.photo && (
              <BenchPhoto
                className="chat-photo"
                src={`/api/photos/${m.photo}`}
                alt="Photo attached to this message"
              />
            )}
            {m.photo && m.role === "user" && !legacy && onPreparePhoto && (
              <button
                className="secondary"
                disabled={photoActionDisabled}
                onClick={() => onPreparePhoto(m.photo!)}
              >
                Prepare Stash card
              </button>
            )}
            {m.actionId && renderAction?.(m.actionId)}
          </div>
        ))}
        {busy && (
          <div className="chat-message user">
            <span className="message-author">YOU</span>
            <p>{pendingText}</p>
          </div>
        )}
        {busy && liveAnswer && (
          <div
            className="chat-message assistant"
            aria-label="Answer in progress"
          >
            <span className="message-author">BENCHMATE · IN PROGRESS</span>
            <ChatMarkdown content={liveAnswer} />
          </div>
        )}
        {busy && (
          <div className="thinking">
            <span role="status">
              {phase === "interpreting"
                ? "Understanding your request"
                : phase === "thinking"
                  ? "Thinking"
                  : phase === "answering"
                    ? "Writing a reply"
                    : "Preparing context"}
              … {elapsed}s
            </span>
            <button onClick={onStop}>Stop</button>
          </div>
        )}
      </div>
      {newReply && (
        <button
          className="conversation-new-reply"
          onClick={() => {
            follow.current = true;
            if (feed.current)
              feed.current.scrollTop = feed.current.scrollHeight;
            setNewReply(false);
          }}
        >
          <ArrowDown size={14} /> New reply ↓
        </button>
      )}
    </>
  );
}
