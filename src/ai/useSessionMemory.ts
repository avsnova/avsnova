import { useRef, useCallback } from "react";
import type { SessionMemory } from "./engine";

// Lightweight in-memory session learning. Deliberately NOT persisted long-term —
// it only improves the CURRENT session (privacy-friendly), matching the spec.
export function useSessionMemory() {
  const mem = useRef<SessionMemory>({ visitedPages: [], topics: [], searches: [] });

  const notePage = useCallback((section: string | null) => {
    if (!section) return;
    const v = mem.current.visitedPages;
    if (v[v.length - 1] !== section) v.push(section);
    if (v.length > 40) v.shift();
  }, []);

  const noteTopic = useCallback((topicId?: string) => {
    if (!topicId) return;
    mem.current.topics.push(topicId);
    if (mem.current.topics.length > 40) mem.current.topics.shift();
  }, []);

  const noteSearch = useCallback((q: string) => {
    if (!q) return;
    mem.current.searches.push(q);
    if (mem.current.searches.length > 20) mem.current.searches.shift();
  }, []);

  const get = useCallback(() => mem.current, []);

  return { notePage, noteTopic, noteSearch, get };
}
