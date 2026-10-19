"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideAction, recheckAction } from "@/app/actions";
import type { Outcome } from "@/lib/types";

export function FixPanel(props: {
  id: string;
  suppliers: { id: string; name: string }[];
  pos: { number: string; supplier_id: string }[];
  supplierId: string;
  poNumber: string;
}) {
  const router = useRouter();
  const [supplierId, setSupplierId] = useState(props.supplierId);
  const [poNumber, setPoNumber] = useState(props.poNumber);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const pos = props.pos.filter((p) => !supplierId || p.supplier_id === supplierId);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1.5">
          <span className="label">Supplier</span>
          <select className="field" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
            <option value="">As read from the invoice</option>
            {props.suppliers.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.id})
              </option>
            ))}
          </select>
        </label>
        <label className="block space-y-1.5">
          <span className="label">Purchase order</span>
          <select className="field" value={poNumber} onChange={(e) => setPoNumber(e.target.value)}>
            <option value="">As read from the invoice</option>
            {pos.map((p) => (
              <option key={p.number} value={p.number}>
                {p.number}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          className="btn-secondary"
          disabled={pending}
          onClick={() =>
            start(async () => {
              setError(null);
              const r = await recheckAction(props.id, supplierId, poNumber);
              if (!r.ok) setError(r.error);
              router.refresh();
            })
          }
        >
          {pending && <span className="spinner" />}
          Run the checks again
        </button>
        {error && <span className="text-xs text-blocked">{error}</span>}
      </div>
    </div>
  );
}

export function DecisionPanel({ id, outcome }: { id: string; outcome: Outcome }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canBook = outcome === "ready" || outcome === "review";

  const act = (action: "book" | "hold" | "reject") =>
    start(async () => {
      setBusy(action);
      setError(null);
      const r = await decideAction(id, action, note);
      if (!r.ok) setError(r.error);
      setBusy(null);
      router.refresh();
    });

  const placeholder =
    outcome === "ready"
      ? "Note for the audit trail (optional)"
      : outcome === "review"
        ? "Why approve anyway, or why hold? For example: price increase agreed by phone with HydroParts"
        : outcome === "blocked"
          ? "Reason for the hold or rejection. For example: called the supplier on our own number, bank change not genuine"
          : "Reason. For example: forwarded to the facility manager for approval";

  return (
    <div className="space-y-3">
      <textarea aria-label="Note" className="field min-h-[68px] resize-y" placeholder={placeholder} value={note} onChange={(e) => setNote(e.target.value)} />
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn-primary" disabled={!canBook || pending} onClick={() => act("book")} title={canBook ? undefined : "Blocked and manual invoices can't be booked from here"}>
          {busy === "book" && <span className="spinner" />}
          {outcome === "review" ? "Approve anyway and book" : "Approve and book"}
        </button>
        <button className="btn-secondary" disabled={pending} onClick={() => act("hold")}>
          {busy === "hold" && <span className="spinner" />}
          Put on hold
        </button>
        <button className="btn-danger" disabled={pending} onClick={() => act("reject")}>
          {busy === "reject" && <span className="spinner" />}
          Reject
        </button>
        {!canBook && <span className="text-[13px] text-muted">Booking is switched off for {outcome === "blocked" ? "blocked" : "manual"} invoices.</span>}
      </div>
      {error && <p className="text-sm text-blocked">{error}</p>}
    </div>
  );
}
