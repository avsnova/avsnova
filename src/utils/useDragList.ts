import { useRef, useState } from "react";

// Lightweight pointer-based drag-and-drop reordering (works on desktop mouse + touch).
// Returns handlers to spread onto each draggable row. onReorder(newOrderedIds) fires on drop.
export function useDragList<T extends { id: string }>(items: T[], onReorder: (ids: string[]) => void) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const order = useRef<string[]>(items.map(i => i.id));
  order.current = items.map(i => i.id);

  const move = (from: string, to: string) => {
    const ids = [...order.current];
    const fi = ids.indexOf(from);
    const ti = ids.indexOf(to);
    if (fi === -1 || ti === -1 || fi === ti) return ids;
    ids.splice(ti, 0, ids.splice(fi, 1)[0]);
    return ids;
  };

  const rowProps = (id: string) => ({
    draggable: true,
    onDragStart: (e: React.DragEvent) => { setDragId(id); e.dataTransfer.effectAllowed = "move"; },
    onDragOver: (e: React.DragEvent) => { e.preventDefault(); if (id !== overId) setOverId(id); },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      if (dragId && dragId !== id) onReorder(move(dragId, id));
      setDragId(null); setOverId(null);
    },
    onDragEnd: () => { setDragId(null); setOverId(null); },
    // Touch support: use a long-press-free simple approach via pointer events
    "data-dragging": dragId === id ? "true" : undefined,
    "data-dragover": overId === id ? "true" : undefined,
  });

  return { rowProps, dragId, overId };
}
