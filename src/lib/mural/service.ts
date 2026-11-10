import "server-only";
import { audit } from "../audit";
import { asSystem, asUser } from "../db";
import { RuleError } from "../lottery/engine";
import { notify } from "../notify";

type Actor = { id: string; label: string };
export type AuthorRole = "sindico" | "conselho" | "administracao";
export const CATEGORIES = {
  comunicado: "Comunicado", importante: "Aviso importante", assembleia: "Assembleia", manutencao: "Manutenção",
  evento: "Evento", prestacao_contas: "Prestação de contas",
} as const;
export type Category = keyof typeof CATEGORIES;
/** Cor da etiqueta de cada categoria. */
export const CAT_STYLE: Record<string, string> = {
  importante: "badge-coral", assembleia: "badge-violeta", manutencao: "badge-amarelo", evento: "badge-turquesa", prestacao_contas: "badge-verde", comunicado: "badge-cinza",
};
export const AUTHOR_LABEL: Record<AuthorRole, string> = { sindico: "Síndico", conselho: "Conselho", administracao: "Administração" };

const MAX = 5 * 1024 * 1024;
const MAGIC: [string, number[]][] = [["application/pdf", [0x25, 0x50, 0x44, 0x46]], ["image/png", [0x89, 0x50, 0x4e, 0x47]], ["image/jpeg", [0xff, 0xd8, 0xff]], ["image/webp", [0x52, 0x49, 0x46, 0x46]]];

/** Como o usuário pode publicar (de acordo com os perfis). */
export function publishAs(roles: string[]): AuthorRole[] {
  const out: AuthorRole[] = [];
  if (roles.includes("sindico")) out.push("sindico");
  if (roles.includes("conselheiro")) out.push("conselho");
  if (roles.includes("admin")) out.push("administracao");
  return out;
}
const ROLE_OF: Record<AuthorRole, string> = { sindico: "sindico", conselho: "conselheiro", administracao: "admin" };

export type Attachment = { name: string; mime: string; data: Buffer } | null;

export function checkAttachment(file: File | null, buf: Buffer | null): Attachment {
  if (!file || !buf || !file.size) return null;
  if (buf.length > MAX) throw new RuleError("O anexo pode ter até 5 MB.");
  const kind = MAGIC.find(([, sig]) => sig.every((b, i) => buf[i] === b));
  if (!kind) throw new RuleError("Anexe um PDF ou uma imagem (JPG, PNG ou WEBP).");
  if (kind[0] === "image/webp" && buf.subarray(8, 12).toString("ascii") !== "WEBP") throw new RuleError("Arquivo de imagem inválido.");
  const name = file.name.replace(/[^\p{L}\p{N} ._()-]/gu, "_").slice(-120) || "anexo";
  return { name, mime: kind[0], data: buf };
}

export type PostInput = {
  as: AuthorRole; category: Category; title: string; body: string; pinned: boolean; expiresOn: string | null; notify: boolean;
  attachment: Attachment; removeAttachment?: boolean;
};

function validate(i: PostInput) {
  const title = i.title.trim().replace(/\s+/g, " "), body = i.body.trim();
  if (title.length < 3) throw new RuleError("Escreva o título.");
  if (title.length > 140) throw new RuleError("Título muito longo (até 140 caracteres).");
  if (body.length < 3) throw new RuleError("Escreva o texto do aviso.");
  if (body.length > 8000) throw new RuleError("Texto muito longo (até 8.000 caracteres).");
  if (!(i.category in CATEGORIES)) throw new RuleError("Escolha a categoria.");
  if (i.expiresOn && !/^\d{4}-\d{2}-\d{2}$/.test(i.expiresOn)) throw new RuleError("Data de validade inválida.");
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(new Date());
  if (i.expiresOn && i.expiresOn < today) throw new RuleError("A validade precisa ser hoje ou depois.");
  return { title, body };
}

async function rolesOf(tx: Parameters<Parameters<typeof asSystem>[0]>[0], userId: string) {
  return (await tx`select role from user_roles r join users u on u.id = r.user_id where r.user_id = ${userId} and u.status = 'ativo'`).map((r) => r.role as string);
}

export async function createPost(actor: Actor, input: PostInput) {
  const { title, body } = validate(input);
  return asSystem(async (tx) => {
    const roles = await rolesOf(tx, actor.id);
    if (!roles.includes(ROLE_OF[input.as])) throw new RuleError("Você não pode publicar com esse perfil.");
    const a = input.attachment;
    const [p] = await tx`
      insert into board_posts (author_id, author_name, author_role, category, title, body, pinned, expires_on,
                               attachment_name, attachment_mime, attachment_size, attachment, updated_by)
      values (${actor.id}, ${actor.label}, ${input.as}, ${input.category}, ${title}, ${body}, ${input.pinned}, ${input.expiresOn},
              ${a?.name ?? null}, ${a?.mime ?? null}, ${a?.data.length ?? null}, ${a?.data ?? null}, ${actor.id})
      returning id`;
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "mural.publicacao", entity: "board_post", entityId: p.id,
      data: { como: AUTHOR_LABEL[input.as], categoria: CATEGORIES[input.category], titulo: title, fixado: input.pinned, validade: input.expiresOn, anexo: a?.name ?? null, avisar_moradores: input.notify } });
    if (input.notify) {
      const users = await tx`select id from users where status = 'ativo' and id <> ${actor.id}`;
      await notify(tx, users.map((u) => u.id as string), { title: `Mural · ${AUTHOR_LABEL[input.as]}: ${title}`, body: CATEGORIES[input.category], link: `/mural/${p.id}` });
    }
    return { id: p.id as string };
  }, actor.id);
}

async function loadForEdit(tx: Parameters<Parameters<typeof asSystem>[0]>[0], actorId: string, id: string) {
  const [p] = await tx`select id, author_id, author_role, title, status from board_posts where id = ${id} for update`;
  if (!p) throw new RuleError("Aviso não encontrado.");
  const roles = await rolesOf(tx, actorId);
  const can = p.author_id === actorId ? roles.includes(ROLE_OF[p.author_role as AuthorRole]) : roles.includes("admin") || roles.includes(ROLE_OF[p.author_role as AuthorRole]);
  if (!can) throw new RuleError("Você não pode alterar este aviso.");
  return p;
}

/** Editar: o autor ou quem tem o mesmo perfil de publicação (ex.: outro conselheiro) e a administração. */
export async function updatePost(actor: Actor, id: string, input: Omit<PostInput, "as" | "notify">) {
  const { title, body } = validate({ ...input, as: "sindico", notify: false });
  return asSystem(async (tx) => {
    const p = await loadForEdit(tx, actor.id, id);
    if (p.status !== "publicado") throw new RuleError("Aviso arquivado.");
    const a = input.attachment;
    await tx`update board_posts set category = ${input.category}, title = ${title}, body = ${body}, pinned = ${input.pinned}, expires_on = ${input.expiresOn},
             updated_at = now(), updated_by = ${actor.id} where id = ${id}`;
    if (a) await tx`update board_posts set attachment_name = ${a.name}, attachment_mime = ${a.mime}, attachment_size = ${a.data.length}, attachment = ${a.data} where id = ${id}`;
    else if (input.removeAttachment) await tx`update board_posts set attachment_name = null, attachment_mime = null, attachment_size = null, attachment = null where id = ${id}`;
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "mural.edicao", entity: "board_post", entityId: id,
      data: { titulo_antes: p.title, titulo: title, categoria: CATEGORIES[input.category], fixado: input.pinned, validade: input.expiresOn,
              anexo: a ? a.name : input.removeAttachment ? "removido" : "mantido" } });
  }, actor.id);
}

export async function archivePost(actor: Actor, id: string, reason: string) {
  if (reason.trim().length < 3) throw new RuleError("Informe o motivo.");
  return asSystem(async (tx) => {
    const p = await loadForEdit(tx, actor.id, id);
    if (p.status !== "publicado") throw new RuleError("Este aviso já foi arquivado.");
    await tx`update board_posts set status = 'arquivado', archived_reason = ${reason.trim()}, archived_by = ${actor.id}, archived_at = now(), pinned = false where id = ${id}`;
    await audit(tx, { actorId: actor.id, actorLabel: actor.label, action: "mural.arquivamento", entity: "board_post", entityId: id, data: { titulo: p.title, motivo: reason.trim() } });
  }, actor.id);
}

const listCols = (t: string) => `${t}.id, ${t}.author_id, ${t}.author_name, ${t}.author_role, ${t}.category, ${t}.title, ${t}.body, ${t}.pinned, ${t}.published_at, ${t}.expires_on, ${t}.attachment_name, ${t}.attachment_mime, ${t}.attachment_size, ${t}.status, ${t}.updated_at`;

/** Avisos vigentes (com marcação de lido para o usuário). */
export async function listPosts(userId: string, opts: { from?: AuthorRole; limit?: number; includeExpired?: boolean } = {}) {
  return asUser(userId, (tx) => tx`
    select ${tx.unsafe(listCols("p"))}, (r.user_id is not null) as lido
    from board_posts p left join board_reads r on r.post_id = p.id and r.user_id = ${userId}
    where p.status = 'publicado'
      and (${opts.includeExpired ?? false} or p.expires_on is null or p.expires_on >= (now() at time zone 'America/Sao_Paulo')::date)
      and (${opts.from ?? null}::text is null or p.author_role = ${opts.from ?? null})
    order by p.pinned desc, p.published_at desc
    limit ${opts.limit ?? 100}`);
}

export async function getPost(userId: string, id: string) {
  // registra a leitura antes (fica valendo para a contagem)
  await asUser(userId, (tx) => tx`insert into board_reads (post_id, user_id)
    select id, ${userId} from board_posts where id = ${id} and status = 'publicado' on conflict do nothing`);
  return asUser(userId, async (tx) => {
    const [p] = await tx`select ${tx.unsafe(listCols("p"))}, p.archived_reason from board_posts p where p.id = ${id}`;
    if (!p) return null;
    const [{ staff }] = await tx`select app.is_staff() as staff`;
    const stats = staff || p.author_id === userId
      ? (await asSystem((s) => s`select count(*)::int as pessoas,
               count(distinct m.unit_id)::int as unidades
             from board_reads r left join unit_memberships m on m.user_id = r.user_id and m.status = 'ativo' where r.post_id = ${id}`))[0]
      : null;
    return { post: p, stats };
  });
}

export async function getAttachment(userId: string, id: string) {
  const [ok] = await asUser(userId, (tx) => tx`select 1 from board_posts where id = ${id}`);
  if (!ok) return null;
  const [a] = await asSystem((tx) => tx`select attachment_name, attachment_mime, attachment from board_posts where id = ${id} and attachment is not null`);
  return a ? { name: a.attachment_name as string, mime: a.attachment_mime as string, data: Buffer.from(a.attachment) } : null;
}

export async function unreadCount(userId: string) {
  const [r] = await asUser(userId, (tx) => tx`
    select count(*)::int as n from board_posts p
    where p.status = 'publicado' and (p.expires_on is null or p.expires_on >= (now() at time zone 'America/Sao_Paulo')::date)
      and not exists (select 1 from board_reads r where r.post_id = p.id and r.user_id = ${userId})`);
  return r.n as number;
}
