import { ComingSoon } from "@/components/ComingSoon";

export const metadata = { title: "Coworking" };

export default function Coworking() {
  return (
    <ComingSoon
      title="Coworking"
      pose="silencio"
      intro="As agendas da sala de reuniões e da mini sala vão abrir aqui assim que a administração definir horários, duração e capacidade."
      rules={[
        ["Para receber de 1 a 7 convidados, é obrigatória a reserva prévia da sala de reuniões, fechada e exclusiva.", "Regimento V7, item 23.1 (a)"],
        ["Videoconferências preferencialmente na sala de reuniões; silêncio e ruído mínimo.", "Regimento V7, item 23.4"],
        ["Uso indevido: atendimento em mais de 3 dias por semana ou mais de 10 convidados distintos na mesma semana.", "Regimento V7, item 23.14"],
        ["Proibidos animais, bebidas alcoólicas e fumígenos.", "Regimento V7, item 23.5"],
      ]}
      pending={[
        "Horários disponíveis, duração mínima e máxima, intervalo e antecedência",
        "Capacidade de cada ambiente",
        "Regras da mini sala (não individualizada no Regimento), inclusive se pode receber convidados",
        "Limites semanais: por usuário ou por unidade; início e fim da semana; bloquear ou só alertar",
        "Política de cancelamento e eventual cobrança",
      ]}
    />
  );
}
