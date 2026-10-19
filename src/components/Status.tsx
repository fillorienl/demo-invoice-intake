import type { DocStatus, Level } from "@/lib/types";

const STATUS: Record<DocStatus, { label: string; cls: string; dot: string }> = {
  new: { label: "New", cls: "bg-carbon-soft text-carbon", dot: "bg-carbon" },
  error: { label: "Couldn't read", cls: "bg-blocked-soft text-blocked", dot: "bg-blocked" },
  ready: { label: "Ready to book", cls: "bg-ready-soft text-ready", dot: "bg-ready" },
  review: { label: "Needs review", cls: "bg-review-soft text-review", dot: "bg-review" },
  blocked: { label: "Blocked", cls: "bg-blocked-soft text-blocked", dot: "bg-blocked" },
  manual: { label: "Manual", cls: "bg-manual-soft text-manual", dot: "bg-manual" },
  booked: { label: "Booked", cls: "bg-ink text-white", dot: "bg-white" },
  on_hold: { label: "On hold", cls: "bg-manual-soft text-manual", dot: "bg-review" },
  rejected: { label: "Rejected", cls: "bg-manual-soft text-faint", dot: "bg-faint" },
};

export function StatusBadge({ status, large }: { status: DocStatus; large?: boolean }) {
  const s = STATUS[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-medium ${large ? "px-3 py-1 text-sm" : "px-2.5 py-0.5 text-xs"} ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

const LEVEL: Record<Level, { cls: string; path: string; label: string }> = {
  ok: { cls: "text-ready", path: "M6 10.5l2.8 2.8L14.5 7.5", label: "Passed" },
  info: { cls: "text-carbon", path: "M10 9.2v5M10 6.2v.1", label: "Note" },
  warn: { cls: "text-review", path: "M10 5.8v5.2M10 14v.1", label: "Warning" },
  error: { cls: "text-blocked", path: "M7 7l6 6M13 7l-6 6", label: "Problem" },
};

export function LevelIcon({ level, className = "" }: { level: Level; className?: string }) {
  const l = LEVEL[level];
  return (
    <svg viewBox="0 0 20 20" className={`h-5 w-5 shrink-0 ${l.cls} ${className}`} role="img" aria-label={l.label}>
      <circle cx="10" cy="10" r="9" fill="currentColor" opacity="0.12" />
      <path d={l.path} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
