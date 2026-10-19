/**
 * Mistral (EU-hosted). Uses Mistral OCR with a document annotation: one call that
 * OCRs the PDF (scans included) and returns JSON in our invoice schema.
 * Document annotations cover at most 8 pages.
 */
import type { ExtractedInvoice } from "../types";
import { INVOICE_SCHEMA, parseInvoiceJson, SCHEMA_IN_PROMPT, SYSTEM_PROMPT } from "./schema";

export const MISTRAL_DEFAULT_MODEL = "mistral-ocr-latest";

export function mistralModel() {
  return process.env.MISTRAL_OCR_MODEL || MISTRAL_DEFAULT_MODEL;
}

export async function extractWithMistral(pdf: Buffer): Promise<{ invoice: ExtractedInvoice; model: string }> {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error("MISTRAL_API_KEY is not set. Add it to .env.local and restart the app.");
  const baseUrl = (process.env.MISTRAL_BASE_URL || "https://api.mistral.ai/v1").replace(/\/+$/, "");
  const model = mistralModel();

  const attempts = [
    { format: { type: "json_schema", json_schema: { name: "supplier_invoice", schema: INVOICE_SCHEMA, strict: true } }, prompt: SYSTEM_PROMPT },
    { format: { type: "json_object" }, prompt: SCHEMA_IN_PROMPT },
  ];

  let lastError = "";
  for (const a of attempts) {
    const res = await fetch(`${baseUrl}/ocr`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        document: { type: "document_url", document_url: `data:application/pdf;base64,${pdf.toString("base64")}` },
        document_annotation_format: a.format,
        document_annotation_prompt: a.prompt,
        include_image_base64: false,
      }),
    });
    if (!res.ok) {
      lastError = `${res.status} ${(await res.text()).slice(0, 500)}`;
      if (res.status === 400 || res.status === 422) continue;
      throw new Error(`Mistral OCR returned ${lastError}`);
    }
    const json = (await res.json()) as { document_annotation?: string | null };
    if (!json.document_annotation) throw new Error("Mistral OCR returned no document annotation.");
    return { invoice: parseInvoiceJson(json.document_annotation), model };
  }
  throw new Error(`Mistral OCR rejected the request. Last error: ${lastError}`);
}
