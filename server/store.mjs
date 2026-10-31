import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";

export function openStore(path) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS projects(id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS boards(id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS allocations(id TEXT PRIMARY KEY, itemId TEXT NOT NULL REFERENCES items(id), projectId TEXT NOT NULL REFERENCES projects(id), quantity INTEGER NOT NULL CHECK(quantity>0), state TEXT NOT NULL CHECK(state IN ('reserved','installed','returned')));
    CREATE TABLE IF NOT EXISTS events(id TEXT PRIMARY KEY, at TEXT NOT NULL, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS messages(id TEXT PRIMARY KEY, at TEXT NOT NULL, role TEXT NOT NULL, content TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS conversations(id TEXT PRIMARY KEY, body TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS chat_actions(id TEXT PRIMARY KEY, body TEXT NOT NULL);`);
  for (const column of ["actionId", "photo"])
    if (
      !db
        .prepare("PRAGMA table_info(messages)")
        .all()
        .some((c) => c.name === column)
    )
      db.exec(`ALTER TABLE messages ADD COLUMN ${column} TEXT`);
  if (
    !db
      .prepare("PRAGMA table_info(messages)")
      .all()
      .some((c) => c.name === "conversationId")
  )
    db.exec("ALTER TABLE messages ADD COLUMN conversationId TEXT");
  db.exec(
    "CREATE INDEX IF NOT EXISTS messages_conversation ON messages(conversationId, at)",
  );
  if (
    db
      .prepare("SELECT id FROM messages WHERE conversationId IS NULL LIMIT 1")
      .get()
  ) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const id = randomUUID(),
        at = new Date().toISOString();
      db.prepare("INSERT INTO conversations VALUES(?,?)").run(
        id,
        JSON.stringify({
          id,
          title: "Earlier bench history",
          projectId: null,
          legacy: true,
          createdAt: at,
          updatedAt: at,
        }),
      );
      db.prepare(
        "UPDATE messages SET conversationId=? WHERE conversationId IS NULL",
      ).run(id);
      db.exec("COMMIT");
    } catch (e) {
      db.exec("ROLLBACK");
      throw e;
    }
  }
  const bodies = (table) =>
    db
      .prepare(`SELECT body FROM ${table}`)
      .all()
      .map((row) => JSON.parse(row.body));
  const event = (type, detail) =>
    db
      .prepare("INSERT INTO events VALUES(?,?,?)")
      .run(
        randomUUID(),
        new Date().toISOString(),
        JSON.stringify({ type, ...detail }),
      );
  let insideTransaction = false;
  const transaction = (fn) => {
    if (insideTransaction) return fn();
    db.exec("BEGIN IMMEDIATE");
    insideTransaction = true;
    try {
      const result = fn();
      db.exec("COMMIT");
      return result;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    } finally {
      insideTransaction = false;
    }
  };
  const available = (id) => {
    const row = db.prepare("SELECT body FROM items WHERE id=?").get(id);
    if (!row) throw new Error("Part not found.");
    const item = JSON.parse(row.body);
    const held = db
      .prepare(
        "SELECT COALESCE(SUM(quantity),0) AS n FROM allocations WHERE itemId=? AND state!='returned'",
      )
      .get(id).n;
    return { item, held, available: item.quantity - held };
  };
  return {
    db,
    conversation(id) {
      const row = db
        .prepare("SELECT body FROM conversations WHERE id=?")
        .get(id);
      if (!row) throw new Error("Conversation not found.");
      return JSON.parse(row.body);
    },
    createConversation({ title = "New exploration", projectId = null } = {}) {
      return transaction(() => {
        if (projectId) {
          const project = db
            .prepare("SELECT body FROM projects WHERE id=?")
            .get(projectId);
          if (!project) throw new Error("Project not found.");
          const existing = bodies("conversations").find(
            (c) => c.projectId === projectId,
          );
          if (existing) return existing;
          title = JSON.parse(project.body).name;
        }
        const id = randomUUID(),
          at = new Date().toISOString();
        const conversation = {
          id,
          title,
          projectId,
          legacy: false,
          createdAt: at,
          updatedAt: at,
        };
        db.prepare("INSERT INTO conversations VALUES(?,?)").run(
          id,
          JSON.stringify(conversation),
        );
        return conversation;
      });
    },
    updateConversation(id, { title, projectId }) {
      return transaction(() => {
        const current = this.conversation(id);
        if (current.legacy)
          throw new Error("Earlier bench history is read-only.");
        if (projectId !== undefined) {
          if (current.projectId && current.projectId !== projectId)
            throw new Error("This conversation already belongs to a project.");
          if (!db.prepare("SELECT id FROM projects WHERE id=?").get(projectId))
            throw new Error("Project not found.");
          if (
            bodies("conversations").some(
              (c) => c.projectId === projectId && c.id !== id,
            )
          )
            throw new Error(
              "That project already has a conversation. Open its chat instead.",
            );
          current.projectId = projectId;
        }
        if (title !== undefined) current.title = title;
        current.updatedAt = new Date().toISOString();
        db.prepare("UPDATE conversations SET body=? WHERE id=?").run(
          JSON.stringify(current),
          id,
        );
        return current;
      });
    },
    exchange(conversationId, question, answer, metadata = {}) {
      return transaction(() => {
        const conversation = this.conversation(conversationId);
        if (conversation.legacy)
          throw new Error(
            "Earlier bench history is read-only. Start an exploration to continue.",
          );
        const at = new Date(
          Math.max(Date.now(), Date.parse(conversation.updatedAt) + 1),
        ).toISOString();
        for (const [role, content] of [
          ["user", question],
          ["assistant", answer],
        ])
          db.prepare(
            "INSERT INTO messages(id,at,role,content,conversationId,actionId,photo) VALUES(?,?,?,?,?,?,?)",
          ).run(
            randomUUID(),
            at,
            role,
            content,
            conversationId,
            role === "assistant" ? metadata.actionId || null : null,
            role === "user" ? metadata.photo || null : null,
          );
        if (!conversation.projectId && conversation.title === "New exploration")
          conversation.title = question.replace(/\s+/g, " ").slice(0, 80);
        conversation.updatedAt = at;
        db.prepare("UPDATE conversations SET body=? WHERE id=?").run(
          JSON.stringify(conversation),
          conversationId,
        );
      });
    },
    chatAction(id) {
      const row = db
        .prepare("SELECT body FROM chat_actions WHERE id=?")
        .get(id);
      return row ? JSON.parse(row.body) : null;
    },
    recordChatAction(action, question, answer, execute = false) {
      return transaction(() => {
        const old = this.chatAction(action.id);
        if (old) {
          if (
            old.fingerprint !== action.fingerprint ||
            old.conversationId !== action.conversationId
          )
            throw new Error("This request ID belongs to another request.");
          return old;
        }
        if (action.replacesActionId) {
          const parent = this.chatAction(action.replacesActionId);
          if (
            !parent ||
            parent.conversationId !== action.conversationId ||
            parent.kind !== "reservation" ||
            parent.status !== "draft"
          )
            throw new Error(
              "This pending action changed. Review the latest action before continuing.",
            );
          parent.status = "cancelled";
          parent.supersededBy = action.id;
          db.prepare("UPDATE chat_actions SET body=? WHERE id=?").run(
            JSON.stringify(parent),
            parent.id,
          );
        }
        const saved = {
          ...action,
          status: action.cancelled ? "cancelled" : "draft",
          createdAt: new Date().toISOString(),
        };
        db.prepare("INSERT INTO chat_actions VALUES(?,?)").run(
          saved.id,
          JSON.stringify(saved),
        );
        const result = execute
          ? this.commitChatAction(saved.id, saved.draft)
          : saved;
        this.exchange(
          action.conversationId,
          question,
          execute ? result.receipt : answer,
          { actionId: action.id, photo: action.photo },
        );
        return result;
      });
    },
    cancelChatAction(id) {
      return transaction(() => {
        const action = this.chatAction(id);
        if (!action) throw new Error("Action not found.");
        if (action.status === "completed")
          throw new Error("This action already completed.");
        action.status = "cancelled";
        db.prepare("UPDATE chat_actions SET body=? WHERE id=?").run(
          JSON.stringify(action),
          id,
        );
        return action;
      });
    },
    commitChatAction(id, fields) {
      return transaction(() => {
        const action = this.chatAction(id);
        if (!action) throw new Error("Action not found.");
        if (action.status === "completed") return action;
        if (action.status !== "draft")
          throw new Error("This action was cancelled.");
        if (this.conversation(action.conversationId).legacy)
          throw new Error("Earlier history is read-only.");
        let receipt, itemId, allocationId;
        if (action.kind === "stash") {
          const item = this.saveItem({
            ...fields,
            photo: action.photo,
            photoReview: action.draft.photoReview,
          });
          itemId = item.id;
          receipt = `Added ${item.quantity} × ${item.name} to Stash. Condition: ${item.condition}.`;
        } else if (action.kind === "stock") {
          itemId = fields.itemId;
          const current = available(itemId);
          if (
            !Number.isInteger(fields.quantity) ||
            fields.quantity < 1 ||
            fields.quantity > 100000 ||
            current.item.quantity + fields.quantity > 100000
          )
            throw new Error(
              "Choose a valid additional quantity; total stock cannot exceed 100000.",
            );
          if (
            fields.expectedUpdatedAt !== current.item.updatedAt ||
            fields.expectedQuantity !== current.item.quantity
          )
            throw new Error(
              "This item changed. Refresh stock and review the addition again.",
            );
          if (
            current.item.removedAt ||
            current.item.dismantledAt ||
            current.item.kind === "donor" ||
            current.item.boardOrigin ||
            current.item.recoveredFrom ||
            current.item.condition !== "untested"
          )
            throw new Error(
              "Use a separate untested Stash card for these units. Donors, Boardroom recoveries and tested batches need their own records.",
            );
          const before = current.item.quantity;
          this.saveItem(
            { ...current.item, quantity: before + fields.quantity },
            itemId,
          );
          event("stock.added", {
            itemId,
            actionId: id,
            quantity: fields.quantity,
            before,
            after: before + fields.quantity,
          });
          receipt = `Added ${fields.quantity} more × ${current.item.name} to existing Stash stock. Total: ${before} → ${before + fields.quantity}. Existing reservations and condition are unchanged.`;
        } else {
          const { operation, quantity, projectId } = fields;
          if (
            !["reserve", "transfer", "return"].includes(operation) ||
            !Number.isInteger(quantity) ||
            quantity < 1
          )
            throw new Error("Choose a valid action and quantity.");
          itemId = fields.itemId;
          const current = available(itemId);
          if (
            current.item.removedAt ||
            current.item.dismantledAt ||
            current.item.kind === "tool" ||
            ["damaged", "consumed"].includes(current.item.condition)
          )
            throw new Error(
              "This item is unavailable for reservation changes.",
            );
          if (
            fields.expectedUpdatedAt &&
            fields.expectedUpdatedAt !== current.item.updatedAt
          )
            throw new Error(
              "This item changed. Review the current item before trying again.",
            );
          const project = projectId
            ? bodies("projects").find((p) => p.id === projectId)
            : null;
          if (operation !== "return" && !project)
            throw new Error("Choose a destination project.");
          if (operation === "reserve") {
            allocationId = this.allocate(itemId, projectId, quantity).id;
            receipt = `Reserved ${quantity} × ${current.item.name} for ${project.name}.`;
          } else {
            const source = db
              .prepare("SELECT * FROM allocations WHERE id=?")
              .get(fields.allocationId);
            if (
              !source ||
              source.itemId !== itemId ||
              source.state !== "reserved"
            )
              throw new Error(
                "Choose a current reservation. Installed parts require a physical recovery record.",
              );
            if (
              fields.expectedQuantity &&
              fields.expectedQuantity !== source.quantity
            )
              throw new Error(
                "This reservation changed. Review the current quantity before trying again.",
              );
            if (quantity > source.quantity)
              throw new Error("Quantity exceeds this reservation.");
            if (operation === "transfer" && source.projectId === projectId)
              throw new Error("Choose a different destination project.");
            if (quantity === source.quantity)
              db.prepare(
                "UPDATE allocations SET state='returned' WHERE id=?",
              ).run(source.id);
            else {
              db.prepare(
                "UPDATE allocations SET quantity=quantity-? WHERE id=?",
              ).run(quantity, source.id);
              db.prepare(
                "INSERT INTO allocations VALUES(?,?,?,?,'returned')",
              ).run(randomUUID(), itemId, source.projectId, quantity);
            }
            if (operation === "transfer") {
              allocationId = this.allocate(itemId, projectId, quantity).id;
              receipt = `Moved ${quantity} × ${current.item.name} from ${bodies("projects").find((p) => p.id === source.projectId)?.name} to ${project.name}.`;
            } else
              receipt = `Returned ${quantity} × ${current.item.name} from ${bodies("projects").find((p) => p.id === source.projectId)?.name} to available stock.`;
            event(
              `parts.${operation === "transfer" ? "transferred" : "returned"}`,
              {
                itemId,
                sourceProjectId: source.projectId,
                projectId,
                quantity,
                actionId: id,
              },
            );
          }
        }
        const completed = {
          ...action,
          status: "completed",
          receipt,
          itemId,
          allocationId,
          completedAt: new Date().toISOString(),
        };
        db.prepare("UPDATE chat_actions SET body=? WHERE id=?").run(
          JSON.stringify(completed),
          id,
        );
        return completed;
      });
    },
    saveBoard(input, id = randomUUID()) {
      return transaction(() => {
        const row = db.prepare("SELECT body FROM boards WHERE id=?").get(id);
        const previous = row ? JSON.parse(row.body) : null;
        if (previous && input.expectedUpdatedAt !== previous.updatedAt)
          throw new Error("This board changed. Reopen it before saving.");
        if (input.linkedItemId) {
          const { item, held } = available(input.linkedItemId);
          if (
            item.removedAt ||
            item.kind === "tool" ||
            item.boardOrigin ||
            item.quantity !== 1 ||
            item.recoveries?.length ||
            held ||
            (item.dismantledAt && !previous?.recoveries?.length)
          )
            throw new Error(
              "Link one active, unallocated board or donor without existing salvage recoveries.",
            );
          if (
            bodies("boards").some(
              (b) => b.id !== id && b.linkedItemId === input.linkedItemId,
            )
          )
            throw new Error("That Stash item already has a board card.");
        }
        const recoveries = previous?.recoveries || [];
        if (recoveries.length && previous.linkedItemId !== input.linkedItemId)
          throw new Error("Keep the source link after recording a recovery.");
        for (const r of recoveries) {
          const old = previous.components.find((c) => c.id === r.componentId);
          const component = input.components.find(
            (c) => c.id === r.componentId,
          );
          const count = recoveries
            .filter((x) => x.componentId === r.componentId)
            .reduce((n, x) => n + x.quantity, 0);
          if (
            !component ||
            component.quantity < count ||
            component.photo !== old.photo
          )
            throw new Error(
              "Keep recovered components, their source photo, and at least their recovered quantity.",
            );
        }
        const { expectedUpdatedAt, ...fields } = input;
        const board = {
          ...fields,
          id,
          recoveries,
          updatedAt: new Date(
            Math.max(Date.now(), (Date.parse(previous?.updatedAt) || 0) + 1),
          ).toISOString(),
        };
        db.prepare(
          "INSERT INTO boards VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
        ).run(id, JSON.stringify(board));
        event(previous ? "board.updated" : "board.added", {
          boardId: id,
          name: board.name,
        });
        return board;
      });
    },
    recoverBoard(
      boardId,
      componentId,
      quantity,
      expectedUpdatedAt,
      location = "",
    ) {
      return transaction(() => {
        const row = db
          .prepare("SELECT body FROM boards WHERE id=?")
          .get(boardId);
        if (!row) throw new Error("Board not found.");
        const board = JSON.parse(row.body);
        if (board.updatedAt !== expectedUpdatedAt)
          throw new Error("This board changed. Reopen it before recovery.");
        const component = board.components.find((c) => c.id === componentId);
        const recovered = board.recoveries
          .filter((r) => r.componentId === componentId)
          .reduce((n, r) => n + r.quantity, 0);
        if (
          !component ||
          !Number.isInteger(quantity) ||
          quantity < 1 ||
          quantity > component.quantity - recovered
        )
          throw new Error(
            "Recovery exceeds the component quantity still on this board.",
          );
        const at = new Date(
          Math.max(Date.now(), Date.parse(board.updatedAt) + 1),
        ).toISOString();
        if (board.linkedItemId) {
          const { item, held } = available(board.linkedItemId);
          if (
            held ||
            item.removedAt ||
            item.recoveries?.length ||
            item.quantity !== 1 ||
            item.kind === "tool" ||
            (item.condition === "consumed" && !item.dismantledAt)
          )
            throw new Error(
              "The linked Stash item cannot be dismantled. Return allocations and check its status first.",
            );
          item.dismantledAt = item.dismantledAt || at;
          item.condition = "consumed";
          item.updatedAt = at;
          db.prepare("UPDATE items SET body=? WHERE id=?").run(
            JSON.stringify(item),
            item.id,
          );
        }
        const id = randomUUID();
        const child = {
          id,
          name: component.name,
          kind: "part",
          quantity,
          identity: "unresolved",
          condition: "untested",
          location,
          markings: component.markings,
          notes: `${component.description}\nUnknowns: ${component.uncertainty}`,
          evidence: component.evidence,
          photo: component.photo,
          sources: component.sources || [],
          updatedAt: at,
          boardOrigin: {
            boardId,
            componentId,
            category: component.category,
            at,
          },
        };
        db.prepare("INSERT INTO items VALUES(?,?)").run(
          id,
          JSON.stringify(child),
        );
        board.recoveries.push({ componentId, itemId: id, quantity, at });
        board.updatedAt = at;
        db.prepare("UPDATE boards SET body=? WHERE id=?").run(
          JSON.stringify(board),
          boardId,
        );
        event("board.recovered", {
          boardId,
          itemId: id,
          quantity,
          name: child.name,
        });
        return child;
      });
    },
    snapshot() {
      return {
        chatActions: bodies("chat_actions"),
        items: bodies("items")
          .filter((item) => !item.removedAt)
          .map((item) => ({
            ...item,
            available: item.dismantledAt ? 0 : available(item.id).available,
          })),
        removedItems: bodies("items")
          .filter((item) => item.removedAt)
          .map((item) => ({ ...item, available: 0 })),
        projects: bodies("projects"),
        boards: bodies("boards"),
        allocations: db.prepare("SELECT * FROM allocations").all(),
        events: db
          .prepare("SELECT * FROM events ORDER BY at DESC LIMIT 30")
          .all()
          .map((e) => ({ ...JSON.parse(e.body), id: e.id, at: e.at })),
        messages: db.prepare("SELECT * FROM messages ORDER BY at, rowid").all(),
        conversations: bodies("conversations")
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .map((c) => ({
            ...c,
            messageCount: db
              .prepare(
                "SELECT COUNT(*) AS n FROM messages WHERE conversationId=?",
              )
              .get(c.id).n,
            preview:
              db
                .prepare(
                  "SELECT content FROM messages WHERE conversationId=? ORDER BY at DESC,rowid DESC LIMIT 1",
                )
                .get(c.id)
                ?.content.slice(0, 160) || "",
          })),
      };
    },
    saveItem(input, id = randomUUID()) {
      return transaction(() => {
        const old = db.prepare("SELECT body FROM items WHERE id=?").get(id);
        if (old) {
          const current = available(id);
          if (current.item.boardOrigin && input.kind !== "part")
            throw new Error("Recovered cache components must remain parts.");
          if (
            bodies("boards").some((b) => b.linkedItemId === id) &&
            (input.quantity !== 1 || input.kind !== current.item.kind)
          )
            throw new Error(
              "A linked Boardroom source must remain one item of the same kind.",
            );
          if (
            current.held &&
            current.item.kind !== input.kind &&
            (current.item.kind === "tool" || input.kind === "tool")
          )
            throw new Error(
              "Return allocated parts before changing between equipment and component stock.",
            );
          if (current.item.removedAt)
            throw new Error("Restore this item before editing it.");
          if (input.quantity < current.held)
            throw new Error(
              "Return allocated parts before reducing quantity below the allocated count.",
            );
          if (current.held && ["damaged", "consumed"].includes(input.condition))
            throw new Error(
              "Return allocated parts before making them unavailable.",
            );
        }
        const previous = old ? JSON.parse(old.body) : {};
        const recoveries = previous.recoveries || [];
        if (
          (input.salvage?.length || recoveries.length) &&
          (input.kind !== "donor" || input.quantity !== 1)
        )
          throw new Error(
            "Salvage maps track one donor device. Use a separate record for each donor.",
          );
        for (const recovery of recoveries) {
          const row = input.salvage?.find((r) => r.id === recovery.rowId);
          const recovered = recoveries
            .filter((r) => r.rowId === recovery.rowId)
            .reduce((n, r) => n + r.quantity, 0);
          if (!row || row.quantity < recovered)
            throw new Error(
              "Keep recovered rows and a quantity at least equal to their recovered total.",
            );
        }
        const item = {
          ...input,
          recoveries,
          dismantledAt: previous.dismantledAt,
          ...(previous.dismantledAt ? { condition: "consumed" } : {}),
          recoveredFrom: previous.recoveredFrom,
          boardOrigin: previous.boardOrigin,
          id,
          updatedAt: new Date(
            Math.max(Date.now(), Date.parse(previous.updatedAt || 0) + 1 || 0),
          ).toISOString(),
        };
        db.prepare(
          "INSERT INTO items VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
        ).run(id, JSON.stringify(item));
        event(old ? "item.updated" : "item.added", {
          itemId: id,
          name: item.name,
        });
        return item;
      });
    },
    recover(donorId, rowId, quantity, expectedUpdatedAt, location = "") {
      return transaction(() => {
        if (
          bodies("boards").some(
            (b) => b.linkedItemId === donorId && b.recoveries?.length,
          )
        )
          throw new Error(
            "This donor has Boardroom recoveries. Continue recovery in Boardroom to avoid double-counting.",
          );
        const current = available(donorId),
          donor = current.item;
        if (donor.removedAt || donor.kind !== "donor" || donor.quantity !== 1)
          throw new Error("Recovery requires one active donor device.");
        if (donor.updatedAt !== expectedUpdatedAt)
          throw new Error(
            "This donor changed. Reopen it before recording recovery.",
          );
        if (current.held)
          throw new Error(
            "Return the donor from its projects before recovering parts.",
          );
        if (donor.condition === "consumed" && !donor.dismantledAt)
          throw new Error("This donor is unavailable.");
        const row = donor.salvage?.find((r) => r.id === rowId);
        const recovered = (donor.recoveries || [])
          .filter((r) => r.rowId === rowId)
          .reduce((n, r) => n + r.quantity, 0);
        if (
          !row ||
          !Number.isInteger(quantity) ||
          quantity < 1 ||
          quantity > row.quantity - recovered
        )
          throw new Error("Recovery exceeds the remaining proposed quantity.");
        const at = new Date(
            Math.max(Date.now(), Date.parse(donor.updatedAt) + 1),
          ).toISOString(),
          id = randomUUID();
        const child = {
          id,
          name: row.name,
          quantity,
          kind: "part",
          identity: "unresolved",
          condition: "untested",
          location,
          markings: "",
          notes: `Recovered from ${donor.name}. ${row.reuse}`,
          evidence: row.evidence,
          photo: null,
          sources: structuredClone(donor.sources || []),
          recoveredFrom: {
            donorId,
            donorName: donor.name,
            rowId,
            at,
            specs: row.specs,
            unknowns: row.unknowns,
            evidenceStatus: row.evidenceStatus,
          },
          updatedAt: at,
        };
        const next = {
          ...donor,
          dismantledAt: donor.dismantledAt || at,
          condition: "consumed",
          updatedAt: at,
          recoveries: [
            ...(donor.recoveries || []),
            { rowId, itemId: id, name: row.name, quantity, at },
          ],
        };
        db.prepare("INSERT INTO items VALUES(?,?)").run(
          id,
          JSON.stringify(child),
        );
        db.prepare("UPDATE items SET body=? WHERE id=?").run(
          JSON.stringify(next),
          donorId,
        );
        event("donor.recovered", {
          itemId: donorId,
          childId: id,
          name: row.name,
          quantity,
        });
        event("item.recovered", {
          itemId: id,
          donorId,
          name: row.name,
          quantity,
        });
        return { donor: next, item: child };
      });
    },
    itemEvents(id) {
      return db
        .prepare("SELECT * FROM events ORDER BY at DESC, rowid DESC")
        .all()
        .map((e) => ({ ...JSON.parse(e.body), id: e.id, at: e.at }))
        .filter((e) => e.itemId === id);
    },
    saveProject(
      input,
      id = randomUUID(),
      conversationId = null,
      startConversation = false,
    ) {
      return transaction(() => {
        const conversation = conversationId
          ? this.conversation(conversationId)
          : null;
        if (
          conversation &&
          (conversation.legacy ||
            (conversation.projectId && conversation.projectId !== id))
        )
          throw new Error("Choose an exploration without an existing project.");
        const project = { ...input, id, updatedAt: new Date().toISOString() };
        db.prepare(
          "INSERT INTO projects VALUES(?,?) ON CONFLICT(id) DO UPDATE SET body=excluded.body",
        ).run(id, JSON.stringify(project));
        event("project.saved", { projectId: id, name: project.name });
        if (conversation) {
          conversation.projectId = id;
          conversation.updatedAt = project.updatedAt;
          db.prepare("UPDATE conversations SET body=? WHERE id=?").run(
            JSON.stringify(conversation),
            conversation.id,
          );
        } else if (
          startConversation &&
          !bodies("conversations").some((c) => c.projectId === id)
        ) {
          const chatId = randomUUID();
          const chat = {
            id: chatId,
            title: project.name,
            projectId: id,
            legacy: false,
            createdAt: project.updatedAt,
            updatedAt: project.updatedAt,
          };
          db.prepare("INSERT INTO conversations VALUES(?,?)").run(
            chatId,
            JSON.stringify(chat),
          );
        }
        return project;
      });
    },
    removeItem(id) {
      return transaction(() => {
        const current = available(id);
        if (current.item.removedAt)
          throw new Error("This item is already removed.");
        if (current.held > 0)
          throw new Error(
            "Return this item’s reserved or installed parts from their projects before removing it.",
          );
        const at = new Date().toISOString();
        const item = { ...current.item, removedAt: at, updatedAt: at };
        db.prepare("UPDATE items SET body=? WHERE id=?").run(
          JSON.stringify(item),
          id,
        );
        event("item.removed", { itemId: id, name: item.name });
      });
    },
    restoreItem(id) {
      return transaction(() => {
        const current = available(id);
        if (!current.item.removedAt)
          throw new Error("This item is already in the stash.");
        const { removedAt, ...restored } = current.item;
        restored.updatedAt = new Date().toISOString();
        db.prepare("UPDATE items SET body=? WHERE id=?").run(
          JSON.stringify(restored),
          id,
        );
        event("item.restored", { itemId: id, name: restored.name });
      });
    },
    allocate(itemId, projectId, quantity) {
      return transaction(() => {
        const current = available(itemId);
        if (current.item.removedAt)
          throw new Error("Restore this item before reserving it.");
        if (!db.prepare("SELECT id FROM projects WHERE id=?").get(projectId))
          throw new Error("Project not found.");
        if (current.item.kind === "tool")
          throw new Error(
            "Tools are reusable bench equipment, not parts to install. Keep them in Tools & equipment.",
          );
        if (current.item.dismantledAt)
          throw new Error(
            "This donor has been dismantled and is not available as an intact device.",
          );
        if (["damaged", "consumed"].includes(current.item.condition))
          throw new Error("This part is unavailable.");
        if (quantity > current.available)
          throw new Error("Not enough available parts.");
        const id = randomUUID();
        db.prepare("INSERT INTO allocations VALUES(?,?,?,?,'reserved')").run(
          id,
          itemId,
          projectId,
          quantity,
        );
        event("parts.reserved", { itemId, projectId, quantity });
        return { id };
      });
    },
    transition(id, state) {
      return transaction(() => {
        const row = db.prepare("SELECT * FROM allocations WHERE id=?").get(id);
        if (!row) throw new Error("Allocation not found.");
        if (
          row.state === "returned" ||
          (state === "installed" && row.state !== "reserved")
        )
          throw new Error("This allocation cannot make that transition.");
        db.prepare("UPDATE allocations SET state=? WHERE id=?").run(state, id);
        event(`parts.${state}`, {
          itemId: row.itemId,
          projectId: row.projectId,
          quantity: row.quantity,
        });
      });
    },
    setting(key, value) {
      if (value !== undefined)
        db.prepare(
          "INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
        ).run(key, value);
      return db.prepare("SELECT value FROM settings WHERE key=?").get(key)
        ?.value;
    },
  };
}
