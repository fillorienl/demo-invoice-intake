/**
 * Deterministic checks on an extracted invoice against the ERP.
 * The AI only reads the document; every decision below is plain code, so it is
 * explainable and repeatable. Nothing here writes to the ERP.
 */
import type { ErpAdapter } from "./erp/adapter";
import { date, eur, iban, num, pct } from "./format";
import { addDays, daysBetween, normalizeId, normalizeName, normalizePoRef, round2, similarity } from "./normalize";
import type { Check, ExtractedInvoice, LineMatch, MatchResult, Outcome, Supplier } from "./types";

const PRICE_TOLERANCE = 0.01; // 1% before a price difference is flagged
const AMOUNT_TOLERANCE = 0.02; // rounding tolerance in euros
const DESCRIPTION_MATCH_MIN = 0.6;

export interface MatchOptions {
  overrides?: { supplier_id?: string; po_number?: string };
  /** Other documents in the inbox, to catch the same invoice being processed twice */
  otherInboxDocs?: { id: string; filename: string; supplier_id: string | null; invoice_number: string; status: string }[];
}

export async function matchInvoice(inv: ExtractedInvoice, erp: ErpAdapter, opts: MatchOptions = {}): Promise<MatchResult> {
  const checks: Check[] = [];
  const suppliers = await erp.listSuppliers();

  // ---- 1. Supplier ----
  const { supplier, by } = findSupplier(inv, suppliers, opts.overrides?.supplier_id);
  if (supplier) {
    const how = { override: "chosen by reviewer", vat_number: "VAT number", kvk_number: "KvK number", iban: "bank account", name: "name only" }[by!];
    checks.push({
      id: "supplier",
      level: by === "name" ? "warn" : "ok",
      title: `Supplier recognised: ${supplier.name} (${supplier.id})`,
      detail: by === "name" ? "Matched on name only; the VAT and KvK numbers on the invoice are not in the supplier record." : `Matched on ${how}.`,
    });
  } else {
    checks.push({
      id: "supplier",
      level: "error",
      title: "Unknown supplier",
      detail: `${inv.supplier.name}${inv.supplier.vat_number ? ` (VAT ${inv.supplier.vat_number})` : ""} is not in the supplier master data. Route to the manual queue to create the supplier or check the invoice.`,
    });
  }

  // ---- 2. Bank account ----
  if (supplier) {
    if (!inv.supplier.iban) {
      checks.push({ id: "iban", level: "info", title: "No bank account on the invoice", detail: `Payment will go to the account on file: ${iban(supplier.iban)}.` });
    } else if (normalizeId(inv.supplier.iban) !== normalizeId(supplier.iban)) {
      checks.push({
        id: "iban",
        level: "error",
        title: "Bank account differs from supplier master data",
        detail:
          `Invoice: ${iban(inv.supplier.iban)}. On file: ${iban(supplier.iban)}. ` +
          (inv.notes && /rekening|bank|iban|account/i.test(inv.notes) ? `The invoice says: “${inv.notes}” ` : "") +
          "This is the classic invoice-fraud pattern. Call the supplier on a number from your own records before booking or paying.",
      });
    } else {
      checks.push({ id: "iban", level: "ok", title: "Bank account matches supplier master data" });
    }
  }

  // ---- 3. Duplicate ----
  if (supplier) {
    const booked = await erp.findBookedInvoice(supplier.id, inv.invoice_number);
    if (booked) {
      checks.push({
        id: "duplicate",
        level: "error",
        title: `Duplicate: already booked as ${booked.booking_id}`,
        detail: `Invoice ${booked.invoice_number} of ${eur(booked.total)} was booked on ${date(booked.booked_at)} by ${booked.booked_by}${booked.status === "paid" ? " and has been paid" : ""}.`,
      });
    } else {
      const twin = opts.otherInboxDocs?.find(
        (d) => d.supplier_id === supplier.id && normalizeId(d.invoice_number) === normalizeId(inv.invoice_number) && d.status !== "rejected",
      );
      if (twin) {
        checks.push({ id: "duplicate", level: "error", title: "Duplicate: same invoice is already in the inbox", detail: `See ${twin.filename}.` });
      } else {
        checks.push({ id: "duplicate", level: "ok", title: "Not booked before" });
      }
    }
  }

  // ---- 4. Purchase order ----
  const poRef = opts.overrides?.po_number ?? normalizePoRef(inv.po_reference);
  const po = poRef ? await erp.getPurchaseOrder(poRef) : null;
  if (!poRef) {
    checks.push({
      id: "po",
      level: "warn",
      title: "No purchase order reference",
      detail: "Non-PO invoice: needs a cost account and approval from the budget holder.",
    });
  } else if (!po) {
    checks.push({ id: "po", level: "error", title: `Purchase order ${poRef} not found` });
  } else if (supplier && po.supplier_id !== supplier.id) {
    checks.push({ id: "po", level: "error", title: `${po.number} belongs to another supplier`, detail: `The PO was placed with ${suppliers.find((s) => s.id === po.supplier_id)?.name ?? po.supplier_id}.` });
  } else {
    const printed = inv.po_reference && inv.po_reference !== po.number ? ` (printed as “${inv.po_reference}”)` : "";
    checks.push({ id: "po", level: "ok", title: `Purchase order ${po.number} found${printed}`, detail: `Ordered ${date(po.date)}.` });
  }

  // ---- 5. Lines: PO price and goods received ----
  const lines: LineMatch[] = inv.lines.map((_, index) => ({
    index,
    po_line_no: null,
    sku: null,
    po_unit_price: null,
    qty_received_open: null,
    matched_by: null,
    flags: [],
  }));

  if (po && (!supplier || po.supplier_id === supplier.id)) {
    const receipts = await erp.getGoodsReceipts(po.number);
    const received = (lineNo: number) => receipts.reduce((s, g) => s + (g.lines.find((l) => l.line_no === lineNo)?.qty ?? 0), 0);
    const used = new Set<number>();

    inv.lines.forEach((il, i) => {
      const lm = lines[i];
      let pl = il.supplier_article_code
        ? po.lines.find((l) => !used.has(l.line_no) && normalizeId(l.supplier_article_code) === normalizeId(il.supplier_article_code))
        : undefined;
      if (pl) lm.matched_by = "article_code";
      if (!pl) {
        const scored = po.lines
          .filter((l) => !used.has(l.line_no))
          .map((l) => ({ l, s: similarity(il.description, l.description) }))
          .sort((a, b) => b.s - a.s);
        if (scored[0] && scored[0].s >= DESCRIPTION_MATCH_MIN) {
          pl = scored[0].l;
          lm.matched_by = "description";
        }
      }
      if (!pl) {
        lm.flags.push({ level: "warn", text: "Not on the purchase order" });
        return;
      }
      used.add(pl.line_no);
      lm.po_line_no = pl.line_no;
      lm.sku = pl.sku;
      lm.po_unit_price = pl.unit_price;
      const open = received(pl.line_no) - pl.qty_invoiced;
      lm.qty_received_open = open;

      const diff = il.unit_price - pl.unit_price;
      if (Math.abs(diff) > Math.max(0.005, pl.unit_price * PRICE_TOLERANCE)) {
        lm.flags.push({
          level: "warn",
          text: `Price ${eur(il.unit_price)} vs PO ${eur(pl.unit_price)} (${pct((diff / pl.unit_price) * 100)}), ${eur(round2(diff * il.quantity))} ${diff > 0 ? "more" : "less"} on this line`,
        });
      }
      if (open <= 0 && il.quantity > 0) {
        lm.flags.push({ level: "warn", text: "Nothing received (or already invoiced) for this line" });
      } else if (il.quantity > open) {
        const gr = receipts.map((g) => g.number).join(", ");
        lm.flags.push({
          level: "warn",
          text: `Invoiced ${num(il.quantity)}, received ${num(open)} (${gr}): ${num(il.quantity - open)} not delivered, ${eur(round2((il.quantity - open) * il.unit_price))}`,
        });
      }
      if (il.quantity > pl.qty_ordered - pl.qty_invoiced && il.quantity <= open) {
        lm.flags.push({ level: "warn", text: `More than ordered (${num(pl.qty_ordered)})` });
      }
      if (lm.flags.length === 0) lm.flags.push({ level: "ok", text: lm.matched_by === "description" ? "Matches PO and receipt (on description)" : "Matches PO and receipt" });
    });

    const lineWarnings = lines.filter((l) => l.flags.some((f) => f.level === "warn")).length;
    const missing = po.lines.filter((l) => !used.has(l.line_no) && l.qty_ordered > l.qty_invoiced);
    checks.push(
      lineWarnings === 0
        ? { id: "three_way", level: "ok", title: "Three-way match: invoice, PO and goods receipt agree" }
        : { id: "three_way", level: "warn", title: `Three-way match: ${lineWarnings} of ${inv.lines.length} lines need a look`, detail: lines.flatMap((l) => l.flags.filter((f) => f.level === "warn").map((f) => `Line ${l.index + 1}: ${f.text}`)).join(" · ") },
    );
    if (missing.length) {
      checks.push({ id: "partial", level: "info", title: `Partial invoice: ${missing.length} PO line(s) not on this invoice`, detail: missing.map((l) => `${l.line_no}. ${l.description}`).join(" · ") });
    }
  }

  // ---- 6. Arithmetic ----
  checks.push(arithmeticCheck(inv));

  // ---- 7. VAT treatment ----
  checks.push(vatCheck(inv, supplier));

  // ---- 8. Payment term ----
  if (supplier && inv.invoice_date && inv.due_date) {
    const term = daysBetween(inv.invoice_date, inv.due_date);
    if (term < supplier.payment_terms_days - 1) {
      checks.push({
        id: "terms",
        level: "warn",
        title: `Payment term ${term} days, agreed ${supplier.payment_terms_days}`,
        detail: `Agreed terms give a due date of ${date(addDays(inv.invoice_date, supplier.payment_terms_days))}.`,
      });
    } else {
      checks.push({ id: "terms", level: "ok", title: `Payment term ${term} days, as agreed` });
    }
  }

  // ---- Outcome ----
  const outcome: Outcome = !supplier || !poRef ? "manual" : checks.some((c) => c.level === "error") ? "blocked" : checks.some((c) => c.level === "warn") ? "review" : "ready";

  return {
    supplier_id: supplier?.id ?? null,
    supplier_matched_by: by,
    po_number: po?.number ?? null,
    checks,
    lines,
    outcome,
    summary: summarise(outcome, checks),
  };
}

function findSupplier(inv: ExtractedInvoice, suppliers: Supplier[], overrideId?: string): { supplier: Supplier | null; by: MatchResult["supplier_matched_by"] } {
  if (overrideId) {
    const s = suppliers.find((x) => x.id === overrideId);
    if (s) return { supplier: s, by: "override" };
  }
  const vat = normalizeId(inv.supplier.vat_number);
  const kvk = normalizeId(inv.supplier.kvk_number);
  const ib = normalizeId(inv.supplier.iban);
  const name = normalizeName(inv.supplier.name);
  let s: Supplier | undefined;
  if (vat && (s = suppliers.find((x) => normalizeId(x.vat_number) === vat))) return { supplier: s, by: "vat_number" };
  if (kvk && (s = suppliers.find((x) => x.kvk_number && normalizeId(x.kvk_number) === kvk))) return { supplier: s, by: "kvk_number" };
  if (ib && (s = suppliers.find((x) => normalizeId(x.iban) === ib))) return { supplier: s, by: "iban" };
  if (name && (s = suppliers.find((x) => normalizeName(x.name) === name))) return { supplier: s, by: "name" };
  return { supplier: null, by: null };
}

function arithmeticCheck(inv: ExtractedInvoice): Check {
  const problems: string[] = [];
  inv.lines.forEach((l, i) => {
    if (Math.abs(l.quantity * l.unit_price - l.line_total) > AMOUNT_TOLERANCE) {
      problems.push(`line ${i + 1}: ${num(l.quantity)} × ${eur(l.unit_price)} is ${eur(round2(l.quantity * l.unit_price))}, invoice says ${eur(l.line_total)}`);
    }
  });
  const lineSum = round2(inv.lines.reduce((s, l) => s + l.line_total, 0));
  if (Math.abs(lineSum - inv.subtotal) > AMOUNT_TOLERANCE) problems.push(`lines add up to ${eur(lineSum)}, subtotal says ${eur(inv.subtotal)}`);
  for (const v of inv.vat_lines) {
    const expected = round2((v.base * v.rate) / 100);
    if (Math.abs(expected - v.amount) > AMOUNT_TOLERANCE) problems.push(`VAT ${v.rate}% over ${eur(v.base)} is ${eur(expected)}, invoice says ${eur(v.amount)}`);
  }
  const vat = inv.vat_lines.reduce((s, v) => s + v.amount, 0);
  if (Math.abs(inv.subtotal + vat - inv.total) > AMOUNT_TOLERANCE) problems.push(`subtotal + VAT is ${eur(round2(inv.subtotal + vat))}, total says ${eur(inv.total)}`);
  return problems.length
    ? { id: "arithmetic", level: "warn", title: "Amounts don't add up", detail: problems.join(" · ") }
    : { id: "arithmetic", level: "ok", title: "Lines, VAT and total add up" };
}

function vatCheck(inv: ExtractedInvoice, supplier: Supplier | null): Check {
  const country = supplier?.country ?? (inv.supplier.vat_number ?? "").slice(0, 2).toUpperCase();
  const vatTotal = inv.vat_lines.reduce((s, v) => s + v.amount, 0);
  if (inv.reverse_charge) {
    if (country && country !== "NL") {
      return { id: "vat", level: "ok", title: "VAT reverse charged (EU supplier)", detail: "No Dutch VAT on the invoice: declare it on your own return (rubriek 4b) and deduct it in 5b." };
    }
    return { id: "vat", level: "warn", title: "Reverse charge on a Dutch supplier's invoice", detail: "Only valid for specific cases (e.g. subcontracting). Check with the supplier." };
  }
  const odd = inv.vat_lines.filter((v) => ![21, 9, 0].includes(v.rate));
  if (odd.length) return { id: "vat", level: "warn", title: `Unexpected VAT rate ${odd.map((v) => v.rate + "%").join(", ")}` };
  if (country && country !== "NL" && vatTotal > 0) {
    return { id: "vat", level: "warn", title: "Foreign supplier charged VAT", detail: "EU suppliers should normally reverse-charge B2B goods. Check before booking." };
  }
  return { id: "vat", level: "ok", title: `VAT ${inv.vat_lines.map((v) => v.rate + "%").join(" + ")} as expected` };
}

function summarise(outcome: Outcome, checks: Check[]): string {
  const errors = checks.filter((c) => c.level === "error").map((c) => c.title);
  const warns = checks.filter((c) => c.level === "warn").map((c) => c.title);
  switch (outcome) {
    case "ready":
      return "All checks passed. Ready to book with one click.";
    case "review":
      return `Needs a look: ${warns.join("; ")}.`;
    case "blocked":
      return `Do not book: ${errors.join("; ")}.`;
    case "manual":
      return errors.length ? `Manual handling: ${errors[0]}.` : `Manual handling: ${warns[0] ?? "no purchase order"}.`;
  }
}
