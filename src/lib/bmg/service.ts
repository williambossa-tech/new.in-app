import "server-only";
import { audit } from "../audit";
import { asSystem, asUser, type Tx } from "../db";
import { RuleError } from "../lottery/engine";
import { addDays, CHECKIN_HOUR, CHECKOUT_HOUR, CLEAN_HOURS, isValidCpf, onlyDigits, todayIso } from "./rules";

type Actor = { id: string; label: string };

const at = (dateIso: string, hour: number) => new Date(`${dateIso}T${String(hour).padStart(2, "0")}:00:00-03:00`);

export async function bmgSettings(tx: Tx) {
  const rows = await tx`select key, status, value from parameters where key in ('bmg.abertura', 'bmg.antecedencia')`;
  const ab = rows.find((r) => r.key === "bmg.abertura");
  const an = rows.find((r) => r.key === "bmg.antecedencia");
  return {
    open: ab?.status === "definido" && ab?.value?.ativo === true,
    advanceHours: an?.status === "definido" && typeof an?.value?.horas === "number" ? (an.value.horas as number) : null,
  };
}

/** Primeira data de entrada possível respeitando a antecedência (entrada às 18h). */
export function firstStartDate(advanceHours: number) {
  let d = todayIso();
  while (at(d, CHECKIN_HOUR).getTime() - Date.now() < advanceHours * 3600_000) d = addDays(d, 1);
  return d;
}

async function roleOf(tx: Tx) {
  const [r] = await tx`select app.has_role('admin') as admin, app.has_role('portaria') as portaria`;
  return { admin: !!r.admin, portaria: !!r.portaria };
}

export type GuestInput = { name: string; cpf: string; minor: boolean };

export async function requestBmg(actor: Actor, input: {
  spaceCode: string; unitId: string; startDate: string; endDate: string; guests: GuestInput[]; accepted: boolean;
}) {
  const { spaceCode, unitId, startDate, endDate, accepted } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) throw new RuleError("Escolha as datas de entrada e saída.");
  const nights = Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86400_000);
  if (nights < 1) throw new RuleError("A saída deve ser depois da entrada.");
  if (nights > 7) throw new RuleError("O período máximo é de 7 diárias.");
  const guests = input.guests.map((g) => ({ name: g.name.trim().replace(/\s+/g, " "), cpf: onlyDigits(g.cpf), minor: g.minor })).filter((g) => g.name || g.cpf);
  if (!guests.length) throw new RuleError("Informe pelo menos um hóspede.");
  if (guests.length > 2) throw new RuleError("O quarto recebe no máximo 2 hóspedes.");
  for (const g of guests) {
    if (g.name.split(" ").length < 2) throw new RuleError("Informe nome e sobrenome de cada hóspede.");
    if (!isValidCpf(g.cpf)) throw new RuleError(`CPF inválido para ${g.name.split(" ")[0]}.`);
  }
  if (new Set(guests.map((g) => g.cpf)).size !== guests.length) throw new RuleError("Os hóspedes precisam ter CPFs diferentes.");
  if (guests.every((g) => g.minor)) throw new RuleError("Menores de idade precisam estar acompanhados do responsável legal.");
  if (!accepted) throw new RuleError("Confirme o aceite do termo.");

  return asSystem(async (tx) => {
    const role = await roleOf(tx);
    const settings = await bmgSettings(tx);
    if (!role.admin) {
      if (!settings.open || settings.advanceHours === null) throw new RuleError("As reservas do Be My Guest ainda não estão abertas.");
      if (at(startDate, CHECKIN_HOUR).getTime() - Date.now() < settings.advanceHours * 3600_000)
        throw new RuleError(`As reservas precisam de ${settings.advanceHours} horas de antecedência.`);
    } else if (at(startDate, CHECKIN_HOUR).getTime() < Date.now()) {
      throw new RuleError("A data de entrada já passou.");
    }
    const [space] = await tx`select id, name from spaces where code = ${spaceCode} and kind = 'bmg_quarto' and active`;
    if (!space) throw new RuleError("Quarto indisponível.");
    const [unit] = await tx`select code from units where id = ${unitId}`;
    if (!unit) throw new RuleError("Apartamento não encontrado.");
    const [terms] = await tx`select max(version) as v from terms_documents where kind = 'bmg'`;
    const checkin = at(startDate, CHECKIN_HOUR);
    const checkout = at(endDate, CHECKOUT_HOUR);
    const cleanEnd = new Date(checkout.getTime() + CLEAN_HOURS * 3600_000);
    const [b] = await tx`
      insert into bookings (space_id, unit_id, responsible_user_id, responsible_name, kind, status, period, blocked, origin, created_by, fee_status)
      values (${space.id}, ${unitId}, ${actor.id}, ${actor.label}, 'bmg', 'solicitada',
              tstzrange(${checkin}, ${checkout}, '[)'), tstzrange(${checkin}, ${cleanEnd}, '[)'),
              ${role.admin ? "admin" : "app"}, ${actor.id}, 'pendente_definicao')
      returning id, code`;
    await tx`insert into bmg_details (booking_id, start_date, end_date, requested_by, terms_version, terms_accepted_at)
             values (${b.id}, ${startDate}, ${endDate}, ${actor.id}, ${terms.v}, now())`;
    for (const g of guests) {
      await tx`insert into bmg_guests (booking_id, full_name, cpf, is_minor) values (${b.id}, ${g.name}, ${g.cpf}, ${g.minor})`;
    }
    await tx`insert into bmg_operations (booking_id) values (${b.id})`;
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "bmg.solicitacao", entity: "booking", entityId: b.code,
      data: { quarto: space.name, apartamento: unit.code, entrada: startDate, saida: endDate, diarias: nights, hospedes: guests.length, termo_versao: terms.v } });
    return { id: b.id as string, code: b.code as string };
  }, actor.id);
}

async function loadForUpdate(tx: Tx, bookingId: string) {
  const [b] = await tx`
    select b.*, d.start_date, d.end_date, u.code as unit_code, s.name as space_name
    from bookings b join bmg_details d on d.booking_id = b.id join units u on u.id = b.unit_id join spaces s on s.id = b.space_id
    where b.id = ${bookingId} and b.kind = 'bmg' for update of b`;
  if (!b) throw new RuleError("Reserva não encontrada.");
  return b;
}

const log = (tx: Tx, actor: Actor, action: string, b: Record<string, unknown>, data: Record<string, unknown> = {}) =>
  audit(tx, { actorId: actor.id, actorLabel: actor.label, action, entity: "booking", entityId: String(b.code),
    data: { quarto: b.space_name, apartamento: b.unit_code, ...data } });

export async function cancelBmg(actor: Actor, bookingId: string, reason: string) {
  return asSystem(async (tx) => {
    const role = await roleOf(tx);
    const b = await loadForUpdate(tx, bookingId);
    if (!role.admin) {
      const [m] = await tx`select 1 from unit_memberships where user_id = ${actor.id} and unit_id = ${b.unit_id} and status = 'ativo'`;
      if (!m) throw new RuleError("Reserva não encontrada.");
      if (Date.now() >= at(new Date(b.start_date).toISOString().slice(0, 10), CHECKIN_HOUR).getTime())
        throw new RuleError("A reserva já começou. Fale com a administração.");
    } else if (reason.trim().length < 5) throw new RuleError("Informe o motivo do cancelamento.");
    if (!["solicitada", "confirmada"].includes(b.status)) throw new RuleError("Esta reserva não pode mais ser cancelada.");
    const why = role.admin ? reason.trim() : "Cancelada pelo morador";
    await tx`update bookings set status = 'cancelada', cancelled_at = now(), cancel_reason = ${why} where id = ${bookingId}`;
    await log(tx, actor, "bmg.cancelamento", b, { motivo: why });
  }, actor.id);
}

export async function decideBmg(actor: Actor, bookingId: string, decision: "confirmar" | "recusar", note: string) {
  return asSystem(async (tx) => {
    const role = await roleOf(tx);
    if (!role.admin) throw new RuleError("Somente a administração confirma reservas.");
    const b = await loadForUpdate(tx, bookingId);
    if (b.status !== "solicitada") throw new RuleError("Esta solicitação já foi decidida.");
    if (decision === "recusar" && note.trim().length < 5) throw new RuleError("Informe o motivo da recusa.");
    await tx`update bookings set status = ${decision === "confirmar" ? "confirmada" : "recusada"},
             cancel_reason = ${decision === "recusar" ? note.trim() : null}, cancelled_at = ${decision === "recusar" ? new Date() : null}
             where id = ${bookingId}`;
    await tx`update bmg_details set decided_by = ${actor.id}, decided_at = now(), decision_note = ${note.trim() || null} where booking_id = ${bookingId}`;
    await log(tx, actor, decision === "confirmar" ? "bmg.confirmacao" : "bmg.recusa", b, { observacao: note.trim() || null });
  }, actor.id);
}

export async function checkInBmg(actor: Actor, bookingId: string, input: { inspectionOk: boolean; inspectionNote: string; tagCode: string }) {
  return asSystem(async (tx) => {
    const role = await roleOf(tx);
    if (!role.admin && !role.portaria) throw new RuleError("Sem permissão.");
    const b = await loadForUpdate(tx, bookingId);
    if (b.status !== "confirmada") throw new RuleError("A entrada só pode ser registrada em reservas confirmadas.");
    if (!input.inspectionOk && input.inspectionNote.trim().length < 5) throw new RuleError("Descreva o que foi encontrado na vistoria.");
    await tx`update bookings set status = 'em_uso' where id = ${bookingId}`;
    await tx`update bmg_operations set inspection_ok = ${input.inspectionOk}, inspection_note = ${input.inspectionNote.trim() || null},
             inspected_by = ${actor.id}, tag_code = ${input.tagCode.trim() || null}, checked_in_at = now(), checked_in_by = ${actor.id}
             where booking_id = ${bookingId}`;
    await log(tx, actor, "bmg.entrada", b, { vistoria_ok: input.inspectionOk, vistoria: input.inspectionNote.trim() || null, tag: input.tagCode.trim() || null });
  }, actor.id);
}

export async function checkOutBmg(actor: Actor, bookingId: string, input: { tagReturned: "sem_tag" | "devolvida_ok" | "nao_devolvida" | "danificada"; note: string }) {
  return asSystem(async (tx) => {
    const role = await roleOf(tx);
    if (!role.admin && !role.portaria) throw new RuleError("Sem permissão.");
    const b = await loadForUpdate(tx, bookingId);
    if (b.status !== "em_uso") throw new RuleError("A saída só pode ser registrada após a entrada.");
    const occurrence = ["nao_devolvida", "danificada"].includes(input.tagReturned);
    if (occurrence && input.note.trim().length < 5) throw new RuleError("Descreva a ocorrência com a tag.");
    await tx`update bookings set status = 'concluida' where id = ${bookingId}`;
    await tx`update bmg_operations set checked_out_at = now(), checked_out_by = ${actor.id}, tag_returned = ${input.tagReturned},
             checkout_note = ${input.note.trim() || null},
             occurrence_status = ${occurrence ? "pendente_validacao" : "sem_ocorrencia"},
             occurrence_amount = ${occurrence ? 100 : null}
             where booking_id = ${bookingId}`;
    await log(tx, actor, "bmg.saida", b, { tag: input.tagReturned, observacao: input.note.trim() || null, ocorrencia: occurrence });
  }, actor.id);
}

export async function validateOccurrence(actor: Actor, bookingId: string, decision: "validada" | "descartada", note: string) {
  return asSystem(async (tx) => {
    const role = await roleOf(tx);
    if (!role.admin) throw new RuleError("Somente a administração valida ocorrências.");
    const b = await loadForUpdate(tx, bookingId);
    const [o] = await tx`select occurrence_status from bmg_operations where booking_id = ${bookingId}`;
    if (o?.occurrence_status !== "pendente_validacao") throw new RuleError("Não há ocorrência pendente.");
    if (note.trim().length < 5) throw new RuleError("Registre a justificativa da decisão.");
    await tx`update bmg_operations set occurrence_status = ${decision}, occurrence_validated_by = ${actor.id},
             occurrence_validated_at = now(), occurrence_note = ${note.trim()} where booking_id = ${bookingId}`;
    await log(tx, actor, "bmg.ocorrencia", b, { decisao: decision, valor: decision === "validada" ? 100 : null, justificativa: note.trim() });
  }, actor.id);
}

export async function markAbsence(actor: Actor, bookingId: string, note: string) {
  return asSystem(async (tx) => {
    const role = await roleOf(tx);
    if (!role.admin) throw new RuleError("Somente a administração registra ausência.");
    const b = await loadForUpdate(tx, bookingId);
    if (b.status !== "confirmada") throw new RuleError("Somente reservas confirmadas e sem entrada.");
    if (Date.now() < at(new Date(b.start_date).toISOString().slice(0, 10), CHECKIN_HOUR).getTime())
      throw new RuleError("A ausência só pode ser registrada depois do horário de entrada.");
    await tx`update bookings set status = 'ausencia', cancel_reason = ${note.trim() || "Hóspedes não compareceram"} where id = ${bookingId}`;
    await log(tx, actor, "bmg.ausencia", b, { observacao: note.trim() || null });
  }, actor.id);
}

/** Exceção de horário (27.22 §2º): mantém o intervalo de limpeza e não pode conflitar com outra reserva. */
export async function timeException(actor: Actor, bookingId: string, input: { checkin: string; checkout: string; reason: string; chargeNote: string }) {
  return asSystem(async (tx) => {
    const role = await roleOf(tx);
    if (!role.admin) throw new RuleError("Somente a administração autoriza exceções.");
    if (input.reason.trim().length < 10) throw new RuleError("Descreva o motivo da exceção.");
    const b = await loadForUpdate(tx, bookingId);
    if (!["solicitada", "confirmada", "em_uso"].includes(b.status)) throw new RuleError("Reserva encerrada.");
    const ci = new Date(`${input.checkin}:00-03:00`);
    const co = new Date(`${input.checkout}:00-03:00`);
    if (!(co > ci)) throw new RuleError("A saída deve ser depois da entrada.");
    const [prev] = await tx`select period::text as p from bookings where id = ${bookingId}`;
    const cleanEnd = new Date(co.getTime() + CLEAN_HOURS * 3600_000);
    await tx`update bookings set period = tstzrange(${ci}, ${co}, '[)'), blocked = tstzrange(${ci}, ${cleanEnd}, '[)') where id = ${bookingId}`;
    await tx`insert into bmg_exceptions (booking_id, previous_period, new_period, reason, charge_note, authorized_by)
             values (${bookingId}, ${prev.p}::tstzrange, tstzrange(${ci}, ${co}, '[)'), ${input.reason.trim()}, ${input.chargeNote.trim() || null}, ${actor.id})`;
    await log(tx, actor, "bmg.excecao_horario", b, { entrada: input.checkin, saida: input.checkout, motivo: input.reason.trim(), cobranca: input.chargeNote.trim() || null });
  }, actor.id);
}

export async function setBmgSettings(actor: Actor, input: { advanceHours: number | null; open: boolean; source: string }) {
  return asSystem(async (tx) => {
    const role = await roleOf(tx);
    if (!role.admin) throw new RuleError("Somente a administração.");
    if (input.source.trim().length < 5) throw new RuleError("Informe a fonte da definição.");
    if (input.advanceHours !== null) {
      if (!Number.isInteger(input.advanceHours) || input.advanceHours < 0 || input.advanceHours > 24 * 60) throw new RuleError("Antecedência inválida.");
      await tx`update parameters set status = 'definido', value = ${tx.json({ horas: input.advanceHours, texto: `${input.advanceHours} horas antes da entrada` } as never)},
               source = ${input.source.trim()}, updated_by = ${actor.id}, updated_at = now() where key = 'bmg.antecedencia'`;
    }
    const s = await bmgSettings(tx);
    if (input.open && s.advanceHours === null) throw new RuleError("Defina a antecedência mínima antes de abrir as reservas.");
    await tx`update parameters set status = 'definido', value = ${tx.json({ ativo: input.open, texto: input.open ? "Abertas" : "Fechadas" } as never)},
             source = ${input.source.trim()}, updated_by = ${actor.id}, updated_at = now() where key = 'bmg.abertura'`;
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "bmg.configuracao", entity: "parameter", entityId: "bmg",
      data: { antecedencia_horas: input.advanceHours ?? s.advanceHours, abertas: input.open, fonte: input.source.trim() } });
  }, actor.id);
}

// ---------------------------------------------------------------------------
// Leitura
// ---------------------------------------------------------------------------
/** Noites indisponíveis por quarto (sem dados pessoais), entre duas datas. */
export async function bmgAvailability(userId: string, from: string, to: string) {
  return asUser(userId, async (tx) => {
    const rooms = await tx`select id, code, name from spaces where kind = 'bmg_quarto' and active order by sort_order`;
    const busy = await tx`
      select a.space_id, lower(a.blocked) as lo, upper(a.blocked) as hi from booking_availability a join spaces s on s.id = a.space_id
      where s.kind = 'bmg_quarto' and a.blocked && tstzrange(${at(from, 0)}, ${at(addDays(to, 1), 23)}, '[)')
      union all
      select b.space_id, lower(b.period), upper(b.period) from space_blocks b join spaces s on s.id = b.space_id
      where s.kind = 'bmg_quarto' and b.period && tstzrange(${at(from, 0)}, ${at(addDays(to, 1), 23)}, '[)')`;
    const out: Record<string, string[]> = {};
    for (const r of rooms) {
      const ranges = busy.filter((x) => x.space_id === r.id).map((x) => ({ lo: +x.lo, hi: +x.hi }));
      const nights: string[] = [];
      for (let d = from; d <= to; d = addDays(d, 1)) {
        const n0 = at(d, CHECKIN_HOUR).getTime();
        const n1 = at(addDays(d, 1), CHECKIN_HOUR).getTime(); // uma diária bloqueia até as 18h do dia seguinte (12h + 6h de limpeza)
        if (ranges.some((rg) => overlaps(rg, n0, n1))) nights.push(d);
      }
      out[r.code] = nights;
    }
    return { rooms: rooms.map((r) => ({ code: r.code as string, name: r.name as string })), busy: out };
  });
}

function overlaps(rg: { lo: number; hi: number }, a: number, b: number) {
  return rg.lo < b && rg.hi > a;
}
