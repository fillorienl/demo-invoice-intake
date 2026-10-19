import Anthropic from "@anthropic-ai/sdk";
import type { ExtractedInvoice } from "../types";
import { INVOICE_SCHEMA, parseInvoiceJson, SYSTEM_PROMPT } from "./schema";

export const ANTHROPIC_DEFAULT_MODEL = "claude-sonnet-5-5";

/** Claude reads the PDF natively (text and page images) and returns schema-constrained JSON. */
export async function extractWithAnthropic(pdf: Buffer): Promise<{ invoice: ExtractedInvoice; model: string }> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not set. Add it to .env.local and restart the app.");
  const model = process.env.ANTHROPIC_MODEL || ANTHROPIC_DEFAULT_MODEL;
  const client = new Anthropic();

  const res = await client.messages.create({
    model,
    max_tokens: 8192,
    system: SYSTEM_PROMPT,
    output_config: { format: { type: "json_schema", schema: INVOICE_SCHEMA } },
    messages: [
      {
        role: "user",
        content: [
          { type: "document", source: { type: "base64", media_type: "application/pdf", data: pdf.toString("base64") } },
          { type: "text", text: "Record this supplier invoice." },
        ],
      },
    ],
  });

  if (res.stop_reason === "max_tokens") throw new Error("The invoice was too long to read in one go (max_tokens reached).");
  if (res.stop_reason === "refusal") throw new Error("The model declined to read this document.");
  const text = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
  return { invoice: parseInvoiceJson(text), model };
}
