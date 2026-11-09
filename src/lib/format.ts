export const TZ = "America/Sao_Paulo";

export function fmtDateTime(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(new Date(d));
}

export function fmtDateTimeSec(d: Date | string | null | undefined): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: TZ, day: "2-digit", month: "2-digit", year: "numeric",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).format(new Date(d));
}

/** Datas "puras" (tipo date do banco) chegam como Date em UTC 00:00. */
export function fmtDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const x = new Date(d);
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", day: "2-digit", month: "2-digit", year: "numeric" }).format(x);
}

export function fmtDateLong(d: Date | string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "numeric", month: "long" }).format(new Date(d));
}

export function fmtBRL(v: number | null | undefined): string {
  if (v === null || v === undefined) return "pendente de definição";
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v);
}

export function shortHash(h: string | null | undefined, n = 12): string {
  if (!h) return "—";
  return `${h.slice(0, n)}…${h.slice(-6)}`;
}

/** Converte "AAAA-MM-DD" + "HH:MM" (horário de Curitiba) em instante UTC. */
export function localToInstant(dateIso: string, hhmm: string): Date {
  // Curitiba não tem horário de verão desde 2019: UTC-03:00 fixo.
  return new Date(`${dateIso}T${hhmm}:00-03:00`);
}

export const RELATION_LABEL: Record<string, string> = {
  proprietario: "Proprietário(a)",
  locatario: "Locatário(a)",
  morador_autorizado: "Morador(a) autorizado(a)",
};

export const ROLE_LABEL: Record<string, string> = {
  morador: "Morador",
  admin: "Administração/síndico",
  portaria: "Portaria/zeladoria",
  administradora: "Administradora",
};
