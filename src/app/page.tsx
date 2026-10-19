import Link from "next/link";
import { ProcessAllButton, UploadButton } from "@/components/Buttons";
import { LevelIcon, StatusBadge } from "@/components/Status";
import { readerLabel } from "@/lib/extract";
import { dateTime, eur } from "@/lib/format";
import { getState } from "@/lib/store";
import type { DocStatus, InboxDocument } from "@/lib/types";

export const dynamic = "force-dynamic";

const ORDER: DocStatus[] = ["blocked", "review", "manual", "error", "on_hold", "ready", "new", "booked", "rejected"];

const VIEWS = {
  all: { label: "All", match: (_: DocStatus) => true },
  attention: { label: "Needs a person", match: (s: DocStatus) => ["review", "blocked", "manual", "error", "on_hold"].includes(s) },
  ready: { label: "Ready to book", match: (s: DocStatus) => s === "ready" },
  new: { label: "Not read yet", match: (s: DocStatus) => s === "new" },
  done: { label: "Booked or rejected", match: (s: DocStatus) => s === "booked" || s === "rejected" },
} as const;
type View = keyof typeof VIEWS;

const OUTCOMES: { key: DocStatus[]; label: string; color: string; view: View }[] = [
  { key: ["ready"], label: "Ready to book", color: "bg-ready", view: "ready" },
  { key: ["review"], label: "Needs review", color: "bg-review", view: "attention" },
  { key: ["blocked"], label: "Blocked", color: "bg-blocked", view: "attention" },
  { key: ["manual", "on_hold", "error"], label: "Manual or on hold", color: "bg-manual", view: "attention" },
  { key: ["booked", "rejected"], label: "Booked or rejected", color: "bg-ink", view: "done" },
];

export default async function Inbox({ searchParams }: { searchParams: Promise<{ view?: string }> }) {
  const { view: viewParam } = await searchParams;
  const view: View = viewParam && viewParam in VIEWS ? (viewParam as View) : "all";
  const { documents } = await getState();

  const read = documents.filter((d) => d.extraction).length;
  const checked = documents.filter((d) => d.match).length;
  const newIds = documents.filter((d) => d.status === "new").map((d) => d.id);
  const outcomes = OUTCOMES.map((o) => ({ ...o, count: documents.filter((d) => o.key.includes(d.status)).length }));
  const decided = outcomes.reduce((s, o) => s + o.count, 0);
  const bookedTotal = documents.filter((d) => d.status === "booked").reduce((s, d) => s + (d.extraction?.total ?? 0), 0);

  const rows = documents
    .filter((d) => VIEWS[view].match(d.status))
    .sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status) || b.received_at.localeCompare(a.received_at));

  return (
    <div className="space-y-7">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-[26px] font-semibold leading-tight tracking-tight">Supplier invoices</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted">
            Invoices sent to facturen@. An AI model reads each PDF, then the app checks it against the supplier record, the purchase order and what was delivered. Nothing is booked until a person approves it.
          </p>
        </div>
        <div className="flex flex-wrap items-start gap-2">
          <UploadButton />
          {newIds.length > 0 && <ProcessAllButton ids={newIds} />}
        </div>
      </header>

      {/* The flow, left to right: what came in, what the AI read, what the checks decided. */}
      <section aria-label="Processing flow" className="panel grid grid-cols-3 gap-px overflow-hidden bg-line md:grid-cols-[1fr_1fr_1fr_2.2fr]">
        <Stage title="Received" value={documents.length} unit={documents.length === 1 ? "invoice" : "invoices"} progress={1} />
        <Stage title="Read by AI" value={read} unit={`of ${documents.length}`} progress={documents.length ? read / documents.length : 0} note={readerLabel()} />
        <Stage title="Checked against ERP" value={checked} unit={`of ${documents.length}`} progress={documents.length ? checked / documents.length : 0} note="Supplier, bank account, duplicates, PO, receipt, VAT" />
        <div className="col-span-3 bg-white p-4 sm:p-5 md:col-span-1">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-sm font-medium">Outcome</span>
            {bookedTotal > 0 && <span className="text-[13px] text-muted">{eur(bookedTotal)} booked</span>}
          </div>
          <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-paper" role="img" aria-label={outcomes.map((o) => `${o.label}: ${o.count}`).join(", ")}>
            {decided > 0 &&
              outcomes.filter((o) => o.count > 0).map((o) => (
                <Link key={o.label} href={`/?view=${o.view}`} title={`${o.label}: ${o.count}`} className={`${o.color} border-r-2 border-white transition-[flex-grow] duration-500 last:border-r-0 hover:opacity-80`} style={{ flexGrow: o.count }} />
              ))}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-[13px]">
            {outcomes.map((o) => (
              <li key={o.label}>
                <Link href={`/?view=${o.view}`} className="flex items-center gap-2 text-muted hover:text-ink">
                  <span className={`h-2 w-2 rounded-full ${o.color}`} />
                  <span className="font-medium text-ink">{o.count}</span> {o.label.toLowerCase()}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="space-y-3">
        <nav aria-label="Filter" className="flex flex-wrap gap-1 rounded-lg bg-white p-1 ring-1 ring-line sm:inline-flex">
          {(Object.keys(VIEWS) as View[]).map((v) => {
            const n = documents.filter((d) => VIEWS[v].match(d.status)).length;
            const active = v === view;
            return (
              <Link
                key={v}
                href={v === "all" ? "/" : `/?view=${v}`}
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-[13px] transition-colors ${active ? "bg-ink text-white" : "text-muted hover:text-ink"}`}
              >
                {VIEWS[v].label} <span className={active ? "text-white/60" : "text-faint"}>{n}</span>
              </Link>
            );
          })}
        </nav>

        <div className="panel overflow-x-auto">
          {rows.length === 0 ? (
            <p className="px-6 py-12 text-center text-sm text-muted">
              No invoices in this view. <Link href="/" className="text-carbon underline underline-offset-2">Show all invoices</Link>
            </p>
          ) : (
            <>
            <ul className="divide-y divide-line md:hidden">
              {rows.map((d) => (
                <MobileRow key={d.id} d={d} />
              ))}
            </ul>
            <table className="hidden w-full min-w-[880px] text-sm md:table">
              <thead>
                <tr className="border-b border-line text-left text-[13px] text-muted">
                  <th className="px-5 py-3 font-normal">Supplier and invoice</th>
                  <th className="px-3 py-3 font-normal">Received</th>
                  <th className="px-3 py-3 text-right font-normal">Amount</th>
                  <th className="px-3 py-3 font-normal">Status</th>
                  <th className="px-5 py-3 font-normal">What the checks found</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((d) => (
                  <Row key={d.id} d={d} />
                ))}
              </tbody>
            </table>
            </>
          )}
        </div>
      </section>
    </div>
  );
}

function Stage({ title, value, unit, progress, note }: { title: string; value: number; unit: string; progress: number; note?: string }) {
  return (
    <div className="relative bg-white p-4 sm:p-5">
      <div className="text-[13px] font-medium sm:text-sm">{title}</div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className="text-[24px] font-semibold leading-none tracking-tight sm:text-[28px]">{value}</span>
        <span className="text-[13px] text-muted">{unit}</span>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-paper">
        <div className="h-full rounded-full bg-carbon transition-[width] duration-500" style={{ width: `${Math.round(progress * 100)}%` }} />
      </div>
      {note && <div className="mt-2 hidden truncate text-xs text-faint sm:block" title={note}>{note}</div>}
    </div>
  );
}

function finding(d: InboxDocument) {
  const top = d.match?.checks.find((c) => c.level === "error") ?? d.match?.checks.find((c) => c.level === "warn");
  // for line-level problems, show the first concrete one instead of "1 of 2 lines need a look"
  const lineIssue = d.match?.lines.flatMap((l) => l.flags.filter((f) => f.level === "warn").map((f) => `Line ${l.index + 1}: ${f.text}`))[0];
  return { top, topText: top?.id === "three_way" && lineIssue ? lineIssue : top?.title };
}

function Finding({ d }: { d: InboxDocument }) {
  const { top, topText } = finding(d);
  if (d.status === "new") return <span className="text-faint">Waiting to be read</span>;
  if (d.status === "error") return <span className="text-blocked">{d.error}</span>;
  if (d.decision) return <span className="text-muted">{d.decision.booking_id ? `Booked as ${d.decision.booking_id}` : `“${d.decision.note}”`}</span>;
  if (top)
    return (
      <span className="flex items-start gap-2">
        <LevelIcon level={top.level} className="mt-px h-[18px] w-[18px]" />
        <span>{topText}</span>
      </span>
    );
  return (
    <span className="flex items-start gap-2 text-ready">
      <LevelIcon level="ok" className="mt-px h-[18px] w-[18px]" />
      All checks passed
    </span>
  );
}

function justRead(d: InboxDocument) {
  return d.extraction_meta && Date.now() - Date.parse(d.extraction_meta.at) < 4000;
}

function MobileRow({ d }: { d: InboxDocument }) {
  const inv = d.extraction;
  return (
    <li className={`relative space-y-2 px-4 py-3.5 ${justRead(d) ? "just-read" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <Link href={`/invoice/${d.id}`} className="min-w-0 font-medium after:absolute after:inset-0 after:content-['']">
          <span className="block truncate">{inv?.supplier.name ?? d.filename}</span>
          <span className={`block font-normal text-muted ${inv ? "code" : "text-[13px]"}`}>{inv?.invoice_number ?? (d.source === "upload" ? "Uploaded by you" : "From facturen@")}</span>
        </Link>
        <span className="shrink-0 text-right">
          <span className="block font-medium">{inv ? eur(inv.total) : "–"}</span>
        </span>
      </div>
      <StatusBadge status={d.status} />
      <div className="text-[13px]">
        <Finding d={d} />
      </div>
    </li>
  );
}

function Row({ d }: { d: InboxDocument }) {
  const inv = d.extraction;

  return (
    <tr className={`relative border-b border-line align-top last:border-0 hover:bg-paper/70 ${justRead(d) ? "just-read" : ""}`}>
      <td className="px-5 py-3.5">
        <Link href={`/invoice/${d.id}`} className="font-medium after:absolute after:inset-0 after:content-['']">
          {inv?.supplier.name ?? d.filename}
        </Link>
        <div className={`mt-0.5 text-muted ${inv ? "code" : "text-[13px]"}`}>{inv?.invoice_number ?? (d.source === "upload" ? "Uploaded by you" : "From facturen@")}</div>
      </td>
      <td className="whitespace-nowrap px-3 py-3.5 text-muted">{dateTime(d.received_at)}</td>
      <td className="whitespace-nowrap px-3 py-3.5 text-right font-medium">{inv ? eur(inv.total) : <span className="font-normal text-faint">–</span>}</td>
      <td className="px-3 py-3.5">
        <StatusBadge status={d.status} />
      </td>
      <td className="px-5 py-3.5">
        <Finding d={d} />
      </td>
    </tr>
  );
}
