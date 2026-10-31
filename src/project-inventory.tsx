import { BenchPhoto } from "./bench-photo";
import { useEffect, useRef } from "react";
import { Box, X } from "lucide-react";
import "./project-inventory.css";

export function ProjectInventory({
  project,
  allocations,
  items,
  onOpen,
}: {
  project: { id: string; name: string };
  allocations: {
    itemId: string;
    projectId: string;
    quantity: number;
    state: string;
  }[];
  items: { id: string; name: string; photo: string | null }[];
  onOpen: (id: string) => void;
}) {
  const disclosure = useRef<HTMLDetailsElement>(null);
  const summary = useRef<HTMLElement>(null);
  const rows = new Map<
    string,
    { itemId: string; reserved: number; installed: number }
  >();
  let reserved = 0,
    installed = 0;
  for (const allocation of allocations) {
    if (
      allocation.projectId !== project.id ||
      !["reserved", "installed"].includes(allocation.state)
    )
      continue;
    const row = rows.get(allocation.itemId) || {
      itemId: allocation.itemId,
      reserved: 0,
      installed: 0,
    };
    if (allocation.state === "reserved") {
      row.reserved += allocation.quantity;
      reserved += allocation.quantity;
    } else {
      row.installed += allocation.quantity;
      installed += allocation.quantity;
    }
    rows.set(row.itemId, row);
  }
  const parts = [...rows.values()]
    .map((row) => ({
      ...row,
      item: items.find((item) => item.id === row.itemId),
    }))
    .sort((a, b) => (a.item?.name || "").localeCompare(b.item?.name || ""));
  function close(focus = false) {
    if (disclosure.current) disclosure.current.open = false;
    if (focus) summary.current?.focus();
  }
  useEffect(() => {
    const outside = (event: PointerEvent) => {
      if (
        disclosure.current?.open &&
        !disclosure.current.contains(event.target as Node)
      )
        disclosure.current.open = false;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && disclosure.current?.open) {
        disclosure.current.open = false;
        summary.current?.focus();
      }
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  return (
    <details className="project-inventory" ref={disclosure}>
      <summary ref={summary} aria-controls={`project-stock-${project.id}`}>
        <Box size={15} aria-hidden="true" />
        <span>
          Project inventory
          <small>
            {reserved} reserved · {installed} installed
          </small>
        </span>
      </summary>
      <section
        id={`project-stock-${project.id}`}
        className="project-inventory-panel"
        aria-label={`Inventory for ${project.name}`}
      >
        <header>
          <div>
            <p className="eyebrow">PARTS FOR THIS PROJECT</p>
            <h3>{project.name}</h3>
          </div>
          <button
            className="icon-button"
            aria-label="Close project inventory"
            onClick={() => close(true)}
          >
            <X size={17} />
          </button>
        </header>
        <div className="project-inventory-totals">
          <span>
            <strong>{reserved}</strong> reserved
          </span>
          <span>
            <strong>{installed}</strong> installed
          </span>
          <span>
            {parts.length} {parts.length === 1 ? "part type" : "part types"}
          </span>
        </div>
        {parts.length ? (
          <ul>
            {parts.map((row) => (
              <li key={row.itemId}>
                <button
                  disabled={!row.item}
                  onClick={() => {
                    close();
                    onOpen(row.itemId);
                  }}
                >
                  {row.item?.photo ? (
                    <BenchPhoto src={`/api/photos/${row.item.photo}`} alt="" />
                  ) : (
                    <span className="project-inventory-icon">
                      <Box size={20} />
                    </span>
                  )}
                  <span>
                    <strong>
                      {row.item?.name || "Unavailable item record"}
                    </strong>
                    <small>
                      {row.reserved > 0 && `${row.reserved} reserved`}
                      {row.reserved > 0 && row.installed > 0 && " · "}
                      {row.installed > 0 && `${row.installed} installed`}
                    </small>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="project-inventory-empty">
            No parts assigned yet. Reserve parts from Stash or use Project parts
            in chat.
          </p>
        )}
        <p className="project-inventory-note">
          Reserved parts are set aside. Installed parts are in the build.
        </p>
      </section>
    </details>
  );
}
