import PDFDocument from "pdfkit";
import { apiAdmin } from "@/lib/api-auth";
import { asUser } from "@/lib/db";
import { fmtDate, fmtDateTime, fmtDateTimeSec } from "@/lib/format";
import type { FreezeDoc } from "@/lib/lottery/core";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VIOLETA = "#5627e0";
const NOITE = "#1d2b4f";
const CINZA = "#4a5675";

export async function GET(_: Request, { params }: { params: Promise<{ code: string }> }) {
  const me = await apiAdmin();
  if (!me) return new Response("Acesso negado", { status: 403 });
  const { code } = await params;

  const d = await asUser(me.id, async (tx) => {
    const [c] = await tx`select c.*, f.full_name as frozen_by_name from lottery_campaigns c left join users f on f.id = c.frozen_by where c.code = ${code}`;
    if (!c) return null;
    const periods = await tx`select id, code, label from lottery_periods where campaign_id = ${c.id} order by sort`;
    const venues = await tx`select s.code, s.name, s.capacity from lottery_venues v join spaces s on s.id = v.space_id where v.campaign_id = ${c.id} order by s.sort_order`;
    const rounds = await tx`
      select r.round, r.status, r.seed_commitment, r.sealed_at, r.public_entropy, r.started_at, r.order_doc, r.concluded_at,
             r.seed_revealed, r.annulled_at, r.annul_reason, s1.full_name as sealed_by_name, s2.full_name as started_by_name, s3.full_name as concluded_by_name, s4.full_name as annulled_by_name
      from lottery_rounds r left join users s1 on s1.id = r.sealed_by left join users s2 on s2.id = r.started_by
      left join users s3 on s3.id = r.concluded_by left join users s4 on s4.id = r.annulled_by
      where r.campaign_id = ${c.id} order by r.round`;
    const stages = await tx`
      select x.*, p.code as period_code, p.label as period_label, s.name as space_name, u.code as winner_code, o.full_name as operator
      from lottery_stages x join lottery_periods p on p.id = x.period_id join spaces s on s.id = x.space_id
      left join units u on u.id = x.winner_unit_id left join users o on o.id = x.executed_by
      where x.campaign_id = ${c.id} order by x.round, p.sort, x.seq`;
    const entries = await tx`
      select count(*) filter (where status = 'ativa')::int as ativas,
             count(*) filter (where status = 'ativa' and origin = 'email')::int as por_email,
             count(*) filter (where status <> 'ativa')::int as canceladas,
             count(distinct unit_id) filter (where status = 'ativa')::int as unidades
      from lottery_entries where campaign_id = ${c.id}`;
    const [chain] = await tx`select * from app.audit_verify()`;
    const subs = await tx`
      select s.*, w.code as withdrawn_code, nw.code as new_winner_code, us.full_name as requested_by_name, x.round as stage_round,
             p.label as period_label, sp.name as space_name
      from lottery_substitutions s join lottery_stages x on x.id = s.stage_id join lottery_periods p on p.id = x.period_id
      join spaces sp on sp.id = x.space_id join units w on w.id = s.withdrawn_unit_id left join units nw on nw.id = s.new_winner_unit_id
      join users us on us.id = s.requested_by where s.campaign_id = ${c.id} order by s.created_at`;
    const rres = await tx`select round, reserve_commitment, reserve_revealed, reserve_revealed_at from lottery_rounds where campaign_id = ${c.id} order by round`;
    return { c, periods, venues, rounds, stages, entries: entries[0], chain, subs, rres };
  });
  if (!d) return new Response("Campanha não encontrada", { status: 404 });
  const { c, periods, venues, rounds, stages, entries, chain, subs, rres } = d;
  const doc0 = c.freeze_doc as FreezeDoc | null;
  const spaceName = (sc: string) => venues.find((v) => v.code === sc)?.name ?? sc;
  const periodLabel = (pc: string) => periods.find((p) => p.code === pc)?.label ?? pc;

  const pdf = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 64, left: 56, right: 56 }, bufferPages: true,
    info: { Title: `Ata — ${c.title}`, Author: "Condomínio NEW.IN", Subject: "Sorteio dos salões" } });
  const chunks: Buffer[] = [];
  pdf.on("data", (b: Buffer) => chunks.push(b));
  const done = new Promise<Buffer>((res) => pdf.on("end", () => res(Buffer.concat(chunks))));

  const W = pdf.page.width - 112;
  const h1 = (t: string) => { pdf.moveDown(0.8).font("Helvetica-Bold").fontSize(12.5).fillColor(VIOLETA).text(t.toUpperCase(), { characterSpacing: 0.4 }); pdf.moveDown(0.3).fillColor(NOITE); };
  const p = (t: string, opts: PDFKit.Mixins.TextOptions = {}) => pdf.font("Helvetica").fontSize(10).fillColor(NOITE).text(t, { align: "justify", ...opts });
  const kv = (k: string, v: string) => {
    if (!v) { pdf.font("Helvetica-Bold").fontSize(10).fillColor(NOITE).text(`${k}:`); return; }
    pdf.font("Helvetica-Bold").fontSize(10).fillColor(NOITE).text(`${k}: `, { continued: true }).font("Helvetica").text(v);
  };
  const mono = (t: string) => pdf.font("Courier").fontSize(8.5).fillColor(CINZA).text(t, { width: W });
  const strip = (md: string) => md.replace(/\*\*(.+?)\*\*/g, "$1").replace(/\*(.+?)\*/g, "$1").replace(/^- /gm, "• ");

  // Cabeçalho
  pdf.rect(0, 0, pdf.page.width, 8).fill(VIOLETA);
  pdf.fillColor(VIOLETA).font("Helvetica-Bold").fontSize(9).text("CONDOMÍNIO NEW.IN · CURITIBA/PR", 56, 30, { characterSpacing: 1.2 });
  pdf.moveDown(0.6).fillColor(NOITE).font("Helvetica-Bold").fontSize(18).text("Ata do sorteio dos salões");
  pdf.font("Helvetica").fontSize(12).text("Natal e Ano Novo 2026/2027");
  if (c.status !== "concluida") {
    pdf.moveDown(0.5).font("Helvetica-Bold").fontSize(10).fillColor("#c23a2b")
      .text(`DOCUMENTO PARCIAL — situação atual da campanha: ${c.status}. Sem resultado oficial concluído.`);
  }
  pdf.moveDown(0.4).font("Helvetica").fontSize(9).fillColor(CINZA).text(`Gerada em ${fmtDateTimeSec(new Date())} (horário de Curitiba) por ${me.fullName}.`);

  h1("1. Fontes e regras aplicadas");
  p(c.source_note);
  pdf.moveDown(0.3);
  p(strip(c.rules_md).replace(/\n{2,}/g, "\n"));
  pdf.moveDown(0.3);
  kv("Versão das regras", String(c.rules_version));
  kv("Versão do termo de participação", String(c.terms_version));
  kv("Prazo de inscrição", `${fmtDate(c.registration_deadline_date)}${c.registration_deadline ? ` às ${fmtDateTime(c.registration_deadline).split(" ")[1]}` : " (horário não definido; limite ao final do dia)"}`);
  kv("Data do sorteio", `${fmtDate(c.draw_date)}${c.draw_at ? ` às ${fmtDateTime(c.draw_at).split(" ")[1]}` : ""}`);

  h1("2. Inscrições");
  kv("Apartamentos inscritos", String(entries.unidades));
  kv("Inscrições ativas (unidade × salão × período)", `${entries.ativas}, das quais ${entries.por_email} recebidas por e-mail e lançadas pela administração`);
  kv("Inscrições canceladas ou invalidadas", String(entries.canceladas));

  h1("3. Congelamento da lista");
  if (c.freeze_hash && doc0) {
    kv("Congelada em", `${fmtDateTimeSec(c.frozen_at)} por ${c.frozen_by_name}`);
    p("Impressão digital (SHA-256 do documento canônico da lista):");
    mono(c.freeze_hash);
    pdf.moveDown(0.3);
    for (const per of doc0.periodos) {
      pdf.font("Helvetica-Bold").fontSize(10).fillColor(NOITE).text(periodLabel(per.codigo));
      for (const s of per.saloes) {
        p(`${spaceName(s.codigo)} — ${s.apartamentos.length} apartamento(s): ${s.apartamentos.join(", ") || "nenhum"}`, { indent: 10 });
      }
    }
  } else p("A lista ainda não foi congelada.");

  h1("4. Ordem dos salões");
  kv("Método", c.order_method === "fixa" ? "ordem fixa divulgada previamente" : c.order_method === "sorteada" ? "ordem sorteada no início do sorteio" : "PENDENTE");
  if (c.order_note) kv("Fonte da decisão", c.order_note);

  h1("5. Execução");
  if (!rounds.length) p("Nenhuma rodada lacrada.");
  for (const r of rounds) {
    pdf.moveDown(0.4).font("Helvetica-Bold").fontSize(11).fillColor(NOITE)
      .text(`Rodada ${r.round} — ${{ lacrada: "lacrada (não iniciada)", em_andamento: "em andamento", concluida: "CONCLUÍDA (resultado oficial)", anulada: "ANULADA" }[r.status as "lacrada" | "em_andamento" | "concluida" | "anulada"]}`);
    kv("Lacre da chave (SHA-256)", "");
    mono(r.seed_commitment);
    kv("Lacrada em", `${fmtDateTimeSec(r.sealed_at)} por ${r.sealed_by_name ?? "—"}`);
    if (r.public_entropy) kv("Número público informado", `${r.public_entropy} (início em ${fmtDateTimeSec(r.started_at)} por ${r.started_by_name})`);
    if (r.order_doc) {
      for (const [pc, list] of Object.entries(r.order_doc as Record<string, string[]>)) {
        kv(`Ordem efetiva — ${periodLabel(pc)}`, (list as string[]).map(spaceName).join(" > "));
      }
    }
    const rs = stages.filter((s) => s.round === r.round);
    for (const s of rs) {
      pdf.moveDown(0.3).font("Helvetica-Bold").fontSize(10).fillColor(VIOLETA)
        .text(`${s.period_label} · ${s.seq}ª etapa · ${s.space_name}`);
      pdf.fillColor(NOITE);
      if (s.status === "pendente") { p("Não sorteada.", { indent: 10 }); continue; }
      if (s.eligible) p(`Elegíveis (${(s.eligible as string[]).length}): ${(s.eligible as string[]).join(", ") || "nenhum"}`, { indent: 10 });
      if ((s.excluded as string[] | null)?.length) p(`Retirados por já terem vencido no período: ${(s.excluded as string[]).join(", ")}`, { indent: 10 });
      if (s.winner_code) p(`Posição sorteada: ${s.draw_index + 1} de ${(s.eligible as string[]).length}  ·  VENCEDOR: APARTAMENTO ${s.winner_code}`, { indent: 10 });
      else p("Sem elegíveis nesta etapa.", { indent: 10 });
      p(`Executada em ${fmtDateTimeSec(s.executed_at)} por ${s.operator}${s.status === "anulada" ? " — ETAPA ANULADA" : ""}`, { indent: 10 });
      pdf.font("Courier").fontSize(7.5).fillColor(CINZA).text(`hash dos elegíveis: ${s.eligible_hash}`, { indent: 10 });
    }
    if (r.concluded_at) kv("Concluída em", `${fmtDateTimeSec(r.concluded_at)} por ${r.concluded_by_name}`);
    if (r.annulled_at) { kv("Anulada em", `${fmtDateTimeSec(r.annulled_at)} por ${r.annulled_by_name}`); kv("Justificativa", r.annul_reason); }
    if (r.seed_revealed) { kv("Chave revelada", ""); mono(r.seed_revealed); }
  }

  h1("6. Desistências e novos sorteios");
  for (const rr of rres.filter((x) => x.reserve_commitment)) {
    kv(`Lacre da chave reserva — rodada ${rr.round}`, "");
    mono(rr.reserve_commitment);
    if (rr.reserve_revealed) { kv("Período de desistências encerrado em", fmtDateTimeSec(rr.reserve_revealed_at)); kv("Chave reserva revelada", ""); mono(rr.reserve_revealed); }
  }
  if (!subs.length) p("Nenhuma desistência registrada.");
  for (const s of subs) {
    pdf.moveDown(0.3).font("Helvetica-Bold").fontSize(10).fillColor(VIOLETA).text(`${s.period_label} · ${s.space_name} · ${s.n}ª desistência`);
    pdf.fillColor(NOITE);
    p(`Desistente: apartamento ${s.withdrawn_code} — ${s.origin === "morador" ? "registrada pelo próprio morador no aplicativo" : `registrada pela administração (${s.reason})`} por ${s.requested_by_name} em ${fmtDateTimeSec(s.created_at)}`, { indent: 10 });
    p(`Excluídos do novo sorteio: ${(s.excluded as string[]).join(", ")}`, { indent: 10 });
    p(`Elegíveis (${(s.eligible as string[]).length}): ${(s.eligible as string[]).join(", ") || "nenhum"}`, { indent: 10 });
    p(s.new_winner_code ? `Posição sorteada: ${s.draw_index + 1}  ·  NOVO VENCEDOR: APARTAMENTO ${s.new_winner_code}` : "Sem inscritos disponíveis: o salão fica sem reserva pelo sorteio.", { indent: 10 });
    pdf.font("Courier").fontSize(7.5).fillColor(CINZA).text(`hash dos elegíveis: ${s.eligible_hash}`, { indent: 10 });
  }

  h1("7. Resultado oficial");
  const official = stages.filter((s) => s.round === c.current_round && ["sorteada", "sem_elegiveis"].includes(s.status));
  if (c.status === "concluida" && official.length) {
    for (const per of periods) {
      pdf.font("Helvetica-Bold").fontSize(10.5).fillColor(NOITE).text(per.label);
      for (const s of official.filter((x) => x.period_code === per.code)) {
        const chain2 = subs.filter((x) => x.stage_id === s.id);
        const holder = chain2.length ? chain2[chain2.length - 1].new_winner_code : s.winner_code;
        p(`${s.space_name}: ${holder ? `apartamento ${holder}` : "sem reserva"}${chain2.length ? ` (sorteado originalmente: ${s.winner_code}; ${chain2.length} desistência(s))` : ""}`, { indent: 10 });
      }
    }
    pdf.moveDown(0.3);
    p("Cada reserva abrange o período completo de dois dias (exceção ao item 20.14 para datas festivas), com uma única taxa. Na desistência do sorteado, novo sorteio automático entre os demais inscritos.");
  } else p("Ainda não há resultado oficial concluído.");

  h1("8. Como conferir");
  p("Qualquer morador pode refazer o sorteio no aplicativo (Sorteios > Verificar): (a) o SHA-256 do documento canônico da lista deve ser igual à impressão digital acima; (b) o SHA-256 da chave revelada deve ser igual ao lacre publicado antes do sorteio; (c) para cada etapa, a posição sorteada é obtida por HMAC-SHA256(chave, número público | campanha | rodada | período | salão | contador), usando os 48 primeiros bits com amostragem por rejeição, o que garante escolha uniforme entre os elegíveis.");
  pdf.moveDown(0.3);
  kv("Trilha de auditoria no momento da geração", `${chain.ok ? "íntegra" : `DIVERGÊNCIA a partir do evento ${chain.first_broken}`} · ${chain.total} eventos`);
  mono(`último hash: ${chain.head_hash}`);

  // Assinaturas
  if (pdf.y > pdf.page.height - 260) pdf.addPage();
  h1("9. Assinaturas");
  pdf.moveDown(1.5);
  const sig = (label: string) => {
    const y = pdf.y + 26;
    pdf.moveTo(56, y).lineTo(56 + W * 0.62, y).lineWidth(0.6).strokeColor(CINZA).stroke();
    pdf.font("Helvetica").fontSize(9).fillColor(CINZA).text(label, 56, y + 4);
    pdf.moveDown(1.6);
  };
  sig("Síndico(a)");
  sig("Membro do conselho");
  sig("Membro do conselho");
  sig("Testemunha (morador presente)");

  // Rodapé com paginação
  const range = pdf.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i++) {
    pdf.switchToPage(i);
    const bottom = pdf.page.margins.bottom;
    pdf.page.margins.bottom = 0;
    pdf.font("Helvetica").fontSize(8).fillColor(CINZA)
      .text(`Ata do sorteio · ${c.code} · lista ${c.freeze_hash ? c.freeze_hash.slice(0, 16) : "não congelada"} · página ${i + 1} de ${range.count}`,
        56, pdf.page.height - 40, { width: W, align: "center" });
    pdf.page.margins.bottom = bottom;
  }
  pdf.end();
  const buf = await done;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="ata-sorteio-${code}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
