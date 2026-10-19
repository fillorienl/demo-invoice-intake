/**
 * Reads a supplier invoice PDF into structured data with the configured AI provider.
 * Pick the provider with LLM_PROVIDER in .env.local: anthropic (default), openai, mistral.
 */
import { promises as fs } from "fs";
import path from "path";
import { ANTHROPIC_DEFAULT_MODEL, extractWithAnthropic } from "./llm/anthropic";
import { extractWithMistral, mistralModel } from "./llm/mistral";
import { extractWithOpenAI, OPENAI_DEFAULT_BASE_URL, openaiConfig } from "./llm/openai";
import type { ExtractedInvoice } from "./types";

export type Provider = "anthropic" | "openai" | "mistral";

export function provider(): Provider {
  const p = (process.env.LLM_PROVIDER || "anthropic").toLowerCase();
  if (p === "openai" || p === "mistral" || p === "anthropic") return p;
  throw new Error(`Unknown LLM_PROVIDER "${p}". Use anthropic, openai or mistral.`);
}

export function extractorMode(): "ai" | "fixture" {
  return process.env.EXTRACTOR === "fixture" ? "fixture" : "ai";
}

/** Short description of who reads the invoices, for the header. */
export function readerLabel(): string {
  if (extractorMode() === "fixture") return "test fixtures";
  try {
    switch (provider()) {
      case "anthropic":
        return `Claude · ${process.env.ANTHROPIC_MODEL || ANTHROPIC_DEFAULT_MODEL}`;
      case "mistral":
        return `Mistral · ${mistralModel()}`;
      case "openai": {
        const { baseUrl, model } = openaiConfig();
        const host = baseUrl === OPENAI_DEFAULT_BASE_URL ? "OpenAI" : new URL(baseUrl).host;
        return `${host} · ${model || "no OPENAI_MODEL set"}`;
      }
    }
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

export interface ExtractionOutput {
  invoice: ExtractedInvoice;
  mode: "ai" | "fixture";
  model?: string;
  ms: number;
}

export async function extractInvoice(absPdfPath: string): Promise<ExtractionOutput> {
  const started = Date.now();
  if (extractorMode() === "fixture") {
    const name = path.basename(absPdfPath, ".pdf");
    const fixture = path.join(process.cwd(), "samples", "expected", name + ".json");
    try {
      const invoice = JSON.parse(await fs.readFile(fixture, "utf8")) as ExtractedInvoice;
      return { invoice, mode: "fixture", ms: Date.now() - started };
    } catch {
      throw new Error("Offline test mode only works for the bundled sample invoices. Remove EXTRACTOR=fixture to read uploads with AI.");
    }
  }

  const pdf = await fs.readFile(absPdfPath);
  const p = provider();
  const out = p === "openai" ? await extractWithOpenAI(pdf) : p === "mistral" ? await extractWithMistral(pdf) : await extractWithAnthropic(pdf);
  return { invoice: out.invoice, mode: "ai", model: `${p}/${out.model}`, ms: Date.now() - started };
}
