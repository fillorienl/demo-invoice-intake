import Link from "next/link";
import { notFound } from "next/navigation";
import { ProcessButton } from "@/components/Buttons";
import { DecisionPanel, FixPanel } from "@/components/ReviewPanels";
import { LevelIcon, StatusBadge } from "@/components/Status";
import { date, dateTime, eur, iban, num } from "@/lib/format";
import { daysBetween, normalizeId, normalizePoRef } from "@/lib/normalize";
import { erp, getState, isClosed } from "@/lib/store";
import type { Check, Level } from "@/lib/types";

export const dynamic = "force-dynamic";

const VERDICT: Record<string, { bar: string; title: string }> = {
  ready: { bar: "border-l-ready", title: "Ready to book" },
  review: { bar: "border-l-review", title: "Needs your review" },
  blocked: { bar: "border-l-blocked", title: "Do not book" },
  manual: { bar: "border-l-manual", title: "Manual handling" },
};

const LEVEL_ORDER: Level[] = ["error", "warn", "info", "ok"];

export default async function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const state = await getState();
  const doc = state.documents.find((d) => d.id === id);
  if (!doc) notFound();

  const inv = doc.extraction;
  const m = doc.match;
  const audit = state.audit.filter((a) => a.doc_id === id).sort((a, b) => a.at.localeCompare(b.at));
  const adapter = erp();
  const [suppliers, pos] = await Promise.all([adapter.listSuppliers(), adapter.listPurchaseOrders()]);
  const supplier = m?.supplier_id ? suppliers.find((s) => s.id === m.supplier_id) : undefined;
  const closed = isClosed(doc);
  const checks = m ? [...m.checks].sort((a, b) => LEVEL_ORDER.indexOf(a.level) - LEVEL_ORDER.indexOf(b.level)) : [];
  const problems = checks.filter((c) => c.level !== "ok");
  const passed = checks.filter((c) => c.level === "ok");

  return (
    <div className="space-y-6">
      <div>
        <Link href="/" className="inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-ink">
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M12 5l-5 5 5 5" />
          </svg>
          Inbox
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="text-[26px] font-semibold leading-tight tracking-tight">{inv?.supplier.name ?? doc.filename}</h1>
            {inv && (
              <p className="mt-1 flex flex-wrap items-baseline gap-x-4 gap-y-1 text-[15px] text-muted">
                <span className="code text-[14px] text-ink">{inv.invoice_number}</span>
                <span>{date(inv.invoice_date)}</span>
                <span className="font-semibold text-ink">{eur(inv.total)}</span>
              </p>
            )}
          </div>
          <StatusBadge status={doc.status} large />
        </div>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* ---- The source document, in a dark tray so it reads as "the paper" ---- */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <div className="overflow-hidden rounded-[10px] bg-ink-2 p-2">
            <div className="flex items-center justify-between gap-3 px-2 pb-2 pt-1 text-xs text-white/70">
              <span className="truncate">{doc.filename}</span>
              <a href={`/api/files/${doc.id}`} target="_blank" className="shrink-0 hover:text-white">
                Open in new tab
              </a>
            </div>
            <iframe src={`/api/files/${doc.id}#view=FitH&toolbar=0`} className="h-[60vh] w-full rounded-md bg-white lg:h-[calc(100vh-150px)]" title={`Invoice PDF ${doc.filename}`} />
          </div>
        </div>

        <div className="space-y-5">
          {!inv && (
            <section className="panel space-y-4 p-6">
              {doc.status === "error" ? (
                <div>
                  <h2 className="font-semibold text-blocked">Couldn&apos;t read this invoice</h2>
                  <p className="mt-1 text-sm text-muted">{doc.error}</p>
                </div>
              ) : (
                <div>
                  <h2 className="font-semibold">Not read yet</h2>
                  <p className="mt-1 text-sm text-muted">The AI model will pull the supplier, amounts and lines out of the PDF. Then the checks run against the ERP.</p>
                </div>
              )}
              <ProcessButton id={doc.id} label={doc.status === "error" ? "Try again" : "Read with AI"} />
            </section>
          )}

          {inv && m && (
            <>
              {/* ---- Verdict and decision come first: it's what the reviewer is here for ---- */}
              <section className={`panel border-l-4 p-5 shadow-[0_1px_2px_rgba(22,33,58,0.06),0_8px_24px_-12px_rgba(22,33,58,0.18)] ${closed || doc.status === "on_hold" ? "border-l-ink" : VERDICT[m.outcome].bar}`}>
                {doc.decision ? (
                  <div>
                    <h2 className="text-lg font-semibold">
                      {doc.decision.action === "book" ? `Booked as ${doc.decision.booking_id}` : doc.decision.action === "hold" ? "On hold" : "Rejected"}
                    </h2>
                    <p className="mt-1 text-sm text-muted">
                      By {doc.decision.by} on {dateTime(doc.decision.at)}
                    </p>
                    {doc.decision.note && <p className="mt-3 rounded-md bg-paper px-3 py-2 text-sm">“{doc.decision.note}”</p>}
                    {doc.status === "on_hold" && (
                      <div className="mt-4 border-t border-line pt-4">
                        <DecisionPanel id={doc.id} outcome={m.outcome} />
                      </div>
                    )}
                  </div>
                ) : (
                  <>
                    <h2 className="text-lg font-semibold">{VERDICT[m.outcome].title}</h2>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{verdictText(m.summary)}</p>
                    <div className="mt-4">
                      <DecisionPanel id={doc.id} outcome={m.outcome} />
                    </div>
                  </>
                )}
              </section>

              <section className="panel">
                <h2 className="flex items-baseline justify-between border-b border-line px-5 py-3">
                  <span className="font-semibold">Checks</span>
                  <span className="text-[13px] text-muted">
                    {passed.length} of {checks.length} passed
                  </span>
                </h2>
                <ul className="divide-y divide-line">
                  {problems.map((c) => (
                    <CheckRow key={c.id} c={c} />
                  ))}
                </ul>
                {passed.length > 0 && (
                  <ul className={`flex flex-wrap gap-x-5 gap-y-2 px-5 py-3.5 ${problems.length ? "border-t border-line bg-paper/50" : ""}`}>
                    {passed.map((c) => (
                      <li key={c.id} className="flex items-center gap-1.5 text-[13px] text-muted" title={c.detail}>
                        <LevelIcon level="ok" className="h-4 w-4" />
                        {c.title}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="panel overflow-x-auto">
                <h2 className="border-b border-line px-5 py-3 font-semibold">Invoice against the ERP</h2>
                <table className="w-full min-w-[480px] text-sm">
                  <thead>
                    <tr className="text-left text-[13px] text-muted">
                      <th className="w-[26%] px-5 pb-1 pt-3 font-normal" />
                      <th className="px-3 pb-1 pt-3 font-normal">On the invoice</th>
                      <th className="px-3 pb-1 pt-3 font-normal">In the ERP</th>
                      <th className="w-10 px-3 pb-1 pt-3" />
                    </tr>
                  </thead>
                  <tbody>
                    <Compare
                      label="Supplier"
                      invoice={inv.supplier.name}
                      erp={supplier ? supplier.name : "Not in supplier records"}
                      level={supplier ? "ok" : "error"}
                    />
                    <Compare
                      label="VAT number"
                      invoice={inv.supplier.vat_number}
                      erp={supplier?.vat_number}
                      mono
                      level={!supplier ? undefined : normalizeId(inv.supplier.vat_number) === normalizeId(supplier.vat_number) ? "ok" : "warn"}
                    />
                    <Compare
                      label="Pay to"
                      invoice={iban(inv.supplier.iban)}
                      erp={supplier ? iban(supplier.iban) : null}
                      mono
                      level={!supplier || !inv.supplier.iban ? undefined : normalizeId(inv.supplier.iban) === normalizeId(supplier.iban) ? "ok" : "error"}
                    />
                    <Compare
                      label="Purchase order"
                      invoice={inv.po_reference ?? "None printed"}
                      erp={m.po_number ?? (normalizePoRef(inv.po_reference) ? "Not found" : "–")}
                      mono
                      level={m.po_number ? "ok" : inv.po_reference ? "error" : "warn"}
                    />
                    {supplier && inv.invoice_date && inv.due_date && (
                      <Compare
                        label="Payment term"
                        invoice={`${daysBetween(inv.invoice_date, inv.due_date)} days, due ${date(inv.due_date)}`}
                        erp={`${supplier.payment_terms_days} days agreed`}
                        level={daysBetween(inv.invoice_date, inv.due_date) < supplier.payment_terms_days - 1 ? "warn" : "ok"}
                      />
                    )}
                  </tbody>
                </table>
                {inv.notes && (
                  <p className="mx-5 mb-4 mt-2 rounded-md bg-paper px-3 py-2 text-sm">
                    <span className="text-muted">Printed on the invoice: </span>“{inv.notes}”
                  </p>
                )}
                <div className="h-2" />
              </section>

              <section className="panel overflow-x-auto">
                <h2 className="border-b border-line px-5 py-3 font-semibold">{m.po_number ? `Lines against ${m.po_number}` : "Invoice lines"}</h2>
                <table className="w-full min-w-[540px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-[13px] text-muted">
                      <th className="px-5 py-2.5 font-normal">Item</th>
                      <th className="whitespace-nowrap px-2 py-2.5 text-right font-normal">Invoiced</th>
                      <th className="whitespace-nowrap px-2 py-2.5 text-right font-normal">Received</th>
                      <th className="whitespace-nowrap px-2 py-2.5 text-right font-normal">Price</th>
                      <th className="whitespace-nowrap px-2 py-2.5 text-right font-normal">PO price</th>
                      <th className="whitespace-nowrap py-2.5 pl-2 pr-5 text-right font-normal">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {inv.lines.map((l, i) => {
                      const lm = m.lines[i];
                      const warn = lm?.flags.some((f) => f.level === "warn");
                      const priceOff = lm?.po_unit_price != null && Math.abs(l.unit_price - lm.po_unit_price) > 0.005;
                      const qtyOff = lm?.qty_received_open != null && l.quantity > lm.qty_received_open;
                      return (
                        <tr key={i} className={`border-b border-line align-top last:border-0 ${warn ? "bg-review-soft/50" : ""}`}>
                          <td className="py-3 pl-5 pr-2">
                            <div>{l.description}</div>
                            <div className="code mt-0.5 text-[12px] text-faint">
                              {l.supplier_article_code ?? "no item code"}
                              {lm?.sku && <span className="text-muted"> matched to {lm.sku}</span>}
                            </div>
                            {lm?.flags
                              .filter((f) => f.level !== "ok")
                              .map((f, k) => (
                                <div key={k} className="mt-1.5 flex items-start gap-1.5 text-[13px] text-review">
                                  <LevelIcon level={f.level} className="h-4 w-4" />
                                  {f.text}
                                </div>
                              ))}
                          </td>
                          <td className={`px-2 py-3 text-right ${qtyOff ? "font-semibold text-review" : ""}`}>{num(l.quantity)}</td>
                          <td className="px-2 py-3 text-right text-muted">{num(lm?.qty_received_open)}</td>
                          <td className={`px-2 py-3 text-right ${priceOff ? "font-semibold text-review" : ""}`}>{eur(l.unit_price)}</td>
                          <td className="px-2 py-3 text-right text-muted">{eur(lm?.po_unit_price)}</td>
                          <td className="whitespace-nowrap py-3 pl-2 pr-5 text-right">{eur(l.line_total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <div className="flex justify-end border-t border-line px-5 py-4">
                  <dl className="grid grid-cols-[auto_auto] gap-x-10 gap-y-1.5 text-sm">
                    <dt className="text-muted">Subtotal</dt>
                    <dd className="text-right">{eur(inv.subtotal)}</dd>
                    {inv.vat_lines.map((v, i) => (
                      <div key={i} className="contents">
                        <dt className="text-muted">{inv.reverse_charge ? "VAT reverse charged" : `VAT ${v.rate}%`}</dt>
                        <dd className="text-right">{eur(v.amount)}</dd>
                      </div>
                    ))}
                    <dt className="pt-1.5 font-semibold">Total</dt>
                    <dd className="pt-1.5 text-right text-base font-semibold">{eur(inv.total)}</dd>
                  </dl>
                </div>
              </section>

              {!closed && (
                <details className="panel group px-5 py-4">
                  <summary className="cursor-pointer list-none font-semibold [&::-webkit-details-marker]:hidden">
                    <span className="inline-flex items-center gap-2">
                      <svg viewBox="0 0 20 20" className="h-4 w-4 transition-transform group-open:rotate-90" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                        <path d="M8 5l5 5-5 5" />
                      </svg>
                      Correct the supplier or purchase order
                    </span>
                  </summary>
                  <p className="mb-4 mt-2 text-[13px] text-muted">If the AI misread a reference, or the supplier left the PO number off, pick the right one. The checks run again without a new AI call.</p>
                  <FixPanel
                    id={doc.id}
                    suppliers={suppliers.map((s) => ({ id: s.id, name: s.name }))}
                    pos={pos.map((p) => ({ number: p.number, supplier_id: p.supplier_id }))}
                    supplierId={doc.overrides?.supplier_id ?? ""}
                    poNumber={doc.overrides?.po_number ?? ""}
                  />
                </details>
              )}
            </>
          )}

          <section className="panel px-5 py-4">
            <h2 className="font-semibold">Audit trail</h2>
            <ol className="relative mt-4 space-y-4 border-l border-line pl-5">
              {audit.map((a, i) => (
                <li key={i} className="relative">
                  <span className={`absolute -left-[25px] top-1.5 h-2 w-2 rounded-full ring-4 ring-white ${a.actor === "Intake bot" ? "bg-carbon" : a.actor.includes("mailbox") ? "bg-faint" : "bg-ink"}`} />
                  <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                    <span className="font-medium">{a.event}</span>
                    <span className="text-[13px] text-muted">{a.actor}</span>
                    <span className="ml-auto text-xs text-faint">{dateTime(a.at)}</span>
                  </div>
                  {a.detail && <p className="mt-0.5 text-[13px] leading-relaxed text-muted">{a.detail}</p>}
                </li>
              ))}
            </ol>
          </section>
        </div>
      </div>
    </div>
  );
}

/** The summary starts with the same words as the verdict title; drop them here. */
function verdictText(summary: string) {
  const s = summary.replace(/^(Do not book|Needs a look|Manual handling):\s*/, "");
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function CheckRow({ c }: { c: Check }) {
  return (
    <li className="flex gap-3 px-5 py-3.5">
      <LevelIcon level={c.level} className="mt-px" />
      <div className="min-w-0">
        <div className={`text-sm ${c.level === "error" ? "font-semibold text-blocked" : "font-medium"}`}>{c.title}</div>
        {c.detail && <div className="mt-1 text-[13px] leading-relaxed text-muted">{c.detail}</div>}
      </div>
    </li>
  );
}

function Compare({ label, invoice, erp, mono, level }: { label: string; invoice: string | null | undefined; erp: string | null | undefined; mono?: boolean; level?: Level }) {
  const bad = level === "error";
  return (
    <tr className="align-top">
      <td className="px-5 py-2 text-muted">{label}</td>
      <td className={`break-words px-3 py-2 ${mono ? "code" : ""} ${bad ? "font-semibold text-blocked" : ""}`}>{invoice || "–"}</td>
      <td className={`break-words px-3 py-2 ${mono ? "code" : ""} text-muted`}>{erp || "–"}</td>
      <td className="px-3 py-2">{level && <LevelIcon level={level} className="h-[18px] w-[18px]" />}</td>
    </tr>
  );
}
