import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { asUser } from "@/lib/db";

export default async function Sorteios() {
  const me = await requireUser();
  const rows = await asUser(me.id, (tx) => tx`select code from lottery_campaigns where status <> 'cancelada' order by created_at desc limit 1`);
  if (rows[0]) redirect(`/sorteios/${rows[0].code}`);
  return <p className="muted">Nenhum sorteio no momento.</p>;
}
