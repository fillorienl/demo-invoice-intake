import { promises as fs } from "fs";
import path from "path";
import { MockErp, ROOT, RUNTIME_DIR, RUNTIME_ERP, SEED_ERP } from "./erp/mock";
import type { ErpAdapter } from "./erp/adapter";
import { extractInvoice } from "./extract";
import { withLock } from "./lock";
import { matchInvoice } from "./match";
import type { AppState, AuditEntry, InboxDocument } from "./types";

const STATE_FILE = path.join(RUNTIME_DIR, "state.json");
const UPLOADS = path.join(RUNTIME_DIR, "uploads");
const SAMPLES = path.join(ROOT, "samples");

export const USER = "Demo reviewer";
export const SYSTEM_ACTOR = "Intake bot";

export function erp(): ErpAdapter {
  return new MockErp(RUNTIME_ERP);
}

async function exists(p: string) {
  return fs.access(p).then(() => true, () => false);
}

/** Create the runtime folder from the seed data and put the sample invoices in the inbox. */
async function seed(): Promise<AppState> {
  await fs.mkdir(UPLOADS, { recursive: true });
  await fs.copyFile(SEED_ERP, RUNTIME_ERP);
  const files = (await fs.readdir(SAMPLES)).filter((f) => f.endsWith(".pdf")).sort();
  const now = Date.now();
  const documents: InboxDocument[] = files.map((f, i) => ({
    id: "doc-" + f.slice(0, 2),
    filename: f,
    file_path: path.join("samples", f),
    source: "sample",
    // spread the arrival times over the last couple of hours, oldest first
    received_at: new Date(now - (files.length - i) * 13 * 60_000).toISOString(),
    status: "new",
  }));
  const audit: AuditEntry[] = documents.map((d) => ({ at: d.received_at, doc_id: d.id, actor: "facturen@ mailbox", event: "Received", detail: d.filename }));
  const state = { documents, audit };
  await write(state);
  return state;
}

async function read(): Promise<AppState> {
  if (!(await exists(STATE_FILE)) || !(await exists(RUNTIME_ERP))) return seed();
  return JSON.parse(await fs.readFile(STATE_FILE, "utf8")) as AppState;
}

async function write(state: AppState) {
  const tmp = STATE_FILE + ".tmp";
  await fs.writeFile(tmp, JSON.stringify(state, null, 2));
  await fs.rename(tmp, STATE_FILE);
}

export async function getState(): Promise<AppState> {
  return withLock(STATE_FILE, read);
}

export async function getDocument(id: string) {
  const s = await getState();
  return s.documents.find((d) => d.id === id) ?? null;
}

async function update(fn: (s: AppState) => void | Promise<void>) {
  return withLock(STATE_FILE, async () => {
    const s = await read();
    await fn(s);
    await write(s);
    return s;
  });
}

function log(s: AppState, doc_id: string, actor: string, event: string, detail?: string) {
  s.audit.push({ at: new Date().toISOString(), doc_id, actor, event, detail });
}

export function absPath(doc: InboxDocument) {
  return path.join(ROOT, doc.file_path);
}

/** Run AI extraction and the checks for one document. */
export async function processDocument(id: string) {
  const doc = await getDocument(id);
  if (!doc) throw new Error("Document not found");
  try {
    const out = await extractInvoice(absPath(doc));
    await update(async (s) => {
      const d = s.documents.find((x) => x.id === id)!;
      d.extraction = out.invoice;
      d.extraction_meta = { mode: out.mode, model: out.model, ms: out.ms, at: new Date().toISOString() };
      d.error = undefined;
      log(s, id, SYSTEM_ACTOR, out.mode === "ai" ? "Read by AI" : "Read from test fixture", `${out.invoice.supplier.name}, ${out.invoice.invoice_number}, ${out.invoice.lines.length} line${out.invoice.lines.length === 1 ? "" : "s"} (${(out.ms / 1000).toFixed(1)} s${out.model ? ", " + out.model : ""})`);
      await runChecks(s, d);
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await update((s) => {
      const d = s.documents.find((x) => x.id === id)!;
      d.status = "error";
      d.error = msg;
      log(s, id, SYSTEM_ACTOR, "Extraction failed", msg);
    });
  }
}

async function runChecks(s: AppState, d: InboxDocument) {
  if (!d.extraction) return;
  const others = s.documents
    .filter((x) => x.id !== d.id && x.extraction)
    .map((x) => ({ id: x.id, filename: x.filename, supplier_id: x.match?.supplier_id ?? null, invoice_number: x.extraction!.invoice_number, status: x.status }));
  d.match = await matchInvoice(d.extraction, erp(), { overrides: d.overrides, otherInboxDocs: others });
  d.status = d.match.outcome;
  log(s, d.id, SYSTEM_ACTOR, "Checked against ERP", d.match.summary);
}

/** Reviewer corrects the supplier or PO, then the checks run again (no new AI call). */
export async function recheck(id: string, overrides: { supplier_id?: string; po_number?: string }) {
  await update(async (s) => {
    const d = s.documents.find((x) => x.id === id);
    if (!d || !d.extraction) throw new Error("Nothing to re-check");
    if (isClosed(d)) throw new Error("This invoice is already decided");
    d.overrides = { supplier_id: overrides.supplier_id || undefined, po_number: overrides.po_number || undefined };
    const parts = [overrides.supplier_id && `supplier → ${overrides.supplier_id}`, overrides.po_number && `PO → ${overrides.po_number}`].filter(Boolean).join(", ");
    log(s, id, USER, "Corrected", parts || "cleared corrections");
    await runChecks(s, d);
  });
}

export function isClosed(d: InboxDocument) {
  return d.status === "booked" || d.status === "rejected";
}

export async function decide(id: string, action: "book" | "hold" | "reject", note: string) {
  await update(async (s) => {
    const d = s.documents.find((x) => x.id === id);
    if (!d || !d.extraction || !d.match) throw new Error("Process the invoice first");
    if (isClosed(d)) throw new Error("This invoice is already decided");
    const at = new Date().toISOString();

    if (action === "book") {
      if (d.match.outcome === "blocked" || d.match.outcome === "manual" || !d.match.supplier_id) {
        throw new Error("Blocked and manual invoices can't be booked from here");
      }
      if (d.match.outcome === "review" && !note.trim()) {
        throw new Error("Add a note explaining why you approve despite the warnings");
      }
      const inv = d.extraction;
      const booking = await erp().bookPurchaseInvoice({
        supplier_id: d.match.supplier_id,
        invoice_number: inv.invoice_number,
        invoice_date: inv.invoice_date,
        due_date: inv.due_date,
        po_number: d.match.po_number,
        subtotal: inv.subtotal,
        vat: Math.round(inv.vat_lines.reduce((a, v) => a + v.amount, 0) * 100) / 100,
        total: inv.total,
        iban: inv.supplier.iban,
        booked_by: USER,
        approval_note: note.trim() || undefined,
        source_document_id: d.id,
        invoiced_lines: d.match.lines
          .filter((l) => l.po_line_no != null)
          .map((l) => ({ line_no: l.po_line_no!, qty: inv.lines[l.index].quantity })),
      });
      d.status = "booked";
      d.decision = { action, by: USER, at, note: note.trim() || undefined, booking_id: booking.booking_id };
      log(s, id, USER, "Approved and booked", `${booking.booking_id} in ${erp().name}${note.trim() ? ` · “${note.trim()}”` : ""}`);
    } else {
      if (!note.trim()) throw new Error(action === "hold" ? "Add a reason for the hold" : "Add a reason for rejecting");
      d.status = action === "hold" ? "on_hold" : "rejected";
      d.decision = { action, by: USER, at, note: note.trim() };
      log(s, id, USER, action === "hold" ? "Put on hold" : "Rejected", note.trim());
    }
  });
}

export async function addUpload(filename: string, bytes: Buffer) {
  const id = "up-" + Date.now().toString(36);
  const safe = filename.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "invoice.pdf";
  await fs.mkdir(UPLOADS, { recursive: true });
  const rel = path.join("data", "runtime", "uploads", `${id}.pdf`);
  await update(async (s) => {
    await fs.writeFile(path.join(ROOT, rel), bytes);
    s.documents.push({ id, filename: safe, file_path: rel, source: "upload", received_at: new Date().toISOString(), status: "new" });
    log(s, id, USER, "Uploaded", safe);
  });
  return id;
}

export async function resetDemo() {
  await withLock(STATE_FILE, async () => {
    await fs.rm(RUNTIME_DIR, { recursive: true, force: true });
    await seed();
  });
}
