import { getSessionUser } from "@/lib/auth";
import { bookingReceiptPdf, loadBookingDetail } from "@/lib/receipt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const me = await getSessionUser();
  if (!me || me.status !== "ativo") return new Response("Acesso negado", { status: 401 });
  const { code } = await params;
  const b = await loadBookingDetail(me.id, code);
  if (!b) return new Response("Reserva não encontrada", { status: 404 });
  const buf = await bookingReceiptPdf(b);
  return new Response(new Uint8Array(buf), { headers: {
    "Content-Type": "application/pdf", "Content-Disposition": `inline; filename="comprovante-reserva-${b.code}.pdf"`, "Cache-Control": "no-store" } });
}
