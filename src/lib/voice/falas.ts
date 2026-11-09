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

export const OUTRAS: Fala[] = [
  { id: "teste-voz", texto: "Oi! Eu sou a Corujinha, e esta é a minha voz.", emocao: "simpática e natural", estado: "greeting" },
];

export const FALAS: Record<string, Fala> = Object.fromEntries([...APRESENTACAO, ...OUTRAS].map((f) => [f.id, f]));
