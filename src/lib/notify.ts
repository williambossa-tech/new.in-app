import "server-only";
import type { Tx } from "./db";

/** Avisos no app (sino no topo). Gravados na mesma transação da operação. */
export type Notice = { title: string; body?: string; link?: string };

export async function notify(tx: Tx, userIds: (string | null | undefined)[], n: Notice) {
  const ids = [...new Set(userIds.filter((x): x is string => !!x))];
  for (const id of ids) {
    await tx`insert into notifications (user_id, title, body, link) values (${id}, ${n.title}, ${n.body ?? null}, ${n.link ?? null})`;
  }
}

/** Avisa a administração (perfil admin ativo). */
export async function notifyAdmins(tx: Tx, n: Notice, exceptUserId?: string) {
  const rows = await tx`select distinct r.user_id from user_roles r join users u on u.id = r.user_id
                        where r.role = 'admin' and u.status = 'ativo'`;
  await notify(tx, rows.map((r) => r.user_id as string).filter((id) => id !== exceptUserId), n);
}
