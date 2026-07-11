import { useSyncExternalStore } from "react";

// Lightweight product comparison store (session-only, max 4). No backend.
export interface CompareItem {
  id: string;
  name: string;
  price: number;
  icon?: string;
  file_url?: string;
  multiple_images?: string;
  category?: string;
  type?: string;
  delivery_type?: string;
  stock?: number;
  rating?: number;
  refund?: string;
}

const KEY = "avs_mkt_compare";
const MAX = 4;
let ids: CompareItem[] = load();
const listeners = new Set<() => void>();

function load(): CompareItem[] {
  try { const v = JSON.parse(sessionStorage.getItem(KEY) || "[]"); return Array.isArray(v) ? v : []; } catch { return []; }
}
function persist() {
  try { sessionStorage.setItem(KEY, JSON.stringify(ids)); } catch { /* sandbox */ }
  listeners.forEach((l) => l());
}

export function toggleCompare(item: CompareItem): boolean {
  const exists = ids.some((x) => x.id === item.id);
  if (exists) { ids = ids.filter((x) => x.id !== item.id); persist(); return false; }
  if (ids.length >= MAX) return false; // full
  ids = [...ids, item];
  persist();
  return true;
}
export function removeCompare(id: string) { ids = ids.filter((x) => x.id !== id); persist(); }
export function clearCompare() { ids = []; persist(); }
export function isComparing(id: string): boolean { return ids.some((x) => x.id === id); }
export function compareFull(): boolean { return ids.length >= MAX; }
export const COMPARE_MAX = MAX;

function subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); }
function snapshot() { return ids; }

// React hook — components re-render when the compare list changes.
export function useCompare(): CompareItem[] {
  return useSyncExternalStore(subscribe, snapshot, snapshot);
}
