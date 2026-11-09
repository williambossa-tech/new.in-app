import { PageHeader } from "@/components/ui";
import { Verifier } from "./Verifier";

export const metadata = { title: "Verificar sorteio" };

export default async function Verificar({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return (
    <>
      <PageHeader title="Conferir o sorteio" back={{ href: `/sorteios/${code}`, label: "Voltar" }}>
        Refaça as contas do sorteio no seu próprio aparelho.
      </PageHeader>
      <Verifier code={code} />
    </>
  );
}
