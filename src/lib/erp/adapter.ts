import type { BookedInvoice, GoodsReceipt, PurchaseOrder, Supplier } from "../types";

export interface BookingInput {
  supplier_id: string;
  invoice_number: string;
  invoice_date: string | null;
  due_date: string | null;
  po_number: string | null;
  subtotal: number;
  vat: number;
  total: number;
  iban: string | null;
  booked_by: string;
  approval_note?: string;
  source_document_id: string;
  /** PO lines to mark as invoiced */
  invoiced_lines: { line_no: number; qty: number }[];
}

/**
 * Everything the intake flow needs from an ERP.
 * The demo uses MockErp (a JSON file). For a client, write an ExactOnlineErp
 * (or AFAS, Twinfield, ...) that implements the same interface.
 */
export interface ErpAdapter {
  readonly name: string;
  listSuppliers(): Promise<Supplier[]>;
  listPurchaseOrders(): Promise<PurchaseOrder[]>;
  getPurchaseOrder(number: string): Promise<PurchaseOrder | null>;
  getGoodsReceipts(poNumber: string): Promise<GoodsReceipt[]>;
  listGoodsReceipts(): Promise<GoodsReceipt[]>;
  findBookedInvoice(supplierId: string, invoiceNumber: string): Promise<BookedInvoice | null>;
  listPurchaseInvoices(): Promise<BookedInvoice[]>;
  bookPurchaseInvoice(input: BookingInput): Promise<BookedInvoice>;
}
