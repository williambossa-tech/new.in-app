import "server-only";
import { audit } from "../audit";
import { isValidCpf, onlyDigits } from "../bmg/rules";
import { asSystem, asUser, type Tx } from "../db";
import { RuleError } from "../lottery/engine";

type Actor = { id: string; label: string };
export type CwGuest = { name: string; cpf: string };

export const SLOT_MIN = 30;
export const MAX_MIN = 120;
export const EXT_MIN = 60;

export class LimitError extends RuleError {
  constructor(message: string, public limit: "dias" | "convidados") { super(message); }
}

const at = (day: string, hhmm: string) => new Date(`${day}T${hhmm}:00-03:00`);

export async function cwSettings(tx: Tx) {
  const rows = await tx`select key, status, value from parameters where key in ('cw.abertura', 'cw.antecedencia')`;
  const ab = rows.find((r) => r.key === "cw.abertura");
  const an = rows.find((r) => r.key === "cw.antecedencia");
  return {
    open: ab?.status === "definido" && ab?.value?.ativo === true,
    advanceMin: an?.status === "definido" && typeof an?.value?.minutos === "number" ? (an.value.minutos as number) : null,
  };
}

async function roleOf(tx: Tx) {
  const [r] = await tx`select app.has_role('admin') as admin, app.has_role('portaria') as portaria`;
  return { admin: !!r.admin, portaria: !!r.portaria };
}

export async function weekUsage(tx: Tx, unitId: string, day: string) {
  const [u] = await tx`select * from app.cw_week_usage(${unitId}, ${day}::date, null)`;
  const guests = await tx`
    select distinct g.cpf from cw_guests g join bookings b on b.id = g.booking_id
    where b.kind = 'coworking' and b.unit_id = ${unitId} and b.status in ('confirmada', 'em_uso', 'concluida')
      and b.local_day >= date_trunc('week', ${day}::date)::date and b.local_day < date_trunc('week', ${day}::date)::date + 7`;
  const days = await tx`
    select distinct b.local_day from bookings b join cw_details d on d.booking_id = b.id
    where b.kind = 'coworking' and b.unit_id = ${unitId} and d.purpose = 'atendimento' and b.status in ('confirmada', 'em_uso', 'concluida')
      and b.local_day >= date_trunc('week', ${day}::date)::date and b.local_day < date_trunc('week', ${day}::date)::date + 7`;
  return { atendDays: u.atend_days as number, distinctGuests: u.distinct_guests as number,
    guestCpfs: guests.map((g) => g.cpf as string), atendDayList: days.map((d) => new Date(d.local_day).toISOString().slice(0, 10)) };
}

export async function requestCw(actor: Actor, input: {
  spaceCode: string; unitId: string; day: string; start: string; minutes: number; purpose: "uso_pessoal" | "atendimento";
  guests: CwGuest[]; exceptionReason?: string;
}) {
  const { spaceCode, unitId, day, start, minutes, purpose } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{2}:\d{2}$/.test(start)) throw new RuleError("Escolha o dia e o horário.");
  if (!Number.isInteger(minutes) || minutes < SLOT_MIN || minutes > MAX_MIN || minutes % SLOT_MIN) throw new RuleError("Escolha uma duração de 30 minutos a 2 horas.");
  const guests = input.guests.map((g) => ({ name: g.name.trim().replace(/\s+/g, " "), cpf: onlyDigits(g.cpf) })).filter((g) => g.name || g.cpf);
  if (purpose === "atendimento" && !guests.length) throw new RuleError("Informe os convidados do atendimento.");
  if (purpose === "uso_pessoal" && guests.length) throw new RuleError("Para receber convidados, escolha “Atendimento”.");
  for (const g of guests) {
    if (g.name.split(" ").length < 2) throw new RuleError("Informe nome e sobrenome de cada convidado.");
    if (!isValidCpf(g.cpf)) throw new RuleError(`CPF inválido para ${g.name.split(" ")[0]}.`);
  }
  if (new Set(guests.map((g) => g.cpf)).size !== guests.length) throw new RuleError("Há CPFs repetidos entre os convidados.");
  const starts = at(day, start);
  const ends = new Date(starts.getTime() + minutes * 60_000);

  return asSystem(async (tx) => {
    const role = await roleOf(tx);
    const s = await cwSettings(tx);
    if (!role.admin && !s.open) throw new RuleError("As reservas do coworking ainda não estão abertas.");
    if (starts.getTime() - Date.now() < (s.advanceMin ?? 0) * 60_000) throw new RuleError(`Reserve com pelo menos ${s.advanceMin ?? 0} minutos de antecedência.`);
    const [m] = await tx`select 1 from unit_memberships m join users u on u.id = m.user_id
                         where m.user_id = ${actor.id} and m.unit_id = ${unitId} and m.status = 'ativo' and u.status = 'ativo'`;
    if (!m && !role.admin) throw new RuleError("Apartamento não vinculado ao seu cadastro.");
    const [space] = await tx`select id, name, capacity from spaces where code = ${spaceCode} and kind in ('cowork_reunioes', 'cowork_mini') and active`;
    if (!space) throw new RuleError("Sala indisponível.");
    if (space.capacity && guests.length + 1 > space.capacity) throw new RuleError(`${space.name}: até ${space.capacity - 1} ${space.capacity - 1 === 1 ? "convidado" : "convidados"}.`);

    // Limites semanais (23.14) por unidade, semana de segunda a domingo
    const u = await weekUsage(tx, unitId, day);
    let limit: "dias" | "convidados" | null = null;
    if (purpose === "atendimento") {
      const days = new Set(u.atendDayList); days.add(day);
      const cpfs = new Set(u.guestCpfs); guests.forEach((g) => cpfs.add(g.cpf));
      if (days.size > 3) limit = "dias";
      else if (cpfs.size > 10) limit = "convidados";
    }
    const exception = !!limit;
    if (limit && !(input.exceptionReason && input.exceptionReason.trim().length >= 10)) {
      throw new LimitError(limit === "dias"
        ? "Seu apartamento já usou os 3 dias de atendimento desta semana."
        : "Seu apartamento atingiria mais de 10 convidados diferentes nesta semana.", limit);
    }
    const [b] = await tx`
      insert into bookings (space_id, unit_id, responsible_user_id, responsible_name, kind, status, period, blocked, origin, created_by, fee_status, local_day)
      values (${space.id}, ${unitId}, ${actor.id}, ${actor.label}, 'coworking', ${exception ? "solicitada" : "confirmada"},
              tstzrange(${starts}, ${ends}, '[)'), tstzrange(${starts}, ${ends}, '[)'), ${role.admin ? "admin" : "app"}, ${actor.id}, 'sem_cobranca', ${day})
      returning id, code`;
    await tx`insert into cw_details (booking_id, purpose, requested_by, exception_status, exception_reason, exception_limit)
             values (${b.id}, ${purpose}, ${actor.id}, ${exception ? "pendente" : null}, ${exception ? input.exceptionReason!.trim() : null}, ${limit})`;
    for (const g of guests) await tx`insert into cw_guests (booking_id, full_name, cpf) values (${b.id}, ${g.name}, ${g.cpf})`;
    const [unit] = await tx`select code from units where id = ${unitId}`;
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: exception ? "cw.excecao_pedido" : "cw.reserva", entity: "booking", entityId: b.code,
      data: { sala: space.name, apartamento: unit.code, dia: day, inicio: start, minutos: minutes, finalidade: purpose, convidados: guests.length,
              limite: limit, motivo_excecao: exception ? input.exceptionReason!.trim() : null } });
    return { code: b.code as string, pending: exception };
  }, actor.id);
}

async function load(tx: Tx, id: string) {
  const [b] = await tx`
    select b.*, s.name as space_name, u.code as unit_code, d.extended, d.exception_status, d.purpose
    from bookings b join cw_details d on d.booking_id = b.id join spaces s on s.id = b.space_id join units u on u.id = b.unit_id
    where b.id = ${id} and b.kind = 'coworking' for update of b`;
  if (!b) throw new RuleError("Reserva não encontrada.");
  return b;
}

export async function cancelCw(actor: Actor, id: string, reason: string) {
  return asSystem(async (tx) => {
    const role = await roleOf(tx);
    const b = await load(tx, id);
    const [m] = await tx`select 1 from unit_memberships where user_id = ${actor.id} and unit_id = ${b.unit_id} and status = 'ativo'`;
    if (!m && !role.admin) throw new RuleError("Reserva não encontrada.");
    if (!["solicitada", "confirmada"].includes(b.status)) throw new RuleError("Esta reserva não pode mais ser cancelada.");
    if (reason.trim().length < 5) throw new RuleError("Informe o motivo do cancelamento.");
    await tx`update bookings set status = 'cancelada', cancelled_at = now(), cancel_reason = ${(m ? "Cancelada pelo morador: " : "Cancelada pela administração: ") + reason.trim()} where id = ${id}`;
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "cw.cancelamento", entity: "booking", entityId: b.code,
      data: { sala: b.space_name, apartamento: b.unit_code, motivo: reason.trim() } });
  }, actor.id);
}

/** Prorroga 1 vez por 1 hora, se não houver reserva seguinte. */
export async function extendCw(actor: Actor, id: string) {
  return asSystem(async (tx) => {
    const role = await roleOf(tx);
    const b = await load(tx, id);
    const [m] = await tx`select 1 from unit_memberships where user_id = ${actor.id} and unit_id = ${b.unit_id} and status = 'ativo'`;
    if (!m && !role.admin) throw new RuleError("Reserva não encontrada.");
    if (!["confirmada", "em_uso"].includes(b.status)) throw new RuleError("Somente reservas confirmadas podem ser prorrogadas.");
    if (b.extended) throw new RuleError("Esta reserva já foi prorrogada uma vez.");
    const [r] = await tx`select upper(period) as fim from bookings where id = ${id}`;
    if (new Date(r.fim).getTime() <= Date.now()) throw new RuleError("A reserva já terminou.");
    await tx`update cw_details set extended = true where booking_id = ${id}`;
    await tx`update bookings set period = tstzrange(lower(period), upper(period) + interval '1 hour', '[)'),
             blocked = tstzrange(lower(blocked), upper(blocked) + interval '1 hour', '[)') where id = ${id}`;
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "cw.prorrogacao", entity: "booking", entityId: b.code,
      data: { sala: b.space_name, apartamento: b.unit_code, nova_saida: new Date(new Date(r.fim).getTime() + 3600_000).toISOString() } });
  }, actor.id);
}

export async function decideCwException(actor: Actor, id: string, decision: "aprovada" | "recusada", note: string) {
  return asSystem(async (tx) => {
    const role = await roleOf(tx);
    if (!role.admin) throw new RuleError("Somente a administração decide exceções.");
    const b = await load(tx, id);
    if (b.exception_status !== "pendente" || b.status !== "solicitada") throw new RuleError("Este pedido já foi decidido.");
    if (note.trim().length < 5) throw new RuleError("Registre a justificativa da decisão.");
    await tx`update cw_details set exception_status = ${decision}, exception_decided_by = ${actor.id}, exception_decided_at = now(), exception_note = ${note.trim()} where booking_id = ${id}`;
    await tx`update bookings set status = ${decision === "aprovada" ? "confirmada" : "recusada"},
             cancel_reason = ${decision === "recusada" ? "Exceção não aprovada: " + note.trim() : null},
             cancelled_at = ${decision === "recusada" ? new Date() : null} where id = ${id}`;
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "cw.excecao_decisao", entity: "booking", entityId: b.code,
      data: { decisao: decision, justificativa: note.trim(), apartamento: b.unit_code } });
  }, actor.id);
}

export async function setCwSettings(actor: Actor, input: { open: boolean; advanceMin: number | null; source: string }) {
  return asSystem(async (tx) => {
    const role = await roleOf(tx);
    if (!role.admin) throw new RuleError("Somente a administração.");
    if (input.source.trim().length < 5) throw new RuleError("Informe a fonte da definição.");
    if (input.advanceMin !== null) {
      await tx`update parameters set status = 'definido', value = ${tx.json({ minutos: input.advanceMin, texto: `${input.advanceMin} minutos` } as never)},
               source = ${input.source.trim()}, updated_by = ${actor.id}, updated_at = now() where key = 'cw.antecedencia'`;
    }
    await tx`update parameters set status = 'definido', value = ${tx.json({ ativo: input.open, texto: input.open ? "Abertas" : "Fechadas" } as never)},
             source = ${input.source.trim()}, updated_by = ${actor.id}, updated_at = now() where key = 'cw.abertura'`;
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "cw.configuracao", entity: "parameter", entityId: "coworking",
      data: { abertas: input.open, antecedencia_min: input.advanceMin, fonte: input.source.trim() } });
  }, actor.id);
}

/** Ocupação por sala (sem dados pessoais) entre dois dias, em faixas de 30 min. */
export async function cwAvailability(userId: string, fromDay: string, toDay: string) {
  return asUser(userId, async (tx) => {
    const rooms = await tx`select id, code, name, capacity from spaces where kind in ('cowork_reunioes', 'cowork_mini') and active order by sort_order`;
    const busy = await tx`
      select a.space_id, lower(a.blocked) as lo, upper(a.blocked) as hi from booking_availability a join spaces s on s.id = a.space_id
      where s.kind in ('cowork_reunioes', 'cowork_mini') and a.blocked && tstzrange(${at(fromDay, "00:00")}, ${at(toDay, "23:59")}, '[)')
      union all
      select b.space_id, lower(b.period), upper(b.period) from space_blocks b join spaces s on s.id = b.space_id
      where s.kind in ('cowork_reunioes', 'cowork_mini') and b.period && tstzrange(${at(fromDay, "00:00")}, ${at(toDay, "23:59")}, '[)')`;
    return {
      rooms: rooms.map((r) => ({ code: r.code as string, name: r.name as string, capacity: r.capacity as number })),
      busy: Object.fromEntries(rooms.map((r) => [r.code, busy.filter((x) => x.space_id === r.id).map((x) => [+x.lo, +x.hi] as [number, number])])),
    };
  });
}
