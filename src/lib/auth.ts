import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHash, randomBytes, scrypt as _scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import { asSystem } from "./db";

const scrypt = promisify(_scrypt) as (pw: string, salt: Buffer, len: number, opts: object) => Promise<Buffer>;
const COOKIE = "newin_sessao";
const SESSION_DAYS = 30;

export type Role = "morador" | "admin" | "portaria" | "administradora" | "sindico" | "conselheiro" | "desenvolvedor";
/** Perfis que veem a área da administração (síndico e conselheiros só visualizam). */
export const VIEW_ROLES: Role[] = ["admin", "sindico", "conselheiro"];

export type SessionUser = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  status: "pendente" | "ativo" | "recusado" | "bloqueado";
  mustChangePassword: boolean;
  roles: Role[];
  units: { id: string; code: string; relation: string; resides: boolean }[];
  pendingUnits: { id: string; code: string }[];
};

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString("base64")}$${key.toString("base64")}`;
}

export async function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [alg, n, r, p, saltB64, keyB64] = stored.split("$");
  if (alg !== "scrypt") return false;
  const expected = Buffer.from(keyB64, "base64");
  const key = await scrypt(pw, Buffer.from(saltB64, "base64"), expected.length, { N: +n, r: +r, p: +p });
  return timingSafeEqual(key, expected);
}

export function passwordProblem(pw: string): string | null {
  if (pw.length < 8) return "A senha deve ter pelo menos 8 caracteres.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "Use letras e números na senha.";
  return null;
}

export function tempPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(12);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  return out.slice(0, 4) + "-" + out.slice(4, 8) + "-" + out.slice(8, 12);
}

const sha = (t: string) => createHash("sha256").update(t).digest("hex");

export async function createSession(userId: string, userAgent?: string | null) {
  const token = randomBytes(32).toString("base64url");
  const expires = new Date(Date.now() + SESSION_DAYS * 86400_000);
  await asSystem(async (tx) => {
    await tx`insert into sessions (user_id, token_hash, expires_at, user_agent)
             values (${userId}, ${sha(token)}, ${expires}, ${userAgent ?? null})`;
  });
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires,
  });
}

export async function destroySession() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (token) {
    await asSystem(async (tx) => {
      await tx`update sessions set revoked_at = now() where token_hash = ${sha(token)}`;
    });
  }
  jar.delete(COOKIE);
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  return asSystem(async (tx) => {
    const [u] = await tx`
      select u.id, u.email, u.full_name, u.phone, u.status, u.must_change_password
      from sessions s join users u on u.id = s.user_id
      where s.token_hash = ${sha(token)} and s.revoked_at is null and s.expires_at > now()`;
    if (!u || u.status === "bloqueado" || u.status === "recusado") return null;
    const roles = u.status === "ativo"
      ? (await tx`select role from user_roles where user_id = ${u.id}`).map((r) => r.role as Role)
      : [];
    const memberships = await tx`
      select m.status, m.relation, m.resides, un.id, un.code
      from unit_memberships m join units un on un.id = m.unit_id
      where m.user_id = ${u.id} and m.status in ('ativo', 'solicitado')
      order by un.floor, un.final`;
    return {
      id: u.id,
      email: u.email,
      fullName: u.full_name,
      phone: u.phone,
      status: u.status,
      mustChangePassword: u.must_change_password,
      roles,
      units: memberships
        .filter((m) => m.status === "ativo" && u.status === "ativo")
        .map((m) => ({ id: m.id, code: m.code, relation: m.relation, resides: m.resides })),
      pendingUnits: memberships.filter((m) => m.status === "solicitado").map((m) => ({ id: m.id, code: m.code })),
    } satisfies SessionUser;
  });
}

/** Exige usuário com cadastro aprovado. */
export async function requireUser(): Promise<SessionUser> {
  const u = await getSessionUser();
  if (!u) redirect("/entrar");
  if (u.mustChangePassword) redirect("/trocar-senha");
  if (u.status !== "ativo") redirect("/aguardando");
  return u;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const u = await requireUser();
  if (!roles.some((r) => u.roles.includes(r))) redirect("/");
  return u;
}

export const isAdmin = (u: SessionUser | null) => !!u?.roles.includes("admin");
export const canView = (u: SessionUser | null) => !!u && VIEW_ROLES.some((r) => u.roles.includes(r));
/** Síndico/conselheiro sem perfil de administração: somente visualização. */
export const viewOnly = (u: SessionUser | null) => canView(u) && !u!.roles.includes("admin") && !u!.roles.includes("portaria");
export const isDev = (u: SessionUser | null) => !!u?.roles.includes("desenvolvedor");

// Limite simples de tentativas de login por e-mail (memória do processo).
const attempts = new Map<string, { n: number; until: number }>();
export function loginThrottle(email: string): string | null {
  const a = attempts.get(email);
  if (a && a.n >= 8 && a.until > Date.now())
    return "Muitas tentativas. Aguarde 15 minutos ou peça à administração para redefinir sua senha.";
  return null;
}
export function loginFailed(email: string) {
  const a = attempts.get(email);
  const now = Date.now();
  if (!a || a.until < now) attempts.set(email, { n: 1, until: now + 15 * 60_000 });
  else a.n++;
}
export function loginOk(email: string) {
  attempts.delete(email);
}
