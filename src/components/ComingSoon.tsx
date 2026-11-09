import { Corujinha, type Pose } from "./Corujinha";
import { Pending } from "./ui";

export function ComingSoon({ title, pose, intro, rules, pending }: { title: string; pose: Pose; intro: string; rules: [string, string][]; pending: string[] }) {
  return (
    <div className="space-y-6">
      <section className="card relative overflow-hidden p-6 sm:p-8">
        <div className="relative z-10 sm:max-w-[70%]">
          <span className="badge-cinza">Em preparação</span>
          <h1 className="h1 mt-2">{title}</h1>
          <p className="mt-2 muted">{intro}</p>
        </div>
        <Corujinha pose={pose} size={140} className="owl-bob absolute -bottom-2 right-4 hidden sm:block" alt="" />
      </section>
      <section className="card p-6">
        <h2 className="h2">O que o Regimento já define</h2>
        <ul className="mt-3 space-y-3">
          {rules.map(([t, src]) => (
            <li key={t} className="rounded-2xl bg-fundo p-3">
              <p className="text-[0.97rem]">{t}</p>
              <p className="mt-0.5 text-xs text-noite-50">{src}</p>
            </li>
          ))}
        </ul>
      </section>
      <section className="card p-6">
        <h2 className="h2">Aguardando definição da administração</h2>
        <ul className="mt-3 space-y-2">
          {pending.map((p) => <li key={p} className="flex items-start gap-3"><Pending>Pendente</Pending><span>{p}</span></li>)}
        </ul>
      </section>
    </div>
  );
}
