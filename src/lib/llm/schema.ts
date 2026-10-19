import type { ExtractedInvoice } from "../types";

/** Instructions shared by every provider. */
export const SYSTEM_PROMPT = `You read supplier invoices for the accounts payable team of a Dutch wholesaler.
Return exactly what is printed on the document as JSON that matches the given schema.

Rules:
- Copy values as printed. Do not correct, recalculate or guess. If a field is not on the document, use null.
- The supplier is the company that SENT the invoice, not the customer it is addressed to.
- Dates as YYYY-MM-DD. Dutch invoices use DD-MM-YYYY, German ones DD.MM.YYYY.
- Amounts as plain numbers with a dot as decimal separator. Dutch and German "1.234,56" becomes 1234.56.
- po_reference: the customer's order / purchase order number exactly as printed (e.g. "Uw ordernummer", "Inkoopordernr.", "Your order", "Ihre Bestellung"). Not the supplier's own order or delivery note number.
- One entry in lines per invoice line, across all pages. supplier_article_code is the supplier's item code if printed.
- vat_lines: one entry per VAT rate shown in the totals section. For reverse-charge invoices use a single entry with rate 0 and amount 0, and set reverse_charge to true.
- notes: any remark that matters to accounts payable, especially a change of bank account, "copy", "duplicate" or "reminder" marks. Otherwise null.`;

const num = { type: "number" } as const;
const str = { type: "string" } as const;
const strOrNull = { type: ["string", "null"] } as const;
const numOrNull = { type: ["number", "null"] } as const;

export const INVOICE_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["supplier", "invoice_number", "invoice_date", "due_date", "po_reference", "currency", "language", "lines", "subtotal", "vat_lines", "total", "reverse_charge", "notes"],
  properties: {
    supplier: {
      type: "object",
      additionalProperties: false,
      required: ["name", "address", "vat_number", "kvk_number", "iban"],
      properties: {
        name: str,
        address: strOrNull,
        vat_number: { ...strOrNull, description: "BTW / VAT ID, e.g. NL123456789B01" },
        kvk_number: { ...strOrNull, description: "Dutch Chamber of Commerce (KvK) number" },
        iban: { ...strOrNull, description: "Bank account the invoice asks to be paid to, without spaces" },
      },
    },
    invoice_number: str,
    invoice_date: strOrNull,
    due_date: strOrNull,
    po_reference: strOrNull,
    currency: { ...str, description: "ISO code, e.g. EUR" },
    language: { ...strOrNull, description: "ISO 639-1 code of the invoice language" },
    lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["supplier_article_code", "description", "unit", "quantity", "unit_price", "line_total", "vat_rate"],
        properties: {
          supplier_article_code: strOrNull,
          description: str,
          unit: strOrNull,
          quantity: num,
          unit_price: num,
          line_total: num,
          vat_rate: numOrNull,
        },
      },
    },
    subtotal: { ...num, description: "Total excluding VAT" },
    vat_lines: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["rate", "base", "amount"],
        properties: { rate: num, base: num, amount: num },
      },
    },
    total: { ...num, description: "Total including VAT" },
    reverse_charge: { type: "boolean" },
    notes: strOrNull,
  },
};

/** For providers that can't enforce a schema: the schema goes into the prompt instead. */
export const SCHEMA_IN_PROMPT = `${SYSTEM_PROMPT}

Reply with one JSON object only, no other text, following this JSON schema:
${JSON.stringify(INVOICE_SCHEMA)}`;

/** Parse model output into an invoice. Tolerates code fences and text around the JSON. */
export function parseInvoiceJson(text: string): ExtractedInvoice {
  let t = text.trim();
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) t = fence[1].trim();
  if (!t.startsWith("{")) {
    const a = t.indexOf("{");
    const b = t.lastIndexOf("}");
    if (a >= 0 && b > a) t = t.slice(a, b + 1);
  }
  let x: ExtractedInvoice;
  try {
    x = JSON.parse(t) as ExtractedInvoice;
  } catch {
    throw new Error("The model did not return valid invoice data (not JSON).");
  }
  if (!x || typeof x !== "object" || !x.supplier || !Array.isArray(x.lines)) {
    throw new Error("The model returned JSON, but not in the invoice format (missing supplier or lines).");
  }
  return clean(x);
}

/** Coerce types defensively; models sometimes return numbers as strings. */
function clean(x: ExtractedInvoice): ExtractedInvoice {
  const n = (v: unknown): number => {
    if (typeof v === "number") return v;
    if (typeof v === "string") {
      const s = v.includes(",") && !v.includes(".") ? v.replace(",", ".") : v.replace(/,/g, "");
      const f = parseFloat(s.replace(/[^0-9.\-]/g, ""));
      return Number.isFinite(f) ? f : 0;
    }
    return 0;
  };
  const s = (v: unknown): string | null => (v == null || v === "" ? null : String(v));
  return {
    supplier: {
      name: String(x.supplier.name ?? ""),
      address: s(x.supplier.address),
      vat_number: s(x.supplier.vat_number),
      kvk_number: s(x.supplier.kvk_number),
      iban: x.supplier.iban ? String(x.supplier.iban).replace(/\s+/g, "") : null,
    },
    invoice_number: String(x.invoice_number ?? ""),
    invoice_date: s(x.invoice_date),
    due_date: s(x.due_date),
    po_reference: s(x.po_reference),
    currency: x.currency || "EUR",
    language: s(x.language),
    lines: x.lines.map((l) => ({
      supplier_article_code: s(l.supplier_article_code),
      description: String(l.description ?? ""),
      unit: s(l.unit),
      quantity: n(l.quantity),
      unit_price: n(l.unit_price),
      line_total: n(l.line_total),
      vat_rate: l.vat_rate == null ? null : n(l.vat_rate),
    })),
    subtotal: n(x.subtotal),
    vat_lines: (x.vat_lines ?? []).map((v) => ({ rate: n(v.rate), base: n(v.base), amount: n(v.amount) })),
    total: n(x.total),
    reverse_charge: Boolean(x.reverse_charge),
    notes: s(x.notes),
  };
}
