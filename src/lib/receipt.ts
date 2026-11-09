import "server-only";
import { createHash } from "node:crypto";
import path from "node:path";
import PDFDocument from "pdfkit";
import { asUser } from "./db";
import type { FeeSnapshot } from "./fees";
import { BASIS_LABEL } from "./fees";
import { fmtDateTime } from "./format";

export const KIND_LABEL: Record<string, string> = { bmg: "Be My Guest", salao_festivo: "Salão — período festivo", salao: "Salão", coworking: "Coworking" };
export const STATUS_TEXT: Record<string, string> = {
  solicitada: "Solicitada", confirmada: "Confirmada", em_uso: "Em uso", concluida: "Concluída",
  cancelada: "Cancelada", recusada: "Recusada", ausencia: "Ausência",
};

export async function loadBookingDetail(userId: string, code: string) {
  return asUser(userId, async (tx) => {
    const [b] = await tx`
      select b.id, b.code, b.kind, b.status, b.origin, b.created_at, b.cancel_reason, b.fee_status, b.fee_snapshot, b.fee_total,
             lower(b.period) as starts_at, upper(b.period) as ends_at, b.responsible_name,
             s.name as space, s.code as space_code, u.code as unit,
             d.nights, d.terms_version, d.terms_accepted_at, d.start_date, d.end_date
      from bookings b join spaces s on s.id = b.space_id join units u on u.id = b.unit_id
      left join bmg_details d on d.booking_id = b.id
      where b.code = ${code.toUpperCase()}`;
    if (!b) return null;
    const guests = b.kind === "bmg"
      ? await tx`select full_name, cpf, is_minor from bmg_guests where booking_id = ${b.id} order by created_at` : [];
    return { ...b, guests } as Record<string, any> & { guests: { full_name: string; cpf: string; is_minor: boolean }[] }; // eslint-disable-line @typescript-eslint/no-explicit-any
  });
}

export const maskCpf = (c: string) => `***.${c.slice(3, 6)}.${c.slice(6, 9)}-**`;
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export async function bookingReceiptPdf(b: NonNullable<Awaited<ReturnType<typeof loadBookingDetail>>>) {
  const dir = path.join(process.cwd(), "node_modules/@expo-google-fonts/plus-jakarta-sans");
  const pdf = new PDFDocument({ size: "A4", margins: { top: 0, bottom: 40, left: 48, right: 48 },
    info: { Title: `Comprovante de reserva ${b.code}`, Author: "Condomínio NEW.IN" } });
  pdf.registerFont("R", path.join(dir, "400Regular/PlusJakartaSans_400Regular.ttf"));
  pdf.registerFont("M", path.join(dir, "500Medium/PlusJakartaSans_500Medium.ttf"));
  pdf.registerFont("B", path.join(dir, "600SemiBold/PlusJakartaSans_600SemiBold.ttf"));
  const chunks: Buffer[] = [];
  pdf.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((r) => pdf.on("end", () => r(Buffer.concat(chunks))));
  const W = pdf.page.width - 96, X = 48;
  const VIOLET = "#6a3df5", INK = "#222b45", MUTED = "#8a91a5", SOFT = "#f7f6fc";

  // Faixa de cabeçalho
  pdf.rect(0, 0, pdf.page.width, 132).fill(VIOLET);
  pdf.image(path.join(process.cwd(), "public/corujinha/ola.png"), pdf.page.width - 48 - 96, 22, { width: 96 });
  pdf.font("B").fontSize(11).fillColor("white").text("NEW.IN Comunidade", X, 34);
  pdf.font("B").fontSize(24).text("Comprovante de reserva", X, 52);
  pdf.font("R").fontSize(10).fillColor("#e4dbff").text(`Reserva #${b.code} · emitido em ${fmtDateTime(new Date())}`, X, 86);
  const status = STATUS_TEXT[b.status] ?? b.status;
  pdf.roundedRect(X, 104, pdf.widthOfString(status) + 24, 18, 9).fill("white");
  pdf.font("B").fontSize(9).fillColor(VIOLET).text(status, X + 12, 108);

  let y = 158;
  const block = (title: string) => { pdf.font("B").fontSize(12).fillColor(INK).text(title, X, y); y += 22; };
  const field = (label: string, value: string, x: number, w: number) => {
    pdf.font("R").fontSize(8.5).fillColor(MUTED).text(label, x, y, { width: w });
    pdf.font("M").fontSize(11).fillColor(INK).text(value, x, y + 12, { width: w });
  };

  block("Dados da reserva");
  const c3 = W / 3;
  field("Espaço", `${b.space}`, X, c3); field("Apartamento", b.unit, X + c3, c3); field("Responsável", b.responsible_name ?? "—", X + 2 * c3, c3);
  y += 40;
  field("Entrada", fmtDateTime(b.starts_at), X, c3); field("Saída", fmtDateTime(b.ends_at), X + c3, c3);
  field(b.kind === "bmg" ? "Diárias" : "Tipo", b.kind === "bmg" ? String(b.nights) : KIND_LABEL[b.kind] ?? b.kind, X + 2 * c3, c3);
  y += 44;
  if (b.status === "cancelada" || b.status === "recusada") {
    pdf.font("R").fontSize(9.5).fillColor("#c23a2b").text(`${status}: ${b.cancel_reason ?? ""}`, X, y, { width: W }); y += 22;
  }

  if (b.guests.length) {
    block("Hóspedes");
    for (const g of b.guests) {
      pdf.font("M").fontSize(10.5).fillColor(INK).text(g.full_name, X, y, { continued: true })
        .font("R").fillColor(MUTED).text(`   CPF ${maskCpf(g.cpf)}${g.is_minor ? " · menor de idade" : ""}`);
      y += 18;
    }
    y += 10;
  }

  // Valores
  block("Valores");
  const fee = b.fee_snapshot as FeeSnapshot | null;
  const cols = [W * 0.42, W * 0.18, W * 0.12, W * 0.28];
  pdf.roundedRect(X, y, W, 22, 6).fill(SOFT);
  ["Componente", "Base", "Qtd.", "Valor"].forEach((h, i) => {
    const x = X + cols.slice(0, i).reduce((a, c) => a + c, 0);
    pdf.font("B").fontSize(8.5).fillColor(MUTED).text(h, x + 10, y + 7, { width: cols[i] - 20, align: i === 3 ? "right" : "left" });
  });
  y += 28;
  const lines = fee?.lines ?? [];
  for (const l of lines) {
    const vals = [l.label, BASIS_LABEL[l.basis] ?? l.basis, String(l.qty), `${brl(l.amount)} × ${l.qty} = ${brl(l.subtotal)}`];
    vals.forEach((v, i) => {
      const x = X + cols.slice(0, i).reduce((a, c) => a + c, 0);
      pdf.font(i === 0 ? "M" : "R").fontSize(10).fillColor(INK).text(v, x + 10, y, { width: cols[i] - 20, align: i === 3 ? "right" : "left" });
    });
    y += 20;
  }
  if (fee?.missing?.length) {
    for (const m of fee.missing) {
      pdf.font("M").fontSize(10).fillColor(INK).text(m, X + 10, y, { width: cols[0] - 20 });
      pdf.font("R").fontSize(10).fillColor(MUTED).text("valor a definir em assembleia", X + cols[0] + 10, y, { width: W - cols[0] - 20, align: "right" });
      y += 20;
    }
  }
  if (!lines.length && !fee?.missing?.length) { pdf.font("R").fontSize(10).fillColor(MUTED).text("Sem valores definidos para esta reserva.", X + 10, y); y += 20; }
  pdf.moveTo(X, y + 2).lineTo(X + W, y + 2).lineWidth(0.6).strokeColor("#e4dbff").stroke();
  y += 10;
  const totalText = fee && !fee.missing?.length ? brl(fee.total) : lines.length ? `${brl(fee!.total)} (parcial)` : "a definir";
  pdf.font("B").fontSize(13).fillColor(INK).text("Total", X + 10, y);
  pdf.font("B").fontSize(13).fillColor(VIOLET).text(totalText, X, y, { width: W - 10, align: "right" });
  y += 26;
  pdf.font("R").fontSize(8.5).fillColor(MUTED).text(
    "Os valores são lançados no boleto do condomínio da unidade (Regimento Interno, item 27.19) e foram fixados no momento da reserva. Este comprovante não quita o boleto.",
    X, y, { width: W });
  y += 34;

  // Regras e aceite
  if (b.kind === "bmg") {
    block("Lembretes");
    const tips = ["Entrada a partir das 18h e saída até as 12h.", "Até 2 hóspedes identificados; menores somente com o responsável legal.",
      "Sem animais, fumo ou uso comercial. Hóspedes não usam a academia.", "Traga travesseiros, roupa de cama e itens de higiene.",
      "Tag de acesso devolvida em perfeitas condições na saída (R$ 100,00 em caso de não devolução)."];
    for (const t of tips) { pdf.font("R").fontSize(9.5).fillColor(INK).text(`•  ${t}`, X, y, { width: W }); y += 15; }
    y += 8;
    if (b.terms_version) {
      pdf.font("R").fontSize(8.5).fillColor(MUTED).text(`Termo de responsabilidade versão ${b.terms_version} aceito em ${fmtDateTime(b.terms_accepted_at)}.`, X, y); y += 14;
    }
  }

  // Autenticação
  const hash = createHash("sha256").update(JSON.stringify([b.code, b.status, b.unit, b.space, b.starts_at, b.ends_at, b.fee_snapshot])).digest("hex");
  pdf.font("R").fontSize(7.5).fillColor(MUTED).text(`Código de autenticação: ${hash.slice(0, 32)}`, X, pdf.page.height - 70, { width: W, align: "center" });
  pdf.font("R").fontSize(7.5).text("Condomínio NEW.IN · Curitiba/PR · documento gerado pelo aplicativo NEW.IN Comunidade", X, pdf.page.height - 58, { width: W, align: "center" });
  pdf.end();
  return done;
}
