import Link from "next/link";
import { Corujinha } from "@/components/Corujinha";
import { Empty } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { AUTHOR_LABEL, CAT_STYLE, CATEGORIES, listPosts, publishAs, type AuthorRole, type Category } from "@/lib/mural/service";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mural de avisos" };

const when = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "short" }).format(d).replace(".", "");
const excerpt = (s: string) => s.replace(/\*\*|\*|^- /gm, "").replace(/\s+/g, " ").slice(0, 180);

export default async function Mural({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const me = await requireUser();
  const sp = await searchParams;
  const from = (["sindico", "conselho", "administracao"] as const).find((x) => x === sp.de);
  const posts = await listPosts(me.id, { from });
  const canPost = publishAs(me.roles).length > 0;
  const filters: [string, string][] = [["", "Todos"], ["sindico", "Síndico"], ["conselho", "Conselho"], ["administracao", "Administração"]];
  return (
    <div className="space-y-8">
      <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-br from-violeta to-violeta-700 px-7 py-9 text-white sm:px-10 sm:py-11">
        <div className="relative z-10 pr-24 sm:max-w-[62%] sm:pr-0">
          <p className="text-sm font-medium text-white/75">Comunicados oficiais</p>
          <h1 className="mt-1 text-[1.8rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[2.2rem]">Mural de avisos</h1>
          <p className="mt-3 text-white/85">Avisos do Síndico e do Conselho para toda a comunidade.</p>
        </div>
        <Corujinha pose="aponta" size={140} className="owl-bob absolute -bottom-2 right-3 h-[96px]! w-[96px]! sm:right-8 sm:h-[140px]! sm:w-[140px]!" alt="" />
      </section>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {filters.map(([k, l]) => (
            <Link key={k} href={k ? `/mural?de=${k}` : "/mural"} className={`rounded-full px-4 py-2 text-sm font-medium ring-1 ${(from ?? "") === k ? "bg-noite text-white ring-noite" : "bg-white text-noite-70 ring-linha hover:bg-violeta-50"}`}>{l}</Link>
          ))}
        </div>
        {canPost && <Link href="/mural/novo" className="btn-primary btn-sm">+ Novo aviso</Link>}
      </div>

      {posts.length === 0 ? <div className="card"><Empty title="Nenhum aviso no momento" /></div> : (
        <div className="space-y-4">
          {posts.map((p) => (
            <Link key={p.id} href={`/mural/${p.id}`} className={`card block p-6 transition hover:shadow-lg ${p.pinned ? "ring-2 ring-amarelo" : ""}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {p.pinned && <span className="badge-amarelo">📌 Fixado</span>}
                <span className={CAT_STYLE[p.category] ?? "badge-cinza"}>{CATEGORIES[p.category as Category]}</span>
                <span className="font-medium text-violeta-700">{AUTHOR_LABEL[p.author_role as AuthorRole]}</span>
                <span className="text-noite-50">· {when(p.published_at)}</span>
                {!p.lido && <span className="ml-auto rounded-full bg-violeta px-2 py-0.5 text-[11px] font-semibold text-white">Novo</span>}
              </div>
              <p className={`mt-2 text-[1.08rem] leading-snug ${p.lido ? "font-medium" : "font-semibold"}`}>{p.title}</p>
              <p className="mt-1 line-clamp-2 text-sm text-noite-70">{excerpt(p.body)}</p>
              {p.attachment_name && <p className="mt-2 text-xs text-noite-50">📎 {p.attachment_name}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
