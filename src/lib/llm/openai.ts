/**
 * Any OpenAI-compatible Chat Completions API: OpenAI, Azure OpenAI, Google Gemini,
 * Ollama, LM Studio, OpenRouter, ... Set OPENAI_BASE_URL to switch.
 *
 * Most of these accept images but not PDFs, so every page is sent as an image,
 * together with the PDF's text layer when it has one. The model needs vision.
 */
import type { ExtractedInvoice } from "../types";
import { renderPdf } from "./pdf";
import { INVOICE_SCHEMA, parseInvoiceJson, SCHEMA_IN_PROMPT, SYSTEM_PROMPT } from "./schema";

export const OPENAI_DEFAULT_BASE_URL = "https://api.openai.com/v1";

type ResponseFormat = { type: "json_schema"; json_schema: { name: string; schema: Record<string, unknown>; strict: boolean } } | { type: "json_object" } | null;

// Remember which JSON mode a server accepted, so later invoices don't retry the ones it refused.
const g = globalThis as unknown as { __jsonModeIndex?: Map<string, number> };
const workingMode = (g.__jsonModeIndex ??= new Map());

export function openaiConfig() {
  const baseUrl = (process.env.OPENAI_BASE_URL || OPENAI_DEFAULT_BASE_URL).replace(/\/+$/, "");
  const model = process.env.OPENAI_MODEL || "";
  return { baseUrl, model, apiKey: process.env.OPENAI_API_KEY || "" };
}

export async function extractWithOpenAI(pdf: Buffer): Promise<{ invoice: ExtractedInvoice; model: string }> {
  const { baseUrl, model, apiKey } = openaiConfig();
  if (!model) throw new Error("OPENAI_MODEL is not set. Add the name of a vision-capable model on your provider to .env.local and restart.");
  const isOfficialOpenAI = baseUrl === OPENAI_DEFAULT_BASE_URL;
  if (!apiKey && isOfficialOpenAI) throw new Error("OPENAI_API_KEY is not set. Add it to .env.local and restart the app.");

  const { pages } = await renderPdf(pdf);
  const textLayer = pages.map((p, i) => `--- Page ${i + 1} ---\n${p.text || "(no text layer: scanned page, read the image)"}`).join("\n\n");
  const userContent = [
    {
      type: "text",
      text:
        `Record this supplier invoice. It has ${pages.length} page(s), attached as images in order.\n` +
        `The PDF's embedded text is below to help with exact characters; the images are the source of truth for layout.\n\n${textLayer}`,
    },
    ...pages.map((p) => ({ type: "image_url", image_url: { url: `data:image/jpeg;base64,${p.jpeg.toString("base64")}` } })),
  ];

  // Not every OpenAI-compatible server supports strict JSON schemas, so step down if one is refused.
  const attempts: { format: ResponseFormat; system: string }[] = [
    { format: { type: "json_schema", json_schema: { name: "supplier_invoice", schema: INVOICE_SCHEMA, strict: true } }, system: SYSTEM_PROMPT },
    { format: { type: "json_object" }, system: SCHEMA_IN_PROMPT },
    { format: null, system: SCHEMA_IN_PROMPT },
  ];

  const key = `${baseUrl}|${model}`;
  let lastError = "";
  for (let i = workingMode.get(key) ?? 0; i < attempts.length; i++) {
    const a = attempts[i];
    const body: Record<string, unknown> = {
      model,
      messages: [
        { role: "system", content: a.system },
        { role: "user", content: userContent },
      ],
      temperature: 0,
    };
    if (a.format) body.response_format = a.format;

    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (apiKey) {
      headers.Authorization = `Bearer ${apiKey}`;
      if (baseUrl.includes(".azure.com")) headers["api-key"] = apiKey;
    }

    const res = await fetch(`${baseUrl}/chat/completions`, { method: "POST", headers, body: JSON.stringify(body) });
    if (!res.ok) {
      const errText = (await res.text()).slice(0, 500);
      lastError = `${res.status} ${errText}`;
      // 400/422 usually means "this response_format isn't supported": try the next, simpler format
      if ((res.status === 400 || res.status === 422) && a.format) continue;
      throw new Error(`${baseUrl} returned ${lastError}`);
    }
    const json = (await res.json()) as { choices?: { message?: { content?: string | null; refusal?: string | null }; finish_reason?: string }[] };
    const choice = json.choices?.[0];
    if (choice?.message?.refusal) throw new Error(`The model declined: ${choice.message.refusal}`);
    if (choice?.finish_reason === "length") throw new Error("The invoice was too long to read in one go (output limit reached).");
    const content = choice?.message?.content;
    if (!content) throw new Error("The model returned an empty response.");
    workingMode.set(key, i);
    return { invoice: parseInvoiceJson(content), model };
  }
  throw new Error(`${baseUrl} rejected every JSON output mode. Last error: ${lastError}`);
}
