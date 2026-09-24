"use client";

import { useRef, useState } from "react";

export interface CategoryRow {
  id: string;
  name: string;
  color?: string | null;
}

const inputClass =
  "bg-surface-2 border border-border-soft rounded-sm px-3 py-2 text-[13px] text-text placeholder:text-text-faint focus:outline-none focus:border-net flex-1 min-w-0";

/**
 * Add / delete / edit the user's categories, in place of the picker inside
 * the add-expense sheet. Edits go straight to /api/categories; the parent
 * receives the updated list.
 */
export function CategoryEditor({
  categories,
  onChanged,
  onBack,
}: {
  categories: CategoryRow[];
  onChanged: (next: CategoryRow[]) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggingId, setDraggingId] = useState<string | null>(null);
  // The pointer currently dragging a row, if any.
  const drag = useRef<{ id: string; pointerId: number } | null>(null);
  // Working list, kept fresh on every change so drag hit-testing never
  // reads a stale render closure (onChanged round-trips through parent
  // state asynchronously).
  const listRef = useRef(categories);

  function apply(next: CategoryRow[]) {
    listRef.current = next;
    onChanged(next);
  }

  async function call(url: string, init: RequestInit) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(url, init);
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error ?? "Failed to save");
      return body;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (busy || !name.trim()) return;
    const body = await call("/api/categories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    if (!body?.category) return;
    apply([...categories, body.category as CategoryRow]);
    setName("");
  }

  async function rename(id: string) {
    if (busy || !editName.trim()) return;
    const body = await call("/api/categories", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, name: editName }),
    });
    if (!body?.category) return;
    apply(categories.map((c) => (c.id === id ? (body.category as CategoryRow) : c)));
    setEditingId(null);
  }

  async function remove(category: CategoryRow) {
    if (busy) return;
    const confirmed = window.confirm(
      `Delete "${category.name}"? Its transactions go uncategorized and re-categorize on the next import.`
    );
    if (!confirmed) return;
    const body = await call(`/api/categories?id=${encodeURIComponent(category.id)}`, {
      method: "DELETE",
    });
    if (!body?.ok) return;
    apply(categories.filter((c) => c.id !== category.id));
  }

  /** Drag the row by its grip: capture the pointer, then reorder live as
   *  the pointer passes over other rows. Pointer events cover mouse and
   *  touch (HTML5 drag events never fire on touch). */
  function startDrag(event: React.PointerEvent<HTMLElement>, id: string) {
    if (busy || editingId) return;
    event.preventDefault();
    drag.current = { id, pointerId: event.pointerId };
    // Capture: pointer moves outside the grip still route here.
    event.currentTarget.setPointerCapture(event.pointerId);
    setDraggingId(id);
  }

  function moveDrag(event: React.PointerEvent<HTMLElement>) {
    const dragState = drag.current;
    if (!dragState) return;
    const overId = document
      .elementFromPoint(event.clientX, event.clientY)
      ?.closest("[data-cat-row]")
      ?.getAttribute("data-cat-row");
    if (!overId || overId === dragState.id) return;
    const list = listRef.current;
    const from = list.findIndex((c) => c.id === dragState.id);
    const to = list.findIndex((c) => c.id === overId);
    if (from === -1 || to === -1) return;
    const next = [...list];
    next.splice(to, 0, next.splice(from, 1)[0]);
    apply(next);
  }

  function endDrag() {
    if (!drag.current) return;
    drag.current = null;
    setDraggingId(null);
    // The list already reflects the new order — persist it whole.
    void call("/api/categories/reorder", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: listRef.current.map((c) => c.id) }),
    });
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-[12.5px] text-text-dim">Edit categories</span>
        <button
          type="button"
          onClick={onBack}
          disabled={busy}
          className="text-[12.5px] font-medium text-net hover:opacity-90 disabled:opacity-60"
        >
          Done
        </button>
      </div>

      <div className="flex flex-col gap-1.5 max-h-[220px] max-sm:max-h-[140px] overflow-y-auto">
        {categories.map((category) => (
          <div
            key={category.id}
            data-cat-row={category.id}
            className={`flex items-center gap-2 bg-surface-2 border rounded-sm px-3 py-1.5 ${
              draggingId === category.id ? "border-net" : "border-border-soft"
            }`}
          >
            {editingId === category.id ? (
              <>
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") rename(category.id);
                    if (event.key === "Escape") setEditingId(null);
                  }}
                  autoFocus
                  className={inputClass}
                />
                <button
                  type="button"
                  onClick={() => rename(category.id)}
                  disabled={busy}
                  className="text-[12.5px] font-medium text-net disabled:opacity-60"
                >
                  Save
                </button>
              </>
            ) : (
              <>
                <span
                  aria-label={`Drag to reorder ${category.name}`}
                  onPointerDown={(event) => startDrag(event, category.id)}
                  onPointerMove={moveDrag}
                  onPointerUp={endDrag}
                  onPointerCancel={endDrag}
                  className={`touch-none cursor-grab select-none px-0.5 ${
                    draggingId === category.id
                      ? "cursor-grabbing text-text"
                      : "text-text-faint hover:text-text"
                  }`}
                >
                  <svg width="12" height="10" viewBox="0 0 12 10" aria-hidden="true">
                    <line x1="1" y1="1.5" x2="11" y2="1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="1" y1="5" x2="11" y2="5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                    <line x1="1" y1="8.5" x2="11" y2="8.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
                  </svg>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setEditingId(category.id);
                    setEditName(category.name);
                  }}
                  className="flex-1 min-w-0 truncate text-left text-[13px] hover:text-text-dim"
                >
                  {category.name}
                </button>
                <button
                  type="button"
                  onClick={() => remove(category)}
                  aria-label={`Delete ${category.name}`}
                  className="text-[15px] leading-none text-text-faint hover:text-expense px-1"
                >
                  ×
                </button>
              </>
            )}
          </div>
        ))}
        {categories.length === 0 && (
          <p className="text-[12.5px] text-text-faint px-1 py-1.5">
            No categories yet — add one below.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2">
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") add();
          }}
          placeholder="New category"
          maxLength={40}
          className={inputClass}
        />
        <button
          type="button"
          onClick={add}
          disabled={busy || !name.trim()}
          className="rounded-sm bg-net px-3 py-2 text-[13px] font-semibold text-bg hover:opacity-90 disabled:opacity-60"
        >
          Add
        </button>
      </div>

      {error && <p className="text-[12px] text-expense">{error}</p>}
    </div>
  );
}
