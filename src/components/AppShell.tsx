import Link from "next/link";
import type { SessionUser } from "@/lib/auth";
import { currentEnv } from "@/lib/db";
import { BottomNav, TopNav, type NavItem } from "./NavLinks";

export async function EnvBanner() {
  const env = await currentEnv();
  if (env !== "demonstracao") return null;
  return (
    <div className="no-print bg-amarelo px-4 py-1.5 text-center text-sm font-black text-noite">
      AMBIENTE DE DEMONSTRAÇÃO · dados fictícios · nada aqui tem validade oficial
    </div>
  );
}

export async function AppShell({ user, children, wide = false }: { user: SessionUser; children: React.ReactNode; wide?: boolean }) {
  const items: NavItem[] = [
    { href: "/", label: "Início", icon: "🏠" },
    { href: "/be-my-guest", label: "Be My Guest", icon: "🛏️" },
    { href: "/coworking", label: "Coworking", icon: "💼" },
    { href: "/sorteios", label: "Sorteio", icon: "🎄" },
    { href: "/minhas-reservas", label: "Reservas", icon: "📅" },
  ];
  const admin = user.roles.includes("admin");
  const firstName = user.fullName.split(" ")[0];
  return (
    <div className="min-h-dvh pb-24 lg:pb-10">
      <EnvBanner />
      <header className="no-print bg-gradient-to-br from-violeta to-violeta-700 text-white">
        <div className="mx-auto flex max-w-6xl items-center gap-4 px-5 py-3.5">
          <Link href="/" className="flex items-baseline gap-2" aria-label="Início">
            <span className="text-[1.3rem] font-bold tracking-[-0.02em]">NEW.IN</span>
            <span className="hidden text-sm font-medium text-white/70 sm:inline">Comunidade</span>
          </Link>
          <div className="flex-1"><TopNav items={items} /></div>
          {admin ? (
            <Link href="/admin" className="rounded-full bg-amarelo px-4 py-2 text-sm font-semibold text-noite hover:brightness-95">
              Administração
            </Link>
          ) : user.roles.includes("portaria") ? (
            <Link href="/admin/be-my-guest" className="rounded-full bg-amarelo px-4 py-2 text-sm font-semibold text-noite hover:brightness-95">
              Portaria
            </Link>
          ) : null}
          <details className="relative">
            <summary className="flex cursor-pointer list-none items-center gap-2 rounded-full bg-white/15 px-3 py-2 text-sm font-bold hover:bg-white/25">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-white text-violeta-700">{firstName[0]?.toUpperCase()}</span>
              <span className="hidden sm:inline">{firstName}</span>
            </summary>
            <div className="absolute right-0 z-40 mt-2 w-64 rounded-2xl bg-white p-2 text-noite shadow-xl ring-1 ring-linha">
              <p className="px-3 pt-2 text-sm font-black">{user.fullName}</p>
              <p className="px-3 pb-2 text-xs text-noite-50">
                {user.units.length ? `Apto ${user.units.map((u) => u.code).join(", ")}` : "Sem unidade vinculada"}
              </p>
              <Link href="/perfil" className="block rounded-xl px-3 py-2 text-sm font-bold hover:bg-violeta-50">Meu cadastro</Link>
              <Link href="/trocar-senha" className="block rounded-xl px-3 py-2 text-sm font-bold hover:bg-violeta-50">Trocar senha</Link>
              <form action="/sair" method="post">
                <button className="w-full rounded-xl px-3 py-2 text-left text-sm font-bold text-[#c23a2b] hover:bg-coral-50">Sair</button>
              </form>
            </div>
          </details>
        </div>
      </header>
      <main className={`mx-auto px-5 py-8 sm:py-12 ${wide ? "max-w-6xl" : "max-w-4xl"}`}>{children}</main>
      <BottomNav items={items} />
    </div>
  );
}

export function AdminTabs({ active }: { active: string }) {
  const tabs = [
    ["/admin", "Painel"],
    ["/admin/cadastros", "Cadastros"],
    ["/admin/sorteios/festas-2026", "Sorteio"],
    ["/admin/be-my-guest", "Be My Guest"],
    ["/admin/coworking", "Coworking"],
    ["/admin/parametros", "Parâmetros"],
    ["/admin/auditoria", "Auditoria"],
  ];
  return (
    <div className="no-print -mx-4 mb-6 overflow-x-auto px-4">
      <div className="flex w-max gap-2">
        {tabs.map(([href, label]) => (
          <Link key={href} href={href}
            className={`rounded-full px-4 py-2 text-sm font-bold ring-1 ${active === href ? "bg-noite text-white ring-noite" : "bg-white text-noite-70 ring-linha hover:bg-violeta-50"}`}>
            {label}
          </Link>
        ))}
      </div>
    </div>
  );
}
