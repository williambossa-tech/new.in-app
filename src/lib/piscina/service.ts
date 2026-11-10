import "server-only";
import { audit } from "../audit";
import { asSystem, asUser, type Tx } from "../db";
import { RuleError } from "../lottery/engine";
import { notify } from "../notify";

/**
 * Piscina — cadastro prévio de convidados (Regimento, capítulo 21).
 * NÃO é reserva, controle de acesso nem registro de presença: o número de
 * cadastros nunca é tratado como número de pessoas na piscina.
 */
type Actor = { id: string; label: string };
export type DocMode = "nao_solicitar" | "opcional" | "obrigatorio";
export type GuestInput = { id?: string; name: string; document?: string; minor: boolean };

export const SIMULTANEOS = 2; // item 21.1, c, i

export async function poolSettings(tx: Tx) {
  const rows = await tx`select key, status, value from parameters where key like 'piscina.%'`;
  const v = (k: string) => { const r = rows.find((x) => x.key === `piscina.${k}`); return r?.status === "definido" ? r.value : null; };
  const ld = v("limite_diario");
  const mode = v("documento")?.modo;
  return {
    simultaneos: typeof v("convidados_simultaneos")?.quantidade === "number" ? (v("convidados_simultaneos").quantidade as number) : SIMULTANEOS,
    limiteDiario: ld?.ativo === true && typeof ld.quantidade === "number" ? (ld.quantidade as number) : null,
    documento: (["nao_solicitar", "opcional", "obrigatorio"].includes(mode) ? mode : "nao_solicitar") as DocMode,
    retencaoDias: typeof v("retencao")?.dias === "number" ? (v("retencao").dias as number) : null,
  };
}

export async function poolTerms(tx: Tx) {
  const [t] = await tx`select version, body_md from terms_documents where kind = 'piscina' order by version desc limit 1`;
  return { version: t.version as number, text: t.body_md as string };
}

const clean = (s: string) => s.trim().replace(/\s+/g, " ");
const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
const fmtDate = (d: string) => d.split("-").reverse().join("/");

async function roleOf(tx: Tx) { const [r] = await tx`select app.has_role('admin') as admin`; return { admin: !!r.admin }; }

async function retention(tx: Tx) {
  const s = await poolSettings(tx);
  if (s.retencaoDias) await tx`select app.pool_retention(${s.retencaoDias})`;
}

/** Salva os convidados de uma data (novos e editados) com o aceite do termo. */
export async function savePoolGuests(actor: Actor, input: { unitId: string; date: string; guests: GuestInput[]; accept: boolean }) {
  const { unitId, date } = input;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new RuleError("Escolha a data prevista.");
  if (date < today()) throw new RuleError("Escolha hoje ou uma data futura.");
  const guests = input.guests.map((g) => ({ ...g, name: clean(g.name ?? ""), document: clean(g.document ?? "") })).filter((g) => g.id || g.name);
  if (!guests.length) throw new RuleError("Informe ao menos um convidado.");
  if (!input.accept) throw new RuleError("Confirme a declaração de ciência das regras da piscina.");

  return asSystem(async (tx) => {
    const role = await roleOf(tx);
    const s = await poolSettings(tx);
    const [m] = await tx`select 1 from unit_memberships m join users u on u.id = m.user_id
                         where m.user_id = ${actor.id} and m.unit_id = ${unitId} and m.status = 'ativo' and u.status = 'ativo'`;
    if (!m && !role.admin) throw new RuleError("Apartamento não vinculado ao seu cadastro.");
    for (const g of guests) {
      if (g.name.length < 3 || g.name.split(" ").length < 2) throw new RuleError("Informe nome e sobrenome de cada convidado.");
      if (s.documento === "obrigatorio" && g.document.length < 3) throw new RuleError(`Informe o documento de ${g.name.split(" ")[0]}.`);
      if (s.documento === "nao_solicitar") g.document = "";
      if (g.document.length > 30) throw new RuleError("Documento muito longo.");
    }
    const existing = await tx`select id, full_name, document, is_minor from pool_guests where unit_id = ${unitId} and visit_date = ${date} and status = 'ativo' for update`;
    const keepIds = new Set(guests.filter((g) => g.id).map((g) => g.id));
    for (const id of keepIds) if (!existing.find((e) => e.id === id)) throw new RuleError("Convidado não encontrado.");
    const names = guests.map((g) => g.name.toLowerCase());
    if (new Set(names).size !== names.length) throw new RuleError("Há convidados repetidos.");
    const totalAfter = existing.length + guests.filter((g) => !g.id).length;
    if (s.limiteDiario && totalAfter > s.limiteDiario) throw new RuleError(`Pela configuração da administração, cada unidade cadastra até ${s.limiteDiario} convidados por dia.`);

    const terms = await poolTerms(tx);
    const [acc] = await tx`insert into term_acceptances (user_id, unit_id, kind, version, context)
                           values (${actor.id}, ${unitId}, 'piscina', ${terms.version}, ${tx.json({ data_prevista: date } as never)}) returning id`;
    let created = 0, updated = 0;
    for (const g of guests) {
      if (g.id) {
        const e = existing.find((x) => x.id === g.id)!;
        if (e.full_name === g.name && (e.document ?? "") === g.document && e.is_minor === g.minor) continue;
        await tx`update pool_guests set full_name = ${g.name}, document = ${g.document || null}, is_minor = ${g.minor}, acceptance_id = ${acc.id},
                 updated_at = now(), updated_by = ${actor.id} where id = ${g.id}`;
        await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "piscina.edicao", entity: "pool_guest", entityId: g.id,
          data: { data: date, antes: { nome: e.full_name, menor: e.is_minor, documento: e.document ? "informado" : null }, depois: { nome: g.name, menor: g.minor, documento: g.document ? "informado" : null } } });
        updated++;
      } else {
        const [row] = await tx`insert into pool_guests (unit_id, responsible_user_id, visit_date, full_name, document, is_minor, acceptance_id, updated_by)
                               values (${unitId}, ${actor.id}, ${date}, ${g.name}, ${g.document || null}, ${g.minor}, ${acc.id}, ${actor.id}) returning id`;
        await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "piscina.cadastro", entity: "pool_guest", entityId: row.id,
          data: { data: date, nome: g.name, menor: g.minor, documento: g.document ? "informado" : null } });
        created++;
      }
    }
    const [unit] = await tx`select code from units where id = ${unitId}`;
    if (created + updated) await notify(tx, [actor.id], { title: "Piscina: convidados cadastrados",
      body: `${fmtDate(date)} · Apto ${unit.code}. Lembrete: até ${s.simultaneos} convidados por vez, sempre com você presente.`, link: "/piscina" });
    await retention(tx);
    return { created, updated };
  }, actor.id);
}

export async function cancelPoolGuest(actor: Actor, id: string, reason: string) {
  return asSystem(async (tx) => {
    const role = await roleOf(tx);
    const [g] = await tx`select g.*, u.code as unit_code from pool_guests g join units u on u.id = g.unit_id where g.id = ${id} for update of g`;
    if (!g) throw new RuleError("Cadastro não encontrado.");
    const [m] = await tx`select 1 from unit_memberships where user_id = ${actor.id} and unit_id = ${g.unit_id} and status = 'ativo'`;
    if (!m && !role.admin) throw new RuleError("Cadastro não encontrado.");
    if (g.status !== "ativo") throw new RuleError("Este cadastro já foi cancelado.");
    const byAdmin = role.admin && !m;
    if (byAdmin && reason.trim().length < 5) throw new RuleError("Registre a justificativa do cancelamento.");
    const why = reason.trim() || "Cancelado pelo morador";
    await tx`update pool_guests set status = 'cancelado', cancel_reason = ${why}, cancelled_by = ${actor.id}, cancelled_at = now(), updated_at = now(), updated_by = ${actor.id} where id = ${id}`;
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "piscina.cancelamento", entity: "pool_guest", entityId: id,
      data: { data: new Date(g.visit_date).toISOString().slice(0, 10), apartamento: g.unit_code, nome: g.full_name, motivo: why, pela_administracao: byAdmin } });
    await notify(tx, [g.responsible_user_id], { title: "Piscina: cadastro de convidado cancelado",
      body: `${g.full_name} · ${fmtDate(new Date(g.visit_date).toISOString().slice(0, 10))}${byAdmin ? ` · ${why}` : ""}`, link: "/piscina" });
  }, actor.id);
}

/** Administração: corrige dados cadastrais com justificativa. */
export async function correctPoolGuest(actor: Actor, id: string, input: { name: string; document: string; minor: boolean; reason: string }) {
  const name = clean(input.name), doc = clean(input.document ?? "");
  if (name.length < 3 || name.split(" ").length < 2) throw new RuleError("Informe nome e sobrenome.");
  if (input.reason.trim().length < 5) throw new RuleError("Registre a justificativa da correção.");
  return asSystem(async (tx) => {
    if (!(await roleOf(tx)).admin) throw new RuleError("Somente a administração.");
    const [g] = await tx`select * from pool_guests where id = ${id} for update`;
    if (!g) throw new RuleError("Cadastro não encontrado.");
    await tx`update pool_guests set full_name = ${name}, document = ${doc || null}, is_minor = ${input.minor}, updated_at = now(), updated_by = ${actor.id} where id = ${id}`;
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "piscina.correcao", entity: "pool_guest", entityId: id,
      data: { antes: { nome: g.full_name, menor: g.is_minor, documento: g.document ? "informado" : null }, depois: { nome: name, menor: input.minor, documento: doc ? "informado" : null }, justificativa: input.reason.trim() } });
  }, actor.id);
}

export async function setPoolConfig(actor: Actor, input: { limiteAtivo: boolean; limiteQtd: number; documento: DocMode; retencaoDias: number | null; source: string }) {
  if (input.source.trim().length < 3) throw new RuleError("Informe a fonte da definição.");
  if (input.limiteAtivo && !(input.limiteQtd >= 1 && input.limiteQtd <= 20)) throw new RuleError("Limite diário inválido.");
  if (input.retencaoDias !== null && !(input.retencaoDias >= 1 && input.retencaoDias <= 3650)) throw new RuleError("Retenção inválida.");
  if (!["nao_solicitar", "opcional", "obrigatorio"].includes(input.documento)) throw new RuleError("Opção de documento inválida.");
  return asSystem(async (tx) => {
    if (!(await roleOf(tx)).admin) throw new RuleError("Somente a administração.");
    const src = input.source.trim();
    await tx`update parameters set value = ${tx.json({ ativo: input.limiteAtivo, quantidade: input.limiteQtd, texto: input.limiteAtivo ? `${input.limiteQtd} por dia` : "Desativado" } as never)},
             status = 'definido', source = ${src}, updated_by = ${actor.id}, updated_at = now() where key = 'piscina.limite_diario'`;
    const docTxt = { nao_solicitar: "Não solicitado", opcional: "Opcional", obrigatorio: "Obrigatório" }[input.documento];
    await tx`update parameters set value = ${tx.json({ modo: input.documento, texto: docTxt } as never)}, status = 'definido', source = ${src}, updated_by = ${actor.id}, updated_at = now()
             where key = 'piscina.documento'`;
    if (input.retencaoDias) await tx`update parameters set value = ${tx.json({ dias: input.retencaoDias, texto: `${input.retencaoDias} dias` } as never)}, status = 'definido', source = ${src},
             updated_by = ${actor.id}, updated_at = now() where key = 'piscina.retencao'`;
    else await tx`update parameters set value = null, status = 'pendente', source = null, updated_by = ${actor.id}, updated_at = now() where key = 'piscina.retencao'`;
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "piscina.configuracao", entity: "parameter", entityId: "piscina",
      data: { limite_diario: input.limiteAtivo ? input.limiteQtd : "desativado", documento: docTxt, retencao_dias: input.retencaoDias ?? "pendente", fonte: src } });
    await retention(tx);
  }, actor.id);
}

/** Cadastros da própria unidade (RLS). */
export async function myPoolGuests(userId: string) {
  return asUser(userId, (tx) => tx`
    select g.id, to_char(g.visit_date, 'YYYY-MM-DD') as date, g.full_name, g.document, g.is_minor, g.status, g.cancel_reason, u.code as unit,
           to_char(g.created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as created
    from pool_guests g join units u on u.id = g.unit_id
    where g.unit_id in (select app.my_unit_ids()) order by g.visit_date desc, g.created_at`);
}

export async function poolAdminList(userId: string, f: { from?: string; to?: string; unit?: string; q?: string; status?: string }) {
  await asSystem((tx) => retention(tx));
  return asUser(userId, (t) => t`
      select g.id, to_char(g.visit_date, 'YYYY-MM-DD') as date, g.full_name, g.document, g.is_minor, g.status, g.cancel_reason, u.code as unit,
             us.full_name as responsavel, to_char(g.created_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as created,
             to_char(a.accepted_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY HH24:MI') as aceite, a.version as termo_versao
      from pool_guests g join units u on u.id = g.unit_id join users us on us.id = g.responsible_user_id
      join term_acceptances a on a.id = g.acceptance_id
      where (${f.from ?? null}::date is null or g.visit_date >= ${f.from ?? null}::date)
        and (${f.to ?? null}::date is null or g.visit_date <= ${f.to ?? null}::date)
        and (${f.unit || null}::text is null or u.code = ${f.unit || null})
        and (${f.q || null}::text is null or app.unaccent_i(g.full_name) ilike '%' || app.unaccent_i(${f.q || ""}) || '%')
        and (${f.status || null}::text is null or g.status = ${f.status || null})
      order by g.visit_date desc, u.code, g.created_at limit 1000`);
}

export async function poolReport(userId: string, from: string, to: string) {
  return asUser(userId, async (tx) => {
    const porData = await tx`select to_char(visit_date, 'DD/MM') as dia, count(*) filter (where status = 'ativo')::int as cadastrados,
                                    count(*) filter (where status = 'cancelado')::int as cancelados
                             from pool_guests where visit_date between ${from}::date and ${to}::date group by visit_date order by visit_date`;
    const porUnidade = await tx`select u.code as unidade, count(*) filter (where g.status = 'ativo')::int as cadastrados, count(distinct g.visit_date)::int as datas,
                                       count(*) filter (where g.status = 'cancelado')::int as cancelados
                                from pool_guests g join units u on u.id = g.unit_id where g.visit_date between ${from}::date and ${to}::date
                                group by u.code order by 2 desc, 1`;
    const [tot] = await tx`select count(*) filter (where status = 'ativo')::int as cadastrados, count(*) filter (where status = 'cancelado')::int as cancelados,
                                  count(distinct unit_id)::int as unidades, count(distinct (unit_id, created_at::date))::int as usos_do_modulo
                           from pool_guests where visit_date between ${from}::date and ${to}::date`;
    return { porData, porUnidade, tot };
  });
}
