import type { Metadata } from "next";
import Link from "next/link";
import { ResetButton } from "@/components/Buttons";
import { NavLink } from "@/components/Nav";
import { extractorMode, readerLabel } from "@/lib/extract";
import { getState } from "@/lib/store";
import "./globals.css";

export const metadata: Metadata = {
  title: "Invoice intake · Fillorie demo",
  description: "Demo: AI supplier invoice intake with three-way matching, for a fictional Dutch wholesaler.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const mode = extractorMode();
  const { documents } = await getState();
  const open = documents.filter((d) => ["new", "ready", "review", "blocked", "manual", "error", "on_hold"].includes(d.status)).length;

  return (
    <html lang="en">
      <body className="min-h-screen font-sans">
        <div className="flex min-h-screen flex-col lg:flex-row">
          <aside className="flex shrink-0 flex-col bg-ink text-white lg:sticky lg:top-0 lg:h-screen lg:w-[240px]">
            <div className="flex items-center gap-3 px-5 pb-4 pt-5">
              <Mark />
              <Link href="/" className="leading-tight">
                <span className="block text-[15px] font-semibold">Invoice intake</span>
                <span className="block text-xs text-white/55">Veldhuis Industrial Supply</span>
              </Link>
            </div>
            <nav className="flex gap-1 px-3 pb-3 lg:flex-col">
              <NavLink href="/" icon="inbox" label="Inbox" count={open} />
              <NavLink href="/erp" icon="erp" label="Mock ERP" />
            </nav>
            <div className="mt-auto hidden space-y-3 border-t border-white/10 px-5 py-5 lg:block">
              <div>
                <div className="text-xs text-white/50">Invoices read by</div>
                <div className="mt-0.5 break-words text-[13px] text-white/90">{readerLabel()}</div>
              </div>
              <ResetButton dark />
              <p className="text-[11px] leading-relaxed text-white/40">Demo by Fillorie. Every company, invoice and bank account here is fictional.</p>
            </div>
          </aside>

          <div className="min-w-0 flex-1">
            {mode === "fixture" && (
              <div className="bg-review-soft px-6 py-2 text-[13px] text-review">
                Offline test mode: invoices come from prepared test data, not from an AI model. Remove EXTRACTOR=fixture from .env.local before a demo.
              </div>
            )}
            <main className="mx-auto max-w-[1320px] px-4 py-6 sm:px-8 sm:py-8">{children}</main>
            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-4 text-xs text-muted sm:px-8 lg:hidden">
              <span>Read by {readerLabel()}</span>
              <ResetButton />
            </div>
          </div>
        </div>
      </body>
    </html>
  );
}

/** A folded invoice with a check: the product mark. */
function Mark() {
  return (
    <svg viewBox="0 0 32 32" className="h-8 w-8 shrink-0" aria-hidden>
      <rect width="32" height="32" rx="8" fill="#3a4bc9" />
      <path d="M10 7h8l4 4v14H10z" fill="#fff" />
      <path d="M18 7v4h4" fill="#c9cff5" />
      <path d="M13 18.5l2.2 2.2 4-4.4" fill="none" stroke="#3a4bc9" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
