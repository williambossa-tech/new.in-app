import "server-only";
import { getSessionUser } from "./auth";

export async function apiAdmin() {
  const me = await getSessionUser();
  if (!me || me.status !== "ativo" || !["admin", "sindico", "conselheiro"].some((r) => me.roles.includes(r as never))) return null;
  return me;
}
