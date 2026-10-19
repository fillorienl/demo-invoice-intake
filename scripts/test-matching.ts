/**
 * Checks the matching logic against the sample invoices, without calling the AI.
 * Uses the "expected" extractions (what a perfect read of each PDF looks like).
 *
 *   npm test
 */
import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { MockErp } from "../src/lib/erp/mock";
import { matchInvoice } from "../src/lib/match";
import { normalizePoRef, similarity } from "../src/lib/normalize";
import type { ExtractedInvoice, MatchResult, Outcome } from "../src/lib/types";

const root = path.join(__dirname, "..");
let failed = 0;
let passed = 0;

function assert(cond: unknown, msg: string) {
  if (cond) passed++;
  else {
    failed++;
    console.log("  ✗ " + msg);
  }
}

async function load(name: string): Promise<ExtractedInvoice> {
  return JSON.parse(await fs.readFile(path.join(root, "samples", "expected", name + ".json"), "utf8"));
}

const has = (m: MatchResult, id: string, level: string) => m.checks.some((c) => c.id === id && c.level === level);

const CASES: { file: string; outcome: Outcome; also?: (m: MatchResult) => void }[] = [
  {
    file: "01-rijnmond-RIJ-2026-10452",
    outcome: "ready",
    also: (m) => assert(m.lines.every((l) => l.matched_by === "article_code" && l.sku), "01: all lines matched on article code with SKU"),
  },
  {
    file: "02-hydroparts-HPB-26-004117",
    outcome: "review",
    also: (m) => {
      assert(m.po_number === "PO-2026-0418", "02: PO found from reference printed without prefix");
      assert(m.lines[0].flags.some((f) => f.text.startsWith("Price")), "02: price deviation flagged on line 1");
      assert(m.lines[1].flags.every((f) => f.level === "ok"), "02: line 2 clean");
    },
  },
  {
    file: "03-safework-SWP-2026-0789",
    outcome: "review",
    also: (m) => {
      assert(m.lines[0].flags.some((f) => f.text.startsWith("Invoiced 200, received 150")), "03: short delivery flagged");
      assert(m.lines[0].qty_received_open === 150, "03: received qty 150");
    },
  },
  { file: "04-kmt-scan-KMT-26-1931", outcome: "ready" },
  {
    file: "05-rijnmond-RIJ-2026-10388-kopie",
    outcome: "blocked",
    also: (m) => assert(has(m, "duplicate", "error"), "05: duplicate detected"),
  },
  {
    file: "06-hydroparts-HPB-26-004203",
    outcome: "blocked",
    also: (m) => {
      assert(has(m, "iban", "error"), "06: IBAN change detected");
      assert(has(m, "terms", "warn"), "06: short payment term flagged");
      assert(has(m, "duplicate", "ok"), "06: not a duplicate");
    },
  },
  {
    file: "07-schoonmaak-OV-2026-0917",
    outcome: "manual",
    also: (m) => assert(m.supplier_id === null && has(m, "supplier", "error"), "07: unknown supplier"),
  },
  {
    file: "08-rheinland-RVT-INV-2026-3318",
    outcome: "ready",
    also: (m) => assert(has(m, "vat", "ok") && m.checks.find((c) => c.id === "vat")!.title.includes("reverse"), "08: reverse charge accepted"),
  },
];

async function main() {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), "intake-test-"));
  const erpFile = path.join(tmp, "erp.json");
  await fs.copyFile(path.join(root, "data", "seed", "erp.json"), erpFile);
  const erp = new MockErp(erpFile);

  console.log("Sample invoices");
  for (const c of CASES) {
    const m = await matchInvoice(await load(c.file), erp);
    const ok = m.outcome === c.outcome;
    assert(ok, `${c.file}: expected ${c.outcome}, got ${m.outcome} — ${m.summary}`);
    if (ok) console.log(`  ✓ ${c.file} → ${m.outcome}`);
    c.also?.(m);
  }

  console.log("Test uploads (test-uploads/)");
  const UPLOADS: { file: string; outcome: Outcome; also?: (m: MatchResult) => void }[] = [
    { file: "U1-hydroparts-2-paginas-HPB-26-004290", outcome: "ready", also: (m) => assert(m.lines.length === 28 && m.lines.every((l) => l.po_line_no), "U1: all 28 lines matched") },
    { file: "U2-rijnmond-btw-fout-RIJ-2026-10511", outcome: "review", also: (m) => assert(has(m, "arithmetic", "warn"), "U2: VAT error caught") },
    { file: "U3-safework-geen-PO-SWP-2026-0812", outcome: "manual", also: (m) => assert(has(m, "po", "warn"), "U3: missing PO flagged") },
    { file: "U4-kmt-scan-vracht-KMT-26-1987", outcome: "review", also: (m) => assert(m.lines[2].flags.some((f) => f.text === "Not on the purchase order"), "U4: freight line not on PO") },
    { file: "U5-rheinland-duits-19pct-RVT-RE-2026-3402", outcome: "review", also: (m) => assert(has(m, "vat", "warn"), "U5: German VAT flagged") },
  ];
  for (const c of UPLOADS) {
    const inv = JSON.parse(await fs.readFile(path.join(root, "test-uploads", "expected", c.file + ".json"), "utf8")) as ExtractedInvoice;
    const m = await matchInvoice(inv, erp);
    const ok = m.outcome === c.outcome;
    assert(ok, `${c.file}: expected ${c.outcome}, got ${m.outcome} — ${m.summary}`);
    if (ok) console.log(`  ✓ ${c.file} → ${m.outcome}`);
    c.also?.(m);
  }
  {
    const inv = JSON.parse(await fs.readFile(path.join(root, "test-uploads", "expected", "U3-safework-geen-PO-SWP-2026-0812.json"), "utf8")) as ExtractedInvoice;
    const m = await matchInvoice(inv, erp, { overrides: { po_number: "PO-2026-0438" } });
    assert(m.outcome === "ready", `U3 after picking PO-2026-0438: expected ready, got ${m.outcome} — ${m.summary}`);
  }

  console.log("Description matching when article codes are missing");
  {
    const inv = await load("01-rijnmond-RIJ-2026-10452");
    inv.lines = inv.lines.map((l) => ({ ...l, supplier_article_code: null })).reverse();
    const m = await matchInvoice(inv, erp);
    assert(m.outcome === "ready", `01 without codes: expected ready, got ${m.outcome} — ${m.summary}`);
    assert(m.lines.every((l) => l.matched_by === "description"), "01 without codes: matched on description");
    assert(m.lines.map((l) => l.po_line_no).join() === "3,2,1", "01 without codes: lines mapped to the right PO lines");
  }
  assert(similarity("Zeskantbout M8x50 RVS A2", "Zeskantbout M8x40 RVS A2 DIN933") === 0, "M8x50 never matches M8x40");

  console.log("Reviewer corrections");
  {
    const inv = await load("07-schoonmaak-OV-2026-0917");
    const m = await matchInvoice(inv, erp, { overrides: { supplier_id: "CR-2004" } });
    assert(m.supplier_matched_by === "override", "override sets supplier");
    assert(has(m, "iban", "error"), "override to wrong supplier exposes IBAN mismatch");
  }

  console.log("Booking, then the same invoice again");
  {
    const inv = await load("01-rijnmond-RIJ-2026-10452");
    const m = await matchInvoice(inv, erp);
    const b = await erp.bookPurchaseInvoice({
      supplier_id: m.supplier_id!, invoice_number: inv.invoice_number, invoice_date: inv.invoice_date, due_date: inv.due_date,
      po_number: m.po_number, subtotal: inv.subtotal, vat: 263.66, total: inv.total, iban: inv.supplier.iban, booked_by: "test",
      source_document_id: "doc-01", invoiced_lines: m.lines.map((l) => ({ line_no: l.po_line_no!, qty: inv.lines[l.index].quantity })),
    });
    assert(b.booking_id === "INK-2026-00732", "first new booking gets INK-2026-00732");
    const again = await matchInvoice(inv, erp);
    assert(again.outcome === "blocked" && has(again, "duplicate", "error"), "same invoice after booking is a duplicate");
    const po = await erp.getPurchaseOrder("PO-2026-0412");
    assert(po!.lines.every((l) => l.qty_invoiced === l.qty_ordered), "PO lines marked as invoiced");
    let threw = false;
    try {
      await erp.bookPurchaseInvoice({ ...b, invoiced_lines: [], booked_by: "test", source_document_id: "x" });
    } catch {
      threw = true;
    }
    assert(threw, "ERP refuses a double booking");
  }

  console.log("PO reference formats");
  for (const [inp, out] of [["PO-2026-0418", "PO-2026-0418"], ["2026-0418", "PO-2026-0418"], ["po 2026/0418", "PO-2026-0418"], ["PO2026-418", "PO-2026-0418"]]) {
    assert(normalizePoRef(inp) === out, `normalizePoRef(${inp}) = ${normalizePoRef(inp)}`);
  }

  await fs.rm(tmp, { recursive: true, force: true });
  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
