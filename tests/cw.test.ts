import { describe, it, expect, beforeAll } from "vitest";
import { asUser, db } from "@/lib/db";
import * as cw from "@/lib/cw/service";
import { addDays, todayIso } from "@/lib/bmg/rules";
import { mkUser } from "./helpers";

function cpf(base9: string) {
  const d = base9.split("").map(Number);
  const dv = (a: number[]) => { const s = a.reduce((x, n, i) => x + n * (a.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  d.push(dv(d)); d.push(dv(d)); return d.join("");
}
const G = (i: number) => ({ name: `Convidado Teste ${i}`, cpf: cpf(String(200000000 + i * 7919).slice(0, 9)) });
let admin: string; const u: Record<string, string> = {};
const unitId = async (c: string) => (await db()`select id from units where code = ${c}`)[0].id as string;
// segunda-feira da próxima semana (todas as reservas na mesma semana)
const monday = (() => { let d = addDays(todayIso(), 7); while (new Date(`${d}T12:00:00Z`).getUTCDay() !== 1) d = addDays(d, 1); return d; })();
const day = (n: number) => addDays(monday, n);
const me = (k: string) => ({ id: u[k], label: k });

beforeAll(async () => {
  admin = await mkUser({ roles: ["admin"] });
  u.a = await mkUser({ unit: "701" }); u.a2 = await mkUser({ unit: "701" }); u.b = await mkUser({ unit: "702" }); u.c = await mkUser({ unit: "703" });
});

describe("Coworking", () => {
  it("confirma automaticamente e respeita capacidade e duração", async () => {
    const r = await cw.requestCw(me("a"), { spaceCode: "cw-reunioes", unitId: await unitId("701"), day: day(0), start: "09:00", minutes: 120, purpose: "atendimento", guests: [G(1), G(2)] });
    const [b] = await db()`select status from bookings where code = ${r.code}`;
    expect(b.status).toBe("confirmada");
    await expect(cw.requestCw(me("b"), { spaceCode: "cw-mini", unitId: await unitId("702"), day: day(0), start: "10:00", minutes: 60, purpose: "atendimento", guests: [G(3), G(4)] }))
      .rejects.toThrow(/1 convidado/);
    await expect(cw.requestCw(me("b"), { spaceCode: "cw-mini", unitId: await unitId("702"), day: day(0), start: "10:00", minutes: 150, purpose: "uso_pessoal", guests: [] }))
      .rejects.toThrow(/2 horas/);
  });

  it("uma reserva por apartamento por dia, mesmo com outra conta", async () => {
    await expect(cw.requestCw(me("a2"), { spaceCode: "cw-mini", unitId: await unitId("701"), day: day(0), start: "15:00", minutes: 30, purpose: "uso_pessoal", guests: [] }))
      .rejects.toMatchObject({ constraint_name: "bookings_cw_one_per_day" });
  });

  it("disputa simultânea pelo mesmo horário: só um consegue", async () => {
    const r = await Promise.allSettled([
      cw.requestCw(me("b"), { spaceCode: "cw-reunioes", unitId: await unitId("702"), day: day(1), start: "14:00", minutes: 60, purpose: "uso_pessoal", guests: [] }),
      cw.requestCw(me("c"), { spaceCode: "cw-reunioes", unitId: await unitId("703"), day: day(1), start: "14:30", minutes: 60, purpose: "uso_pessoal", guests: [] }),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });

  it("prorroga 1 vez por 1 hora se o horário seguinte estiver livre", async () => {
    const [b] = await db()`select b.id from bookings b join units un on un.id = b.unit_id where un.code = '701' and b.kind = 'coworking'`;
    await cw.extendCw(me("a"), b.id);
    await expect(cw.extendCw(me("a"), b.id)).rejects.toThrow(/uma vez/);
    const [x] = await db()`select extract(epoch from upper(period) - lower(period))/60 as m from bookings where id = ${b.id}`;
    expect(Number(x.m)).toBe(180);
  });

  it("limite de 3 dias de atendimento por semana: bloqueia e permite pedir exceção", async () => {
    const uid = await unitId("701");
    await cw.requestCw(me("a"), { spaceCode: "cw-reunioes", unitId: uid, day: day(2), start: "09:00", minutes: 60, purpose: "atendimento", guests: [G(1)] });
    await cw.requestCw(me("a"), { spaceCode: "cw-reunioes", unitId: uid, day: day(3), start: "09:00", minutes: 60, purpose: "atendimento", guests: [G(1)] });
    await expect(cw.requestCw(me("a"), { spaceCode: "cw-reunioes", unitId: uid, day: day(4), start: "09:00", minutes: 60, purpose: "atendimento", guests: [G(1)] }))
      .rejects.toBeInstanceOf(cw.LimitError);
    // uso pessoal continua liberado (o limite é de atendimento)
    await cw.requestCw(me("a"), { spaceCode: "cw-mini", unitId: uid, day: day(5), start: "09:00", minutes: 60, purpose: "uso_pessoal", guests: [] });
    const r = await cw.requestCw(me("a"), { spaceCode: "cw-reunioes", unitId: uid, day: day(4), start: "09:00", minutes: 60, purpose: "atendimento", guests: [G(1)],
      exceptionReason: "Reunião com advogado do inventário, sem outra data" });
    expect(r.pending).toBe(true);
    const [b] = await db()`select id from bookings where code = ${r.code}`;
    await cw.decideCwException({ id: admin, label: "Admin" }, b.id, "aprovada", "Aprovado excepcionalmente");
    const [ok] = await db()`select status from bookings where code = ${r.code}`;
    expect(ok.status).toBe("confirmada");
  });

  it("limite de 10 convidados diferentes por semana (por CPF)", async () => {
    const uid = await unitId("702");
    await cw.requestCw(me("b"), { spaceCode: "cw-reunioes", unitId: uid, day: day(2), start: "16:00", minutes: 60, purpose: "atendimento", guests: [1, 2, 3, 4, 5, 6, 7].map((i) => G(100 + i)) });
    await expect(cw.requestCw(me("b"), { spaceCode: "cw-reunioes", unitId: uid, day: day(3), start: "16:00", minutes: 60, purpose: "atendimento", guests: [8, 9, 10, 11].map((i) => G(100 + i)) }))
      .rejects.toThrow(/10 convidados/);
    // os mesmos convidados não contam de novo
    await cw.requestCw(me("b"), { spaceCode: "cw-reunioes", unitId: uid, day: day(3), start: "16:00", minutes: 60, purpose: "atendimento", guests: [1, 2, 8].map((i) => G(100 + i)) });
  });

  it("outros moradores não veem convidados", async () => {
    const g = await asUser(u.c, (tx) => tx`select * from cw_guests`);
    expect(g).toHaveLength(0);
  });
});
