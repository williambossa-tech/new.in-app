import { beforeAll, describe, expect, it } from "vitest";
import { addDays, todayIso } from "@/lib/bmg/rules";
import { asUser, db } from "@/lib/db";
import * as pool from "@/lib/piscina/service";
import * as q from "@/lib/quadras/service";
import { mkUser } from "./helpers";

let admin: string; const u: Record<string, string> = {};
const unitId = async (c: string) => (await db()`select id from units where code = ${c}`)[0].id as string;
const me = (k: string) => ({ id: u[k], label: `Morador ${k}` });
const adm = () => ({ id: admin, label: "Síndico" });
const monday = (() => { let d = addDays(todayIso(), 14); while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 1) d = addDays(d, 1); return d; })();
const day = (n: number) => addDays(monday, n);
const base = async (k: string, unit: string, over: Partial<q.CourtRequest> = {}): Promise<q.CourtRequest> => ({
  court: "areia", unitId: await unitId(unit), day: day(0), start: "09:00", end: "10:00", modality: "Beach Tennis",
  participants: 4, visitors: 0, activity: "recreativo", acceptTerms: false, ...over });
const status = async (code: string) => (await db()`select b.status, d.approval from bookings b join court_details d on d.booking_id = b.id where b.code = ${code}`)[0];
const notices = async (userId: string) => (await db()`select title from notifications where user_id = ${userId} order by created_at`).map((r) => r.title as string);

beforeAll(async () => {
  admin = await mkUser({ roles: ["admin"] });
  u.a = await mkUser({ unit: "801" }); u.b = await mkUser({ unit: "802" }); u.c = await mkUser({ unit: "803" });
});

describe("Quadras", () => {
  it("horário do Regimento (08h às 22h) e sem sobreposição", async () => {
    await expect(q.requestCourt(me("a"), await base("a", "801", { start: "07:30", end: "08:30" }))).rejects.toThrow(/08h00 às 22h00/);
    await expect(q.requestCourt(me("a"), await base("a", "801", { start: "21:30", end: "22:30" }))).rejects.toThrow(/08h00 às 22h00/);
    const r = await q.requestCourt(me("a"), await base("a", "801"));
    // configuração pendente: a administração confirma
    expect(r.status).toBe("solicitada");
    await expect(q.requestCourt(me("b"), await base("b", "802", { start: "09:30", end: "10:30" }))).rejects.toMatchObject({ code: "23P01" });
    // a outra quadra é independente
    const p = await q.requestCourt(me("b"), await base("b", "802", { court: "poli", modality: "Futsal", start: "09:30", end: "10:30" }));
    expect(p.code).toBeTruthy();
    expect(await notices(u.a)).toContain("Quadra de Areia: agendamento solicitado");
  });

  it("confirmação automática quando a administração define", async () => {
    await q.setCourtConfig(adm(), "areia", { confirmacao: "automatica", duracao: "", antecedenciaMinH: "", antecedenciaMaxD: "", maxQtd: "2", maxPeriodo: "semana",
      intervaloMin: "", consecutivosMin: "120", prioridade: "", cancelamentoH: "", modalidades: "Beach Tennis, Vôlei de Areia, Futevôlei, Outras modalidades", source: "Decisão do síndico" });
    const r = await q.requestCourt(me("c"), await base("c", "803", { start: "11:00", end: "12:00" }));
    expect(r.status).toBe("confirmada");
    await expect(q.requestCourt(me("c"), await base("c", "803", { day: day(1), start: "11:00", end: "13:30" }))).rejects.toThrow(/até 120 minutos/);
    await q.requestCourt(me("c"), await base("c", "803", { day: day(2), start: "11:00", end: "12:00" }));
    await expect(q.requestCourt(me("c"), await base("c", "803", { day: day(3), start: "11:00", end: "12:00" }))).rejects.toThrow(/já tem 2 agendamento/);
  });

  it("jogo com mais de 4 visitantes vai para aprovação (item 25.3)", async () => {
    await expect(q.requestCourt(me("b"), await base("b", "802", { day: day(4), start: "15:00", end: "16:00", participants: 10, visitors: 6, activity: "jogo" })))
      .rejects.toThrow(/acompanhar/);
    const r = await q.requestCourt(me("b"), await base("b", "802", { day: day(4), start: "15:00", end: "16:00", participants: 10, visitors: 6, activity: "jogo", acceptTerms: true }));
    expect(r.status).toBe("pendente_aprovacao");
    expect((await status(r.code)).approval).toBe("pendente");
    const [acc] = await db()`select kind, version from term_acceptances where user_id = ${u.b} order by accepted_at desc limit 1`;
    expect(acc).toMatchObject({ kind: "quadras", version: 1 });
    // recreativo com 4 visitantes não precisa de aprovação
    const ok = await q.requestCourt(me("b"), await base("b", "802", { day: day(4), start: "17:00", end: "18:00", participants: 6, visitors: 4, acceptTerms: true }));
    expect(ok.status).toBe("confirmada");
    const [b] = await db()`select id from bookings where code = ${r.code}`;
    await expect(q.decideCourt(adm(), b.id, "rejeitar", "")).rejects.toThrow(/justificativa/);
    await q.decideCourt(adm(), b.id, "confirmar", "Jogo autorizado; manter o volume baixo.");
    expect(await status(r.code)).toMatchObject({ status: "confirmada", approval: "aprovada" });
    expect(await notices(u.b)).toContain("Quadra de Areia: jogo autorizado");
  });

  it("programação recorrente bloqueia e cancela agendamentos afetados só com confirmação", async () => {
    const r = await q.requestCourt(me("a"), await base("a", "801", { day: day(5), start: "09:00", end: "10:00" }));
    const sched = { court: "areia" as const, kind: "programacao" as const, title: "Beach tennis infantil", audience: "Crianças", startDate: day(0), endDate: day(13),
      weekdays: [6], startTime: "08:00", endTime: "10:00" };
    await expect(q.createSchedule(adm(), sched)).rejects.toThrow(/agendamento\(s\) de moradores/);
    const s = await q.createSchedule(adm(), { ...sched, cancelAffected: true });
    expect(s.cancelled).toBe(1);
    expect((await status(r.code)).status).toBe("cancelada");
    expect(await notices(u.a)).toContain("Quadra de Areia: agendamento cancelado");
    await expect(q.requestCourt(me("a"), await base("a", "801", { day: day(12), start: "09:00", end: "10:00" }))).rejects.toThrow(/programação da administração/);
    const cal = await q.courtCalendar(u.c, "areia", day(5), day(12));
    expect(cal.items.filter((i) => i.kind === "programacao").map((i) => i.day)).toEqual([day(5), day(12)]);
    // outra unidade vê só “Ocupado”, sem dados pessoais
    const calB = await q.courtCalendar(u.b, "areia", day(0), day(0));
    expect(calB.items.find((i) => i.start === "09:00")?.title).toBe("Ocupado");
    expect(calB.items.find((i) => i.start === "09:00")?.unit).toBeUndefined();
  });

  it("cancelamento pelo morador e restrição entre unidades", async () => {
    const r = await q.requestCourt(me("c"), await base("c", "803", { court: "poli", modality: "Basquete", day: day(1), start: "19:00", end: "20:00" }));
    const [b] = await db()`select id from bookings where code = ${r.code}`;
    await expect(q.cancelCourt(me("a"), b.id, "teste")).rejects.toThrow(/não encontrado/);
    await q.cancelCourt(me("c"), b.id, "Mudança de planos");
    expect((await status(r.code)).status).toBe("cancelada");
    const rows = await asUser(u.a, (tx) => tx`select booking_id from court_details where booking_id = ${b.id}`);
    expect(rows).toHaveLength(0);
  });
});

describe("Piscina — convidados", () => {
  const d1 = day(2);
  it("cadastra com aceite do termo e não limita por padrão", async () => {
    const unit = await unitId("801");
    await expect(pool.savePoolGuests(me("a"), { unitId: unit, date: d1, guests: [{ name: "Ana Souza", minor: false }], accept: false })).rejects.toThrow(/declaração/);
    const r = await pool.savePoolGuests(me("a"), { unitId: unit, date: d1, accept: true,
      guests: [{ name: "Ana Souza", minor: false }, { name: "Bruno Lima", minor: true }, { name: "Carla Dias", minor: false }] });
    expect(r.created).toBe(3); // cadastro não é presença: sem bloqueio por “ocupação”
    const [acc] = await db()`select a.kind, a.version, a.unit_id from pool_guests g join term_acceptances a on a.id = g.acceptance_id where g.full_name = 'Ana Souza'`;
    expect(acc).toMatchObject({ kind: "piscina", version: 1, unit_id: unit });
    expect(await notices(u.a)).toContain("Piscina: convidados cadastrados");
    // documento não é guardado quando a administração não solicita
    await pool.savePoolGuests(me("a"), { unitId: unit, date: day(3), accept: true, guests: [{ name: "Davi Rocha", document: "12345678", minor: false }] });
    const [g] = await db()`select document from pool_guests where full_name = 'Davi Rocha'`;
    expect(g.document).toBeNull();
  });

  it("limite diário opcional, edição, cancelamento e privacidade", async () => {
    const unit = await unitId("802");
    await pool.setPoolConfig(adm(), { limiteAtivo: true, limiteQtd: 2, documento: "opcional", retencaoDias: null, source: "Decisão do síndico" });
    await pool.savePoolGuests(me("b"), { unitId: unit, date: d1, accept: true, guests: [{ name: "Eva Prado", minor: false }, { name: "Fábio Reis", document: "RG 1234", minor: false }] });
    await expect(pool.savePoolGuests(me("b"), { unitId: unit, date: d1, accept: true, guests: [{ name: "Gil Costa", minor: false }] })).rejects.toThrow(/até 2 convidados por dia/);
    const mine = await pool.myPoolGuests(u.b);
    expect(mine.map((x) => x.full_name).sort()).toEqual(["Eva Prado", "Fábio Reis"]);
    expect(await pool.myPoolGuests(u.c)).toHaveLength(0);
    const eva = mine.find((x) => x.full_name === "Eva Prado")!;
    await pool.savePoolGuests(me("b"), { unitId: unit, date: d1, accept: true, guests: [{ id: eva.id, name: "Eva Prado Lima", minor: false }] });
    await expect(pool.cancelPoolGuest(me("c"), eva.id, "")).rejects.toThrow(/não encontrado/);
    await expect(pool.cancelPoolGuest(adm(), eva.id, "")).rejects.toThrow(/justificativa/);
    await pool.cancelPoolGuest(me("b"), eva.id, "");
    const [x] = await db()`select status, full_name, cancel_reason from pool_guests where id = ${eva.id}`;
    expect(x).toMatchObject({ status: "cancelado", full_name: "Eva Prado Lima", cancel_reason: "Cancelado pelo morador" });
    const hist = await db()`select action from audit_log where entity = 'pool_guest' and entity_id = ${eva.id} order by id`;
    expect(hist.map((h) => h.action)).toEqual(["piscina.cadastro", "piscina.edicao", "piscina.cancelamento"]);
    await pool.setPoolConfig(adm(), { limiteAtivo: false, limiteQtd: 2, documento: "nao_solicitar", retencaoDias: null, source: "Decisão do síndico" });
  });

  it("administração corrige e lista com filtros", async () => {
    const list = await pool.poolAdminList(admin, { q: "fabio" });
    expect(list).toHaveLength(1);
    await pool.correctPoolGuest(adm(), list[0].id, { name: "Fábio Reis Neto", document: "", minor: false, reason: "Nome completo informado pelo morador" });
    const rep = await pool.poolReport(admin, day(0), day(13));
    expect(rep.tot.cadastrados).toBeGreaterThanOrEqual(4);
  });
});

describe("Perfis: síndico e conselheiro só visualizam", () => {
  it("veem dados de todas as unidades, mas não alteram", async () => {
    const sind = await mkUser({ roles: ["sindico"] });
    const cons = await mkUser({ roles: ["conselheiro"] });
    for (const v of [sind, cons]) {
      const rows = await asUser(v, (tx) => tx`select count(*)::int as n from pool_guests`);
      expect(rows[0].n).toBeGreaterThan(0);
      await expect(asUser(v, (tx) => tx`update parameters set source = 'x' where key = 'piscina.horario'`).then((r) => r.count)).resolves.toBe(0);
      await expect(asUser(v, (tx) => tx`insert into user_roles (user_id, role) values (${v}, 'admin')`)).rejects.toThrow();
    }
    const [b] = await db()`select b.id from bookings b where b.kind = 'quadra' and b.status = 'confirmada' limit 1`;
    await expect(q.cancelCourt({ id: sind, label: "Síndico" }, b.id, "teste de permissão")).rejects.toThrow(/não encontrado/);
    await expect(q.decideCourt({ id: cons, label: "Conselheiro" }, b.id, "confirmar", "")).rejects.toThrow(/Somente a administração/);
    await expect(pool.setPoolConfig({ id: sind, label: "Síndico" }, { limiteAtivo: false, limiteQtd: 2, documento: "nao_solicitar", retencaoDias: null, source: "teste" })).rejects.toThrow(/Somente a administração/);
  });
});
