import { ComingSoon } from "@/components/ComingSoon";
import { OwlAtWork } from "@/components/OwlAtWork";

export const metadata = { title: "Coworking" };

export default function Coworking() {
  return <ComingSoon title="Coworking" pose="silencio" text="Agende a sala de reuniões ou a mini sala para trabalhar e receber seus convidados." art={<OwlAtWork size={230} />} />;
}
