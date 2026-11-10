import { adimplenciaAction, aprovarCadastroAction, criarUsuarioAction, perfisAction, recusarCadastroAction, redefinirSenhaAction, situacaoUsuarioAction, vinculoAction } from "@/app/actions/admin";
import { AdminTabs } from "@/components/AppShell";
import { ActionForm, SubmitButton } from "@/components/forms";
import { Empty, PageHeader } from "@/components/ui";
import { requireRole } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { fmtDate, fmtDateTime, RELATION_LABEL, ROLE_LABEL } from "@/lib/format";

export const metadata = { title: "Cadastros" };

export default async function Cadastros({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireRole("admin", "sindico", "conselheiro");
  const { q = "" } = await searchParams;
  const d = await asUser(me.id, async (tx) => {
    const pending = await tx`
      select u.id as user_id, u.full_name, u.email, u.phone, u.status, u.created_at, m.id as membership_id, m.relation, m.resides, m.requested_at, un.code as unit
      from users u left join unit_memberships m on m.user_id = u.id and m.status = 'solicitado' left join units un on un.id = m.unit_id
      where u.status = 'pendente' or m.id is not null order by coalesce(m.requested_at, u.created_at)`;
    const like = `%${q.trim().toLowerCase()}%`;
    const users = await tx`
      select u.id, u.full_name, u.email, u.phone, u.status, u.created_at,
        coalesce((select json_agg(json_build_object('id', m.id, 'code', un.code, 'relation', m.relation, 'resides', m.resides) order by un.floor, un.final)
                  from unit_memberships m join units un on un.id = m.unit_id where m.user_id = u.id and m.status = 'ativo'), '[]') as units,
        coalesce((select array_agg(role order by role) from user_roles r where r.user_id = u.id), '{}') as roles
      from users u
      where u.status in ('ativo', 'bloqueado') and (${q.trim()} = '' or lower(u.full_name) like ${like} or lower(u.email) like ${like}
            or exists (select 1 from unit_memberships m join units un on un.id = m.unit_id where m.user_id = u.id and un.code = ${q.trim()}))
      order by u.full_name limit 100`;
    const standing = await tx`select distinct on (s.unit_id) un.code, s.standing, s.reference_date, s.source, s.recorded_at
                              from unit_standing s join units un on un.id = s.unit_id order by s.unit_id, s.recorded_at desc`;
    const [{ n }] = await tx`select count(distinct unit_id)::int as n from unit_memberships where status = 'ativo'`;
    return { pending, users, standing, unitsWithMembers: n };
  });

  return (
    <>
      <AdminTabs active="/admin/cadastros" />
      <PageHeader eyebrow="Administração" title="Cadastros, perfis e unidades">
        {d.unitsWithMembers} de 192 apartamentos têm pelo menos um morador aprovado.
      </PageHeader>

      <section className="card mb-6 p-6">
        <h2 className="h2">Aguardando aprovação ({d.pending.length})</h2>
        {d.pending.length === 0 ? <Empty pose="festa" title="Nenhum cadastro pendente" /> : (
          <ul className="mt-4 space-y-3">
            {d.pending.map((p) => (
              <li key={`${p.user_id}-${p.membership_id}`} className="rounded-2xl border border-linha p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-lg font-black">{p.full_name}</p>
                    <p className="text-sm muted">{p.email} · {p.phone ?? "sem telefone"}</p>
                    <p className="mt-1">
                      {p.unit ? <>Apto <b>{p.unit}</b> · {RELATION_LABEL[p.relation]} · {p.resides ? "reside" : <b className="text-[#c23a2b]">não reside</b>}</> : "Sem unidade informada"}
                    </p>
                    <p className="text-xs text-noite-50">Solicitado em {fmtDateTime(p.requested_at ?? p.created_at)}</p>
                  </div>
                  <ActionForm action={aprovarCadastroAction} className="space-y-2">
                    <input type="hidden" name="user_id" value={p.user_id} />
                    <input type="hidden" name="membership_id" value={p.membership_id ?? ""} />
                    <SubmitButton className="btn-success btn-sm">Aprovar</SubmitButton>
                  </ActionForm>
                </div>
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm font-bold text-[#c23a2b]">Recusar…</summary>
                  <ActionForm action={recusarCadastroAction} className="mt-2 flex flex-wrap gap-2">
                    <input type="hidden" name="user_id" value={p.user_id} />
                    <input type="hidden" name="membership_id" value={p.membership_id ?? ""} />
                    <input className="input flex-1" name="note" placeholder="Motivo (ex.: não consta como morador da unidade)" required />
                    <SubmitButton className="btn-danger btn-sm">Recusar</SubmitButton>
                  </ActionForm>
                </details>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="card mb-6 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="h2">Usuários</h2>
          <form className="flex gap-2">
            <input className="input" name="q" defaultValue={q} placeholder="Nome, e-mail ou apto" />
            <button className="btn-secondary">Buscar</button>
          </form>
        </div>
        <ul className="mt-4 divide-y divide-linha">
          {d.users.map((u) => {
            const units = u.units as { id: string; code: string; relation: string; resides: boolean }[];
            const roles = u.roles as string[];
            return (
              <li key={u.id} className="py-3">
                <details>
                  <summary className="flex cursor-pointer list-none flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-black">{u.full_name}</span>
                    <span className="text-sm muted">{units.map((x) => x.code).join(", ") || "sem apto"}</span>
                    {roles.filter((r) => r !== "morador").map((r) => <span key={r} className="badge-violeta">{ROLE_LABEL[r]}</span>)}
                    {u.status === "bloqueado" && <span className="badge-coral">Bloqueado</span>}
                  </summary>
                  <div className="mt-3 grid gap-4 rounded-2xl bg-fundo p-4 md:grid-cols-2">
                    <div className="space-y-2 text-sm">
                      <p>{u.email} · {u.phone ?? "sem telefone"}</p>
                      {units.map((x) => (
                        <ActionForm key={x.id} action={vinculoAction} className="flex items-center gap-2">
                          <input type="hidden" name="user_id" value={u.id} />
                          <input type="hidden" name="op" value="encerrar" />
                          <input type="hidden" name="membership_id" value={x.id} />
                          <span>Apto <b>{x.code}</b> · {RELATION_LABEL[x.relation]} · {x.resides ? "reside" : "não reside"}</span>
                          <SubmitButton className="btn-ghost btn-sm text-[#c23a2b]" confirm={`Encerrar vínculo com o apto ${x.code}?`}>Encerrar</SubmitButton>
                        </ActionForm>
                      ))}
                      <ActionForm action={vinculoAction} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="user_id" value={u.id} />
                        <input type="hidden" name="op" value="incluir" />
                        <input className="input w-24" name="unit" placeholder="Apto" required />
                        <select className="input w-auto" name="relation">
                          <option value="proprietario">Proprietário</option><option value="locatario">Locatário</option><option value="morador_autorizado">Morador autorizado</option>
                        </select>
                        <select className="input w-auto" name="resides"><option value="sim">Reside</option><option value="nao">Não reside</option></select>
                        <SubmitButton className="btn-secondary btn-sm">Vincular</SubmitButton>
                      </ActionForm>
                    </div>
                    <div className="space-y-3">
                      <ActionForm action={perfisAction} className="space-y-2">
                        <input type="hidden" name="user_id" value={u.id} />
                        <div className="flex flex-wrap gap-2">
                          {Object.entries(ROLE_LABEL).map(([k, l]) => (
                            <label key={k} className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm font-bold ring-1 ring-linha">
                              <input type="checkbox" name="role" value={k} defaultChecked={roles.includes(k)} className="accent-violeta" /> {l}
                            </label>
                          ))}
                        </div>
                        <SubmitButton className="btn-secondary btn-sm">Salvar perfis</SubmitButton>
                      </ActionForm>
                      <div className="flex flex-wrap gap-2">
                        <ActionForm action={redefinirSenhaAction}>
                          <input type="hidden" name="user_id" value={u.id} />
                          <SubmitButton className="btn-secondary btn-sm" confirm="Gerar senha provisória para este usuário?">Redefinir senha</SubmitButton>
                        </ActionForm>
                        <ActionForm action={situacaoUsuarioAction}>
                          <input type="hidden" name="user_id" value={u.id} />
                          <input type="hidden" name="to" value={u.status === "bloqueado" ? "ativo" : "bloqueado"} />
                          <SubmitButton className={u.status === "bloqueado" ? "btn-success btn-sm" : "btn-danger btn-sm"}>
                            {u.status === "bloqueado" ? "Reativar" : "Bloquear"}
                          </SubmitButton>
                        </ActionForm>
                      </div>
                    </div>
                  </div>
                </details>
              </li>
            );
          })}
        </ul>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="card p-6">
          <h2 className="h2">Criar usuário</h2>
          <p className="mt-1 text-sm muted">Para portaria, administradora ou administração. Moradores fazem o próprio cadastro.</p>
          <ActionForm action={criarUsuarioAction} className="mt-4 space-y-3" resetOnSuccess>
            <input className="input" name="full_name" placeholder="Nome completo" required />
            <input className="input" name="email" type="email" placeholder="E-mail" required />
            <input className="input" name="phone" placeholder="Telefone (opcional)" />
            <div className="flex flex-wrap gap-2">
              {Object.entries(ROLE_LABEL).map(([k, l]) => (
                <label key={k} className="flex items-center gap-2 rounded-full bg-fundo px-3 py-1.5 text-sm font-bold ring-1 ring-linha">
                  <input type="checkbox" name="role" value={k} className="accent-violeta" /> {l}
                </label>
              ))}
            </div>
            <SubmitButton>Criar e gerar senha provisória</SubmitButton>
          </ActionForm>
        </section>
        <section className="card p-6">
          <h2 className="h2">Adimplência por unidade</h2>
          <p className="mt-1 text-sm muted">Somente a administração registra. O morador não declara a própria situação.</p>
          <ActionForm action={adimplenciaAction} className="mt-4 grid gap-3 sm:grid-cols-2" resetOnSuccess>
            <input className="input" name="unit" placeholder="Apto" required />
            <select className="input" name="standing" required defaultValue="">
              <option value="" disabled>Situação</option><option value="adimplente">Adimplente</option><option value="inadimplente">Inadimplente</option>
            </select>
            <input className="input" name="reference_date" type="date" required />
            <input className="input" name="source" placeholder="Fonte (ex.: relatório da administradora)" required />
            <div className="sm:col-span-2"><SubmitButton>Registrar</SubmitButton></div>
          </ActionForm>
          {d.standing.length > 0 && (
            <div className="table-wrap mt-4">
              <table className="tbl"><thead><tr><th>Apto</th><th>Situação</th><th>Referência</th><th>Fonte</th></tr></thead>
                <tbody>{d.standing.map((s) => (
                  <tr key={s.code}><td className="font-black">{s.code}</td><td>{s.standing === "adimplente" ? <span className="badge-verde">Adimplente</span> : <span className="badge-coral">Inadimplente</span>}</td>
                    <td>{fmtDate(s.reference_date)}</td><td className="text-xs">{s.source}</td></tr>))}</tbody></table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
