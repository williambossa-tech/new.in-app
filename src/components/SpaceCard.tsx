import Link from "next/link";

/** Cartão padrão dos espaços na tela inicial: ilustração, título, informação e duas ações. */
export type SpaceCardProps = {
  title: string; info: string; art: React.ReactNode; href: string;
  primary: [string, string]; secondary?: [string, string]; badge?: string;
};

export function SpaceCard({ title, info, art, href, primary, secondary, badge }: SpaceCardProps) {
  return (
    <div className="card flex flex-col p-4 transition hover:shadow-lg">
      <Link href={href} className="relative block overflow-hidden rounded-2xl" tabIndex={-1} aria-hidden>
        {art}
        {badge && <span className="absolute right-3 top-6 rounded-full bg-white/95 px-2.5 py-1 text-xs font-semibold text-noite-70 shadow-sm">{badge}</span>}
      </Link>
      <Link href={href} className="mt-3 px-1 font-semibold hover:text-violeta-700">{title}</Link>
      <p className="min-h-[2.5rem] px-1 text-sm leading-snug text-noite-50">{info}</p>
      <div className={`mt-3 grid gap-2 ${secondary ? "grid-cols-2" : "grid-cols-1"}`}>
        <Link href={primary[1]} className="btn-primary btn-sm justify-center whitespace-nowrap text-center">{primary[0]}</Link>
        {secondary && <Link href={secondary[1]} className="btn-secondary btn-sm justify-center whitespace-nowrap text-center">{secondary[0]}</Link>}
      </div>
    </div>
  );
}

export function SpaceGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{children}</div>;
}
