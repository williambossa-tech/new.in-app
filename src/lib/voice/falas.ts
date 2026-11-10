/**
 * Falas registradas da Corujinha. Cada fala tem um código fixo, o texto e a
 * emoção com que deve ser dita (a voz é sempre a mesma).
 * O estado indica a animação da personagem durante a fala.
 */
export type OwlState = "idle" | "greeting" | "talking" | "happy" | "thinking" | "listening" | "goodbye";

export type Fala = { id: string; texto: string; emocao: string; estado: OwlState; pausaDepois?: number };

export const APRESENTACAO: Fala[] = [
  { id: "boas-vindas-1", texto: "Oiê! Que alegria ter você por aqui!", emocao: "empolgada e calorosa, como quem reencontra alguém querido", estado: "greeting", pausaDepois: 0.5 },
  { id: "boas-vindas-2", texto: "Eu sou a Corujinha, sua companheira no dia a dia do condomínio!", emocao: "carinhosa e um pouquinho orgulhosa ao se apresentar", estado: "happy", pausaDepois: 0.4 },
  { id: "boas-vindas-3", texto: "Cheguei para deixar tudo muito mais fácil, prático e organizado.", emocao: "confiante e tranquila, enfatizando de leve cada palavra da lista", estado: "talking", pausaDepois: 0.45 },
  { id: "boas-vindas-4", texto: "Por aqui, você reserva as suítes do Be My Guest e as salas do coworking, acompanha os sorteios e os eventos do condomínio e consulta as suas reservas.", emocao: "animada, explicando com clareza, num ritmo leve e gostoso de ouvir", estado: "talking", pausaDepois: 0.35 },
  { id: "boas-vindas-5", texto: "E, se bater uma dúvida sobre as regras, é só me perguntar!", emocao: "divertida e prestativa, com um sorriso", estado: "happy", pausaDepois: 0.5 },
  { id: "boas-vindas-6", texto: "E sabe o melhor? Você encontra tudo isso de um jeitinho simples, direto e na palma da sua mão!", emocao: "cúmplice, como quem conta um segredo bom; sorrindo", estado: "happy", pausaDepois: 0.45 },
  { id: "boas-vindas-7", texto: "Sempre que precisar, pode contar comigo!", emocao: "acolhedora e suave, mais devagar", estado: "listening", pausaDepois: 0.4 },
  { id: "boas-vindas-8", texto: "Agora, prepare suas asinhas... porque temos muitas novidades para descobrir juntos!", emocao: "brincalhona, com uma pequena pausa de suspense nas reticências e empolgação no final", estado: "happy", pausaDepois: 0.4 },
  { id: "boas-vindas-9", texto: "Seja muito bem-vindo!", emocao: "calorosa, finalizando com alegria", estado: "goodbye" },
];

/**
 * Regras de cada espaço, ditas pela Corujinha ao tocar nela (Regimento Interno V7
 * e definições do condomínio). Mantidas objetivas, sem números de itens.
 */
export const REGRAS: Record<string, Fala> = {
  "be-my-guest": { id: "regras-be-my-guest", estado: "talking", emocao: "explicando com clareza e carinho, num ritmo tranquilo",
    texto: "Regras do Be My Guest! As suítes são para hospedar seus convidados pessoais, nunca para aluguel ou qualquer atividade com lucro. Cabem até duas pessoas, todas identificadas antes. Cada apartamento pode ter uma reserva ativa por vez, de até sete diárias seguidas, e no máximo sete diárias a cada trinta dias. Peça com pelo menos quarenta e oito horas de antecedência. A entrada é a partir das dezoito horas, e a saída até o meio-dia. Não pode fumar, levar animais nem deixar menores sem o responsável. Os hóspedes não usam a academia, e você responde por eles. Tragam roupa de cama, travesseiro e itens de higiene!" },
  coworking: { id: "regras-coworking", estado: "talking", emocao: "explicando com clareza e animação, num ritmo tranquilo",
    texto: "Regras do coworking! Ele funciona vinte e quatro horas. Cada reserva vai até duas horas, e dá para prorrogar uma vez, por mais uma hora, se a sala estiver livre. Cada apartamento faz uma reserva por dia, com quinze minutos de antecedência. Para receber de um a sete convidados, reserve a sala de reuniões; a mini sala recebe só um convidado. Atenção: no máximo três dias de atendimento e dez convidados diferentes por semana. Acima disso, peça uma exceção à administração. Fale baixinho, use fones de ouvido, e nada de bebida alcoólica, cigarro ou animais. Pode lanchar, deixando tudo limpinho!" },
  quadras: { id: "regras-quadras", estado: "talking", emocao: "explicando com clareza e energia, num ritmo tranquilo",
    texto: "Regras das quadras! Elas funcionam das oito da manhã às dez da noite, e o uso é compartilhado: o agendamento organiza os horários, mas não dá exclusividade. Seus visitantes só jogam com você presente, e você responde por eles. Jogos amistosos ou organizados com mais de quatro visitantes precisam de autorização prévia da administração. A administração também pode reservar horários na programação, para crianças, jovens, adultos ou modalidades. Na poliesportiva, use calçado adequado; na de areia, não espalhe areia para fora. Nada de levar os acessórios para fora da quadra, e evite gritaria. Danos ficam por conta de quem causou!" },
  piscina: { id: "regras-piscina", estado: "talking", emocao: "explicando com clareza e carinho, num ritmo tranquilo",
    texto: "Regras da piscina! Ela funciona das cinco da manhã à meia-noite, e não precisa de reserva. Cada apartamento pode estar com até dois convidados por vez, e você precisa ficar junto o tempo todo. Cadastre seus convidados aqui no app antes. Se a piscina lotar, os moradores têm prioridade. Crianças menores de doze anos, só com um adulto responsável. Tome uma ducha antes de entrar, use traje de banho, e nada de vidro, objetos cortantes, animais ou jogos com bola. Lanches, só nas mesas, deixando tudo limpinho!" },
  sorteio: { id: "regras-sorteio", estado: "talking", emocao: "explicando com clareza e animação, num ritmo tranquilo",
    texto: "Como funciona o sorteio dos salões! A inscrição é por apartamento, dentro do prazo, e você escolhe os salões que deseja em cada data. Cada apartamento fica com, no máximo, um salão por data. O sorteio é online e transparente, e qualquer morador pode conferir o resultado aqui no app. Se alguém desistir, um novo sorteio automático escolhe entre os inscritos que ficaram. Depois, valem as regras normais dos salões, como capacidade e horário de silêncio." },
};

export const OUTRAS: Fala[] = [
  { id: "teste-voz", texto: "Oi! Eu sou a Corujinha, e esta é a minha voz.", emocao: "simpática e natural", estado: "greeting" },
];

export const FALAS: Record<string, Fala> = Object.fromEntries([...APRESENTACAO, ...Object.values(REGRAS), ...OUTRAS].map((f) => [f.id, f]));
