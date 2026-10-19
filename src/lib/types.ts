// ---------- What the AI reads from the invoice ----------

export interface ExtractedLine {
  supplier_article_code: string | null;
  description: string;
  unit: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  vat_rate: number | null;
}

export interface ExtractedInvoice {
  supplier: {
    name: string;
    address: string | null;
    vat_number: string | null;
    kvk_number: string | null;
    iban: string | null;
  };
  invoice_number: string;
  invoice_date: string | null; // YYYY-MM-DD
  due_date: string | null; // YYYY-MM-DD
  po_reference: string | null; // exactly as printed
  currency: string;
  language: string | null;
  lines: ExtractedLine[];
  subtotal: number;
  vat_lines: { rate: number; base: number; amount: number }[];
  total: number;
  reverse_charge: boolean;
  notes: string | null;
}

// ---------- Mock ERP records ----------

export interface Supplier {
  id: string;
  name: string;
  address: string;
  country: string;
  vat_number: string;
  kvk_number: string | null;
  iban: string;
  payment_terms_days: number;
}

export interface PurchaseOrderLine {
  line_no: number;
  supplier_article_code: string;
  sku: string;
  description: string;
  unit: string;
  qty_ordered: number;
  unit_price: number;
  qty_invoiced: number;
}

export interface PurchaseOrder {
  number: string;
  supplier_id: string;
  date: string;
  lines: PurchaseOrderLine[];
}

export interface GoodsReceipt {
  number: string;
  po_number: string;
  date: string;
  note?: string;
  lines: { line_no: number; qty: number }[];
}

export interface BookedInvoice {
  booking_id: string;
  supplier_id: string;
  invoice_number: string;
  invoice_date: string | null;
  due_date: string | null;
  po_number: string | null;
  subtotal: number;
  vat: number;
  total: number;
  iban: string | null;
  booked_at: string;
  booked_by: string;
  status: "open" | "paid";
  approval_note?: string;
  source_document_id?: string;
}

export interface ErpData {
  company: { name: string; address: string; postcode_city: string; country: string; vat_number: string; kvk_number: string };
  suppliers: Supplier[];
  purchase_orders: PurchaseOrder[];
  goods_receipts: GoodsReceipt[];
  purchase_invoices: BookedInvoice[];
  next_booking_no: number;
}

// ---------- Matching result ----------

export type Level = "ok" | "info" | "warn" | "error";

export interface Check {
  id: string;
  level: Level;
  title: string;
  detail?: string;
}

export interface LineMatch {
  index: number;
  po_line_no: number | null;
  sku: string | null;
  po_unit_price: number | null;
  qty_received_open: number | null;
  matched_by: "article_code" | "description" | null;
  flags: { level: Level; text: string }[];
}

export type Outcome = "ready" | "review" | "blocked" | "manual";

export interface MatchResult {
  supplier_id: string | null;
  supplier_matched_by: "override" | "vat_number" | "kvk_number" | "iban" | "name" | null;
  po_number: string | null;
  checks: Check[];
  lines: LineMatch[];
  outcome: Outcome;
  summary: string;
}

// ---------- Inbox documents and audit ----------

export type DocStatus =
  | "new"
  | "error"
  | Outcome
  | "booked"
  | "on_hold"
  | "rejected";

export interface InboxDocument {
  id: string;
  filename: string;
  file_path: string; // relative to project root
  source: "sample" | "upload";
  received_at: string;
  status: DocStatus;
  extraction?: ExtractedInvoice;
  extraction_meta?: { mode: "ai" | "fixture"; model?: string; ms: number; at: string };
  match?: MatchResult;
  overrides?: { supplier_id?: string; po_number?: string };
  decision?: { action: "book" | "hold" | "reject"; by: string; at: string; note?: string; booking_id?: string };
  error?: string;
}

export interface AuditEntry {
  at: string;
  doc_id: string;
  actor: string;
  event: string;
  detail?: string;
}

export interface AppState {
  documents: InboxDocument[];
  audit: AuditEntry[];
}
