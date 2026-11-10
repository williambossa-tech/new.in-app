import { SpaceCard, SpaceGrid } from "./SpaceCard";
import { CourtArt, PoolArt } from "./SportsArt";

/** Cartões de Esportes e lazer (quadras e piscina). A piscina não tem reserva. */
export function SportsCards() {
  return (
    <SpaceGrid>
      <SpaceCard title="Quadra Poliesportiva" info="08h00 às 22h00 · uso compartilhado" art={<CourtArt kind="poli" className="block w-full" />}
        href="/quadras/poli" primary={["Agendar", "/quadras/poli#agendar"]} secondary={["Calendário", "/quadras/poli?v=semana#calendario"]} />
      <SpaceCard title="Quadra de Areia" info="08h00 às 22h00 · uso compartilhado" art={<CourtArt kind="areia" className="block w-full" />}
        href="/quadras/areia" primary={["Agendar", "/quadras/areia#agendar"]} secondary={["Calendário", "/quadras/areia?v=semana#calendario"]} />
      <SpaceCard title="Piscina — Convidados" info="Até 2 convidados por vez, com você presente" art={<PoolArt className="block w-full" />}
        href="/piscina" primary={["Cadastrar", "/piscina#cadastro"]} secondary={["Meus cadastros", "/piscina#meus"]} />
    </SpaceGrid>
  );
}
