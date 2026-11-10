import { ReadOnlyProvider } from "@/components/forms";
import { requireUser, viewOnly } from "@/lib/auth";
import { ROLE_LABEL } from "@/lib/format";

/** Área da administração. Síndico e conselheiros acessam em modo de visualização. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const me = await requireUser();
  const ro = viewOnly(me);
  const who = me.roles.includes("sindico") ? ROLE_LABEL.sindico : ROLE_LABEL.conselheiro;
  return (
    <ReadOnlyProvider value={ro}>
      {ro && (
        <div className="mb-6 flex items-center gap-3 rounded-2xl bg-violeta-50 px-4 py-3 text-sm text-violeta-700 ring-1 ring-violeta/20">
          <span aria-hidden>👁️</span>
          <span><b>Modo visualização · {who}.</b> Você vê tudo o que a administração vê; as operações ficam com a Administração.</span>
        </div>
      )}
      {children}
    </ReadOnlyProvider>
  );
}
