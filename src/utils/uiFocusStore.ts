import { useSyncExternalStore } from "react";

/**
 * uiFocusStore — a tiny global signal for "focus mode": times when a blocking or
 * high-intent surface is active (a purchase/checkout modal, the SMS terminal, a form
 * that must not be obstructed). Non-essential floating UI (the AI assistant launcher,
 * proactive bubbles) subscribes and gets out of the way.
 *
 * Reference-counted so multiple overlapping surfaces compose correctly: each caller
 * enters on mount and exits on unmount; focus mode is active while count > 0.
 */

let focusCount = 0;
const listeners = new Set<() => void>();

function emit() { listeners.forEach((l) => l()); }

export function enterFocusMode(): () => void {
  focusCount += 1;
  emit();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    focusCount = Math.max(0, focusCount - 1);
    emit();
  };
}

function subscribe(cb: () => void) { listeners.add(cb); return () => listeners.delete(cb); }
function getSnapshot() { return focusCount > 0; }

/** React hook: true while any focus-mode surface is active. */
export function useUiFocusMode(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}
