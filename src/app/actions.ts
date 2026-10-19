"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addUpload, decide, processDocument, recheck, resetDemo } from "@/lib/store";

export type ActionResult = { ok: true } | { ok: false, error: string };

function fail(e: unknown): ActionResult {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

export async function processAction(id: string): Promise<ActionResult> {
  try {
    await processDocument(id);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function recheckAction(id: string, supplier_id: string, po_number: string): Promise<ActionResult> {
  try {
    await recheck(id, { supplier_id, po_number });
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function decideAction(id: string, action: "book" | "hold" | "reject", note: string): Promise<ActionResult> {
  try {
    await decide(id, action, note);
    revalidatePath("/", "layout");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function uploadAction(form: FormData): Promise<ActionResult> {
  let id: string;
  try {
    const file = form.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose a PDF file");
    if (file.size > 10 * 1024 * 1024) throw new Error("File is larger than 10 MB");
    const bytes = Buffer.from(await file.arrayBuffer());
    if (bytes.subarray(0, 5).toString() !== "%PDF-") throw new Error("Only PDF invoices are supported");
    id = await addUpload(file.name, bytes);
  } catch (e) {
    return fail(e);
  }
  revalidatePath("/", "layout");
  redirect(`/invoice/${id}`);
}

export async function resetAction(): Promise<void> {
  await resetDemo();
  revalidatePath("/", "layout");
  redirect("/");
}
