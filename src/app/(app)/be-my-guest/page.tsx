import { ComingSoon } from "@/components/ComingSoon";

export const metadata = { title: "Be My Guest" };

export default function BeMyGuest() {
  return (
    <ComingSoon
      title="Be My Guest"
      pose="descanso"
      intro="As reservas das duas suítes para convidados vão abrir aqui assim que a administração definir os prazos e as taxas aprovadas em assembleia."
      rules={[
        ["Uso exclusivo para estadia temporária de convidados pessoais do condômino; vedado uso comercial, transferência ou moradia habitual.", "Regimento V7, itens 27.1, 27.2 e 27.5"],
        ["Solicitação somente por proprietário ou locatário adimplente.", "Regimento V7, item 27.3"],
        ["Máximo de 2 ocupantes por quarto, com identificação prévia.", "Regimento V7, item 27.6"],
        ["Uma reserva ativa por unidade e no máximo 7 dias corridos.", "Regimento V7, item 27.7"],
        ["Entrada a partir das 18h, saída até as 12h e intervalo mínimo de 6 horas entre usos para limpeza.", "Regimento V7, item 27.22"],
        ["Sem animais, sem menores desacompanhados, sem vaga de garagem e sem credencial permanente.", "Regimento V7, itens 27.11 e 27.12"],
        ["Hóspedes trazem travesseiros, roupas de cama e material de higiene.", "Regimento V7, item 27.29"],
        ["Tag de acesso não devolvida em perfeitas condições: cobrança de R$ 100,00 após registro e validação da administração.", "Regimento V7, item 27.30"],
      ]}
      pending={[
        "Antecedência mínima de solicitação (27.7 a)",
        "Intervalo mínimo entre reservas sucessivas (27.7 d)",
        "Valores e bases da taxa de uso, taxa de limpeza e fundo de manutenção (27.17 e 27.20)",
        "Políticas de cancelamento e de ausência",
        "Identificação dos quartos e fonte da adimplência",
      ]}
    />
  );
}
