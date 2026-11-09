import "server-only";
import { getSessionUser } from "./auth";

export async function apiAdmin() {
  const me = await getSessionUser();
  if (!me || me.status !== "ativo" || !me.roles.includes("admin")) return null;
  return me;
}
