import Link from "next/link";
import { marcarAvisosLidos } from "@/app/actions/avisos";
import { Empty } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { asUser } from "@/lib/db";
import { MarkRead } from "./MarkRead";

export const dynamic = "force-dynamic";
export const metadata = { title: "Avisos" };

const when = (d: Date) => new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);

export default async function Avisos() {
  const me = await requireUser();
  const rows = await asUser(me.id, (tx) => tx`select id, title, body, link, created_at, read_at from notifications where user_id = ${me.id} order by created_at desc limit 100`);
  const unread = rows.some((r) => !r.read_at);
  return (
    <div className="space-y-6">
      <h1 className="h1">Avisos</h1>
      {unread && <MarkRead action={marcarAvisosLidos} />}
      {rows.length === 0 ? <div className="card"><Empty title="Nenhum aviso por enquanto" /></div> : (
        <ul className="space-y-3">
          {rows.map((r) => {
            const inner = (
              <div className={`card flex gap-4 p-5 ${!r.read_at ? "ring-2 ring-violeta/40" : ""}`}>
                <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${r.read_at ? "bg-linha" : "bg-violeta"}`} />
                <div className="min-w-0">
                  <p className="font-semibold">{r.title}</p>
                  {r.body && <p className="mt-0.5 text-sm text-noite-70">{r.body}</p>}
                  <p className="mt-1 text-xs text-noite-50">{when(r.created_at)}</p>
                </div>
              </div>
            );
            return <li key={r.id}>{r.link ? <Link href={r.link} className="block transition hover:opacity-90">{inner}</Link> : inner}</li>;
          })}
        </ul>
      )}
    </div>
  );
}
