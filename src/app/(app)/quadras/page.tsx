import { SportsCards } from "@/components/SportsCards";
import { requireUser } from "@/lib/auth";

export const metadata = { title: "Esportes e lazer" };

export default async function Esportes() {
  await requireUser();
  return (
    <div className="space-y-8">
      <div><h1 className="h1">Esportes e lazer</h1><p className="mt-2 text-noite-70">Agende as quadras e cadastre os convidados da piscina.</p></div>
      <SportsCards />
    </div>
  );
}
