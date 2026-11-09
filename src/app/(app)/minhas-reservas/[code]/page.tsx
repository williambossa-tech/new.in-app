import Link from "next/link";
import { notFound } from "next/navigation";
import { Corujinha } from "@/components/Corujinha";
import { BookingBadge } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import type { FeeSnapshot } from "@/lib/fees";
import { BASIS_LABEL } from "@/lib/fees";
import { fmtDateTime } from "@/lib/format";
import { KIND_LABEL, loadBookingDetail, maskCpf } from "@/lib/receipt";

export const metadata = { title: "Detalhes da reserva" };
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export default async function ReservaDetalhe({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const me = await requireUser();
  const b = await loadBookingDetail(me.id, code);
  if (!b) notFound();
  const fee = b.fee_snapshot as FeeSnapshot | null;
  return (
    <div className="space-y-8">
      <Link href="/minhas-reservas" className="text-sm font-medium text-violeta-700">‹ Minhas reservas</Link>
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-violeta to-violeta-700 px-7 py-9 text-white sm:px-10">
        <p className="text-sm text-white/75">{KIND_LABEL[b.kind] ?? b.kind} · reserva #{b.code}</p>
        <h1 className="mt-1 text-[1.8rem] font-semibold leading-tight tracking-[-0.02em]">{b.space}</h1>
        <div className="mt-3"><span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-violeta-700"><BookingBadgeText status={b.status} /></span></div>
        <Corujinha pose="festa" size={120} className="owl-bob absolute -bottom-2 right-6 hidden sm:block" alt="" />
      </section>

      <section className="card grid gap-6 p-7 sm:grid-cols-3">
        <Info label="Entrada" value={fmtDateTime(b.starts_at)} />
        <Info label="Saída" value={fmtDateTime(b.ends_at)} />
        <Info label={b.kind === "bmg" ? "Diárias" : "Apartamento"} value={b.kind === "bmg" ? String(b.nights) : b.unit} />
        <Info label="Apartamento" value={b.unit} />
        <Info label="Responsável" value={b.responsible_name ?? "—"} />
        <Info label="Situação" value={<BookingBadge status={b.status} />} />
      </section>

      {b.guests.length > 0 && (
        <section className="card p-7">
          <h2 className="h2">Hóspedes</h2>
          <ul className="mt-4 divide-y divide-linha">
            {b.guests.map((g) => (
              <li key={g.cpf} className="flex justify-between py-3"><span>{g.full_name}{g.is_minor ? " · menor" : ""}</span><span className="text-noite-50">CPF {maskCpf(g.cpf)}</span></li>
            ))}
          </ul>
        </section>
      )}

      <section className="card p-7">
        <h2 className="h2">Valores</h2>
        <ul className="mt-4 divide-y divide-linha">
          {(fee?.lines ?? []).map((l) => (
            <li key={l.component} className="flex justify-between gap-4 py-3">
              <span>{l.label} <span className="text-sm text-noite-50">· {brl(l.amount)} {BASIS_LABEL[l.basis]}{l.qty > 1 ? ` × ${l.qty}` : ""}</span></span>
              <span className="font-medium">{brl(l.subtotal)}</span>
            </li>
          ))}
          {(fee?.missing ?? []).map((m) => (
            <li key={m} className="flex justify-between py-3"><span>{m}</span><span className="text-sm text-noite-50">a definir</span></li>
          ))}
          {!fee && <li className="py-3 text-noite-50">Valores a definir</li>}
        </ul>
        <div className="mt-2 flex items-center justify-between border-t border-linha pt-4">
          <span className="font-semibold">Total</span>
          <span className="text-xl font-semibold text-violeta-700">
            {fee && !fee.missing?.length ? brl(fee.total) : fee?.lines?.length ? `${brl(fee.total)} parcial` : "a definir"}
          </span>
        </div>
        <p className="mt-3 text-sm text-noite-50">Lançado no boleto do condomínio.</p>
      </section>

      <a href={`/api/reservas/${b.code}/comprovante`} target="_blank" className="btn-primary w-full sm:w-auto sm:px-10">Baixar comprovante (PDF)</a>
    </div>
  );
}

function Info({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><p className="text-sm text-noite-50">{label}</p><div className="mt-0.5 font-semibold">{value}</div></div>;
}

function BookingBadgeText({ status }: { status: string }) {
  const t: Record<string, string> = { solicitada: "Solicitada", confirmada: "Confirmada", em_uso: "Em uso", concluida: "Concluída", cancelada: "Cancelada", recusada: "Recusada", ausencia: "Ausência" };
  return <>{t[status] ?? status}</>;
}
