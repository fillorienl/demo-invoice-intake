/** Uppercase and drop everything except letters and digits: "NL 8224.139.05 B01" -> "NL822413905B01" */
export function normalizeId(s: string | null | undefined): string {
  return (s ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Accept "PO-2026-0418", "2026-0418", "PO 2026/0418", "po2026-0418" -> "PO-2026-0418" */
export function normalizePoRef(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = s.match(/(\d{4})\D{0,3}(\d{3,5})/);
  if (!m) return s.trim().toUpperCase();
  return `PO-${m[1]}-${m[2].padStart(4, "0")}`;
}

export function normalizeName(s: string | null | undefined): string {
  return (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(b\.?v\.?|n\.?v\.?|gmbh|vof|v\.o\.f\.|bv|nv)\b/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const STOP = new Set(["de", "het", "een", "en", "per", "of", "a", "the", "box", "doos", "zak", "st", "stuk"]);

/** Word tokens for fuzzy description matching; splits "M8x40" into "m8", "40" so sizes still match. */
export function tokens(s: string): Set<string> {
  const t = s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/(\d),(\d)/g, "$1.$2")
    .split(/[^a-z0-9.]+|x(?=\d)/)
    .map((w) => w.replace(/^\.+|\.+$/g, ""))
    .filter((w) => w.length > 0 && !STOP.has(w));
  return new Set(t);
}

/** Share of the PO description's tokens that also appear in the invoice description. */
export function similarity(invoiceDesc: string, poDesc: string): number {
  const a = tokens(invoiceDesc);
  const b = tokens(poDesc);
  if (b.size === 0) return 0;
  let hit = 0;
  for (const w of b) {
    if (a.has(w)) hit++;
    // sizes and codes must match exactly: M8x40 is not M8x50
    else if (/\d/.test(w)) return 0;
  }
  return hit / b.size;
}

export function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(isoDate + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((Date.parse(toIso + "T12:00:00Z") - Date.parse(fromIso + "T12:00:00Z")) / 86_400_000);
}
