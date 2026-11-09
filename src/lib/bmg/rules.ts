// Regras e utilidades do Be My Guest que rodam no servidor e no navegador.
export const CHECKIN_HOUR = 18; // 27.22, II
export const CHECKOUT_HOUR = 12; // 27.22, I
export const CLEAN_HOURS = 6; // 27.22, §1º
export const MAX_NIGHTS = 7; // 27.7, c
export const MAX_GUESTS = 2; // 27.6

export const onlyDigits = (s: string) => s.replace(/\D/g, "");

export function isValidCpf(raw: string) {
  const c = onlyDigits(raw);
  if (c.length !== 11 || /^(\d)\1{10}$/.test(c)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(c[i]) * (len + 1 - i);
    const r = (sum * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return calc(9) === Number(c[9]) && calc(10) === Number(c[10]);
}

export const formatCpf = (raw: string) => {
  const c = onlyDigits(raw).slice(0, 11);
  return c.replace(/^(\d{3})(\d)/, "$1.$2").replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3").replace(/\.(\d{3})(\d)/, ".$1-$2");
};

export function addDays(iso: string, n: number) {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function todayIso() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
}

export const nightsBetween = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400_000);
