const eurFmt = new Intl.NumberFormat("nl-NL", { style: "currency", currency: "EUR" });
const numFmt = new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 2 });

export const eur = (n: number | null | undefined) => (n == null ? "–" : eurFmt.format(n));
export const num = (n: number | null | undefined) => (n == null ? "–" : numFmt.format(n));
export const pct = (n: number) => `${n > 0 ? "+" : ""}${numFmt.format(Math.round(n * 10) / 10)}%`;

/** 2026-10-09 -> 09-10-2026 */
export function date(iso: string | null | undefined): string {
  if (!iso) return "–";
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}-${m}-${y}`;
}

export function dateTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("nl-NL", {
    timeZone: "Europe/Amsterdam",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** NL24BUNQ2095318846 -> NL24 BUNQ 2095 3188 46 */
export function iban(s: string | null | undefined): string {
  if (!s) return "–";
  return s.replace(/\s+/g, "").replace(/(.{4})/g, "$1 ").trim();
}
