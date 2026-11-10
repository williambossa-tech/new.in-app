import Link from "next/link";
import { notFound } from "next/navigation";
import { arquivarAvisoAction } from "@/app/actions/mural";
import { CancelWithReason } from "@/components/CancelWithReason";
import { SimpleMarkdown } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import type { Role } from "@/lib/auth";
import { AUTHOR_LABEL, CAT_STYLE, CATEGORIES, getPost, publishAs, type AuthorRole, type Category } from "@/lib/mural/service";

export const dynamic = "force-dynamic";
const when = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(d);
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} MB` : `${Math.ceil(n / 1024)} KB`);

export default async function Aviso({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const me = await requireUser();
  const r = await getPost(me.id, id);
  if (!r) notFound();
  const p = r.post;
  const roleNeeded: Record<string, Role> = { sindico: "sindico", conselho: "conselheiro", administracao: "admin" };
  const canEdit = p.status === "publicado" && (me.roles.includes(roleNeeded[p.author_role]) || me.roles.includes("admin")) && publishAs(me.roles).length > 0;
  const isImg = p.attachment_mime?.startsWith("image/");
  return (
    <div className="space-y-6">
      <Link href="/mural" className="text-sm font-medium text-violeta-700">‹ Mural de avisos</Link>
      {sp.publicado && <div className="rounded-2xl bg-turquesa-50 px-4 py-3 text-sm text-[#0b6158] ring-1 ring-[#bfeee8]">Aviso publicado.</div>}
      {p.status !== "publicado" && <div className="rounded-2xl bg-coral-50 px-4 py-3 text-sm text-[#9e2c1f]">Aviso arquivado: {p.archived_reason}</div>}
      <article className="card p-6 sm:p-9">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {p.pinned && <span className="badge-amarelo">📌 Fixado</span>}
          <span className={CAT_STYLE[p.category] ?? "badge-cinza"}>{CATEGORIES[p.category as Category]}</span>
        </div>
        <h1 className="h1 mt-3">{p.title}</h1>
        <p className="mt-2 text-sm text-noite-50">{AUTHOR_LABEL[p.author_role as AuthorRole]} · {p.author_name} · {when(p.published_at)}
          {+new Date(p.updated_at) - +new Date(p.published_at) > 60_000 ? " · editado" : ""}{p.expires_on ? ` · válido até ${new Date(p.expires_on).toISOString().slice(0, 10).split("-").reverse().join("/")}` : ""}</p>
        <SimpleMarkdown text={p.body} className="mt-6 text-[1.02rem] leading-relaxed" />
        {p.attachment_name && (
          <div className="mt-6">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {isImg && <img src={`/api/mural/${p.id}/anexo`} alt={p.attachment_name} className="mb-3 max-h-[70vh] w-auto rounded-2xl ring-1 ring-linha" />}
            <a href={`/api/mural/${p.id}/anexo`} target="_blank" rel="noopener" className="inline-flex items-center gap-2 rounded-2xl bg-fundo px-4 py-3 text-sm font-medium ring-1 ring-linha hover:bg-violeta-50">
              📎 {p.attachment_name} <span className="text-noite-50">({kb(p.attachment_size)})</span></a>
          </div>
        )}
      </article>
      {r.stats && <p className="text-sm text-noite-50">👁️ Lido por {r.stats.pessoas} {r.stats.pessoas === 1 ? "pessoa" : "pessoas"} de {r.stats.unidades} {r.stats.unidades === 1 ? "apartamento" : "apartamentos"}.</p>}
      {canEdit && (
        <div className="flex flex-wrap items-start gap-x-6 gap-y-3">
          <Link href={`/mural/${p.id}/editar`} className="btn-secondary btn-sm">Editar</Link>
          <CancelWithReason id={p.id} action={arquivarAvisoAction} label="Arquivar aviso" hint="O aviso sai do mural (fica no histórico de auditoria)." />
        </div>
      )}
    </div>
  );
}
