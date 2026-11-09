import { describe, it, expect, beforeAll } from "vitest";
import { asUser, db } from "@/lib/db";
import * as bmg from "@/lib/bmg/service";
import { addDays, todayIso } from "@/lib/bmg/rules";
import { mkUser } from "./helpers";

function cpf(base9: string) {
  const d = base9.split("").map(Number);
  const dv = (arr: number[]) => { const s = arr.reduce((acc, n, i) => acc + n * (arr.length + 1 - i), 0); const r = (s * 10) % 11; return r === 10 ? 0 : r; };
  d.push(dv(d)); d.push(dv(d));
  return d.join("");
}
const G = (n: string, b: string, minor = false) => ({ name: n, cpf: cpf(b), minor });

let admin: string;
const u: Record<string, string> = {};
const A = () => ({ id: admin, label: "Admin" });
const me = (k: string) => ({ id: u[k], label: k });
const unitId = async (code: string) => (await db()`select id from units where code = ${code}`)[0].id as string;
const D = (n: number) => addDays(todayIso(), n);

beforeAll(async () => {
  admin = await mkUser({ roles: ["admin"] });
  u.p401 = await mkUser({ unit: "401" });
  u.l401 = await mkUser({ unit: "401", relation: "locatario" });
  u.aut402 = await mkUser({ unit: "402", relation: "morador_autorizado" });
  u.p402 = await mkUser({ unit: "402" });
  u.p403 = await mkUser({ unit: "403", resides: false });
  u.p404 = await mkUser({ unit: "404" });
  u.portaria = await mkUser({ roles: ["portaria"] });
});

describe("Be My Guest", () => {
  it("taxas: valores com vigência ficam congelados na reserva", async () => {
    await bmg.addFee(A(), { module: "bmg", component: "taxa_uso", amount: 80, basis: "por_diaria", validFrom: "2026-01-01", source: "AGE teste" });
    await bmg.addFee(A(), { module: "bmg", component: "taxa_limpeza", amount: 60, basis: "por_reserva", validFrom: "2026-01-01", source: "AGE teste" });
    // corrigir um valor cadastrado não altera reservas já feitas (testado abaixo)
  });

  it("fechado para moradores quando a administração fecha; reabre com antecedência definida", async () => {
    await bmg.setBmgSettings(A(), { advanceHours: null, open: false, source: "teste de configuração" });
    await expect(bmg.requestBmg(me("p401"), { spaceCode: "bmg-1", unitId: await unitId("401"), startDate: D(3), endDate: D(5), guests: [G("Ana Souza", "123456789")], accepted: true }))
      .rejects.toThrow(/não estão abertas/);
    await bmg.setBmgSettings(A(), { advanceHours: 24, open: true, source: "teste de configuração" });
  });

  it("valida hóspedes, CPF, menores, limite de 7 diárias e antecedência", async () => {
    const base = { spaceCode: "bmg-1", unitId: await unitId("401"), accepted: true };
    await expect(bmg.requestBmg(me("p401"), { ...base, startDate: D(3), endDate: D(11), guests: [G("Ana Souza", "123456789")] })).rejects.toThrow(/7 diárias/);
    await expect(bmg.requestBmg(me("p401"), { ...base, startDate: D(3), endDate: D(4), guests: [G("Ana Souza", "123456789"), G("Bia Lima", "223456789"), G("Caio Reis", "323456789")] })).rejects.toThrow(/2 hóspedes/);
    await expect(bmg.requestBmg(me("p401"), { ...base, startDate: D(3), endDate: D(4), guests: [{ name: "Ana Souza", cpf: "11111111111", minor: false }] })).rejects.toThrow(/CPF/);
    await expect(bmg.requestBmg(me("p401"), { ...base, startDate: D(3), endDate: D(4), guests: [G("Ana Souza", "123456789", true)] })).rejects.toThrow(/responsável/);
    await expect(bmg.requestBmg(me("p401"), { ...base, startDate: D(0), endDate: D(1), guests: [G("Ana Souza", "123456789")] })).rejects.toThrow(/antecedência/);
  });

  it("só proprietário ou locatário solicita (27.3)", async () => {
    await expect(bmg.requestBmg(me("aut402"), { spaceCode: "bmg-1", unitId: await unitId("402"), startDate: D(20), endDate: D(21), guests: [G("Ana Souza", "123456789")], accepted: true }))
      .rejects.toThrow(/proprietário ou locatário/);
  });

  it("uma reserva ativa por unidade, mesmo com outra conta do apartamento; confirmação automática com valores", async () => {
    const r = await bmg.requestBmg(me("p401"), { spaceCode: "bmg-1", unitId: await unitId("401"), startDate: D(3), endDate: D(8), guests: [G("Ana Souza", "123456789")], accepted: true });
    const [b] = await db()`select status, fee_total, fee_status, fee_snapshot from bookings where code = ${r.code}`;
    expect(b.status).toBe("confirmada");
    expect(Number(b.fee_total)).toBeNull;
    expect(b.fee_status).toBe("pendente_definicao"); // falta o fundo de manutenção
    expect(b.fee_snapshot.lines.map((l: { subtotal: number }) => l.subtotal)).toEqual([60, 400]);
    await bmg.addFee(A(), { module: "bmg", component: "taxa_uso", amount: 999, basis: "por_diaria", validFrom: "2026-01-02", source: "Nova AGE teste" });
    const [b2] = await db()`select fee_snapshot from bookings where code = ${r.code}`;
    expect(b2.fee_snapshot.lines.find((l: { component: string }) => l.component === "taxa_uso").amount).toBe(80);
    await expect(bmg.requestBmg(me("l401"), { spaceCode: "bmg-2", unitId: await unitId("401"), startDate: D(15), endDate: D(16), guests: [G("Ana Souza", "123456789")], accepted: true }))
      .rejects.toMatchObject({ constraint_name: "bookings_bmg_one_active_per_unit" });
  });

  it("dois apartamentos disputando o mesmo quarto ao mesmo tempo: só um consegue", async () => {
    const r = await Promise.allSettled([
      bmg.requestBmg(me("p402"), { spaceCode: "bmg-2", unitId: await unitId("402"), startDate: D(10), endDate: D(12), guests: [G("Bia Lima", "223456789")], accepted: true }),
      bmg.requestBmg(me("p403"), { spaceCode: "bmg-2", unitId: await unitId("403"), startDate: D(11), endDate: D(13), guests: [G("Caio Reis", "323456789")], accepted: true }),
    ]);
    expect(r.filter((x) => x.status === "fulfilled")).toHaveLength(1);
  });

  it("respeita 18h/12h e o intervalo de limpeza: a próxima entrada pode ser no dia da saída", async () => {
    // bmg-1 está ocupado de D3 (18h) a D8 (12h) + limpeza até 18h
    await expect(bmg.requestBmg(me("p404"), { spaceCode: "bmg-1", unitId: await unitId("404"), startDate: D(7), endDate: D(9), guests: [G("Davi Melo", "423456789")], accepted: true }))
      .rejects.toMatchObject({ code: "23P01" });
    const ok = await bmg.requestBmg(me("p404"), { spaceCode: "bmg-1", unitId: await unitId("404"), startDate: D(8), endDate: D(9), guests: [G("Davi Melo", "423456789")], accepted: true });
    expect(ok.code).toBeTruthy();
    const [b] = await db()`select lower(period) as ci, upper(period) as co, upper(blocked) as clean from bookings where code = ${ok.code}`;
    expect(new Date(b.ci).toISOString()).toBe(new Date(`${D(8)}T18:00:00-03:00`).toISOString());
    expect(new Date(b.co).toISOString()).toBe(new Date(`${D(9)}T12:00:00-03:00`).toISOString());
    expect((+b.clean - +b.co) / 3600_000).toBe(6);
  });

  it("exceção de horário não pode eliminar a limpeza nem conflitar", async () => {
    const [b] = await db()`select b.id from bookings b join units u on u.id = b.unit_id where u.code = '404' and b.kind = 'bmg'`;
    await expect(bmg.timeException(A(), b.id, { checkin: `${D(8)}T14:00`, checkout: `${D(9)}T12:00`, reason: "Chegada antecipada do voo", chargeNote: "" }))
      .rejects.toMatchObject({ code: "23P01" });
  });

  it("no máximo 7 diárias por unidade em 30 dias", async () => {
    const [b] = await db()`select b.id from bookings b join units u on u.id = b.unit_id where u.code = '401' and b.kind = 'bmg' and b.status = 'confirmada'`;
    await bmg.checkInBmg(me("portaria"), b.id, { inspectionOk: true, inspectionNote: "", tagCode: "T-01" });
    await bmg.checkOutBmg(me("portaria"), b.id, { tagReturned: "nao_devolvida", note: "Hóspede levou a tag" });
    // já usou 5 diárias: mais 3 dentro de 30 dias excede
    await expect(bmg.requestBmg(me("p401"), { spaceCode: "bmg-2", unitId: await unitId("401"), startDate: D(20), endDate: D(23), guests: [G("Ana Souza", "123456789")], accepted: true }))
      .rejects.toThrow(/7 diárias a cada 30 dias/);
    const ok = await bmg.requestBmg(me("p401"), { spaceCode: "bmg-2", unitId: await unitId("401"), startDate: D(20), endDate: D(22), guests: [G("Ana Souza", "123456789")], accepted: true });
    expect(ok.code).toBeTruthy();
  });

  it("ocorrência da tag só vira cobrança após validação da administração", async () => {
    const [b] = await db()`select b.id from bookings b join units u on u.id = b.unit_id where u.code = '401' and b.status = 'concluida'`;
    const [o] = await db()`select occurrence_status, occurrence_amount from bmg_operations where booking_id = ${b.id}`;
    expect(o.occurrence_status).toBe("pendente_validacao");
    await expect(bmg.validateOccurrence(me("portaria"), b.id, "validada", "Conferido")).rejects.toThrow(/administração/);
    await bmg.validateOccurrence(A(), b.id, "validada", "Tag não devolvida, confirmado pela portaria");
    const [o2] = await db()`select occurrence_status from bmg_operations where booking_id = ${b.id}`;
    expect(o2.occurrence_status).toBe("validada");
  });

  it("outros moradores veem só a ocupação, nunca hóspedes ou CPFs", async () => {
    const guests = await asUser(u.p404, (tx) => tx`select g.full_name from bmg_guests g join bookings b on b.id = g.booking_id join units un on un.id = b.unit_id where un.code <> '404'`);
    expect(guests).toHaveLength(0);
    const av = await asUser(u.p404, (tx) => tx`select * from booking_availability`);
    expect(av.length).toBeGreaterThan(0);
    expect(Object.keys(av[0])).not.toContain("unit_id");
    const all = await asUser(u.portaria, (tx) => tx`select cpf from bmg_guests`);
    expect(all.length).toBeGreaterThan(0);
  });

  it("disponibilidade por noite reflete a limpeza", async () => {
    const r = await bmg.bmgAvailability(u.p404, D(0), D(30));
    // a reserva do 401 (D3–D8) já foi concluída no teste e deixa de ocupar a agenda
    expect(r.busy["bmg-1"]).not.toContain(D(3));
    expect(r.busy["bmg-1"]).toContain(D(8)); // reserva do 404
    expect(r.busy["bmg-1"]).not.toContain(D(9));
  });
});
