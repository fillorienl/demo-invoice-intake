import { promises as fs } from "fs";
import path from "path";
import { withLock } from "../lock";
import { normalizeId } from "../normalize";
import type { BookedInvoice, ErpData } from "../types";
import type { BookingInput, ErpAdapter } from "./adapter";

/** Mock ERP backed by a JSON file. Stands in for Exact Online in the demo. */
export class MockErp implements ErpAdapter {
  readonly name = "Mock ERP (JSON file)";

  constructor(private readonly file: string, private readonly readOnly = false) {}

  private async load(): Promise<ErpData> {
    return JSON.parse(await fs.readFile(this.file, "utf8")) as ErpData;
  }

  async listSuppliers() {
    return (await this.load()).suppliers;
  }

  async listPurchaseOrders() {
    return (await this.load()).purchase_orders;
  }

  async getPurchaseOrder(number: string) {
    const n = normalizeId(number);
    return (await this.load()).purchase_orders.find((p) => normalizeId(p.number) === n) ?? null;
  }

  async getGoodsReceipts(poNumber: string) {
    return (await this.load()).goods_receipts.filter((g) => g.po_number === poNumber);
  }

  async listGoodsReceipts() {
    return (await this.load()).goods_receipts;
  }

  async findBookedInvoice(supplierId: string, invoiceNumber: string) {
    const n = normalizeId(invoiceNumber);
    return (
      (await this.load()).purchase_invoices.find(
        (i) => i.supplier_id === supplierId && normalizeId(i.invoice_number) === n,
      ) ?? null
    );
  }

  async listPurchaseInvoices() {
    return (await this.load()).purchase_invoices;
  }

  async bookPurchaseInvoice(input: BookingInput): Promise<BookedInvoice> {
    if (this.readOnly) throw new Error("This ERP instance is read-only");
    return withLock(this.file, async () => {
      const data = await this.load();
      if (data.purchase_invoices.some((i) => i.supplier_id === input.supplier_id && normalizeId(i.invoice_number) === normalizeId(input.invoice_number))) {
        throw new Error(`Invoice ${input.invoice_number} is already booked for this supplier`);
      }
      const booking: BookedInvoice = {
        booking_id: `INK-2026-${String(data.next_booking_no).padStart(5, "0")}`,
        supplier_id: input.supplier_id,
        invoice_number: input.invoice_number,
        invoice_date: input.invoice_date,
        due_date: input.due_date,
        po_number: input.po_number,
        subtotal: input.subtotal,
        vat: input.vat,
        total: input.total,
        iban: input.iban,
        booked_at: new Date().toISOString(),
        booked_by: input.booked_by,
        status: "open",
        approval_note: input.approval_note,
        source_document_id: input.source_document_id,
      };
      data.next_booking_no += 1;
      data.purchase_invoices.push(booking);
      const po = input.po_number ? data.purchase_orders.find((p) => p.number === input.po_number) : undefined;
      if (po) {
        for (const il of input.invoiced_lines) {
          const line = po.lines.find((l) => l.line_no === il.line_no);
          if (line) line.qty_invoiced += il.qty;
        }
      }
      const tmp = this.file + ".tmp";
      await fs.writeFile(tmp, JSON.stringify(data, null, 2));
      await fs.rename(tmp, this.file);
      return booking;
    });
  }
}

export const ROOT = process.cwd();
export const SEED_ERP = path.join(ROOT, "data", "seed", "erp.json");
export const RUNTIME_DIR = path.join(ROOT, "data", "runtime");
export const RUNTIME_ERP = path.join(RUNTIME_DIR, "erp.json");
