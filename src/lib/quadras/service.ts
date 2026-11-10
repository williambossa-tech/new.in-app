import "server-only";
import { audit } from "../audit";
import { asSystem, asUser, type Tx } from "../db";
import { RuleError } from "../lottery/engine";
import { notify, notifyAdmins } from "../notify";

type Actor = { id: string; label: string };

export const COURTS = {
  poli: { code: "quadra-poli", name: "Quadra Poliesportiva" },
  areia: { code: "quadra-areia", name: "Quadra de Areia" },
} as const;
export type CourtKey = keyof typeof COURTS;
export const isCourt = (k: string): k is CourtKey => k === "poli" || k === "areia";

/** Horário do Regimento (25.7) e limite de visitantes sem autorização (25.3). */
export const OPEN = "08:00", CLOSE = "22:00", VISITORS_FREE = 4;
const STEP = 30;

const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00-03:00`);
const toMin = (hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); return h * 60 + m; };
const fmtHm = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).format(d);
const fmtDay = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", weekday: "short", day: "2-digit", month: "2-digit" }).format(d).replace(".", "");
export const localDay = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(d);

export type CourtSettings = {
  confirmacao: "automatica" | "administracao" | null;
  duracao: number | null;
  antecedenciaMinH: number | null;
  antecedenciaMaxD: number | null;
  maxUnidade: { quantidade: number; periodo: "dia" | "semana" | "mes" } | null;
  intervaloMin: number | null;
  consecutivosMin: number | null;
  prioridade: string | null;
  cancelamentoH: number | null;
  modalidades: string[];
};

export async function courtSettings(tx: Tx, court: CourtKey): Promise<CourtSettings> {
  const rows = await tx`select key, status, value from parameters where key like ${`quadra.${court}.%`}`;
  const v = (k: string) => { const r = rows.find((x) => x.key === `quadra.${court}.${k}`); return r?.status === "definido" ? r.value : null; };
  const n = (k: string, f: string) => { const x = v(k); return x && typeof x[f] === "number" ? (x[f] as number) : null; };
  const conf = v("confirmacao")?.modo;
  const mu = v("max_unidade");
  return {
    confirmacao: conf === "automatica" || conf === "administracao" ? conf : null,
    duracao: n("duracao", "minutos"),
    antecedenciaMinH: n("antecedencia_min", "horas"),
    antecedenciaMaxD: n("antecedencia_max", "dias"),
    maxUnidade: mu && typeof mu.quantidade === "number" && ["dia", "semana", "mes"].includes(mu.periodo) ? { quantidade: mu.quantidade, periodo: mu.periodo } : null,
    intervaloMin: n("intervalo", "minutos"),
    consecutivosMin: n("consecutivos", "minutos"),
    prioridade: typeof v("prioridade")?.texto === "string" ? v("prioridade").texto : null,
    cancelamentoH: n("cancelamento", "horas"),
    modalidades: Array.isArray(v("modalidades")?.lista) ? v("modalidades").lista : ["Outras modalidades"],
  };
}

async function roleOf(tx: Tx) {
  const [r] = await tx`select app.has_role('admin') as admin`;
  return { admin: !!r.admin };
}

async function spaceOf(tx: Tx, court: CourtKey) {
  const [s] = await tx`select id, name from spaces where code = ${COURTS[court].code} and active`;
  if (!s) throw new RuleError("Quadra indisponível.");
  return s as { id: string; name: string };
}

export type CourtRequest = {
  court: CourtKey; unitId: string; day: string; start: string; end: string;
  modality: string; participants: number; visitors: number;
  activity: "recreativo" | "jogo"; activityNote?: string; acceptTerms: boolean;
};

export async function requestCourt(actor: Actor, input: CourtRequest) {
  const { court, unitId, day, start, end } = input;
  if (!isCourt(court)) throw new RuleError("Quadra inválida.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) throw new RuleError("Escolha o dia e o horário.");
  const a = toMin(start), b = toMin(end);
  if (a < toMin(OPEN) || b > toMin(CLOSE) || b <= a) throw new RuleError("As quadras funcionam das 08h00 às 22h00 (Regimento, item 25.7).");
  if (a % STEP || b % STEP) throw new RuleError("Escolha horários em intervalos de 30 minutos.");
  const participants = Math.trunc(Number(input.participants)), visitors = Math.trunc(Number(input.visitors));
  if (!(participants >= 1 && participants <= 60)) throw new RuleError("Informe a quantidade estimada de participantes.");
  if (!(visitors >= 0 && visitors < participants)) throw new RuleError("Os visitantes fazem parte dos participantes, e o morador precisa estar presente.");
  if (!["recreativo", "jogo"].includes(input.activity)) throw new RuleError("Informe o tipo de atividade.");
  if (visitors > 0 && !input.acceptTerms) throw new RuleError("Confirme que vai acompanhar seus visitantes.");
  const starts = at(day, start), ends = at(day, end);
  if (starts.getTime() <= Date.now()) throw new RuleError("Escolha um horário futuro.");

  return asSystem(async (tx) => {
    const role = await roleOf(tx);
    const s = await courtSettings(tx, court);
    const space = await spaceOf(tx, court);
    const [m] = await tx`select 1 from unit_memberships m join users u on u.id = m.user_id
                         where m.user_id = ${actor.id} and m.unit_id = ${unitId} and m.status = 'ativo' and u.status = 'ativo'`;
    if (!m && !role.admin) throw new RuleError("Apartamento não vinculado ao seu cadastro.");
    if (!s.modalidades.includes(input.modality)) throw new RuleError("Escolha uma modalidade da lista.");

    // Parâmetros da administração (aplicados só quando definidos)
    const minutes = b - a;
    if (s.duracao && minutes !== s.duracao) throw new RuleError(`Cada horário tem ${s.duracao} minutos.`);
    if (s.consecutivosMin && minutes > s.consecutivosMin) throw new RuleError(`O uso contínuo é de até ${s.consecutivosMin} minutos.`);
    if (s.antecedenciaMinH && starts.getTime() - Date.now() < s.antecedenciaMinH * 3600_000) throw new RuleError(`Agende com pelo menos ${s.antecedenciaMinH} h de antecedência.`);
    if (s.antecedenciaMaxD && starts.getTime() - Date.now() > s.antecedenciaMaxD * 86400_000) throw new RuleError(`Agende com até ${s.antecedenciaMaxD} dias de antecedência.`);
    if (s.maxUnidade) {
      const trunc = s.maxUnidade.periodo === "dia" ? "day" : s.maxUnidade.periodo === "semana" ? "week" : "month";
      const [c] = await tx`select count(*)::int as n from bookings
        where kind = 'quadra' and space_id = ${space.id} and unit_id = ${unitId} and status in ('solicitada', 'confirmada', 'em_uso', 'concluida')
          and date_trunc(${trunc}, local_day) = date_trunc(${trunc}, ${day}::date)`;
      if (c.n >= s.maxUnidade.quantidade) throw new RuleError(`Seu apartamento já tem ${c.n} agendamento(s) neste ${s.maxUnidade.periodo === "mes" ? "mês" : s.maxUnidade.periodo}.`);
    }
    if (s.intervaloMin) {
      const gap = `${s.intervaloMin} minutes`;
      const [c] = await tx`select 1 from bookings where kind = 'quadra' and space_id = ${space.id} and unit_id = ${unitId}
        and status in ('solicitada', 'confirmada', 'em_uso')
        and period && tstzrange(${starts}::timestamptz - ${gap}::interval, ${ends}::timestamptz + ${gap}::interval, '[)') limit 1`;
      if (c) throw new RuleError(`Deixe pelo menos ${s.intervaloMin} minutos entre os agendamentos do seu apartamento.`);
    }

    const needsApproval = input.activity === "jogo" && visitors > VISITORS_FREE;
    const status = needsApproval || s.confirmacao !== "automatica" ? "solicitada" : "confirmada";
    let terms: { version: number } | null = null;
    if (visitors > 0) {
      const [t] = await tx`select version from terms_documents where kind = 'quadras' order by version desc limit 1`;
      terms = t as { version: number };
      await tx`insert into term_acceptances (user_id, unit_id, kind, version, context)
               values (${actor.id}, ${unitId}, 'quadras', ${terms.version}, ${tx.json({ quadra: COURTS[court].name, dia: day, inicio: start } as never)})`;
    }
    const [bk] = await tx`
      insert into bookings (space_id, unit_id, responsible_user_id, responsible_name, kind, status, period, blocked, origin, created_by, fee_status, local_day)
      values (${space.id}, ${unitId}, ${actor.id}, ${actor.label}, 'quadra', ${status},
              tstzrange(${starts}, ${ends}, '[)'), tstzrange(${starts}, ${ends}, '[)'), ${role.admin ? "admin" : "app"}, ${actor.id}, 'sem_cobranca', ${day})
      returning id, code`;
    await tx`insert into court_details (booking_id, modality, participants, visitors, activity, activity_note, approval, terms_version, terms_accepted_at, requested_by)
             values (${bk.id}, ${input.modality}, ${participants}, ${visitors}, ${input.activity}, ${input.activityNote?.trim() || null},
                     ${needsApproval ? "pendente" : "nao_requer"}, ${terms?.version ?? null}, ${terms ? new Date() : null}, ${actor.id})`;
    const [unit] = await tx`select code from units where id = ${unitId}`;
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "quadra.agendamento", entity: "booking", entityId: bk.code,
      data: { quadra: space.name, apartamento: unit.code, dia: day, inicio: start, fim: end, modalidade: input.modality,
              participantes: participants, visitantes: visitors, atividade: input.activity, situacao: needsApproval ? "pendente_aprovacao" : status } });

    const when = `${fmtDay(starts)}, ${start}–${end}`;
    const link = `/quadras/${court}`;
    if (needsApproval) {
      await notify(tx, [actor.id], { title: `${space.name}: pedido enviado para aprovação`, body: `${when}. Jogos com mais de 4 visitantes dependem de autorização da administração.`, link });
      await notifyAdmins(tx, { title: `${space.name}: aprovação pendente`, body: `Apto ${unit.code} · ${when} · ${visitors} visitantes`, link: "/admin/quadras" }, actor.id);
    } else if (status === "solicitada") {
      await notify(tx, [actor.id], { title: `${space.name}: agendamento solicitado`, body: `${when}. Você será avisado quando a administração confirmar.`, link });
      await notifyAdmins(tx, { title: `${space.name}: agendamento para confirmar`, body: `Apto ${unit.code} · ${when}`, link: "/admin/quadras" }, actor.id);
    } else {
      await notify(tx, [actor.id], { title: `${space.name}: agendamento confirmado`, body: when, link });
    }
    return { code: bk.code as string, status: needsApproval ? "pendente_aprovacao" : status };
  }, actor.id);
}

async function load(tx: Tx, id: string) {
  const [b] = await tx`
    select b.*, s.name as space_name, u.code as unit_code, d.approval, d.visitors, d.modality
    from bookings b join court_details d on d.booking_id = b.id join spaces s on s.id = b.space_id join units u on u.id = b.unit_id
    where b.id = ${id} and b.kind = 'quadra' for update of b`;
  if (!b) throw new RuleError("Agendamento não encontrado.");
  return b;
}
const whenOf = (_b: unknown, ini: Date, fim: Date) => `${fmtDay(ini)}, ${fmtHm(ini)}–${fmtHm(fim)}`;

export async function cancelCourt(actor: Actor, id: string, reason: string) {
  return asSystem(async (tx) => {
    const role = await roleOf(tx);
    const b = await load(tx, id);
    const [m] = await tx`select 1 from unit_memberships where user_id = ${actor.id} and unit_id = ${b.unit_id} and status = 'ativo'`;
    if (!m && !role.admin) throw new RuleError("Agendamento não encontrado.");
    if (!["solicitada", "confirmada"].includes(b.status)) throw new RuleError("Este agendamento não pode mais ser cancelado.");
    const [p] = await tx`select lower(period) as ini, upper(period) as fim from bookings where id = ${id}`;
    if (new Date(p.ini).getTime() <= Date.now()) throw new RuleError("O horário já começou.");
    if (reason.trim().length < 3) throw new RuleError("Informe o motivo do cancelamento.");
    if (!role.admin) {
      const s = await courtSettings(tx, b.space_name === COURTS.poli.name ? "poli" : "areia");
      if (s.cancelamentoH && new Date(p.ini).getTime() - Date.now() < s.cancelamentoH * 3600_000)
        throw new RuleError(`Cancelamentos com até ${s.cancelamentoH} h de antecedência. Fale com a administração.`);
    }
    const byAdmin = role.admin && !m;
    await tx`update bookings set status = 'cancelada', cancelled_at = now(),
             cancel_reason = ${(byAdmin ? "Cancelado pela administração: " : "Cancelado pelo morador: ") + reason.trim()} where id = ${id}`;
    await tx`update court_details set updated_at = now() where booking_id = ${id}`;
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "quadra.cancelamento", entity: "booking", entityId: b.code,
      data: { quadra: b.space_name, apartamento: b.unit_code, motivo: reason.trim(), pela_administracao: byAdmin } });
    await notify(tx, [b.responsible_user_id, actor.id], { title: `${b.space_name}: agendamento cancelado`,
      body: `${whenOf(b, p.ini, p.fim)}${byAdmin ? ` · Motivo: ${reason.trim()}` : ""}`, link: "/minhas-reservas" });
  }, actor.id);
}

/** Administração: confirma, aprova (25.3) ou rejeita, com justificativa. */
export async function decideCourt(actor: Actor, id: string, decision: "confirmar" | "rejeitar", note: string) {
  return asSystem(async (tx) => {
    if (!(await roleOf(tx)).admin) throw new RuleError("Somente a administração.");
    const b = await load(tx, id);
    if (b.status !== "solicitada") throw new RuleError("Este pedido já foi decidido.");
    if (decision === "rejeitar" && note.trim().length < 5) throw new RuleError("Registre a justificativa da rejeição.");
    const [p] = await tx`select lower(period) as ini, upper(period) as fim from bookings where id = ${id}`;
    const approval = b.approval === "pendente" ? (decision === "confirmar" ? "aprovada" : "rejeitada") : b.approval;
    await tx`update court_details set approval = ${approval}, decided_by = ${actor.id}, decided_at = now(), decision_note = ${note.trim() || null}, updated_at = now()
             where booking_id = ${id}`;
    await tx`update bookings set status = ${decision === "confirmar" ? "confirmada" : "recusada"},
             cancel_reason = ${decision === "rejeitar" ? "Rejeitado pela administração: " + note.trim() : null},
             cancelled_at = ${decision === "rejeitar" ? new Date() : null} where id = ${id}`;
    const action = b.approval === "pendente" ? (decision === "confirmar" ? "quadra.aprovacao" : "quadra.rejeicao") : (decision === "confirmar" ? "quadra.confirmacao" : "quadra.rejeicao");
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action, entity: "booking", entityId: b.code,
      data: { quadra: b.space_name, apartamento: b.unit_code, justificativa: note.trim() || null } });
    const title = decision === "rejeitar" ? `${b.space_name}: pedido não aprovado` : b.approval === "pendente" ? `${b.space_name}: jogo autorizado` : `${b.space_name}: agendamento confirmado`;
    await notify(tx, [b.responsible_user_id], { title, body: `${whenOf(b, p.ini, p.fim)}${note.trim() ? ` · ${note.trim()}` : ""}`, link: "/minhas-reservas" });
  }, actor.id);
}

/** Administração: altera o horário de um agendamento (morador é avisado). */
export async function rescheduleCourt(actor: Actor, id: string, day: string, start: string, end: string, note: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(start) || !/^\d{2}:\d{2}$/.test(end)) throw new RuleError("Informe dia e horário.");
  if (note.trim().length < 5) throw new RuleError("Registre o motivo da alteração.");
  return asSystem(async (tx) => {
    if (!(await roleOf(tx)).admin) throw new RuleError("Somente a administração.");
    const b = await load(tx, id);
    if (!["solicitada", "confirmada"].includes(b.status)) throw new RuleError("Este agendamento não pode ser alterado.");
    const [old] = await tx`select lower(period) as ini, upper(period) as fim from bookings where id = ${id}`;
    const ini = at(day, start), fim = at(day, end);
    await tx`update bookings set period = tstzrange(${ini}, ${fim}, '[)'), blocked = tstzrange(${ini}, ${fim}, '[)'), local_day = ${day} where id = ${id}`;
    await tx`update court_details set updated_at = now() where booking_id = ${id}`;
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "quadra.alteracao", entity: "booking", entityId: b.code,
      data: { quadra: b.space_name, apartamento: b.unit_code, de: whenOf(b, old.ini, old.fim), para: whenOf(b, ini, fim), motivo: note.trim() } });
    await notify(tx, [b.responsible_user_id], { title: `${b.space_name}: horário alterado`,
      body: `De ${whenOf(b, old.ini, old.fim)} para ${whenOf(b, ini, fim)} · ${note.trim()}`, link: "/minhas-reservas" });
  }, actor.id);
}

// ---------------------------------------------------------------------
// Programações (25.4) e bloqueios
// ---------------------------------------------------------------------
export type ScheduleInput = {
  court: CourtKey; kind: "programacao" | "bloqueio"; title: string; audience?: string;
  startDate: string; endDate?: string | null; weekdays?: number[] | null; startTime: string; endTime: string; cancelAffected?: boolean;
};

function occurrences(s: { start_date: string; end_date: string | null; weekdays: number[] | null }, from: string, to: string) {
  const out: string[] = [];
  const startD = s.start_date > from ? s.start_date : from;
  const endD = s.end_date ? (s.end_date < to ? s.end_date : to) : to;
  if (!s.weekdays || !s.weekdays.length) return s.start_date >= from && s.start_date <= to ? [s.start_date] : [];
  for (let d = new Date(`${startD}T12:00:00Z`); d <= new Date(`${endD}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = ((d.getUTCDay() + 6) % 7) + 1;
    if (s.weekdays.includes(iso)) out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export async function createSchedule(actor: Actor, input: ScheduleInput) {
  const title = input.title.trim();
  if (!isCourt(input.court)) throw new RuleError("Quadra inválida.");
  if (title.length < 3) throw new RuleError(input.kind === "bloqueio" ? "Informe o motivo do bloqueio." : "Dê um nome à programação.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.startDate)) throw new RuleError("Informe a data de início.");
  if (input.endDate && input.endDate < input.startDate) throw new RuleError("A data final é anterior à inicial.");
  const a = toMin(input.startTime), b = toMin(input.endTime);
  if (!(a >= toMin(OPEN) && b <= toMin(CLOSE) && b > a)) throw new RuleError("Use horários entre 08h00 e 22h00.");
  const weekdays = input.weekdays?.length ? [...new Set(input.weekdays)].filter((d) => d >= 1 && d <= 7).sort() : null;
  const endDate = weekdays ? (input.endDate || null) : input.startDate;

  return asSystem(async (tx) => {
    if (!(await roleOf(tx)).admin) throw new RuleError("Somente a administração.");
    const space = await spaceOf(tx, input.court);
    // agendamentos já existentes que seriam atingidos
    const horizon = endDate ?? localDay(new Date(Date.now() + 400 * 86400_000));
    const days = occurrences({ start_date: input.startDate, end_date: endDate, weekdays }, input.startDate, horizon);
    const affected = days.length ? await tx`
      select b.id, b.code, b.responsible_user_id, lower(b.period) as ini, upper(b.period) as fim, u.code as unit
      from bookings b join units u on u.id = b.unit_id
      where b.kind = 'quadra' and b.space_id = ${space.id} and b.status in ('solicitada', 'confirmada') and lower(b.period) > now()
        and b.local_day = any(${days}::date[])
        and (b.period && tstzrange((b.local_day + ${input.startTime}::time) at time zone 'America/Sao_Paulo',
                                   (b.local_day + ${input.endTime}::time) at time zone 'America/Sao_Paulo', '[)'))` : [];
    if (affected.length && !input.cancelAffected) {
      throw new RuleError(`Há ${affected.length} agendamento(s) de moradores nesse período. Marque “cancelar e avisar os moradores” para continuar.`);
    }
    for (const x of affected) {
      await tx`update bookings set status = 'cancelada', cancelled_at = now(),
               cancel_reason = ${`Cancelado pela administração: ${input.kind === "bloqueio" ? "bloqueio" : "programação"} — ${title}`} where id = ${x.id}`;
      await notify(tx, [x.responsible_user_id], { title: `${space.name}: agendamento cancelado`,
        body: `${fmtDay(x.ini)}, ${fmtHm(x.ini)}–${fmtHm(x.fim)} · ${input.kind === "bloqueio" ? "Bloqueio" : "Programação"} da administração: ${title}`, link: "/minhas-reservas" });
      await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "quadra.cancelamento", entity: "booking", entityId: x.code,
        data: { quadra: space.name, apartamento: x.unit, motivo: `${input.kind}: ${title}`, pela_administracao: true } });
    }
    const [row] = await tx`insert into court_schedules (space_id, kind, title, audience, start_date, end_date, weekdays, start_time, end_time, created_by)
      values (${space.id}, ${input.kind}, ${title}, ${input.audience?.trim() || null}, ${input.startDate}, ${endDate}, ${weekdays}, ${input.startTime}, ${input.endTime}, ${actor.id})
      returning id`;
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: input.kind === "bloqueio" ? "quadra.bloqueio" : "quadra.programacao", entity: "court_schedule", entityId: row.id,
      data: { quadra: space.name, titulo: title, publico: input.audience?.trim() || null, inicio: input.startDate, fim: endDate, dias_semana: weekdays,
              horario: `${input.startTime}–${input.endTime}`, agendamentos_cancelados: affected.map((x) => x.code) } });
    return { id: row.id as string, cancelled: affected.length };
  }, actor.id);
}

export async function cancelSchedule(actor: Actor, id: string, reason: string) {
  if (reason.trim().length < 3) throw new RuleError("Informe o motivo.");
  return asSystem(async (tx) => {
    if (!(await roleOf(tx)).admin) throw new RuleError("Somente a administração.");
    const [s] = await tx`update court_schedules set cancelled_at = now(), cancelled_by = ${actor.id}, cancel_reason = ${reason.trim()}
                         where id = ${id} and cancelled_at is null returning kind, title`;
    if (!s) throw new RuleError("Programação não encontrada.");
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "quadra.programacao_encerrada", entity: "court_schedule", entityId: id,
      data: { tipo: s.kind, titulo: s.title, motivo: reason.trim() } });
  }, actor.id);
}

// ---------------------------------------------------------------------
// Configuração (somente parâmetros operacionais; o Regimento não muda aqui)
// ---------------------------------------------------------------------
export type CourtConfig = {
  confirmacao: "" | "automatica" | "administracao"; duracao: string; antecedenciaMinH: string; antecedenciaMaxD: string;
  maxQtd: string; maxPeriodo: string; intervaloMin: string; consecutivosMin: string; prioridade: string; cancelamentoH: string;
  modalidades: string; source: string;
};

export async function setCourtConfig(actor: Actor, court: CourtKey, c: CourtConfig) {
  if (c.source.trim().length < 3) throw new RuleError("Informe a fonte da definição (ex.: decisão do síndico, ata).");
  const pos = (x: string, label: string) => { if (x.trim() === "") return null; const n = Number(x); if (!Number.isFinite(n) || n <= 0) throw new RuleError(`${label}: informe um número maior que zero.`); return Math.round(n); };
  const vals: Record<string, Record<string, unknown> | null> = {
    confirmacao: c.confirmacao ? { modo: c.confirmacao, texto: c.confirmacao === "automatica" ? "Automática" : "Pela administração" } : null,
    duracao: ((n) => n ? { minutos: n, texto: `${n} minutos` } : null)(pos(c.duracao, "Duração")),
    antecedencia_min: ((n) => n ? { horas: n, texto: `${n} h` } : null)(pos(c.antecedenciaMinH, "Antecedência mínima")),
    antecedencia_max: ((n) => n ? { dias: n, texto: `${n} dias` } : null)(pos(c.antecedenciaMaxD, "Antecedência máxima")),
    max_unidade: ((n) => n ? { quantidade: n, periodo: ["dia", "semana", "mes"].includes(c.maxPeriodo) ? c.maxPeriodo : "semana", texto: `${n} por ${c.maxPeriodo === "mes" ? "mês" : c.maxPeriodo || "semana"}` } : null)(pos(c.maxQtd, "Máximo por unidade")),
    intervalo: ((n) => n ? { minutos: n, texto: `${n} minutos` } : null)(pos(c.intervaloMin, "Intervalo")),
    consecutivos: ((n) => n ? { minutos: n, texto: `${n} minutos` } : null)(pos(c.consecutivosMin, "Tempo consecutivo")),
    prioridade: c.prioridade.trim() ? { texto: c.prioridade.trim() } : null,
    cancelamento: ((n) => n ? { horas: n, texto: `${n} h` } : null)(pos(c.cancelamentoH, "Prazo de cancelamento")),
  };
  const mods = c.modalidades.split(/[\n,;]+/).map((x) => x.trim()).filter(Boolean);
  if (!mods.length) throw new RuleError("Informe ao menos uma modalidade.");
  return asSystem(async (tx) => {
    if (!(await roleOf(tx)).admin) throw new RuleError("Somente a administração.");
    for (const [k, v] of Object.entries(vals)) {
      if (v) await tx`update parameters set status = 'definido', value = ${tx.json(v as never)}, source = ${c.source.trim()}, updated_by = ${actor.id}, updated_at = now() where key = ${`quadra.${court}.${k}`}`;
      else await tx`update parameters set status = 'pendente', value = null, source = null, updated_by = ${actor.id}, updated_at = now() where key = ${`quadra.${court}.${k}`}`;
    }
    await tx`update parameters set status = 'definido', value = ${tx.json({ lista: mods, texto: mods.join(", ") } as never)}, source = ${c.source.trim()}, updated_by = ${actor.id}, updated_at = now()
             where key = ${`quadra.${court}.modalidades`}`;
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "quadra.configuracao", entity: "parameter", entityId: `quadra.${court}`,
      data: { ...Object.fromEntries(Object.entries(vals).map(([k, v]) => [k, v ? (v.texto as string) : "pendente"])), modalidades: mods, fonte: c.source.trim() } });
  }, actor.id);
}

// ---------------------------------------------------------------------
// Calendário (sem dados pessoais de outras unidades)
// ---------------------------------------------------------------------
export type CalItem = {
  id: string; kind: "agendamento" | "programacao" | "bloqueio"; day: string; start: string; end: string;
  title: string; mine?: boolean; status?: string; approval?: string; code?: string; unit?: string; detail?: string;
};

export async function courtCalendar(userId: string, court: CourtKey, from: string, to: string) {
  return asUser(userId, async (tx) => {
    const [{ admin }] = await tx`select app.has_role('admin') as admin`;
    const [space] = await tx`select id, name from spaces where code = ${COURTS[court].code}`;
    const range = [at(from, "00:00"), at(to, "23:59")];
    const avail = await tx`select lower(a.period) as ini, upper(a.period) as fim from booking_availability a
                           where a.space_id = ${space.id} and a.period && tstzrange(${range[0]}, ${range[1]}, '[)')`;
    const visible = await tx`
      select b.id, b.code, b.status, lower(b.period) as ini, upper(b.period) as fim, u.code as unit, d.modality, d.participants, d.visitors, d.approval, b.responsible_name
      from bookings b join court_details d on d.booking_id = b.id join units u on u.id = b.unit_id
      where b.space_id = ${space.id} and b.status in ('solicitada', 'confirmada', 'em_uso') and b.period && tstzrange(${range[0]}, ${range[1]}, '[)')`;
    const own = new Set((await tx`select id from bookings where space_id = ${space.id} and unit_id in (select app.my_unit_ids())
                                   and period && tstzrange(${range[0]}, ${range[1]}, '[)')`).map((r) => r.id as string));
    const items: CalItem[] = [];
    const seen = new Set<string>();
    for (const v of visible) {
      seen.add(`${+v.ini}-${+v.fim}`);
      const isMine = own.has(v.id);
      const show = isMine || !!admin;
      items.push({ id: v.id, kind: "agendamento", day: localDay(v.ini), start: fmtHm(v.ini), end: fmtHm(v.fim),
        title: show ? v.modality : "Ocupado", mine: isMine, status: v.status, approval: v.approval, code: show ? v.code : undefined,
        unit: show ? v.unit : undefined, detail: admin ? `${v.participants} participantes · ${v.visitors} visitantes · ${v.responsible_name ?? ""}` : undefined });
    }
    for (const a of avail) if (!seen.has(`${+a.ini}-${+a.fim}`)) items.push({ id: `${+a.ini}`, kind: "agendamento", day: localDay(a.ini), start: fmtHm(a.ini), end: fmtHm(a.fim), title: "Ocupado" });
    const scheds = await tx`select id, kind, title, audience, to_char(start_date, 'YYYY-MM-DD') as start_date, to_char(end_date, 'YYYY-MM-DD') as end_date, weekdays,
                                   to_char(start_time, 'HH24:MI') as st, to_char(end_time, 'HH24:MI') as et
                            from court_schedules where space_id = ${space.id} and cancelled_at is null
                              and start_date <= ${to}::date and (end_date is null or end_date >= ${from}::date)`;
    for (const s of scheds) for (const d of occurrences(s as never, from, to))
      items.push({ id: `${s.id}-${d}`, kind: s.kind, day: d, start: s.st, end: s.et, title: s.title, detail: s.audience ?? undefined });
    items.sort((x, y) => (x.day + x.start).localeCompare(y.day + y.start));
    return { items, admin: !!admin };
  });
}

// ---------------------------------------------------------------------
// Relatório (por quadra e período)
// ---------------------------------------------------------------------
export async function courtReport(userId: string, court: CourtKey, from: string, to: string) {
  return asUser(userId, async (tx) => {
    const [space] = await tx`select id from spaces where code = ${COURTS[court].code}`;
    const base = tx`from bookings b join court_details d on d.booking_id = b.id join units u on u.id = b.unit_id
                    where b.space_id = ${space.id} and b.local_day between ${from}::date and ${to}::date`;
    const [tot] = await tx`select count(*)::int as total,
        count(*) filter (where b.status in ('confirmada', 'em_uso', 'concluida'))::int as confirmados,
        count(*) filter (where b.status = 'solicitada' and d.approval = 'pendente')::int as pendentes_aprovacao,
        count(*) filter (where b.status = 'solicitada' and d.approval <> 'pendente')::int as aguardando_confirmacao,
        count(*) filter (where b.status = 'cancelada')::int as cancelados,
        count(*) filter (where b.status = 'recusada')::int as rejeitados ${base}`;
    const porHora = await tx`select extract(hour from lower(b.period) at time zone 'America/Sao_Paulo')::int as hora, count(*)::int as n ${base}
                             and b.status in ('confirmada', 'em_uso', 'concluida') group by 1 order by 1`;
    const porModalidade = await tx`select d.modality as modalidade, count(*)::int as n ${base} and b.status in ('confirmada', 'em_uso', 'concluida') group by 1 order by 2 desc`;
    const porUnidade = await tx`select u.code as unidade, count(*) filter (where b.status in ('confirmada', 'em_uso', 'concluida'))::int as n,
                                       count(*) filter (where b.status = 'cancelada')::int as cancelados ${base} group by 1 order by 2 desc, 1`;
    const linhas = await tx`select b.code, to_char(b.local_day, 'DD/MM/YYYY') as dia, to_char(lower(b.period) at time zone 'America/Sao_Paulo', 'HH24:MI') as inicio,
                                   to_char(upper(b.period) at time zone 'America/Sao_Paulo', 'HH24:MI') as fim, u.code as unidade, b.responsible_name as responsavel,
                                   d.modality as modalidade, d.participants as participantes, d.visitors as visitantes, d.activity as atividade, b.status, d.approval as aprovacao,
                                   coalesce(d.decision_note, b.cancel_reason) as observacao ${base} order by b.local_day, lower(b.period)`;
    const bloqueios = await tx`select kind as tipo, title as titulo, audience as publico, to_char(start_date, 'DD/MM/YYYY') as inicio, to_char(end_date, 'DD/MM/YYYY') as fim,
                                      weekdays, to_char(start_time, 'HH24:MI') || '–' || to_char(end_time, 'HH24:MI') as horario,
                                      to_char(created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as criado_em, cancelled_at is not null as encerrado, cancel_reason
                               from court_schedules where space_id = ${space.id} order by created_at desc`;
    return { tot, porHora, porModalidade, porUnidade, linhas, bloqueios };
  });
}
