"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export type NavItem = { href: string; label: string; icon: string };

function isActive(path: string, href: string) {
  return href === "/" ? path === "/" : path === href || path.startsWith(href + "/");
}

export function TopNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="hidden items-center gap-1 lg:flex" aria-label="Principal">
      {items.map((i) => (
        <Link key={i.href} href={i.href}
          className={`rounded-full px-4 py-2 text-[0.95rem] font-bold transition ${isActive(path, i.href) ? "bg-white text-violeta-700" : "text-white/85 hover:bg-white/15 hover:text-white"}`}>
          {i.label}
        </Link>
      ))}
    </nav>
  );
}

export function BottomNav({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav aria-label="Principal" className="no-print fixed inset-x-0 bottom-0 z-30 border-t border-linha bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="mx-auto grid max-w-xl" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
        {items.map((i) => {
          const on = isActive(path, i.href);
          return (
            <li key={i.href}>
              <Link href={i.href} className={`flex flex-col items-center gap-0.5 px-1 py-2 text-[0.72rem] font-bold leading-tight ${on ? "text-violeta" : "text-noite-50"}`}>
                <span aria-hidden className={`grid h-8 w-12 place-items-center rounded-full text-lg ${on ? "bg-violeta-50" : ""}`}>{i.icon}</span>
                <span className="text-center">{i.label}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
