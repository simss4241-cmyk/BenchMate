export type SuggestedPart = {
  id: string;
  name: string;
  quantity: number | null;
  purpose: string;
  verification: string;
  itemId: string | null;
};
export type PartsPlan = {
  summary: string;
  rows: SuggestedPart[];
  model?: string;
  createdAt?: string;
};
export type PlanItem = {
  id: string;
  name: string;
  quantity: number;
  available: number;
  kind: string;
  condition: string;
  identity?: string;
  dismantledAt?: string;
};
type Allocation = {
  itemId: string;
  projectId: string;
  quantity: number;
  state: string;
};

// Consume each stock/held pool once, even if multiple requirements name it.
export function partsCoverage(
  plan: PartsPlan,
  projectId: string,
  items: PlanItem[],
  allocations: Allocation[],
) {
  const free = new Map(
    items.map((i) => [
      i.id,
      i.kind === "part" &&
      !i.dismantledAt &&
      !["damaged", "consumed"].includes(i.condition)
        ? Math.max(0, i.available)
        : 0,
    ]),
  );
  const held = new Map<string, number>();
  for (const a of allocations)
    if (
      a.projectId === projectId &&
      ["reserved", "installed"].includes(a.state)
    )
      held.set(a.itemId, (held.get(a.itemId) || 0) + a.quantity);
  return plan.rows.map((row) => {
    const item = items.find((i) => i.id === row.itemId);
    if (!item || item.kind !== "part")
      return {
        row,
        item: undefined,
        covered: 0,
        reservable: 0,
        missing: row.quantity,
      };
    if (row.quantity === null)
      return { row, item, covered: 0, reservable: 0, missing: null };
    const covered = Math.min(row.quantity, held.get(item.id) || 0);
    held.set(item.id, (held.get(item.id) || 0) - covered);
    const remaining = row.quantity - covered,
      reservable = Math.min(remaining, free.get(item.id) || 0);
    free.set(item.id, (free.get(item.id) || 0) - reservable);
    return { row, item, covered, reservable, missing: remaining - reservable };
  });
}
