import Link from "next/link";
import { Corujinha, type Pose } from "./Corujinha";

export function PageHeader({ eyebrow, title, children, back }: { eyebrow?: string; title: string; children?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6">
      {back && (
        <Link href={back.href} className="mb-3 inline-flex items-center gap-1 text-sm font-bold text-violeta-700 hover:underline">
          ← {back.label}
        </Link>
      )}
      {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
      <h1 className="h1">{title}</h1>
      {children && <div className="mt-2 max-w-3xl text-[1.02rem] muted">{children}</div>}
    </div>
  );
}

export function Pending({ children = "Pendente de definição" }: { children?: React.ReactNode }) {
  return <span className="badge-amarelo">⏳ {children}</span>;
}

export function Source({ children }: { children: React.ReactNode }) {
  return <p className="mt-1 text-xs text-noite-50">Fonte: {children}</p>;
}

export function Notice({ tone = "violeta", pose, title, children }: { tone?: "violeta" | "amarelo" | "coral" | "turquesa"; pose?: Pose; title?: string; children: React.ReactNode }) {
  const tones = {
    violeta: "bg-violeta-50 ring-violeta-100",
    amarelo: "bg-amarelo-50 ring-[#ffe39a]",
    coral: "bg-coral-50 ring-[#ffd0ca]",
    turquesa: "bg-turquesa-50 ring-[#bfeee8]",
  };
  return (
    <div className={`flex items-start gap-3 rounded-2xl p-4 ring-1 ${tones[tone]}`}>
      {pose && <Corujinha pose={pose} size={56} className="-my-1 shrink-0" alt="" />}
      <div className="min-w-0 text-[0.97rem]">
        {title && <p className="font-black">{title}</p>}
        <div className="text-noite-70">{children}</div>
      </div>
    </div>
  );
}

export function Empty({ pose = "descanso", title, children }: { pose?: Pose; title: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-4 py-10 text-center">
      <Corujinha pose={pose} size={110} alt="" />
      <p className="mt-3 text-lg font-black">{title}</p>
      {children && <div className="mt-1 max-w-md muted">{children}</div>}
    </div>
  );
}

export function Stat({ label, value, hint }: { label: string; value: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <div className="card p-4">
      <p className="text-xs font-black uppercase tracking-wide text-noite-50">{label}</p>
      <p className="mt-1 text-2xl font-black">{value}</p>
      {hint && <p className="mt-0.5 text-sm muted">{hint}</p>}
    </div>
  );
}

const CAMPAIGN_STATUS: Record<string, [string, string]> = {
  rascunho: ["Em preparação", "badge-cinza"],
  inscricoes_abertas: ["Inscrições abertas", "badge-turquesa"],
  inscricoes_encerradas: ["Inscrições encerradas", "badge-amarelo"],
  congelada: ["Lista congelada", "badge-violeta"],
  em_sorteio: ["Sorteio em andamento", "badge-coral"],
  concluida: ["Resultado oficial", "badge-verde"],
  cancelada: ["Cancelada", "badge-cinza"],
};
export function CampaignBadge({ status }: { status: string }) {
  const [label, cls] = CAMPAIGN_STATUS[status] ?? [status, "badge-cinza"];
  return <span className={cls}>{label}</span>;
}

const BOOKING_STATUS: Record<string, [string, string]> = {
  solicitada: ["Solicitada", "badge-amarelo"],
  confirmada: ["Confirmada", "badge-turquesa"],
  em_uso: ["Em uso", "badge-violeta"],
  concluida: ["Concluída", "badge-verde"],
  cancelada: ["Cancelada", "badge-cinza"],
  recusada: ["Recusada", "badge-coral"],
  ausencia: ["Ausência", "badge-coral"],
};
export function BookingBadge({ status }: { status: string }) {
  const [label, cls] = BOOKING_STATUS[status] ?? [status, "badge-cinza"];
  return <span className={cls}>{label}</span>;
}

/** Markdown mínimo e seguro (negrito, itálico, listas, parágrafos). */
export function SimpleMarkdown({ text, className = "" }: { text: string; className?: string }) {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\*(.+?)\*/g, "<em>$1</em>");
  const blocks: string[] = [];
  let list: { type: "ul" | "ol"; items: string[] } | null = null;
  const flush = () => { if (list) { blocks.push(`<${list.type}>${list.items.map((i) => `<li>${i}</li>`).join("")}</${list.type}>`); list = null; } };
  for (const raw of text.trim().split("\n")) {
    const line = raw.trim();
    const ul = line.match(/^- (.*)$/);
    const ol = line.match(/^\d+\. (.*)$/);
    if (ul) { if (list?.type !== "ul") { flush(); list = { type: "ul", items: [] }; } list!.items.push(inline(ul[1])); }
    else if (ol) { if (list?.type !== "ol") { flush(); list = { type: "ol", items: [] }; } list!.items.push(inline(ol[1])); }
    else { flush(); if (line) blocks.push(`<p>${inline(line)}</p>`); }
  }
  flush();
  return <div className={`prose-newin ${className}`} dangerouslySetInnerHTML={{ __html: blocks.join("") }} />;
}
