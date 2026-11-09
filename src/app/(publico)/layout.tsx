export const dynamic = "force-dynamic";

import { EnvBanner } from "@/components/AppShell";
import { Corujinha } from "@/components/Corujinha";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-dvh bg-gradient-to-b from-violeta to-violeta-700">
      <EnvBanner />
      <div className="mx-auto flex max-w-md flex-col items-center px-4 pb-10 pt-8">
        <div className="flex items-center gap-3 text-white">
          <Corujinha pose="ola" size={84} className="owl-bob" alt="" />
          <div>
            <p className="text-3xl font-black tracking-tight">NEW.IN</p>
            <p className="text-sm font-bold text-white/80">Reservas e sorteios do condomínio</p>
          </div>
        </div>
        <div className="card mt-6 w-full p-6 sm:p-7">{children}</div>
        <p className="mt-6 text-center text-xs text-white/70">Condomínio NEW.IN · Curitiba/PR</p>
      </div>
    </div>
  );
}
