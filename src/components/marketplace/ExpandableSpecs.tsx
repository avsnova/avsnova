import { useState } from "react";
import { ChevronDown, ChevronUp, Info } from "lucide-react";

// Parses the existing `specifications` string into rich, expandable preview groups.
// Convention (backward compatible with the current "Key: Value | Key: Value" format):
//   - "Key: Value" pairs separated by "|"
//   - Optional grouping with a "## Group Name" token to start a new collapsible section
//     e.g. "## Account | Country: USA | Age: 2y | ## Security | 2FA: Yes"
// Products with no groups render a single "Specifications" panel (unchanged behavior).

interface SpecItem { label: string; value: string; }
interface SpecGroup { title: string; items: SpecItem[]; }

function parseSpecs(raw?: string): SpecGroup[] {
  if (!raw || !raw.trim()) return [];
  const tokens = raw.split("|").map((t) => t.trim()).filter(Boolean);
  const groups: SpecGroup[] = [];
  let current: SpecGroup = { title: "Specifications", items: [] };
  for (const tok of tokens) {
    if (tok.startsWith("##")) {
      if (current.items.length) groups.push(current);
      current = { title: tok.replace(/^##\s*/, "").trim() || "Details", items: [] };
      continue;
    }
    const idx = tok.indexOf(":");
    if (idx >= 0) current.items.push({ label: tok.slice(0, idx).trim(), value: tok.slice(idx + 1).trim() || "Yes" });
    else current.items.push({ label: tok, value: "Yes" });
  }
  if (current.items.length) groups.push(current);
  return groups;
}

export default function ExpandableSpecs({ specifications }: { specifications?: string }) {
  const groups = parseSpecs(specifications);
  // All groups open by default; multi-group products get individual toggles.
  const [open, setOpen] = useState<Record<number, boolean>>(() => Object.fromEntries(groups.map((_, i) => [i, true])));
  if (groups.length === 0) return null;

  const multi = groups.length > 1;

  return (
    <div className="space-y-2.5">
      {groups.map((g, i) => (
        <div key={i} className="rounded-2xl bg-purple-950/10 border border-purple-500/12 overflow-hidden">
          <button
            type="button"
            onClick={() => multi && setOpen((o) => ({ ...o, [i]: !o[i] }))}
            className={`w-full flex items-center justify-between px-4 py-2.5 ${multi ? "cursor-pointer hover:bg-white/[0.03]" : "cursor-default"}`}
          >
            <span className="text-[10px] text-cyan-400 uppercase font-bold tracking-widest font-space flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5" /> {g.title}
            </span>
            {multi && (open[i] ? <ChevronUp className="h-4 w-4 text-purple-300/50" /> : <ChevronDown className="h-4 w-4 text-purple-300/50" />)}
          </button>
          {open[i] && (
            <div className="px-4 pb-3 divide-y divide-purple-500/5 animate-fade-up">
              {g.items.map((it, j) => (
                <div key={j} className="flex justify-between gap-4 py-1.5 text-xs">
                  <span className="text-purple-200/40">{it.label}</span>
                  <span className="text-white font-bold text-right break-words">{it.value}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
