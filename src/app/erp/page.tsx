import Link from "next/link";
import { date, dateTime, eur, iban, num } from "@/lib/format";
import { erp, getState } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function ErpPage() {
  await getState(); // makes sure the runtime data exists
  const a = erp();
  const [suppliers, pos, receipts, invoices] = await Promise.all([a.listSuppliers(), a.listPurchaseOrders(), a.listGoodsReceipts(), a.listPurchaseInvoices()]);
  const supplierName = (id: string) => suppliers.find((s) => s.id === id)?.name ?? id;
  const received = (po: string, line: number) => receipts.filter((g) => g.po_number === po).reduce((s, g) => s + (g.lines.find((l) => l.line_no === line)?.qty ?? 0), 0);
  const th = "px-4 py-2.5 font-normal";

  return (
    <div className="space-y-8">
      <header className="max-w-2xl">
        <h1 className="text-[26px] font-semibold leading-tight tracking-tight">Mock ERP</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted">
          Stands in for Exact Online. The intake app reads and books through an adapter, so connecting a real ERP means writing one new adapter, not changing the app.
        </p>
      </header>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Booked purchase invoices</h2>
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[13px] text-muted">
                <th className={th}>Booking</th>
                <th className={th}>Supplier</th>
                <th className={th}>Invoice</th>
                <th className={th}>Purchase order</th>
                <th className={`${th} text-right`}>Total</th>
                <th className={th}>Booked</th>
                <th className={th}>By</th>
                <th className={th}>Status</th>
              </tr>
            </thead>
            <tbody>
              {[...invoices].reverse().map((i) => (
                <tr key={i.booking_id} className={`border-b border-line last:border-0 ${i.source_document_id ? "bg-ready-soft/60" : ""}`}>
                  <td className="code px-4 py-2.5">{i.booking_id}</td>
                  <td className="px-4 py-2.5">{supplierName(i.supplier_id)}</td>
                  <td className="code px-4 py-2.5">
                    {i.source_document_id ? (
                      <Link className="text-carbon underline underline-offset-2" href={`/invoice/${i.source_document_id}`}>
                        {i.invoice_number}
                      </Link>
                    ) : (
                      i.invoice_number
                    )}
                  </td>
                  <td className="code px-4 py-2.5">{i.po_number ?? "–"}</td>
                  <td className="px-4 py-2.5 text-right font-medium">{eur(i.total)}</td>
                  <td className="px-4 py-2.5 text-muted">{dateTime(i.booked_at)}</td>
                  <td className="px-4 py-2.5">{i.booked_by}</td>
                  <td className="px-4 py-2.5">{i.status === "paid" ? "Paid" : "Open"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-[13px] text-muted">Rows booked from this demo are highlighted green and link back to the invoice.</p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Purchase orders</h2>
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[13px] text-muted">
                <th className={th}>Item</th>
                <th className={`${th} text-right`}>Ordered</th>
                <th className={`${th} text-right`}>Received</th>
                <th className={`${th} text-right`}>Invoiced</th>
                <th className={`${th} text-right`}>Price</th>
              </tr>
            </thead>
            {pos.map((p) => (
              <tbody key={p.number} className="border-b border-line last:border-0">
                <tr className="bg-paper/60">
                  <td colSpan={5} className="px-4 py-2">
                    <span className="code font-medium">{p.number}</span>
                    <span className="ml-3">{supplierName(p.supplier_id)}</span>
                    <span className="ml-3 text-[13px] text-faint">ordered {date(p.date)}</span>
                  </td>
                </tr>
                {p.lines.map((l) => {
                  const r = received(p.number, l.line_no);
                  return (
                    <tr key={l.line_no}>
                      <td className="px-4 py-2">
                        {l.description}
                        <span className="code ml-2 text-[12px] text-faint">{l.sku}</span>
                      </td>
                      <td className="px-4 py-2 text-right">{num(l.qty_ordered)}</td>
                      <td className={`px-4 py-2 text-right ${r < l.qty_ordered ? "font-medium text-review" : ""}`}>{num(r)}</td>
                      <td className={`px-4 py-2 text-right ${l.qty_invoiced >= l.qty_ordered ? "text-ready" : "text-muted"}`}>{num(l.qty_invoiced)}</td>
                      <td className="px-4 py-2 text-right">{eur(l.unit_price)}</td>
                    </tr>
                  );
                })}
              </tbody>
            ))}
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Suppliers</h2>
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[13px] text-muted">
                <th className={th}>Code</th>
                <th className={th}>Name</th>
                <th className={th}>VAT number</th>
                <th className={th}>KvK</th>
                <th className={th}>Bank account on file</th>
                <th className={th}>Payment term</th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((s) => (
                <tr key={s.id} className="border-b border-line last:border-0">
                  <td className="code px-4 py-2.5">{s.id}</td>
                  <td className="px-4 py-2.5">{s.name}</td>
                  <td className="code px-4 py-2.5">{s.vat_number}</td>
                  <td className="code px-4 py-2.5">{s.kvk_number ?? "–"}</td>
                  <td className="code px-4 py-2.5">{iban(s.iban)}</td>
                  <td className="px-4 py-2.5">{s.payment_terms_days} days</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Goods receipts</h2>
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-line text-left text-[13px] text-muted">
                <th className={th}>Receipt</th>
                <th className={th}>Purchase order</th>
                <th className={th}>Date</th>
                <th className={th}>Note</th>
              </tr>
            </thead>
            <tbody>
              {receipts.map((g) => (
                <tr key={g.number} className="border-b border-line last:border-0">
                  <td className="code px-4 py-2.5">{g.number}</td>
                  <td className="code px-4 py-2.5">{g.po_number}</td>
                  <td className="px-4 py-2.5">{date(g.date)}</td>
                  <td className="px-4 py-2.5 text-muted">{g.note ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
