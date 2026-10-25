import { NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getMedia } from "@/lib/media-store";
import { canOpenFinanceProof } from "@/lib/finance/proof";
import { isUuid } from "@/lib/media";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "not found" }, { status: 404 });

  const row = await getMedia(id);
  if (!row) return NextResponse.json({ error: "not found" }, { status: 404 });

  // Receipts are private: only the owner and the unit they belong to may open them (lib/finance/proof.ts).
  if (row.kind === "document" && !(await canOpenFinanceProof(user, row))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const body = new Uint8Array(Buffer.from(row.data, "base64"));
  const name = row.fileName ?? "berkas";
  return new Response(body, {
    headers: {
      "Content-Type": row.mimeType,
      "Content-Length": String(body.byteLength),
      "Content-Disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`,
      // Media rows are immutable (a new upload gets a new id), so images cache
      // for good. Identity documents are never kept in the browser cache.
      "Cache-Control":
        row.kind === "document" ? "private, no-store" : "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
