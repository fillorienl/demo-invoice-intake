"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { processAction, resetAction, uploadAction } from "@/app/actions";

export function ProcessButton({ id, label = "Read with AI", className = "btn-primary" }: { id: string; label?: string; className?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1.5">
      <button
        className={className}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            const r = await processAction(id);
            if (!r.ok) setError(r.error);
            router.refresh();
          })
        }
      >
        {pending && <span className="spinner" />}
        {pending ? "Reading…" : label}
      </button>
      {error && <span className="text-xs text-blocked">{error}</span>}
    </span>
  );
}

export function ProcessAllButton({ ids }: { ids: string[] }) {
  const router = useRouter();
  const [progress, setProgress] = useState<number | null>(null);
  const [total, setTotal] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const run = async () => {
    setError(null);
    const queue = [...ids]; // the ids prop shrinks as rows get processed
    setTotal(queue.length);
    for (let i = 0; i < queue.length; i++) {
      setProgress(i + 1);
      const r = await processAction(queue[i]);
      if (!r.ok) setError(r.error);
      router.refresh();
    }
    setProgress(null);
  };
  return (
    <span className="inline-flex flex-col items-end gap-1.5">
      <button className="btn-primary" disabled={ids.length === 0 || progress !== null} onClick={run}>
        {progress !== null ? <span className="spinner" /> : <Sparkle />}
        {progress !== null ? `Reading ${progress} of ${total}…` : `Process ${ids.length} new invoice${ids.length === 1 ? "" : "s"}`}
      </button>
      {error && <span className="max-w-xs text-right text-xs text-blocked">{error}</span>}
    </span>
  );
}

function Sparkle() {
  return (
    <svg viewBox="0 0 20 20" className="h-4 w-4" fill="currentColor" aria-hidden>
      <path d="M10 2l1.6 4.6L16 8.2l-4.4 1.6L10 14.4 8.4 9.8 4 8.2l4.4-1.6zM15.5 13l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </svg>
  );
}

export function UploadButton() {
  const ref = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-end gap-1.5">
      <input
        ref={ref}
        type="file"
        accept="application/pdf"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (!f) return;
          const fd = new FormData();
          fd.set("file", f);
          start(async () => {
            setError(null);
            const r = await uploadAction(fd);
            if (r && !r.ok) setError(r.error);
          });
          e.target.value = "";
        }}
      />
      <button className="btn-secondary" disabled={pending} onClick={() => ref.current?.click()}>
        {pending ? (
          <span className="spinner" />
        ) : (
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M10 13V3M6 7l4-4 4 4M4 13v3h12v-3" />
          </svg>
        )}
        Upload PDF
      </button>
      {error && <span className="text-xs text-blocked">{error}</span>}
    </span>
  );
}

export function ResetButton({ dark }: { dark?: boolean }) {
  const [armed, setArmed] = useState(false);
  const [pending, start] = useTransition();
  const base = dark
    ? `btn w-full border text-[13px] ${armed ? "border-blocked bg-blocked text-white" : "border-white/20 text-white/80 hover:border-white/40 hover:text-white"}`
    : `btn border text-xs ${armed ? "border-blocked bg-blocked text-white" : "border-line bg-white text-ink"}`;
  return (
    <button
      className={base}
      disabled={pending}
      onBlur={() => setArmed(false)}
      onClick={() => {
        if (!armed) return setArmed(true);
        start(async () => {
          await resetAction();
          setArmed(false);
        });
      }}
    >
      {pending ? "Resetting…" : armed ? "Click again to reset" : "Reset demo"}
    </button>
  );
}
