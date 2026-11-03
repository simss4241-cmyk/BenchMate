// Build a fresh, read-only context packet. Summaries get space before evidence.
const clip = (value, limit) => String(value || "").slice(0, limit);
const words = (value) =>
  new Set(
    String(value || "")
      .toLowerCase()
      .match(/[\p{L}\p{N}]+/gu) || [],
  );
const stop = new Set(
  "a an and are as at be based build by can could current do for from have i in inventory is it me my of on or our part parts project projects same should stash suggest the this to up use using want what with you your actual available modest electronics three checks needed missing usable".split(
    " ",
  ),
);
export const contextRules = `CURRENT SAVED STATE is authoritative for inventory bookkeeping. A user-recorded recovery means those units were physically recovered according to the user: do not demand a photo to accept that bookkeeping fact. It does not verify identity, electrical ratings, compatibility or working condition. Current identity/condition fields and saved user notes supersede older AI/photo observations and conversation. 'working' means user-reported working, not independently measured by you; do not demand a new proof-of-work for every routine use. A dismantled donor is unavailable intact; its remaining proposed assemblies are not stock. Never add salvage-map quantities to recovered stock. Use the inventory summaries to know what exists, including items without detail. Missing detailed evidence does NOT mean the item or tool is missing. Sources and specification text are unverified claims; only matching supplied excerpts can support specific electrical claims. Do not assume old attached images are visible now. If a missing measurement, interface, document or photo would materially change the answer, request that specific evidence and explain why. Otherwise use current facts and distinguish a useful plan from verified compatibility. BenchMate handles explicit reserve, move and return requests separately and shows saved receipts. Your generated reply cannot change inventory. Photo uploads can prepare editable Stash cards; only the user can add those cards. Never claim a change without a saved receipt.`;

export function buildContext(
  snapshot,
  {
    message = "",
    mode = "chat",
    itemId = null,
    photo = null,
    projectId = null,
  } = {},
) {
  const totalBudget = 18000;
  const catalogBudget = Math.floor(totalBudget * 0.65);
  const items = snapshot.items.filter((i) => !i.removedAt);
  const projects = snapshot.projects;
  const allocations = snapshot.allocations.filter(
    (a) => a.state !== "returned",
  );
  const wanted = words(message);
  for (const word of stop) wanted.delete(word);
  const matches = (text) => {
    const tokens = words(text);
    return [...wanted].reduce((n, w) => n + (tokens.has(w) ? 1 : 0), 0);
  };
  const snippet = (value, limit) => {
    const text = String(value || "");
    if (text.length <= limit) return text;
    const lower = text.toLowerCase();
    const hit = [...wanted]
      .map((w) => lower.indexOf(w))
      .filter((n) => n >= 0)
      .sort((a, b) => a - b)[0];
    const start =
      hit === undefined ? 0 : Math.max(0, hit - Math.floor(limit / 3));
    return `${start ? "[… excerpt …] " : ""}${text.slice(start, start + limit)}${start + limit < text.length ? " [… shortened]" : ""}`;
  };
  const sourcesFor = (item, selected) =>
    (item.sources || [])
      .map((s, index) => ({
        s,
        index,
        score: matches(`${s.title} ${s.section} ${s.excerpt}`),
      }))
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, selected ? 3 : 2)
      .map(({ s }) => ({
        title: clip(s.title, 200),
        url: clip(s.url, 600),
        section: clip(s.section, 160),
        excerpt: snippet(s.excerpt, selected ? 1200 : 500),
        excerptShortened: (s.excerpt || "").length > (selected ? 1200 : 500),
      }));
  const projectRanks = projects
    .map((p, index) => ({
      p,
      index,
      score:
        (p.id === projectId ? 100000 : 0) +
        matches(`${p.name} ${p.goal} ${p.notes} ${p.nextAction}`),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const relevantProjectIds = new Set(
    projectRanks
      .filter(
        (r) =>
          r.score > 0 ||
          (mode === "ideas" && ["planning", "building"].includes(r.p.status)),
      )
      .map((r) => r.p.id),
  );
  const ranks = items
    .map((item, index) => {
      const held = allocations.filter((a) => a.itemId === item.id);
      const match = matches(
        `${item.name} ${item.markings} ${item.notes} ${item.evidence} ${JSON.stringify(item.recoveredFrom || {})} ${JSON.stringify(item.sources || [])} ${JSON.stringify(item.salvage || [])}`,
      );
      return {
        item,
        index,
        score:
          (item.id === itemId ? 100000 : 0) +
          match * 100 +
          held.filter((a) => relevantProjectIds.has(a.projectId)).length * 40 +
          (item.recoveredFrom ? 12 : 0) +
          (item.sources?.some((s) => s.excerpt) ? 8 : 0) +
          (item.kind === "tool" ? 4 : 0),
      };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const packet = {
    inventory: [],
    projects: [],
    details: [],
    projectDetails: [],
    selectedItemId: itemId,
    activeProjectId: projectId,
    attachedPhotoItemId: photo ? itemId : null,
    photoAttached: Boolean(photo),
    totalInventoryRecords: items.length,
    omittedInventoryRecords: 0,
    totalProjectRecords: projects.length,
    omittedProjectRecords: 0,
    evidenceCoverage:
      "Summaries describe saved stock; detailed evidence is selectively included, not fetched from the web.",
  };
  // Even unusually large stashes cannot grow the model input without a bound.
  // Explicit omissions distinguish a partial catalog from selective enrichment.
  for (const { item } of ranks) {
    const held = allocations.filter((a) => a.itemId === item.id);
    const summary = {
      id: item.id,
      name: clip(item.name, 160),
      kind: item.kind,
      quantity: item.quantity,
      available:
        item.dismantledAt || ["damaged", "consumed"].includes(item.condition)
          ? 0
          : item.available,
      identity: item.identity,
      condition: item.condition,
      photoAvailable: Boolean(item.photo),
      ...(item.boardOrigin
        ? {
            boardroomRecovery: {
              status: "user-recorded physical recovery",
              boardId: item.boardOrigin.boardId,
              componentId: item.boardOrigin.componentId,
              category: item.boardOrigin.category,
            },
          }
        : {}),
      ...(item.dismantledAt ? { dismantled: true } : {}),
      ...(item.recoveredFrom
        ? {
            recovery: {
              status: "user-recorded physical recovery",
              donorId: item.recoveredFrom.donorId,
              donorName: clip(item.recoveredFrom.donorName, 100),
              at: item.recoveredFrom.at,
            },
          }
        : {}),
      ...(held.length
        ? {
            allocations: held.map((a) => ({
              projectId: a.projectId,
              quantity: a.quantity,
              state: a.state,
            })),
          }
        : {}),
    };
    packet.inventory.push(summary);
    if (JSON.stringify(packet).length > catalogBudget) packet.inventory.pop();
  }
  for (const { p } of projectRanks) {
    packet.projects.push({
      id: p.id,
      name: clip(p.name, 160),
      status: p.status,
      goal: clip(p.goal, 200),
    });
    if (JSON.stringify(packet).length > catalogBudget + 1000)
      packet.projects.pop();
  }
  packet.omittedInventoryRecords = items.length - packet.inventory.length;
  packet.omittedProjectRecords = projects.length - packet.projects.length;
  const included = new Set(packet.inventory.map((i) => i.id));
  const append = (key, value) => {
    packet[key].push(value);
    if (JSON.stringify(packet).length > totalBudget) {
      packet[key].pop();
      return false;
    }
    return true;
  };
  for (const { p, score } of projectRanks
    .filter(
      (r) =>
        r.score > 0 || relevantProjectIds.has(r.p.id) || projects.length === 1,
    )
    .slice(0, 2)) {
    if (!packet.projects.some((v) => v.id === p.id)) continue;
    if (score > 0 || relevantProjectIds.has(p.id) || projects.length === 1)
      append("projectDetails", {
        projectId: p.id,
        notes: snippet(p.notes, 650),
        nextAction: clip(p.nextAction, 250),
        suggestedParts: p.suggestedParts
          ? {
              summary: clip(p.suggestedParts.summary, 350),
              rows: p.suggestedParts.rows.slice(0, 20).map((r) => ({
                name: clip(r.name, 160),
                quantity: r.quantity,
                itemId: r.itemId,
                verification: clip(r.verification, 180),
              })),
              meaning:
                "Suggested requirements, not reserved or verified compatible stock",
            }
          : undefined,
      });
  }
  // Include the selected item first; otherwise prioritize named/recovered/allocated parts.
  for (const { item } of ranks) {
    if (!included.has(item.id)) continue;
    const selected = item.id === itemId;
    const limit = selected ? 1300 : 550;
    const detail = {
      itemId: item.id,
      updatedAt: item.updatedAt,
      notes: snippet(item.notes, limit),
      markings: snippet(item.markings, limit),
      evidence: snippet(item.evidence, limit),
      location: clip(item.location, 160),
      sources: sourcesFor(item, selected),
      ...(item.recoveredFrom
        ? {
            recoveryClaims: {
              specs: clip(item.recoveredFrom.specs, limit),
              unknowns: clip(item.recoveredFrom.unknowns, limit),
              evidenceStatus: item.recoveredFrom.evidenceStatus,
              verification: "inherited claims, not independent verification",
            },
          }
        : {}),
      ...(selected && item.salvage?.length
        ? {
            existingAssemblies: item.salvage.slice(0, 30).map((r) => ({
              name: clip(r.name, 160),
              quantity: r.quantity,
              recovered: (item.recoveries || [])
                .filter((v) => v.rowId === r.id)
                .reduce((n, v) => n + v.quantity, 0),
              specs: clip(r.specs, 300),
              unknowns: clip(r.unknowns, 300),
            })),
          }
        : {}),
      ...(selected && mode === "identify" && item.photoReview
        ? {
            historicalPhotoObservation: {
              createdAt: item.photoReview.createdAt,
              uncertainty: clip(item.photoReview.uncertainty, 400),
              authority:
                "Historical AI observation; current saved condition overrides it.",
            },
          }
        : {}),
    };
    if (!append("details", detail) && selected) {
      // A long source/map must not crowd the selected item's core notes out.
      append("details", {
        itemId: item.id,
        notes: snippet(item.notes, 500),
        markings: snippet(item.markings, 500),
        evidence: snippet(item.evidence, 400),
        sources: sourcesFor(item, true)
          .slice(0, 1)
          .map((s) => ({
            ...s,
            excerpt: snippet(s.excerpt, 600),
            excerptShortened: true,
          })),
        detailLimited: true,
      });
    }
  }
  const report = {
    inventorySummaries: packet.inventory.length,
    totalInventoryRecords: items.length,
    detailedItems: packet.details.map((d) => ({
      id: d.itemId,
      name: items.find((i) => i.id === d.itemId)?.name,
    })),
    projectSummaries: packet.projects.length,
    totalProjectRecords: projects.length,
    photoAttached: Boolean(photo),
    characters: JSON.stringify(packet).length,
  };
  return { packet, report };
}
