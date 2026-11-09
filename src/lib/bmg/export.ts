import "server-only";
import path from "node:path";
import { Resvg } from "@resvg/resvg-js";
import ExcelJS from "exceljs";
import PDFDocument from "pdfkit";
import { fmtDateTime } from "../format";
import { STATUS_LABEL, type BmgStats } from "./report";

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
type Meta = { from: string; to: string; roomLabel: string; statusLabel: string; generatedBy: string };

const FONT_DIR = path.join(process.cwd(), "node_modules/@expo-google-fonts/plus-jakarta-sans");
const F = {
  regular: path.join(FONT_DIR, "400Regular/PlusJakartaSans_400Regular.ttf"),
  medium: path.join(FONT_DIR, "500Medium/PlusJakartaSans_500Medium.ttf"),
  semibold: path.join(FONT_DIR, "600SemiBold/PlusJakartaSans_600SemiBold.ttf"),
};

export function svgToPng(svg: string, width = 1280) {
  const r = new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { fontFiles: [F.regular, F.medium, F.semibold], loadSystemFonts: false, defaultFontFamily: "Plus Jakarta Sans" },
    background: "white",
  });
  return Buffer.from(r.render().asPng());
}

const br = (iso: string) => iso.split("-").reverse().join("/");
const pct = (v: number) => `${String(v).replace(".", ",")}%`;

function kpiList(s: BmgStats): [string, string][] {
  const k = s.kpis;
  return [
    ["Reservas no período", String(k.bookings)],
    ["Confirmadas ou realizadas", String(k.used)],
    ["Diárias utilizadas", String(k.nights)],
    ["Ocupação média das suítes", pct(k.occupancy)],
    ["Média de diárias por reserva", String(k.avgNights).replace(".", ",")],
    ["Antecedência média (dias)", String(k.avgLead).replace(".", ",")],
    ["Cancelamentos", pct(k.cancelRate)],
    ["Ausências", String(k.absences)],
    ["Ocorrências de tag", String(k.occurrences)],
    ["Apartamentos atendidos", String(k.units)],
  ];
}

// ---------------------------------------------------------------------------
// Excel
// ---------------------------------------------------------------------------
export async function bmgXlsx(rows: Row[], s: BmgStats, charts: Record<string, string>, meta: Meta) {
  const wb = new ExcelJS.Workbook();
  wb.creator = "NEW.IN Comunidade";
  wb.created = new Date();
  const violet = "FF6A3DF5";
  const head = (ws: ExcelJS.Worksheet, rowNum: number) => {
    const r = ws.getRow(rowNum);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: violet } };
    r.alignment = { vertical: "middle" };
    r.height = 22;
  };

  // Resumo
  const ws = wb.addWorksheet("Resumo", { views: [{ showGridLines: false }] });
  ws.columns = [{ width: 34 }, { width: 18 }, { width: 4 }, { width: 22 }, { width: 14 }, { width: 14 }, { width: 14 }];
  ws.getCell("A1").value = "Be My Guest — Relatório de utilização";
  ws.getCell("A1").font = { size: 16, bold: true, color: { argb: violet } };
  ws.getCell("A2").value = `Período: ${br(meta.from)} a ${br(meta.to)} · Suíte: ${meta.roomLabel} · Situação: ${meta.statusLabel}`;
  ws.getCell("A3").value = `Gerado em ${fmtDateTime(new Date())} por ${meta.generatedBy} · Condomínio NEW.IN`;
  ws.getCell("A2").font = ws.getCell("A3").font = { color: { argb: "FF555E78" } };
  ws.getRow(5).values = ["Indicador", "Valor"];
  head(ws, 5);
  kpiList(s).forEach(([k, v], i) => { ws.getRow(6 + i).values = [k, v]; });
  ws.getRow(5).getCell(4).value = "Suíte";
  ws.getRow(5).getCell(5).value = "Reservas";
  ws.getRow(5).getCell(6).value = "Diárias";
  ws.getRow(5).getCell(7).value = "Ocupação";
  s.byRoom.forEach((r, i) => {
    const row = ws.getRow(6 + i);
    row.getCell(4).value = r.name; row.getCell(5).value = r.bookings; row.getCell(6).value = r.nights;
    row.getCell(7).value = r.occupancy / 100; row.getCell(7).numFmt = "0.0%";
  });
  let y = 18;
  for (const key of ["occupancy", "monthly", "units", "status"]) {
    const img = wb.addImage({ buffer: svgToPng(charts[key], 1200) as unknown as ExcelJS.Buffer, extension: "png" });
    const h = key === "units" || key === "status" ? 300 : 280;
    ws.addImage(img, { tl: { col: 0, row: y }, ext: { width: 620, height: h } });
    y += Math.ceil(h / 20) + 1;
  }

  // Por apartamento
  const wu = wb.addWorksheet("Por apartamento");
  wu.columns = [
    { header: "Apartamento", key: "unit", width: 14 }, { header: "Reservas", key: "bookings", width: 11 },
    { header: "Confirmadas/realizadas", key: "used", width: 22 }, { header: "Diárias", key: "nights", width: 10 },
    { header: "Canceladas", key: "cancelled", width: 12 }, { header: "Recusadas", key: "refused", width: 12 },
    { header: "Ausências", key: "absences", width: 11 }, { header: "Ocorrências de tag", key: "occurrences", width: 18 },
    { header: "Última entrada", key: "lastStart", width: 16 },
  ];
  head(wu, 1);
  s.byUnit.forEach((u) => wu.addRow({ ...u, lastStart: u.lastStart ? br(u.lastStart) : "" }));
  wu.autoFilter = { from: "A1", to: "I1" };
  wu.views = [{ state: "frozen", ySplit: 1 }];

  // Ocupação mensal
  const wm = wb.addWorksheet("Ocupação mensal");
  const rooms = s.byRoom;
  wm.columns = [{ header: "Mês", key: "m", width: 12 }, { header: "Dias", key: "d", width: 8 },
    ...rooms.flatMap((r) => [{ header: `${r.name} — diárias`, key: `${r.code}_n`, width: 22 }, { header: `${r.name} — ocupação`, key: `${r.code}_o`, width: 22 }])];
  head(wm, 1);
  s.byMonth.forEach((m) => {
    const row: Record<string, unknown> = { m: m.label, d: m.days };
    rooms.forEach((r) => { row[`${r.code}_n`] = m.perRoom[r.code]; row[`${r.code}_o`] = m.days ? m.perRoom[r.code] / m.days : 0; });
    const added = wm.addRow(row);
    rooms.forEach((r) => { added.getCell(`${r.code}_o`).numFmt = "0.0%"; });
  });

  // Reservas
  const wr = wb.addWorksheet("Reservas");
  wr.columns = [
    { header: "Reserva", key: "code", width: 11 }, { header: "Suíte", key: "room", width: 15 }, { header: "Apto", key: "unit", width: 8 },
    { header: "Responsável", key: "resp", width: 26 }, { header: "Entrada", key: "ci", width: 18 }, { header: "Saída", key: "co", width: 18 },
    { header: "Diárias", key: "nights", width: 9 }, { header: "Hóspedes", key: "guests", width: 36 }, { header: "Situação", key: "status", width: 13 },
    { header: "Solicitada em", key: "created", width: 18 }, { header: "Vistoria", key: "insp", width: 22 }, { header: "Tag", key: "tag", width: 12 },
    { header: "Devolução da tag", key: "tagret", width: 18 }, { header: "Ocorrência", key: "occ", width: 18 }, { header: "Observações", key: "obs", width: 36 },
  ];
  head(wr, 1);
  rows.forEach((r) => wr.addRow({
    code: r.code, room: r.room, unit: r.unit, resp: r.responsible_name, ci: fmtDateTime(r.checkin_at), co: fmtDateTime(r.checkout_at),
    nights: r.nights, guests: (r.guests as { name: string }[]).map((g) => g.name).join(" | "), status: STATUS_LABEL[r.status] ?? r.status,
    created: fmtDateTime(r.created_at), insp: r.inspection_ok === null || r.inspection_ok === undefined ? "" : r.inspection_ok ? "Sem apontamentos" : `Com apontamentos: ${r.inspection_note ?? ""}`,
    tag: r.tag_code ?? "", tagret: r.tag_returned ?? "", occ: r.occurrence_status === "sem_ocorrencia" ? "" : r.occurrence_status ?? "",
    obs: r.checkout_note ?? r.cancel_reason ?? "",
  }));
  wr.autoFilter = { from: "A1", to: "O1" };
  wr.views = [{ state: "frozen", ySplit: 1 }];

  return Buffer.from(await wb.xlsx.writeBuffer());
}

// ---------------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------------
export async function bmgPdf(rows: Row[], s: BmgStats, charts: Record<string, string>, meta: Meta) {
  const pdf = new PDFDocument({ size: "A4", margins: { top: 48, bottom: 56, left: 44, right: 44 }, bufferPages: true,
    info: { Title: "Be My Guest — Relatório de utilização", Author: "Condomínio NEW.IN" } });
  pdf.registerFont("R", F.regular);
  pdf.registerFont("M", F.medium);
  pdf.registerFont("B", F.semibold);
  const chunks: Buffer[] = [];
  pdf.on("data", (b: Buffer) => chunks.push(b));
  const done = new Promise<Buffer>((res) => pdf.on("end", () => res(Buffer.concat(chunks))));
  const W = pdf.page.width - 88;
  const VIOLET = "#6a3df5", INK = "#222b45", MUTED = "#8a91a5", LINE = "#ebe9f5";

  // Cabeçalho
  pdf.rect(0, 0, pdf.page.width, 6).fill(VIOLET);
  pdf.font("B").fontSize(9).fillColor(VIOLET).text("CONDOMÍNIO NEW.IN · BE MY GUEST", 44, 26, { characterSpacing: 1 });
  pdf.font("B").fontSize(20).fillColor(INK).text("Relatório de utilização", 44, 42);
  pdf.font("R").fontSize(10).fillColor(MUTED)
    .text(`Período ${br(meta.from)} a ${br(meta.to)} · Suíte: ${meta.roomLabel} · Situação: ${meta.statusLabel}`, 44, 70)
    .text(`Gerado em ${fmtDateTime(new Date())} por ${meta.generatedBy}`);

  // Indicadores (cartões)
  const k = kpiList(s);
  const cols = 5, gap = 8, cw = (W - gap * (cols - 1)) / cols, ch = 52;
  let top = 108;
  k.forEach(([label, value], i) => {
    const x = 44 + (i % cols) * (cw + gap), yy = top + Math.floor(i / cols) * (ch + gap);
    pdf.roundedRect(x, yy, cw, ch, 8).fill("#f7f6fc");
    pdf.font("R").fontSize(7.5).fillColor(MUTED).text(label, x + 9, yy + 8, { width: cw - 18 });
    pdf.font("B").fontSize(15).fillColor(INK).text(value, x + 9, yy + 27, { width: cw - 18 });
  });
  top += 2 * (ch + gap) + 8;

  // Gráficos
  const put = (key: string, x: number, yy: number, w: number) => {
    const png = svgToPng(charts[key], 1400);
    pdf.image(png, x, yy, { width: w });
  };
  put("occupancy", 44, top, W);
  top += W * (280 / 640) + 10;
  put("monthly", 44, top, W);

  // Página 2: por apartamento
  pdf.addPage();
  pdf.font("B").fontSize(14).fillColor(INK).text("Indicadores por apartamento", 44, 48);
  const unitsH = (48 + Math.max(1, Math.min(10, s.byUnit.filter((u) => u.nights > 0).length)) * 26 + 18) / 640;
  const statusH = (48 + Math.max(1, s.byStatus.length) * 26 + 18) / 640;
  const half = (W - 12) / 2;
  put("units", 44, 76, half);
  put("status", 44 + half + 12, 76, half);
  const ty = 76 + half * Math.max(unitsH, statusH) + 16;
  const table = (headers: string[], widths: number[], data: (string | number)[][], startY: number) => {
    let yy = startY;
    const drawHead = () => {
      pdf.rect(44, yy, W, 20).fill(VIOLET);
      let x = 44;
      headers.forEach((h, i) => { pdf.font("B").fontSize(8).fillColor("white").text(h, x + 5, yy + 6, { width: widths[i] - 10 }); x += widths[i]; });
      yy += 20;
    };
    drawHead();
    data.forEach((row, ri) => {
      const hgt = Math.max(18, ...row.map((c, i) => pdf.font("R").fontSize(8).heightOfString(String(c), { width: widths[i] - 10 }) + 8));
      if (yy + hgt > pdf.page.height - 64) { pdf.addPage(); yy = 48; drawHead(); }
      if (ri % 2) pdf.rect(44, yy, W, hgt).fill("#fbfaff");
      let x = 44;
      row.forEach((c, i) => { pdf.font(i === 0 ? "B" : "R").fontSize(8).fillColor(INK).text(String(c), x + 5, yy + 5, { width: widths[i] - 10 }); x += widths[i]; });
      pdf.moveTo(44, yy + hgt).lineTo(44 + W, yy + hgt).lineWidth(0.5).strokeColor(LINE).stroke();
      yy += hgt;
    });
    return yy;
  };
  const uw = [70, 52, 80, 50, 62, 58, 56, 70].map((x) => (x / 498) * W);
  table(["Apto", "Reservas", "Confirm./realiz.", "Diárias", "Canceladas", "Recusadas", "Ausências", "Última entrada"], uw,
    s.byUnit.map((u) => [u.unit, u.bookings, u.used, u.nights, u.cancelled, u.refused, u.absences, u.lastStart ? br(u.lastStart) : "—"]), ty);

  // Página 3: reservas
  pdf.addPage();
  pdf.font("B").fontSize(14).fillColor(INK).text("Reservas do período", 44, 48);
  const rw = [48, 64, 36, 92, 70, 70, 36, 86].map((x) => (x / 502) * W);
  table(["Reserva", "Suíte", "Apto", "Responsável", "Entrada", "Saída", "Diárias", "Situação"], rw,
    rows.map((r) => [r.code, r.room, r.unit, r.responsible_name ?? "", fmtDateTime(r.checkin_at), fmtDateTime(r.checkout_at), r.nights, STATUS_LABEL[r.status] ?? r.status]), 76);

  // Rodapé
  const range = pdf.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    pdf.switchToPage(i);
    const b = pdf.page.margins.bottom; pdf.page.margins.bottom = 0;
    pdf.font("R").fontSize(8).fillColor(MUTED).text(`NEW.IN Comunidade · Be My Guest · página ${i + 1} de ${range.count}`, 44, pdf.page.height - 34, { width: W, align: "center" });
    pdf.page.margins.bottom = b;
  }
  pdf.end();
  return done;
}
