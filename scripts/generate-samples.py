"""Generate the mock ERP seed data and the sample supplier invoices for the demo.

Run from the project root:  python3 scripts/generate-samples.py
Needs: reportlab, Pillow, numpy, and pdftoppm (poppler) for the scanned sample.

Writes:
  data/seed/erp.json            mock ERP (suppliers, purchase orders, goods receipts, booked invoices)
  samples/*.pdf                 the supplier invoices that land in the demo inbox
  samples/expected/*.json       what a perfect extraction of each PDF looks like (used by tests and offline mode)

All companies, people, numbers and bank accounts are fictional.
"""

import json
import os
import random
import subprocess
import tempfile
from decimal import Decimal, ROUND_HALF_UP

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import mm
from reportlab.pdfgen import canvas

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SAMPLES = os.path.join(ROOT, "samples")
EXPECTED = os.path.join(SAMPLES, "expected")
SEED = os.path.join(ROOT, "data", "seed")
for d in (SAMPLES, EXPECTED, SEED):
    os.makedirs(d, exist_ok=True)


def money(x):
    return float(Decimal(str(x)).quantize(Decimal("0.01"), rounding=ROUND_HALF_UP))


def nl(x):
    """Dutch number format: 1.234,56"""
    s = f"{x:,.2f}"
    return s.replace(",", "X").replace(".", ",").replace("X", ".")


def en(x):
    return f"{x:,.2f}"


# --------------------------------------------------------------------------
# Buyer and suppliers
# --------------------------------------------------------------------------

BUYER = {
    "name": "Veldhuis Industrial Supply B.V.",
    "address": "Ceintuurbaan 118",
    "postcode_city": "8024 AA Zwolle",
    "country": "NL",
    "vat_number": "NL863120449B01",
    "kvk_number": "05094417",
}

SUPPLIERS = [
    {
        "id": "CR-2001",
        "name": "Bevestigingstechniek Rijnmond B.V.",
        "address": "Waalhaven Z.z. 41, 3089 JH Rotterdam",
        "country": "NL",
        "vat_number": "NL822413905B01",
        "kvk_number": "24301187",
        "iban": "NL26ABNA0518822731",
        "payment_terms_days": 30,
    },
    {
        "id": "CR-2002",
        "name": "HydroParts Benelux B.V.",
        "address": "Achtseweg Noord 7, 5651 GG Eindhoven",
        "country": "NL",
        "vat_number": "NL861027744B01",
        "kvk_number": "17289034",
        "iban": "NL06RABO0317465912",
        "payment_terms_days": 30,
    },
    {
        "id": "CR-2003",
        "name": "SafeWork PPE B.V.",
        "address": "Atoomweg 52, 3542 AB Utrecht",
        "country": "NL",
        "vat_number": "NL853390128B01",
        "kvk_number": "30195562",
        "iban": "NL49INGB0007731590",
        "payment_terms_days": 14,
    },
    {
        "id": "CR-2004",
        "name": "Kabel & Montage Twente B.V.",
        "address": "Twentepoort Oost 19, 7609 RG Almelo",
        "country": "NL",
        "vat_number": "NL809335217B01",
        "kvk_number": "06124478",
        "iban": "NL95ABNA0624190358",
        "payment_terms_days": 30,
    },
    {
        "id": "CR-2005",
        "name": "Rheinland Verbindungstechnik GmbH",
        "address": "Hansaallee 233, 40549 Düsseldorf, Germany",
        "country": "DE",
        "vat_number": "DE312845097",
        "kvk_number": None,
        "iban": "DE21370100500582749163",
        "payment_terms_days": 30,
    },
]
SUP = {s["id"]: s for s in SUPPLIERS}

# --------------------------------------------------------------------------
# Purchase orders and goods receipts (what Veldhuis ordered and received)
# --------------------------------------------------------------------------


def po_line(n, code, sku, desc, unit, qty, price, received=None, invoiced=0):
    return {
        "line_no": n,
        "supplier_article_code": code,
        "sku": sku,
        "description": desc,
        "unit": unit,
        "qty_ordered": qty,
        "unit_price": price,
        "qty_received": qty if received is None else received,
        "qty_invoiced": invoiced,
    }


PURCHASE_ORDERS = [
    {
        "number": "PO-2026-0398", "supplier_id": "CR-2001", "date": "2026-09-18",
        "lines": [
            po_line(1, "BR-933-1060-A2", "VIS-BT-M10x60-A2", "Zeskantbout M10x60 RVS A2 DIN933", "doos 50", 20, 19.80, invoiced=20),
            po_line(2, "BR-934-10-A2", "VIS-MO-M10-A2", "Zeskantmoer M10 RVS A2 DIN934", "doos 100", 20, 8.15, invoiced=20),
        ],
    },
    {
        "number": "PO-2026-0412", "supplier_id": "CR-2001", "date": "2026-10-02",
        "lines": [
            po_line(1, "BR-933-0840-A2", "VIS-BT-M8x40-A2", "Zeskantbout M8x40 RVS A2 DIN933", "doos 100", 40, 12.60),
            po_line(2, "BR-933-0850-A2", "VIS-BT-M8x50-A2", "Zeskantbout M8x50 RVS A2 DIN933", "doos 100", 30, 14.30),
            po_line(3, "BR-934-08-A2", "VIS-MO-M8-A2", "Zeskantmoer M8 RVS A2 DIN934", "doos 200", 50, 6.45),
        ],
    },
    {
        "number": "PO-2026-0418", "supplier_id": "CR-2002", "date": "2026-10-05",
        "lines": [
            po_line(1, "HP-12L38-BSP", "VIS-HF-12L-38", "Hydraulische koppeling 12L 3/8 BSP", "stuk", 100, 4.10),
            po_line(2, "HP-R2-38-M", "VIS-HS-R2-38-1M", "Hydraulische slang R2 3/8", "meter", 250, 7.40),
        ],
    },
    {
        "number": "PO-2026-0421", "supplier_id": "CR-2003", "date": "2026-10-06",
        "lines": [
            po_line(1, "SW-NIT-10", "VIS-PPE-HS-10", "Werkhandschoen nitril maat 10", "paar", 200, 1.35, received=150),
            po_line(2, "SW-EN166-CL", "VIS-PPE-VB-01", "Veiligheidsbril helder EN166", "stuk", 100, 2.90),
        ],
    },
    {
        "number": "PO-2026-0425", "supplier_id": "CR-2004", "date": "2026-10-07",
        "lines": [
            po_line(1, "KMT-KB200-48Z", "VIS-KB-200-ZW", "Kabelbinder 200x4.8 zwart", "zak 100", 80, 2.45),
            po_line(2, "KMT-KB300-48Z", "VIS-KB-300-ZW", "Kabelbinder 300x4.8 zwart", "zak 100", 40, 3.60),
        ],
    },
    {
        "number": "PO-2026-0427", "supplier_id": "CR-2005", "date": "2026-10-07",
        "lines": [
            po_line(1, "RVT-912-0620", "VIS-CS-M6x20-A2", "Cilinderkopschroef M6x20 RVS A2 DIN912", "doos 200", 25, 11.80),
            po_line(2, "RVT-125-06", "VIS-SR-M6-A2", "Sluitring M6 RVS A2 DIN125", "doos 500", 20, 7.90),
        ],
    },
    {
        "number": "PO-2026-0430", "supplier_id": "CR-2002", "date": "2026-10-09",
        "lines": [
            po_line(1, "HP-15L12-BSP", "VIS-HF-15L-12", "Hydraulische koppeling 15L 1/2 BSP", "stuk", 60, 5.20),
        ],
    },
]

GOODS_RECEIPTS = [
    {"number": "GR-2026-1071", "po_number": "PO-2026-0398", "date": "2026-09-24"},
    {"number": "GR-2026-1102", "po_number": "PO-2026-0412", "date": "2026-10-08"},
    {"number": "GR-2026-1109", "po_number": "PO-2026-0418", "date": "2026-10-09"},
    {"number": "GR-2026-1115", "po_number": "PO-2026-0421", "date": "2026-10-12", "note": "Handschoenen: 150 van 200 paar geleverd, rest in backorder"},
    {"number": "GR-2026-1117", "po_number": "PO-2026-0425", "date": "2026-10-12"},
    {"number": "GR-2026-1118", "po_number": "PO-2026-0427", "date": "2026-10-13"},
    {"number": "GR-2026-1124", "po_number": "PO-2026-0430", "date": "2026-10-14"},
]
# ---- Extra purchase orders, used only by the test-uploads/ invoices ----
_HP_ITEMS = []
for size, thread in [("06L", "1/8"), ("08L", "1/4"), ("10L", "3/8"), ("12L", "3/8"), ("15L", "1/2"), ("18L", "1/2"), ("22L", "3/4")]:
    t = thread.replace("/", "")
    _HP_ITEMS.append((f"HP-{size}{t}-RK", f"Rechte koppeling {size} {thread} BSP", "stuk"))
    _HP_ITEMS.append((f"HP-{size}{t}-HK", f"Haakse koppeling 90gr {size} {thread} BSP", "stuk"))
    _HP_ITEMS.append((f"HP-{size}-MR", f"Wartelmoer {size} staal verzinkt", "stuk"))
    _HP_ITEMS.append((f"HP-{size}-SR", f"Snijring {size} staal", "stuk"))
_rng = random.Random(42)
PURCHASE_ORDERS += [
    {
        "number": "PO-2026-0433", "supplier_id": "CR-2002", "date": "2026-10-12",
        "lines": [
            po_line(i + 1, code, "VIS-HF-" + code[3:], desc, unit, _rng.choice([10, 20, 25, 40, 50]), round(_rng.uniform(0.6, 9.5), 2))
            for i, (code, desc, unit) in enumerate(_HP_ITEMS)
        ],
    },
    {
        "number": "PO-2026-0436", "supplier_id": "CR-2001", "date": "2026-10-13",
        "lines": [
            po_line(1, "BR-933-0630-A2", "VIS-BT-M6x30-A2", "Zeskantbout M6x30 RVS A2 DIN933", "doos 200", 25, 10.40),
            po_line(2, "BR-934-06-A2", "VIS-MO-M6-A2", "Zeskantmoer M6 RVS A2 DIN934", "doos 500", 12, 11.75),
            po_line(3, "BR-933-1280-A4", "VIS-BT-M12x80-A4", "Zeskantbout M12x80 RVS A4 DIN933", "doos 25", 10, 21.90),
        ],
    },
    {
        "number": "PO-2026-0438", "supplier_id": "CR-2003", "date": "2026-10-13",
        "lines": [
            po_line(1, "SW-OD-SNR37", "VIS-PPE-OD-37", "Oordoppen SNR 37 (doos 200 paar)", "doos", 15, 24.50),
            po_line(2, "SW-HELM-WIT", "VIS-PPE-HM-WT", "Veiligheidshelm wit EN397", "stuk", 30, 8.95),
        ],
    },
    {
        "number": "PO-2026-0440", "supplier_id": "CR-2004", "date": "2026-10-14",
        "lines": [
            po_line(1, "KMT-IB16-GR", "VIS-IB-16-GR", "Installatiebuis 16 mm grijs, lengte 4 m", "lengte", 50, 1.85),
            po_line(2, "KMT-KS-6-M6", "VIS-KS-6-M6", "Kabelschoen 6 mm2 M6 vertind (zak 100)", "zak", 10, 9.60),
        ],
    },
    {
        "number": "PO-2026-0441", "supplier_id": "CR-2005", "date": "2026-10-14",
        "lines": [
            po_line(1, "RVT-933-1030", "VIS-BT-M10x30-A2", "Zeskantbout M10x30 RVS A2 DIN933", "doos 100", 30, 16.20),
            po_line(2, "RVT-985-10", "VIS-BM-M10-A2", "Borgmoer M10 RVS A2 DIN985", "doos 100", 30, 9.40),
        ],
    },
]
GOODS_RECEIPTS += [
    {"number": "GR-2026-1131", "po_number": "PO-2026-0433", "date": "2026-10-15"},
    {"number": "GR-2026-1133", "po_number": "PO-2026-0436", "date": "2026-10-15"},
    {"number": "GR-2026-1134", "po_number": "PO-2026-0438", "date": "2026-10-15"},
    {"number": "GR-2026-1136", "po_number": "PO-2026-0440", "date": "2026-10-16"},
    {"number": "GR-2026-1137", "po_number": "PO-2026-0441", "date": "2026-10-16"},
]

for gr in GOODS_RECEIPTS:
    po = next(p for p in PURCHASE_ORDERS if p["number"] == gr["po_number"])
    gr["lines"] = [{"line_no": l["line_no"], "qty": l["qty_received"]} for l in po["lines"]]
# received quantities live in the goods receipts only; the app sums them per PO line
for po in PURCHASE_ORDERS:
    for l in po["lines"]:
        del l["qty_received"]

# --------------------------------------------------------------------------
# Invoices
# --------------------------------------------------------------------------


def inv_line(code, desc, unit, qty, price, vat_rate=21):
    return {
        "supplier_article_code": code,
        "description": desc,
        "unit": unit,
        "quantity": qty,
        "unit_price": price,
        "line_total": money(qty * price),
        "vat_rate": vat_rate,
    }


def finish(inv):
    subtotal = money(sum(l["line_total"] for l in inv["lines"]))
    vat_lines = []
    if inv.get("reverse_charge"):
        vat_lines.append({"rate": 0, "base": subtotal, "amount": 0.0})
    else:
        rates = sorted({l["vat_rate"] for l in inv["lines"]})
        for r in rates:
            base = money(sum(l["line_total"] for l in inv["lines"] if l["vat_rate"] == r))
            vat_lines.append({"rate": r, "base": base, "amount": money(base * r / 100)})
    inv["subtotal"] = subtotal
    inv["vat_lines"] = vat_lines
    inv["total"] = money(subtotal + sum(v["amount"] for v in vat_lines))
    inv.setdefault("currency", "EUR")
    inv.setdefault("reverse_charge", False)
    inv.setdefault("notes", None)
    return inv


def supplier_block(sid, iban=None):
    s = SUP[sid]
    return {
        "name": s["name"],
        "address": s["address"],
        "vat_number": s["vat_number"],
        "kvk_number": s["kvk_number"],
        "iban": iban or s["iban"],
    }


INVOICES = {}

# 1. Clean three-way match
INVOICES["01-rijnmond-RIJ-2026-10452"] = finish({
    "supplier": supplier_block("CR-2001"),
    "invoice_number": "RIJ-2026-10452", "invoice_date": "2026-10-09", "due_date": "2026-11-08",
    "po_reference": "PO-2026-0412", "language": "nl",
    "lines": [
        inv_line("BR-933-0840-A2", "Zeskantbout M8x40 RVS A2 DIN933 (doos 100)", "doos", 40, 12.60),
        inv_line("BR-933-0850-A2", "Zeskantbout M8x50 RVS A2 DIN933 (doos 100)", "doos", 30, 14.30),
        inv_line("BR-934-08-A2", "Zeskantmoer M8 RVS A2 DIN934 (doos 200)", "doos", 50, 6.45),
    ],
})

# 2. Price deviation on one line
INVOICES["02-hydroparts-HPB-26-004117"] = finish({
    "supplier": supplier_block("CR-2002"),
    "invoice_number": "HPB-26-004117", "invoice_date": "2026-10-10", "due_date": "2026-11-09",
    "po_reference": "2026-0418", "language": "nl",  # printed without the PO- prefix
    "lines": [
        inv_line("HP-12L38-BSP", "Hydr. koppeling recht 12L - 3/8\" BSP", "st", 100, 4.45),
        inv_line("HP-R2-38-M", "Hydr. slang SAE 100 R2 3/8\" per mtr", "m", 250, 7.40),
    ],
})

# 3. Invoiced more than received
INVOICES["03-safework-SWP-2026-0789"] = finish({
    "supplier": supplier_block("CR-2003"),
    "invoice_number": "SWP-2026-0789", "invoice_date": "2026-10-12", "due_date": "2026-10-26",
    "po_reference": "PO-2026-0421", "language": "nl",
    "lines": [
        inv_line("SW-NIT-10", "Nitril werkhandschoen, maat 10 (XL)", "paar", 200, 1.35),
        inv_line("SW-EN166-CL", "Veiligheidsbril EN166, heldere lens", "st", 100, 2.90),
    ],
})

# 4. Scanned, skewed paper invoice that matches cleanly
INVOICES["04-kmt-scan-KMT-26-1931"] = finish({
    "supplier": supplier_block("CR-2004"),
    "invoice_number": "KMT/26/1931", "invoice_date": "2026-10-13", "due_date": "2026-11-12",
    "po_reference": "PO-2026-0425", "language": "nl",
    "lines": [
        inv_line("KMT-KB200-48Z", "Kabelbinder 200 x 4,8 mm zwart, zak a 100", "zak", 80, 2.45),
        inv_line("KMT-KB300-48Z", "Kabelbinder 300 x 4,8 mm zwart, zak a 100", "zak", 40, 3.60),
    ],
})

# 5. Duplicate: a re-sent copy of an invoice that is already booked
INVOICES["05-rijnmond-RIJ-2026-10388-kopie"] = finish({
    "supplier": supplier_block("CR-2001"),
    "invoice_number": "RIJ-2026-10388", "invoice_date": "2026-09-25", "due_date": "2026-10-25",
    "po_reference": "PO-2026-0398", "language": "nl",
    "lines": [
        inv_line("BR-933-1060-A2", "Zeskantbout M10x60 RVS A2 DIN933 (doos 50)", "doos", 20, 19.80),
        inv_line("BR-934-10-A2", "Zeskantmoer M10 RVS A2 DIN934 (doos 100)", "doos", 20, 8.15),
    ],
    "notes": "KOPIE - 2e verzending",
})

# 6. Bank account differs from supplier master data (possible invoice fraud)
INVOICES["06-hydroparts-HPB-26-004203"] = finish({
    "supplier": supplier_block("CR-2002", iban="NL24BUNQ2095318846"),
    "invoice_number": "HPB-26-004203", "invoice_date": "2026-10-15", "due_date": "2026-10-22",
    "po_reference": "2026-0430", "language": "nl",
    "lines": [
        inv_line("HP-15L12-BSP", "Hydr. koppeling recht 15L - 1/2\" BSP", "st", 60, 5.20),
    ],
    "notes": "Let op: ons bankrekeningnummer is gewijzigd. Gelieve uitsluitend nog te betalen op onderstaand rekeningnummer.",
})

# 7. Unknown supplier, no purchase order
INVOICES["07-schoonmaak-OV-2026-0917"] = finish({
    "supplier": {
        "name": "Schoonmaakbedrijf Oost-Veluwe",
        "address": "Industrieweg 14, 8131 VZ Wijhe",
        "vat_number": "NL004417263B53",
        "kvk_number": "71820455",
        "iban": "NL57RABO0129863405",
    },
    "invoice_number": "OV-2026-0917", "invoice_date": "2026-10-01", "due_date": "2026-10-15",
    "po_reference": None, "language": "nl",
    "lines": [
        inv_line(None, "Schoonmaak kantoor en kantine, september 2026", "maand", 1, 685.00),
        inv_line(None, "Extra reiniging magazijnvloer 22-09-2026", "uur", 6, 42.50),
    ],
})

# 8. English invoice from a German supplier, VAT reverse charged
INVOICES["08-rheinland-RVT-INV-2026-3318"] = finish({
    "supplier": supplier_block("CR-2005"),
    "invoice_number": "RVT-INV-2026-3318", "invoice_date": "2026-10-13", "due_date": "2026-11-12",
    "po_reference": "PO-2026-0427", "language": "en",
    "lines": [
        inv_line("RVT-912-0620", "Socket head cap screw M6x20 DIN912 A2, box of 200", "box", 25, 11.80, vat_rate=0),
        inv_line("RVT-125-06", "Flat washer M6 DIN125 A2, box of 500", "box", 20, 7.90, vat_rate=0),
    ],
    "reverse_charge": True,
    "notes": "VAT reverse charged - Article 196 Directive 2006/112/EC",
})

# The booked invoice that #5 duplicates, plus one more for realism
BOOKED = [
    {
        "booking_id": "INK-2026-00731", "supplier_id": "CR-2001", "invoice_number": "RIJ-2026-10388",
        "invoice_date": "2026-09-25", "due_date": "2026-10-25", "po_number": "PO-2026-0398",
        "subtotal": INVOICES["05-rijnmond-RIJ-2026-10388-kopie"]["subtotal"],
        "vat": sum(v["amount"] for v in INVOICES["05-rijnmond-RIJ-2026-10388-kopie"]["vat_lines"]),
        "total": INVOICES["05-rijnmond-RIJ-2026-10388-kopie"]["total"],
        "iban": SUP["CR-2001"]["iban"],
        "booked_at": "2026-09-29T10:14:00+02:00", "booked_by": "M. de Vries", "status": "paid",
    },
]

# --------------------------------------------------------------------------
# PDF rendering: each supplier gets its own layout, as in real life
# --------------------------------------------------------------------------

W, H = A4


def draw_lines_table(c, inv, x, y, cols, fmt, header_fill=None, font="Helvetica", size=9):
    """cols: list of (title, key, width, align)"""
    if header_fill:
        c.setFillColor(header_fill)
        c.rect(x, y - 4, sum(w for _, _, w, _ in cols), 16, stroke=0, fill=1)
        c.setFillColor(colors.white)
    c.setFont(font + "-Bold", size)
    cx = x
    for title, _, w, align in cols:
        if align == "r":
            c.drawRightString(cx + w - 4, y, title)
        else:
            c.drawString(cx + 4, y, title)
        cx += w
    c.setFillColor(colors.black)
    y -= 18
    c.setFont(font, size)
    for l in inv["lines"]:
        cx = x
        for _, key, w, align in cols:
            v = key(l) if callable(key) else l.get(key)
            if isinstance(v, float):
                v = fmt(v)
            v = "" if v is None else str(v)
            if align == "r":
                c.drawRightString(cx + w - 4, y, v)
            else:
                c.drawString(cx + 4, y, v)
            cx += w
        y -= 15
    c.setStrokeColor(colors.grey)
    c.line(x, y + 8, x + sum(w for _, _, w, _ in cols), y + 8)
    return y - 8


def draw_totals(c, inv, xr, y, fmt, labels, size=9.5):
    c.setFont("Helvetica", size)
    c.drawRightString(xr - 90, y, labels["sub"])
    c.drawRightString(xr, y, fmt(inv["subtotal"]))
    y -= 14
    for v in inv["vat_lines"]:
        c.drawRightString(xr - 90, y, labels["vat"](v))
        c.drawRightString(xr, y, fmt(v["amount"]))
        y -= 14
    c.setFont("Helvetica-Bold", size + 1)
    c.drawRightString(xr - 90, y - 2, labels["tot"])
    c.drawRightString(xr, y - 2, fmt(inv["total"]))
    return y - 20


def buyer_block(c, x, y, size=9.5, title=None):
    if title:
        c.setFont("Helvetica-Bold", size)
        c.drawString(x, y, title)
        y -= 13
    c.setFont("Helvetica", size)
    for t in [BUYER["name"], "t.a.v. Crediteurenadministratie", BUYER["address"], BUYER["postcode_city"]]:
        c.drawString(x, y, t)
        y -= 12.5
    return y


def fmt_date_nl(d):
    y, m, dd = d.split("-")
    return f"{dd}-{m}-{y}"


def pdf_rijnmond(path, inv, copy_stamp=False):
    c = canvas.Canvas(path, pagesize=A4)
    c.setTitle(f"Factuur {inv['invoice_number']}")
    navy = colors.HexColor("#1F3A5F")
    c.setFillColor(navy)
    c.rect(0, H - 34 * mm, W, 34 * mm, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 18)
    c.drawString(20 * mm, H - 18 * mm, "BEVESTIGINGSTECHNIEK RIJNMOND")
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, H - 25 * mm, "Waalhaven Z.z. 41  ·  3089 JH Rotterdam  ·  010 - 429 18 70  ·  verkoop@bt-rijnmond.example")
    c.setFillColor(colors.black)
    buyer_block(c, 20 * mm, H - 52 * mm)
    c.setFont("Helvetica-Bold", 16)
    c.drawString(120 * mm, H - 52 * mm, "FACTUUR")
    c.setFont("Helvetica", 9.5)
    rows = [
        ("Factuurnummer", inv["invoice_number"]),
        ("Factuurdatum", fmt_date_nl(inv["invoice_date"])),
        ("Vervaldatum", fmt_date_nl(inv["due_date"])),
        ("Uw ordernummer", inv["po_reference"]),
        ("Debiteurnummer", "D-55102"),
    ]
    y = H - 60 * mm
    for k, v in rows:
        c.drawString(120 * mm, y, k)
        c.drawString(155 * mm, y, v)
        y -= 12.5
    y = H - 100 * mm
    y = draw_lines_table(
        c, inv, 20 * mm, y,
        [("Artikel", "supplier_article_code", 32 * mm, "l"), ("Omschrijving", "description", 78 * mm, "l"),
         ("Aantal", lambda l: str(l["quantity"]), 16 * mm, "r"), ("Prijs", "unit_price", 22 * mm, "r"),
         ("Bedrag", "line_total", 22 * mm, "r")],
        nl, header_fill=navy,
    )
    draw_totals(c, inv, 190 * mm, y - 10, lambda v: "€ " + nl(v),
                {"sub": "Subtotaal", "vat": lambda v: f"BTW {v['rate']}% over € {nl(v['base'])}", "tot": "Totaal te betalen"})
    c.setFont("Helvetica", 8.5)
    c.drawString(20 * mm, 30 * mm, f"Betaling binnen 30 dagen op {inv['supplier']['iban'][:4]} {' '.join(inv['supplier']['iban'][4+i:8+i] for i in range(0, len(inv['supplier']['iban'])-4, 4))} t.n.v. Bevestigingstechniek Rijnmond B.V. o.v.v. factuurnummer.")
    c.drawString(20 * mm, 25 * mm, f"KvK {inv['supplier']['kvk_number']}  ·  BTW {inv['supplier']['vat_number']}  ·  Op al onze leveringen zijn de Metaalunievoorwaarden van toepassing.")
    if copy_stamp:
        c.saveState()
        c.translate(70 * mm, 95 * mm)
        c.rotate(28)
        c.setFillColor(colors.Color(0.85, 0.1, 0.1, alpha=0.35))
        c.setFont("Helvetica-Bold", 54)
        c.drawCentredString(0, 0, "KOPIE")
        c.setFont("Helvetica-Bold", 16)
        c.drawCentredString(0, -24, "2e verzending")
        c.restoreState()
    c.showPage()
    c.save()


def pdf_hydroparts(path, inv):
    c = canvas.Canvas(path, pagesize=A4)
    c.setTitle(f"Factuur {inv['invoice_number']}")
    orange = colors.HexColor("#E46B1E")
    c.setFillColor(orange)
    c.circle(26 * mm, H - 22 * mm, 8 * mm, stroke=0, fill=1)
    c.setFillColor(colors.white)
    c.setFont("Helvetica-Bold", 13)
    c.drawCentredString(26 * mm, H - 24 * mm, "HP")
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 15)
    c.drawString(38 * mm, H - 20 * mm, "HydroParts Benelux B.V.")
    c.setFont("Helvetica", 8.5)
    c.drawString(38 * mm, H - 25 * mm, "Hydrauliek · Pneumatiek · Afdichtingen")
    c.setFont("Helvetica", 8.5)
    yy = H - 16 * mm
    for t in ["Achtseweg Noord 7", "5651 GG Eindhoven", "T 040 - 291 33 00", "facturen@hydroparts.example",
              f"KvK {inv['supplier']['kvk_number']}", f"BTW {inv['supplier']['vat_number']}"]:
        c.drawRightString(190 * mm, yy, t)
        yy -= 11
    buyer_block(c, 20 * mm, H - 55 * mm, title="Factuuradres")
    c.setFont("Helvetica-Bold", 12)
    c.drawString(20 * mm, H - 92 * mm, f"Factuur {inv['invoice_number']}")
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, H - 99 * mm, f"Datum: {fmt_date_nl(inv['invoice_date'])}     Vervaldatum: {fmt_date_nl(inv['due_date'])}     Inkoopordernr. klant: {inv['po_reference']}")
    y = H - 112 * mm
    y = draw_lines_table(
        c, inv, 20 * mm, y,
        [("Aantal", lambda l: str(l["quantity"]), 16 * mm, "r"), ("Eenh.", "unit", 12 * mm, "l"),
         ("Art.nr.", "supplier_article_code", 30 * mm, "l"), ("Omschrijving", "description", 68 * mm, "l"),
         ("Stukprijs", "unit_price", 22 * mm, "r"), ("Totaal", "line_total", 22 * mm, "r")],
        nl,
    )
    y = draw_totals(c, inv, 190 * mm, y - 6, lambda v: nl(v),
                    {"sub": "Totaal excl. BTW", "vat": lambda v: f"BTW {v['rate']}%", "tot": "Totaal incl. BTW (EUR)"})
    if inv.get("notes"):
        c.setFillColor(colors.HexColor("#FFF4E5"))
        c.rect(20 * mm, y - 26, 170 * mm, 30, stroke=0, fill=1)
        c.setFillColor(colors.HexColor("#8A3B00"))
        c.setFont("Helvetica-Bold", 9)
        c.drawString(23 * mm, y - 8, "Let op: ons bankrekeningnummer is gewijzigd.")
        c.setFont("Helvetica", 9)
        c.drawString(23 * mm, y - 20, "Gelieve uitsluitend nog te betalen op onderstaand rekeningnummer.")
        c.setFillColor(colors.black)
    iban = inv["supplier"]["iban"]
    c.setFont("Helvetica", 8.5)
    c.drawString(20 * mm, 28 * mm, f"Gelieve het totaalbedrag over te maken op IBAN {iban} t.n.v. HydroParts Benelux B.V.")
    c.drawString(20 * mm, 23 * mm, "Vermeld bij betaling altijd het factuurnummer.")
    c.showPage()
    c.save()


def pdf_safework(path, inv):
    c = canvas.Canvas(path, pagesize=A4)
    c.setTitle(f"Factuur {inv['invoice_number']}")
    green = colors.HexColor("#2E7D32")
    c.setFont("Helvetica-Bold", 22)
    c.setFillColor(green)
    c.drawString(20 * mm, H - 25 * mm, "SafeWork")
    c.setFillColor(colors.black)
    c.setFont("Helvetica", 22)
    c.drawString(57 * mm, H - 25 * mm, "PPE")
    c.setStrokeColor(green)
    c.setLineWidth(2)
    c.line(20 * mm, H - 30 * mm, 190 * mm, H - 30 * mm)
    buyer_block(c, 120 * mm, H - 45 * mm)
    c.setFont("Helvetica-Bold", 11)
    c.drawString(20 * mm, H - 45 * mm, "FACTUUR")
    c.setFont("Helvetica", 9)
    y = H - 53 * mm
    for k, v in [("Nr.", inv["invoice_number"]), ("Datum", fmt_date_nl(inv["invoice_date"])),
                 ("Betalen vóór", fmt_date_nl(inv["due_date"])), ("Referentie", inv["po_reference"])]:
        c.drawString(20 * mm, y, f"{k}:")
        c.drawString(45 * mm, y, v)
        y -= 12
    y = H - 95 * mm
    y = draw_lines_table(
        c, inv, 20 * mm, y,
        [("Code", "supplier_article_code", 30 * mm, "l"), ("Artikel", "description", 72 * mm, "l"),
         ("Aantal", lambda l: f"{l['quantity']} {l['unit']}", 24 * mm, "r"), ("Prijs/st", "unit_price", 22 * mm, "r"),
         ("Totaal", "line_total", 22 * mm, "r")],
        nl, header_fill=green,
    )
    draw_totals(c, inv, 190 * mm, y - 6, lambda v: "€ " + nl(v),
                {"sub": "Netto", "vat": lambda v: f"BTW hoog ({v['rate']}%)", "tot": "Totaal"})
    c.setFont("Helvetica", 8)
    c.drawString(20 * mm, 22 * mm, f"SafeWork PPE B.V. · Atoomweg 52, 3542 AB Utrecht · KvK {inv['supplier']['kvk_number']} · BTW {inv['supplier']['vat_number']} · IBAN {inv['supplier']['iban']}")
    c.drawString(20 * mm, 18 * mm, "Betalingstermijn 14 dagen. Retouren alleen na overleg en in originele verpakking.")
    c.showPage()
    c.save()


def pdf_kmt(path, inv):
    """Typewriter-ish layout, later rasterised to look like a scan."""
    c = canvas.Canvas(path, pagesize=A4)
    c.setFont("Courier-Bold", 14)
    c.drawString(20 * mm, H - 22 * mm, "KABEL & MONTAGE TWENTE B.V.")
    c.setFont("Courier", 9)
    c.drawString(20 * mm, H - 28 * mm, "Twentepoort Oost 19 - 7609 RG Almelo - tel 0546-81 22 40")
    c.drawString(20 * mm, H - 33 * mm, f"KvK {inv['supplier']['kvk_number']}   BTW-nr {inv['supplier']['vat_number']}")
    buyer_block(c, 110 * mm, H - 48 * mm, size=9)
    c.setFont("Courier-Bold", 12)
    c.drawString(20 * mm, H - 80 * mm, "F A C T U U R")
    c.setFont("Courier", 9.5)
    c.drawString(20 * mm, H - 88 * mm, f"Factuurnr : {inv['invoice_number']}")
    c.drawString(20 * mm, H - 93 * mm, f"Datum     : {fmt_date_nl(inv['invoice_date'])}")
    c.drawString(20 * mm, H - 98 * mm, f"Uw order  : {inv['po_reference']}")
    c.drawString(20 * mm, H - 103 * mm, "Pakbon    : PB-26-4410")
    y = H - 118 * mm
    y = draw_lines_table(
        c, inv, 20 * mm, y,
        [("Artikelnr", "supplier_article_code", 34 * mm, "l"), ("Omschrijving", "description", 76 * mm, "l"),
         ("Aant", lambda l: str(l["quantity"]), 14 * mm, "r"), ("Prijs", "unit_price", 20 * mm, "r"),
         ("Bedrag", "line_total", 24 * mm, "r")],
        nl, font="Courier", size=9,
    )
    c.setFont("Courier", 9.5)
    y -= 8
    c.drawRightString(190 * mm, y, f"Subtotaal     EUR {nl(inv['subtotal']):>10}")
    y -= 13
    for v in inv["vat_lines"]:
        c.drawRightString(190 * mm, y, f"BTW {v['rate']}%       EUR {nl(v['amount']):>10}")
        y -= 13
    c.setFont("Courier-Bold", 10)
    c.drawRightString(190 * mm, y, f"TOTAAL        EUR {nl(inv['total']):>10}")
    c.setFont("Courier", 8.5)
    c.drawString(20 * mm, 30 * mm, f"Betaling binnen 30 dagen na factuurdatum op {inv['supplier']['iban']}.")
    c.drawString(20 * mm, 26 * mm, "Met dank voor uw order.")
    # a handwritten-looking initial + stamp, as on a paper invoice that was signed for receipt
    c.setStrokeColor(colors.HexColor("#1a3c9e"))
    c.setLineWidth(1.4)
    p = c.beginPath()
    p.moveTo(140 * mm, 52 * mm)
    p.curveTo(145 * mm, 60 * mm, 150 * mm, 44 * mm, 156 * mm, 54 * mm)
    p.curveTo(160 * mm, 58 * mm, 163 * mm, 48 * mm, 170 * mm, 53 * mm)
    c.drawPath(p)
    c.setFont("Helvetica", 8)
    c.setFillColor(colors.HexColor("#1a3c9e"))
    c.drawString(140 * mm, 42 * mm, "ontv. 14/10  MdV")
    c.showPage()
    c.save()


def pdf_rheinland(path, inv):
    c = canvas.Canvas(path, pagesize=A4)
    c.setTitle(f"Invoice {inv['invoice_number']}")
    grey = colors.HexColor("#37474F")
    c.setFillColor(grey)
    c.rect(0, 0, 8 * mm, H, stroke=0, fill=1)
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 15)
    c.drawString(20 * mm, H - 22 * mm, "Rheinland Verbindungstechnik GmbH")
    c.setFont("Helvetica", 8.5)
    c.drawString(20 * mm, H - 27 * mm, "Hansaallee 233 · 40549 Düsseldorf · Germany · +49 211 5571 400")
    c.drawString(20 * mm, H - 31 * mm, f"VAT ID {inv['supplier']['vat_number']} · Amtsgericht Düsseldorf HRB 88214")
    c.setFont("Helvetica", 9.5)
    y = H - 48 * mm
    for t in [BUYER["name"], "Accounts Payable", BUYER["address"], BUYER["postcode_city"], "Netherlands",
              f"VAT ID {BUYER['vat_number']}"]:
        c.drawString(20 * mm, y, t)
        y -= 12.5
    c.setFont("Helvetica-Bold", 16)
    c.drawString(120 * mm, H - 48 * mm, "INVOICE")
    c.setFont("Helvetica", 9.5)
    y = H - 56 * mm
    for k, v in [("Invoice no.", inv["invoice_number"]), ("Invoice date", inv["invoice_date"]),
                 ("Due date", inv["due_date"]), ("Your order", inv["po_reference"]), ("Delivery", "DN-88231, 13 Oct 2026")]:
        c.drawString(120 * mm, y, k)
        c.drawString(150 * mm, y, v)
        y -= 12.5
    y = H - 105 * mm
    y = draw_lines_table(
        c, inv, 20 * mm, y,
        [("Item", "supplier_article_code", 30 * mm, "l"), ("Description", "description", 80 * mm, "l"),
         ("Qty", lambda l: str(l["quantity"]), 14 * mm, "r"), ("Unit price", "unit_price", 22 * mm, "r"),
         ("Amount", "line_total", 24 * mm, "r")],
        en, header_fill=grey,
    )
    y = draw_totals(c, inv, 190 * mm, y - 6, lambda v: "EUR " + en(v),
                    {"sub": "Net amount", "vat": lambda v: "VAT 0% (reverse charge)", "tot": "Total due"})
    c.setFont("Helvetica-Oblique", 9)
    c.drawString(20 * mm, y - 10, "VAT reverse charged - Article 196 Directive 2006/112/EC. Intra-community supply of goods.")
    c.setFont("Helvetica", 8.5)
    c.drawString(20 * mm, 26 * mm, f"Bank: Postbank Düsseldorf · IBAN {inv['supplier']['iban']} · BIC PBNKDEFFXXX")
    c.drawString(20 * mm, 22 * mm, "Payment terms: 30 days net. Please quote the invoice number with your payment.")
    c.showPage()
    c.save()


def pdf_schoonmaak(path, inv):
    c = canvas.Canvas(path, pagesize=A4)
    c.setTitle(f"Factuur {inv['invoice_number']}")
    teal = colors.HexColor("#00796B")
    c.setFillColor(teal)
    c.setFont("Helvetica-Bold", 17)
    c.drawString(20 * mm, H - 22 * mm, "Schoonmaakbedrijf Oost-Veluwe")
    c.setFillColor(colors.black)
    c.setFont("Helvetica", 9)
    c.drawString(20 * mm, H - 28 * mm, "Industrieweg 14, 8131 VZ Wijhe · 0570 - 52 18 90 · info@schoonmaak-ov.example")
    buyer_block(c, 20 * mm, H - 45 * mm)
    c.setFont("Helvetica-Bold", 12)
    c.drawString(120 * mm, H - 45 * mm, "Factuur")
    c.setFont("Helvetica", 9.5)
    y = H - 53 * mm
    for k, v in [("Factuurnummer", inv["invoice_number"]), ("Datum", fmt_date_nl(inv["invoice_date"])),
                 ("Vervaldatum", fmt_date_nl(inv["due_date"])), ("Contract", "Schoonmaak 2026 / Zwolle")]:
        c.drawString(120 * mm, y, k)
        c.drawString(152 * mm, y, v)
        y -= 12.5
    y = H - 95 * mm
    y = draw_lines_table(
        c, inv, 20 * mm, y,
        [("Omschrijving", "description", 96 * mm, "l"), ("Aantal", lambda l: f"{l['quantity']} {l['unit']}", 24 * mm, "r"),
         ("Tarief", "unit_price", 24 * mm, "r"), ("Bedrag", "line_total", 26 * mm, "r")],
        nl, header_fill=teal,
    )
    draw_totals(c, inv, 190 * mm, y - 6, lambda v: "€ " + nl(v),
                {"sub": "Subtotaal", "vat": lambda v: f"BTW {v['rate']}%", "tot": "Totaal"})
    c.setFont("Helvetica", 8.5)
    c.drawString(20 * mm, 26 * mm, f"Graag binnen 14 dagen overmaken op {inv['supplier']['iban']} t.n.v. Schoonmaakbedrijf Oost-Veluwe.")
    c.drawString(20 * mm, 22 * mm, f"KvK {inv['supplier']['kvk_number']} · BTW {inv['supplier']['vat_number']}")
    c.showPage()
    c.save()


def make_scan(src_pdf, out_pdf, angle=1.6, seed=7):
    from PIL import Image, ImageFilter
    import numpy as np

    with tempfile.TemporaryDirectory() as td:
        subprocess.run(["pdftoppm", "-r", "110", "-gray", "-png", src_pdf, os.path.join(td, "p")], check=True)
        png = sorted(f for f in os.listdir(td) if f.endswith(".png"))[0]
        img = Image.open(os.path.join(td, png)).convert("L")
    img = img.rotate(angle, resample=Image.BICUBIC, expand=True, fillcolor=245)
    arr = np.array(img).astype(np.float32)
    rng = np.random.default_rng(seed)
    arr = arr * 0.93 + 8  # slightly grey paper
    arr += rng.normal(0, 7, arr.shape)  # sensor noise
    # darker band at the left edge, like a scanner lid shadow
    arr[:, :25] *= np.linspace(0.75, 1.0, 25)[None, :]
    arr = np.clip(arr, 0, 255).astype(np.uint8)
    img = Image.fromarray(arr).filter(ImageFilter.GaussianBlur(0.5))
    img.save(out_pdf, "PDF", resolution=110)


RENDER = {
    "01-rijnmond-RIJ-2026-10452": lambda p, i: pdf_rijnmond(p, i),
    "02-hydroparts-HPB-26-004117": pdf_hydroparts,
    "03-safework-SWP-2026-0789": pdf_safework,
    "05-rijnmond-RIJ-2026-10388-kopie": lambda p, i: pdf_rijnmond(p, i, copy_stamp=True),
    "06-hydroparts-HPB-26-004203": pdf_hydroparts,
    "07-schoonmaak-OV-2026-0917": pdf_schoonmaak,
    "08-rheinland-RVT-INV-2026-3318": pdf_rheinland,
}

for name, inv in INVOICES.items():
    out = os.path.join(SAMPLES, name + ".pdf")
    if name.startswith("04-"):
        with tempfile.TemporaryDirectory() as td:
            clean = os.path.join(td, "clean.pdf")
            pdf_kmt(clean, inv)
            make_scan(clean, out)
    else:
        RENDER[name](out, inv)
    with open(os.path.join(EXPECTED, name + ".json"), "w") as f:
        json.dump(inv, f, indent=2, ensure_ascii=False)

# --------------------------------------------------------------------------
# Test uploads: 5 more invoices that are NOT put in the inbox automatically.
# Upload them yourself via "Upload a PDF invoice" to test the AI on new documents.
# --------------------------------------------------------------------------

UPLOADS_DIR = os.path.join(ROOT, "test-uploads")
UPLOADS_EXPECTED = os.path.join(UPLOADS_DIR, "expected")
os.makedirs(UPLOADS_EXPECTED, exist_ok=True)


def po_lines_as_invoice(po_number, desc_fn=lambda d: d, unit_fn=lambda u: u, vat_rate=21):
    po = next(p for p in PURCHASE_ORDERS if p["number"] == po_number)
    return [inv_line(l["supplier_article_code"], desc_fn(l["description"]), unit_fn(l["unit"]), l["qty_ordered"], l["unit_price"], vat_rate) for l in po["lines"]]


TEST_UPLOADS = {}

# U1. Long two-page invoice, everything matches
TEST_UPLOADS["U1-hydroparts-2-paginas-HPB-26-004290"] = finish({
    "supplier": supplier_block("CR-2002"),
    "invoice_number": "HPB-26-004290", "invoice_date": "2026-10-16", "due_date": "2026-11-15",
    "po_reference": "2026-0433", "language": "nl",
    "lines": po_lines_as_invoice("PO-2026-0433", desc_fn=lambda d: d.replace("Rechte koppeling", "Hydr. rechte koppeling").replace("Haakse koppeling 90gr", "Hydr. haakse koppeling 90°"), unit_fn=lambda u: "st"),
})

# U2. VAT amount printed wrong (digits swapped), total follows the wrong VAT
_u2 = finish({
    "supplier": supplier_block("CR-2001"),
    "invoice_number": "RIJ-2026-10511", "invoice_date": "2026-10-16", "due_date": "2026-11-15",
    "po_reference": "PO-2026-0436", "language": "nl",
    "lines": po_lines_as_invoice("PO-2026-0436", desc_fn=lambda d: d + " (" + {"Zeskantbout M6x30 RVS A2 DIN933": "doos 200", "Zeskantmoer M6 RVS A2 DIN934": "doos 500", "Zeskantbout M12x80 RVS A4 DIN933": "doos 25"}[d] + ")", unit_fn=lambda u: "doos"),
})
_right = _u2["vat_lines"][0]["amount"]
_wrong = float(f"{_right:.2f}"[:-2] + f"{_right:.2f}"[-1] + f"{_right:.2f}"[-2])  # swap the last two digits
if _wrong == _right:
    _wrong = money(_right + 0.90)
_u2["vat_lines"][0]["amount"] = _wrong
_u2["total"] = money(_u2["subtotal"] + _wrong)
TEST_UPLOADS["U2-rijnmond-btw-fout-RIJ-2026-10511"] = _u2

# U3. No PO number on the invoice (ordered by phone); lines do match open PO-2026-0438
TEST_UPLOADS["U3-safework-geen-PO-SWP-2026-0812"] = finish({
    "supplier": supplier_block("CR-2003"),
    "invoice_number": "SWP-2026-0812", "invoice_date": "2026-10-16", "due_date": "2026-10-30",
    "po_reference": None, "language": "nl",
    "_printed_reference": "telefonisch besteld door M. de Vries",
    "lines": [
        inv_line("SW-OD-SNR37", "Oordoppen SNR 37, doos a 200 paar", "doos", 15, 24.50),
        inv_line("SW-HELM-WIT", "Veiligheidshelm EN397, wit", "st", 30, 8.95),
    ],
})

# U4. Scanned, with a freight line that is not on the purchase order
TEST_UPLOADS["U4-kmt-scan-vracht-KMT-26-1987"] = finish({
    "supplier": supplier_block("CR-2004"),
    "invoice_number": "KMT/26/1987", "invoice_date": "2026-10-17", "due_date": "2026-11-16",
    "po_reference": "PO-2026-0440", "language": "nl",
    "lines": [
        inv_line("KMT-IB16-GR", "Installatiebuis 16 mm grijs, 4 m", "lengte", 50, 1.85),
        inv_line("KMT-KS-6-M6", "Kabelschoen 6 mm2 M6 vertind, zak a 100", "zak", 10, 9.60),
        inv_line(None, "Vrachtkosten (order onder EUR 250)", "x", 1, 12.50),
    ],
})

# U5. German-language invoice from an EU supplier that charged German VAT instead of reverse charge
TEST_UPLOADS["U5-rheinland-duits-19pct-RVT-RE-2026-3402"] = finish({
    "supplier": supplier_block("CR-2005"),
    "invoice_number": "RVT-RE-2026-3402", "invoice_date": "2026-10-17", "due_date": "2026-11-16",
    "po_reference": "PO-2026-0441", "language": "de",
    "lines": [
        inv_line("RVT-933-1030", "Sechskantschraube M10x30 DIN933 A2, VE 100", "VE", 30, 16.20, vat_rate=19),
        inv_line("RVT-985-10", "Sicherungsmutter M10 DIN985 A2, VE 100", "VE", 30, 9.40, vat_rate=19),
    ],
})


def pdf_hydroparts_long(path, inv):
    """HydroParts layout, lines spread over two pages."""
    c = canvas.Canvas(path, pagesize=A4)
    c.setTitle(f"Factuur {inv['invoice_number']}")
    orange = colors.HexColor("#E46B1E")
    cols = [("Aantal", lambda l: str(l["quantity"]), 16 * mm, "r"), ("Eenh.", "unit", 12 * mm, "l"),
            ("Art.nr.", "supplier_article_code", 30 * mm, "l"), ("Omschrijving", "description", 68 * mm, "l"),
            ("Stukprijs", "unit_price", 22 * mm, "r"), ("Totaal", "line_total", 22 * mm, "r")]
    first, rest = inv["lines"][:17], inv["lines"][17:]
    pages = [first, rest]
    for pi, lines in enumerate(pages):
        c.setFillColor(orange)
        c.circle(26 * mm, H - 22 * mm, 8 * mm, stroke=0, fill=1)
        c.setFillColor(colors.white)
        c.setFont("Helvetica-Bold", 13)
        c.drawCentredString(26 * mm, H - 24 * mm, "HP")
        c.setFillColor(colors.black)
        c.setFont("Helvetica-Bold", 15)
        c.drawString(38 * mm, H - 20 * mm, "HydroParts Benelux B.V.")
        c.setFont("Helvetica", 8.5)
        c.drawRightString(190 * mm, H - 16 * mm, f"Factuur {inv['invoice_number']}  ·  pagina {pi + 1} van {len(pages)}")
        if pi == 0:
            yy = H - 27 * mm
            for t in ["Achtseweg Noord 7, 5651 GG Eindhoven", f"KvK {inv['supplier']['kvk_number']} · BTW {inv['supplier']['vat_number']}"]:
                c.drawRightString(190 * mm, yy, t)
                yy -= 11
            buyer_block(c, 20 * mm, H - 50 * mm, title="Factuuradres")
            c.setFont("Helvetica-Bold", 12)
            c.drawString(20 * mm, H - 85 * mm, f"Factuur {inv['invoice_number']}")
            c.setFont("Helvetica", 9)
            c.drawString(20 * mm, H - 92 * mm, f"Datum: {fmt_date_nl(inv['invoice_date'])}     Vervaldatum: {fmt_date_nl(inv['due_date'])}     Inkoopordernr. klant: {inv['po_reference']}")
            y = H - 104 * mm
        else:
            y = H - 40 * mm
        page_inv = dict(inv, lines=lines)
        y = draw_lines_table(c, page_inv, 20 * mm, y, cols, nl)
        if pi < len(pages) - 1:
            c.setFont("Helvetica-Oblique", 8.5)
            c.drawRightString(190 * mm, y - 4, "Vervolg op volgende pagina")
        else:
            draw_totals(c, inv, 190 * mm, y - 6, lambda v: nl(v),
                        {"sub": "Totaal excl. BTW", "vat": lambda v: f"BTW {v['rate']}%", "tot": "Totaal incl. BTW (EUR)"})
        c.setFont("Helvetica", 8.5)
        c.drawString(20 * mm, 23 * mm, f"Gelieve het totaalbedrag over te maken op IBAN {inv['supplier']['iban']} t.n.v. HydroParts Benelux B.V.")
        c.showPage()
    c.save()


def pdf_safework_noref(path, inv):
    pdf_safework(path, dict(inv, po_reference=inv["_printed_reference"]))


def de(x):
    return nl(x)  # German uses the same 1.234,56 format


def pdf_rheinland_de(path, inv):
    c = canvas.Canvas(path, pagesize=A4)
    c.setTitle(f"Rechnung {inv['invoice_number']}")
    grey = colors.HexColor("#37474F")
    c.setFillColor(grey)
    c.rect(0, 0, 8 * mm, H, stroke=0, fill=1)
    c.setFillColor(colors.black)
    c.setFont("Helvetica-Bold", 15)
    c.drawString(20 * mm, H - 22 * mm, "Rheinland Verbindungstechnik GmbH")
    c.setFont("Helvetica", 8.5)
    c.drawString(20 * mm, H - 27 * mm, "Hansaallee 233 · 40549 Düsseldorf · Telefon +49 211 5571 400")
    c.drawString(20 * mm, H - 31 * mm, f"USt-IdNr. {inv['supplier']['vat_number']} · Amtsgericht Düsseldorf HRB 88214")
    c.setFont("Helvetica", 9.5)
    y = H - 48 * mm
    for t in [BUYER["name"], "Kreditorenbuchhaltung", BUYER["address"], BUYER["postcode_city"], "Niederlande"]:
        c.drawString(20 * mm, y, t)
        y -= 12.5
    c.setFont("Helvetica-Bold", 16)
    c.drawString(120 * mm, H - 48 * mm, "RECHNUNG")
    c.setFont("Helvetica", 9.5)
    y = H - 56 * mm
    d = lambda iso: ".".join(reversed(iso.split("-")))
    for k, v in [("Rechnungsnr.", inv["invoice_number"]), ("Rechnungsdatum", d(inv["invoice_date"])),
                 ("Fällig am", d(inv["due_date"])), ("Ihre Bestellung", inv["po_reference"]), ("Lieferschein", "LS-88410")]:
        c.drawString(120 * mm, y, k)
        c.drawString(152 * mm, y, v)
        y -= 12.5
    y = H - 105 * mm
    y = draw_lines_table(
        c, inv, 20 * mm, y,
        [("Artikel", "supplier_article_code", 30 * mm, "l"), ("Bezeichnung", "description", 80 * mm, "l"),
         ("Menge", lambda l: str(l["quantity"]), 14 * mm, "r"), ("Einzelpreis", "unit_price", 22 * mm, "r"),
         ("Gesamt", "line_total", 24 * mm, "r")],
        de, header_fill=grey,
    )
    draw_totals(c, inv, 190 * mm, y - 6, lambda v: de(v) + " €",
                {"sub": "Nettobetrag", "vat": lambda v: f"MwSt. {v['rate']}%", "tot": "Rechnungsbetrag"})
    c.setFont("Helvetica", 8.5)
    c.drawString(20 * mm, 26 * mm, f"Bankverbindung: Postbank Düsseldorf · IBAN {inv['supplier']['iban']} · BIC PBNKDEFFXXX")
    c.drawString(20 * mm, 22 * mm, "Zahlbar innerhalb von 30 Tagen ohne Abzug. Bitte geben Sie die Rechnungsnummer an.")
    c.showPage()
    c.save()


UPLOAD_RENDER = {
    "U1-hydroparts-2-paginas-HPB-26-004290": pdf_hydroparts_long,
    "U2-rijnmond-btw-fout-RIJ-2026-10511": pdf_rijnmond,
    "U3-safework-geen-PO-SWP-2026-0812": pdf_safework_noref,
    "U5-rheinland-duits-19pct-RVT-RE-2026-3402": pdf_rheinland_de,
}

for name, inv in TEST_UPLOADS.items():
    out = os.path.join(UPLOADS_DIR, name + ".pdf")
    if name.startswith("U4-"):
        with tempfile.TemporaryDirectory() as td:
            clean = os.path.join(td, "clean.pdf")
            pdf_kmt(clean, inv)
            make_scan(clean, out, angle=-2.3, seed=11)
    else:
        UPLOAD_RENDER[name](out, inv)
    with open(os.path.join(UPLOADS_EXPECTED, name + ".json"), "w") as f:
        json.dump({k: v for k, v in inv.items() if not k.startswith("_")}, f, indent=2, ensure_ascii=False)

erp = {
    "company": BUYER,
    "suppliers": SUPPLIERS,
    "purchase_orders": PURCHASE_ORDERS,
    "goods_receipts": GOODS_RECEIPTS,
    "purchase_invoices": BOOKED,
    "next_booking_no": 732,
}
with open(os.path.join(SEED, "erp.json"), "w") as f:
    json.dump(erp, f, indent=2, ensure_ascii=False)

print(f"Wrote {len(INVOICES)} sample invoices, {len(TEST_UPLOADS)} test uploads and data/seed/erp.json")
