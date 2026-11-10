import Link from "next/link";
import { CourtArt, PoolArt } from "./SportsArt";

/** Cartões de Esportes e lazer (quadras e piscina). A piscina não tem reserva. */
export function SportsCards() {
  const cards = [
    { key: "poli", title: "Quadra Poliesportiva", info: "08h00 às 22h00", art: <CourtArt kind="poli" className="w-full" />,
      actions: [["Agendar", "/quadras/poli#agendar"], ["Ver calendário", "/quadras/poli?v=semana#calendario"]] },
    { key: "areia", title: "Quadra de Areia", info: "08h00 às 22h00", art: <CourtArt kind="areia" className="w-full" />,
      actions: [["Agendar", "/quadras/areia#agendar"], ["Ver calendário", "/quadras/areia?v=semana#calendario"]] },
    { key: "piscina", title: "Piscina — Convidados", info: "Até 2 convidados por vez, com você", art: <PoolArt className="w-full" />,
      actions: [["Cadastrar convidados", "/piscina#cadastro"], ["Meus cadastros", "/piscina#meus"]] },
  ] as const;
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {cards.map((c) => (
        <div key={c.key} className="card flex flex-col p-4">
          <Link href={c.actions[0][1].split("#")[0]} className="block overflow-hidden rounded-2xl">{c.art}</Link>
          <p className="mt-3 px-1 font-semibold">{c.title}</p>
          <p className="px-1 text-sm text-noite-50">{c.info}</p>
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link href={c.actions[0][1]} className="btn-primary btn-sm justify-center text-center">{c.actions[0][0]}</Link>
            <Link href={c.actions[1][1]} className="btn-secondary btn-sm justify-center text-center">{c.actions[1][0]}</Link>
          </div>
        </div>
      ))}
    </div>
  );
}
