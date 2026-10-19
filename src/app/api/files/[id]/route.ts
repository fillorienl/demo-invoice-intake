import { promises as fs } from "fs";
import { absPath, getDocument } from "@/lib/store";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const doc = await getDocument(id);
  if (!doc) return new Response("Not found", { status: 404 });
  const bytes = await fs.readFile(absPath(doc));
  return new Response(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="${doc.filename.replace(/"/g, "")}"`,
      "Cache-Control": "no-store",
    },
  });
}
