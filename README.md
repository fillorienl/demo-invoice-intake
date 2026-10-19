# Invoice intake demo

A working demo of AI supplier-invoice processing for a fictional 38-person Dutch wholesaler, Veldhuis Industrial Supply B.V. Built by Fillorie as a sales demo.

Supplier invoices arrive as PDFs. An AI model (Claude, any OpenAI-compatible API, or Mistral) reads each one into structured data. Plain code then checks it against the mock ERP: supplier record, bank account, duplicates, purchase order, goods receipt, arithmetic, VAT and payment terms. A person approves, holds or rejects, and approved invoices are booked into the mock ERP with an audit trail. Nothing is booked without a human click.

All companies, invoices, people and bank accounts are fictional.

## Run it

Needs Node 20 or newer and an API key for one of the providers below. **[SETUP.md](SETUP.md) has the full step-by-step setup**, per-provider settings and troubleshooting.

```bash
npm install
cp .env.example .env.local     # pick a provider and fill in its key
npm run dev                    # http://localhost:3000
```

## Choosing the AI provider

Set `LLM_PROVIDER` in `.env.local` and fill in that provider's block (`.env.example` has all of them). Restart `npm run dev` after changing it. The header shows which model is reading.

| `LLM_PROVIDER` | Covers | How the PDF is read |
|---|---|---|
| `anthropic` (default) | Claude | Claude reads the PDF directly. JSON is enforced with structured outputs. |
| `openai` | OpenAI, Azure OpenAI, Google Gemini, Ollama, LM Studio, OpenRouter: anything with an OpenAI-compatible `/chat/completions` | Each page is sent as an image, plus the PDF's text layer when it has one. The model must accept images. Set `OPENAI_BASE_URL` for anything other than OpenAI itself. |
| `mistral` | Mistral (EU-hosted) | Mistral OCR with a structured document annotation, in one call. Scans included, max 8 pages. |

Not every OpenAI-compatible server can enforce a JSON schema. The app tries a strict schema first, then JSON mode, then plain text with the schema in the prompt, and remembers what worked. Smaller local models may still misread numbers. The arithmetic and three-way checks catch most of that, and the invoice then lands in **Needs review**.

The first page load puts the 8 sample invoices in the inbox. **Reset demo** (top right, click twice) restores everything, so you can run the demo again before every call.

No API key at hand? Set `EXTRACTOR=fixture` in `.env.local` to run on prepared test data instead of AI. The app shows a yellow banner while this is on; don't use it in front of a prospect.

## The sample invoices

| # | Supplier | What it shows | Expected result |
|---|---|---|---|
| 1 | Bevestigingstechniek Rijnmond | Clean invoice: PO, receipt and prices all agree | Ready to book, one click |
| 2 | HydroParts Benelux | Unit price 8,5% above the PO; PO number printed without "PO-" | Needs review: €35,00 extra |
| 3 | SafeWork PPE | Invoices 200 pairs of gloves, only 150 received | Needs review: €67,50 not delivered |
| 4 | Kabel & Montage Twente | Crooked, noisy paper scan | Ready to book: the AI reads scans too |
| 5 | Bevestigingstechniek Rijnmond | "KOPIE" of an invoice that's already booked and paid | Blocked: duplicate |
| 6 | HydroParts Benelux | "Our bank account has changed", 7-day term instead of 30 | Blocked: possible invoice fraud |
| 7 | Schoonmaakbedrijf Oost-Veluwe | Unknown supplier, no PO | Manual queue |
| 8 | Rheinland Verbindungstechnik (DE) | English invoice, VAT reverse charged | Ready to book, with a 4b/5b VAT note |

You can also upload any PDF invoice. Uploads get checked against the same mock ERP, so a real invoice from elsewhere will usually land in **Manual** as an unknown supplier, which is the correct behaviour.

## Test uploads

`test-uploads/` has 5 more invoices that are not put in the inbox automatically. Upload them with **Upload a PDF invoice** to see how the AI handles documents it hasn't seen before. Their purchase orders are already in the mock ERP.

| File | What it tests | Expected result |
|---|---|---|
| U1 HydroParts | Two pages, 28 lines | Ready to book, all 28 lines matched |
| U2 Bevestigingstechniek Rijnmond | VAT printed as €130,02 instead of €130,20 | Needs review: amounts don't add up |
| U3 SafeWork PPE | No PO number ("ordered by phone") | Manual. Pick PO-2026-0438 under "Correct supplier or purchase order" and it becomes ready to book |
| U4 Kabel & Montage Twente | Crooked scan with a €12,50 freight line that isn't on the PO | Needs review: line not on the purchase order |
| U5 Rheinland Verbindungstechnik | German-language invoice charging 19% German VAT instead of reverse charge | Needs review: unexpected VAT rate |

`test-uploads/expected/` holds the correct reading of each one, so you can compare it with what the AI extracted.

## A 2-minute demo script

1. **Inbox.** "These are this morning's supplier invoices in facturen@." Click **Process 8 new invoices** and let the rows fill in.
2. **The tiles.** "Three of eight need no work at all. Two need a look, two must not be paid, one is for the manual queue."
3. **#6, HydroParts with the new bank account.** Show the red check and the IBAN next to the one on file. "This is how companies lose €20.000 in an afternoon. Here it can't be booked."
4. **#2, the price deviation.** Show the €4,45 vs €4,10 line. Type "Price increase agreed by phone" and click **Approve anyway and book**.
5. **#1, the clean one.** One click, booked. Open **Mock ERP** and show the new booking at the top, with the PO lines now invoiced.
6. Close with: "The AI only reads the documents. Every check is plain code, so you can see why each decision was made, and nothing is booked without a person."

## How it fits together

```
PDF ─► AI model (reads; src/lib/llm/) ─► checks (plain code; src/lib/match.ts) ─► review screen ─► ERP adapter ─► audit log
                                                     ▲                                                   │
                                                     └──────────────── mock ERP (data/runtime/erp.json) ◄┘
```

| Part | Where |
|---|---|
| AI extraction: provider switch, shared prompt and JSON schema, one file per provider | `src/lib/extract.ts`, `src/lib/llm/` |
| Checks: supplier, IBAN, duplicate, PO, three-way match, arithmetic, VAT, terms | `src/lib/match.ts` |
| ERP interface, and the JSON-file mock that implements it | `src/lib/erp/adapter.ts`, `src/lib/erp/mock.ts` |
| Inbox state and audit trail | `src/lib/store.ts`, saved in `data/runtime/` |
| Screens | `src/app/` (inbox, invoice review, mock ERP) |
| Sample PDFs and mock ERP seed data (regenerate with `npm run samples`) | `scripts/generate-samples.py` |
| Tests for the checks, using the expected extraction of each sample | `npm test` |

The checks are tuned in the constants at the top of `match.ts` (1% price tolerance, €0,02 rounding tolerance).

## Going from demo to a client

- **ERP.** Write an `ExactOnlineErp` (or AFAS, Twinfield, …) class that implements `ErpAdapter` and use it in `store.ts`. The screens and checks stay the same.
- **Mailbox.** Replace the sample folder with Microsoft Graph polling on the client's facturen@ mailbox.
- **Data location.** The demo sends PDFs to whichever AI provider you configure. For a client, agree where invoice data may be processed. Use an EU-hosted model if required, sign a data processing agreement (verwerkersovereenkomst) and set a retention period.
- **Storage.** Swap the JSON files for Postgres (e.g. Supabase in Frankfurt) once more than one person uses it.
