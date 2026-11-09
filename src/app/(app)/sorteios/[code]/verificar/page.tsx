import { PageHeader } from "@/components/ui";
import { Verifier } from "./Verifier";

export const metadata = { title: "Verificar sorteio" };

export default async function Verificar({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <>
      <PageHeader eyebrow="Transparência" title="Conferir o sorteio no seu aparelho" back={{ href: `/sorteios/${code}`, label: "Voltar ao sorteio" }}>
        Esta página refaz todas as contas do sorteio <b>no seu próprio navegador</b>, sem depender do servidor:
        confere a impressão digital da lista congelada, o lacre da chave secreta e cada vencedor.
      </PageHeader>
      <Verifier code={code} />
    </>
  );
}
