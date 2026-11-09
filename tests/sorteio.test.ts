import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { asSystem, asUser, db } from "@/lib/db";
import * as engine from "@/lib/lottery/engine";
import { computeRound, drawSubstitution, freezeHash, sha256Hex, uniformIndex, type FreezeDoc } from "@/lib/lottery/core";
import { enroll, mkUser } from "./helpers";

let admin: string;
const A = () => ({ id: admin, label: "Admin Teste" });
const users: Record<string, string> = {};

beforeAll(async () => {
  admin = await mkUser({ roles: ["admin"] });
  users.a301 = await mkUser({ unit: "301" });
  users.b301 = await mkUser({ unit: "301", relation: "morador_autorizado" });
  users.a302 = await mkUser({ unit: "302", relation: "locatario" });
  users.a303 = await mkUser({ unit: "303" });
  users.a304 = await mkUser({ unit: "304" });
  users.a305 = await mkUser({ unit: "305" });
  users.naoResidente = await mkUser({ unit: "306", relation: "proprietario", resides: false });
  users.pendente = await mkUser({ unit: "307", status: "pendente" });
});

afterAll(async () => {
  await db().end();
});

describe("inscrições", () => {
  it("não aceita inscrição com a campanha em rascunho", async () => {
    await expect(enroll(users.a301, "301", "natal", "skybar")).rejects.toThrow(/não estão abertas/);
  });

  it("abre inscrições (somente administração)", async () => {
    await expect(engine.setRegistrationState({ id: users.a301, label: "x" }, "festas-2026", "inscricoes_abertas"))
      .rejects.toThrow(/administração/);
    await engine.setRegistrationState(A(), "festas-2026", "inscricoes_abertas");
  });

  it("bloqueia a mesma combinação para duas contas da mesma unidade, inclusive simultâneas", async () => {
    const results = await Promise.allSettled([
      enroll(users.a301, "301", "natal", "skybar"),
      enroll(users.b301, "301", "natal", "skybar"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const rej = results.find((r) => r.status === "rejected") as PromiseRejectedResult;
    expect((rej.reason as { constraint_name?: string }).constraint_name).toBe("lottery_entries_unit_uq");
  });

  it("morador não inscreve outra unidade", async () => {
    await expect(enroll(users.a301, "302", "natal", "skybar")).rejects.toThrow();
  });

  it("proprietário não residente (unidade locada) é recusado — item 20.5", async () => {
    await expect(enroll(users.naoResidente, "306", "natal", "skybar")).rejects.toThrow(/moradores do apartamento/);
  });

  it("cadastro pendente não inscreve", async () => {
    await expect(enroll(users.pendente, "307", "natal", "skybar")).rejects.toThrow();
  });

  it("monta inscrições de vários apartamentos", async () => {
    for (const s of ["partyin", "gourmetin"]) await enroll(users.a301, "301", "natal", s);
    for (const s of ["skybar", "partyin", "gourmetin"]) await enroll(users.b301, "301", "ano_novo", s);
    for (const u of ["302", "303", "304", "305"]) {
      for (const p of ["natal", "ano_novo"]) for (const s of ["skybar", "partyin", "gourmetin"]) await enroll(users["a" + u], u, p, s);
    }
    const [{ n }] = await db()`select count(*)::int as n from lottery_entries where status = 'ativa'`;
    expect(n).toBe(30);
  });

  it("morador não enxerga inscrições de outras unidades (RLS)", async () => {
    const rows = await asUser(users.a302, (tx) => tx`select distinct unit_id from lottery_entries`);
    expect(rows).toHaveLength(1);
    const outros = await asUser(users.a302, (tx) => tx`select id, full_name from users`);
    expect(outros).toHaveLength(1);
  });

  it("morador não lê a chave secreta nem a senha", async () => {
    await expect(asUser(users.a302, (tx) => tx`select * from lottery_secrets`)).rejects.toThrow();
    await expect(asUser(users.a302, (tx) => tx`select password_hash from users`)).rejects.toThrow();
  });

  it("morador não se atribui perfil administrativo", async () => {
    await expect(asUser(users.a302, (tx) => tx`insert into user_roles (user_id, role) values (${users.a302}, 'admin')`)).rejects.toThrow();
  });
});

describe("congelamento e sorteio", () => {
  it("exige encerrar inscrições e definir a ordem antes de congelar", async () => {
    await expect(engine.freeze(A(), "festas-2026")).rejects.toThrow(/Encerre/);
    await engine.setRegistrationState(A(), "festas-2026", "inscricoes_encerradas");
    await expect(engine.freeze(A(), "festas-2026")).rejects.toThrow(/método de ordem/);
    await engine.setOrderMethod(A(), "festas-2026", "sorteada", null, "Decisão do síndico registrada em ata de 10/11/2026");
  });

  it("simulação não toca os resultados oficiais", async () => {
    const sim = await engine.simulate(A(), "festas-2026");
    expect(sim.stages).toHaveLength(6);
    const [{ n }] = await db()`select count(*)::int as n from lottery_stages`;
    expect(n).toBe(0);
  });

  it("congela a lista com hash reproduzível e torna as inscrições imutáveis", async () => {
    const { hash, commitment } = await engine.freeze(A(), "festas-2026");
    const [c] = await db()`select freeze_doc from lottery_campaigns where code = 'festas-2026'`;
    expect(await freezeHash(c.freeze_doc as FreezeDoc)).toBe(hash);
    expect(commitment).toMatch(/^[0-9a-f]{64}$/);
    await expect(enroll(users.a303, "303", "natal", "skybar")).rejects.toThrow();
    await expect(db()`update lottery_entries set status = 'cancelada' where true`).rejects.toThrow(/congelada/);
  });

  it("executa as etapas em ordem, de forma idempotente e sem execução dupla simultânea", async () => {
    await engine.startRound(A(), "festas-2026", "4 8 15 16 23 42");
    const stages = await db()`select x.id, p.code as period, x.seq from lottery_stages x join lottery_periods p on p.id = x.period_id order by p.sort, x.seq`;
    expect(stages).toHaveLength(6);
    // Pular a ordem é recusado
    await expect(engine.drawStage(A(), "festas-2026", stages[1].id)).rejects.toThrow(/ordem/);
    for (const st of stages) {
      const twice = await Promise.all([engine.drawStage(A(), "festas-2026", st.id), engine.drawStage(A(), "festas-2026", st.id)]);
      expect(twice.filter((r) => !r.already)).toHaveLength(1);
      const again = await engine.drawStage(A(), "festas-2026", st.id);
      expect(again.already).toBe(true);
    }
    const [{ n }] = await db()`select count(*)::int as n from audit_log where action = 'sorteio.etapa'`;
    expect(n).toBe(6);
  });

  it("vencedor sai das demais etapas do mesmo período e continua no outro", async () => {
    const rows = await db()`
      select p.code as period, x.seq, u.code as winner, x.excluded, x.eligible
      from lottery_stages x join lottery_periods p on p.id = x.period_id left join units u on u.id = x.winner_unit_id
      order by p.sort, x.seq`;
    for (const period of ["natal", "ano_novo"]) {
      const ps = rows.filter((r) => r.period === period);
      const winners = ps.map((r) => r.winner).filter(Boolean);
      expect(new Set(winners).size).toBe(winners.length);
      for (let i = 1; i < ps.length; i++) {
        for (const w of ps.slice(0, i).map((r) => r.winner).filter(Boolean)) {
          expect(ps[i].eligible).not.toContain(w);
        }
      }
    }
    const natalWinners = rows.filter((r) => r.period === "natal").map((r) => r.winner);
    const anoNovoEligible = rows.filter((r) => r.period === "ano_novo" && r.seq === 1)[0].eligible as string[];
    for (const w of natalWinners) expect(anoNovoEligible).toContain(w);
  });

  it("resultado oficial não pode ser alterado diretamente", async () => {
    await expect(db()`update lottery_stages set winner_unit_id = null where status = 'sorteada'`).rejects.toThrow(/não pode ser alterado/);
    await expect(db()`delete from lottery_stages`).rejects.toThrow();
  });

  it("conclui, revela a chave, confere o lacre e gera reservas de dois dias", async () => {
    await engine.concludeRound(A(), "festas-2026");
    const [r] = await db()`select * from lottery_rounds where round = 1`;
    expect(await sha256Hex(r.seed_revealed)).toBe(r.seed_commitment);
    const [c] = await db()`select freeze_doc from lottery_campaigns`;
    const recomputed = await computeRound(c.freeze_doc as FreezeDoc, 1, r.seed_revealed, r.public_entropy);
    const stored = await db()`select p.code as period, s.code as space, u.code as winner from lottery_stages x
      join lottery_periods p on p.id = x.period_id join spaces s on s.id = x.space_id left join units u on u.id = x.winner_unit_id`;
    for (const st of recomputed.stages) {
      expect(stored.find((x) => x.period === st.period && x.space === st.space)?.winner ?? null).toBe(st.winner);
    }
    const bookings = await db()`select lower(period) as ini, upper(period) as fim, kind from bookings`;
    expect(bookings.length).toBe(6);
    for (const b of bookings) expect((+b.fim - +b.ini) / 3600_000).toBe(48);
  });

  it("desistência do sorteado gera novo sorteio automático entre os demais inscritos", async () => {
    const stages = await db()`
      select x.id, p.code as period, s.code as space, u.code as winner from lottery_stages x join lottery_periods p on p.id = x.period_id
      join spaces s on s.id = x.space_id join units u on u.id = x.winner_unit_id
      where x.status = 'sorteada' and p.code = 'natal' order by x.seq`;
    const st = stages[0];
    const owner = users["a" + st.winner];
    const other = Object.entries(users).find(([k]) => k.startsWith("a") && k !== "a" + st.winner && /^a\d+$/.test(k))![1];
    await expect(engine.withdraw({ id: other, label: "Outro" }, "festas-2026", st.id, "", "morador", st.winner)).rejects.toThrow(/Somente moradores/);
    const r1 = await engine.withdraw({ id: owner, label: "Dono" }, "festas-2026", st.id, "", "morador", st.winner);
    const otherWinners = stages.slice(1).map((x) => x.winner);
    if (r1.newWinner) {
      expect(r1.newWinner).not.toBe(st.winner);
      expect(otherWinners).not.toContain(r1.newWinner);
    }
    const bk = await db()`select u.code, b.status from bookings b join units u on u.id = b.unit_id where b.lottery_stage_id = ${st.id} order by b.created_at`;
    expect(bk[0]).toMatchObject({ code: st.winner, status: "cancelada" });
    if (r1.newWinner) expect(bk[1]).toMatchObject({ code: r1.newWinner, status: "confirmada" });
    // Clique duplo da administração: só um registro passa
    if (r1.newWinner) {
      const two = await Promise.allSettled([
        engine.withdraw(A(), "festas-2026", st.id, "Comunicado por telefone à portaria", "administracao", r1.newWinner),
        engine.withdraw(A(), "festas-2026", st.id, "Comunicado por telefone à portaria", "administracao", r1.newWinner),
      ]);
      expect(two.filter((x) => x.status === "fulfilled")).toHaveLength(1);
    }
    await expect(db()`update lottery_substitutions set reason = 'x'`).rejects.toThrow(/não podem ser alterados/);
  });

  it("revela a chave reserva e permite conferir os novos sorteios; depois não aceita desistências", async () => {
    await engine.revealReserve(A(), "festas-2026");
    const [r] = await db()`select * from lottery_rounds where round = 1`;
    expect(await sha256Hex(r.reserve_revealed)).toBe(r.reserve_commitment);
    const [c] = await db()`select freeze_doc from lottery_campaigns`;
    const subs = await db()`select s.n, s.excluded, s.eligible_hash, nw.code as new_winner, p.code as period, sp.code as space
      from lottery_substitutions s join lottery_stages x on x.id = s.stage_id join lottery_periods p on p.id = x.period_id
      join spaces sp on sp.id = x.space_id left join units nw on nw.id = s.new_winner_unit_id`;
    expect(subs.length).toBeGreaterThan(0);
    for (const s of subs) {
      const re = await drawSubstitution({ doc: c.freeze_doc as FreezeDoc, round: 1, reserveSeedHex: r.reserve_revealed, entropy: r.public_entropy,
        period: s.period, space: s.space, n: s.n, excluded: s.excluded as string[] });
      expect(re.winner ?? null).toBe(s.new_winner ?? null);
      expect(re.eligibleHash).toBe(s.eligible_hash);
    }
    const [st] = await db()`select id, (select u.code from units u where u.id = winner_unit_id) as w from lottery_stages where status = 'sorteada' limit 1`;
    await expect(engine.withdraw(A(), "festas-2026", st.id, "Teste após encerramento", "administracao", st.w)).rejects.toThrow(/encerrado/);
  });

  it("anulação exige justificativa, preserva o histórico e lacra nova chave", async () => {
    await expect(engine.annulRound(A(), "festas-2026", "curto")).rejects.toThrow(/justificativa/);
    await engine.annulRound(A(), "festas-2026", "Teste de anulação com justificativa suficiente para registro");
    const rounds = await db()`select round, status, seed_commitment from lottery_rounds order by round`;
    expect(rounds.map((r) => r.status)).toEqual(["anulada", "lacrada"]);
    expect(rounds[0].seed_commitment).not.toBe(rounds[1].seed_commitment);
    const [{ n }] = await db()`select count(*)::int as n from lottery_stages where status = 'anulada'`;
    expect(n).toBe(6);
    const [{ ativas }] = await db()`select count(*)::int as ativas from bookings where status = 'confirmada'`;
    expect(ativas).toBe(0);
  });
});

describe("auditoria", () => {
  it("cadeia íntegra e imutável", async () => {
    const [v] = await db()`select * from app.audit_verify()`;
    expect(v.ok).toBe(true);
    expect(Number(v.total)).toBeGreaterThan(10);
    await expect(db()`update audit_log set actor_label = 'x' where id = 1`).rejects.toThrow(/não pode ser alterada/);
    await expect(db()`delete from audit_log`).rejects.toThrow();
  });

  it("detecta adulteração mesmo com gatilho desligado", async () => {
    await asSystem(async (tx) => {
      await tx`alter table audit_log disable trigger audit_log_no_update`;
      await tx`update audit_log set actor_label = 'adulterado' where id = 2`;
      const [v] = await tx`select * from app.audit_verify()`;
      expect(v.ok).toBe(false);
      expect(Number(v.first_broken)).toBe(2);
      throw new Error("rollback");
    }).catch((e) => expect(String(e)).toMatch(/rollback/));
  });
});

describe("aleatoriedade", () => {
  it("distribuição uniforme (qui-quadrado)", async () => {
    const n = 7, trials = 7000, counts = new Array(n).fill(0);
    for (let i = 0; i < trials; i++) counts[(await uniformIndex("ab".repeat(32), "e", `t${i}`, n)).index]++;
    const exp = trials / n;
    const chi = counts.reduce((s, c) => s + (c - exp) ** 2 / exp, 0);
    expect(chi).toBeLessThan(22.46); // p = 0,001 com 6 graus de liberdade
  });
});

describe("auditoria por morador", () => {
  it("morador grava evento na trilha mas não consegue lê-la", async () => {
    const { audit } = await import("@/lib/audit");
    const u = await mkUser({ unit: "1001" });
    await asUser(u, (tx) => audit(tx, { actorId: u, actorLabel: "Morador", action: "sorteio.inscricao", entity: "teste" }));
    const rows = await asUser(u, (tx) => tx`select id from audit_log`);
    expect(rows).toHaveLength(0);
    await expect(asUser(u, (tx) => audit(tx, { actorId: admin, actorLabel: "Falso", action: "x", entity: "teste" }))).rejects.toThrow();
  });
});
