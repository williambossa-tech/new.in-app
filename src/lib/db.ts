import "server-only";
import postgres from "postgres";

type Sql = postgres.Sql<Record<string, never>>;
export type Tx = postgres.TransactionSql<Record<string, never>>;

const globalForDb = globalThis as unknown as { __newinSql?: Sql };

function connect(): Sql {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL não definida");
  return postgres(url, {
    max: Number(process.env.DB_POOL_MAX ?? 10),
    onnotice: () => {},
    connection: { TimeZone: "America/Sao_Paulo" },
    idle_timeout: 30,
  });
}

export function db(): Sql {
  if (!globalForDb.__newinSql) globalForDb.__newinSql = connect();
  return globalForDb.__newinSql;
}

/**
 * Executa como o usuário autenticado: as políticas de acesso do banco (RLS)
 * passam a valer para tudo o que for feito dentro da transação.
 */
export async function asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await db().begin(async (tx) => {
    await tx`select set_config('app.user_id', ${userId}, true)`;
    await tx`set local role newin_app`;
    return fn(tx);
  })) as T;
}

/**
 * Executa com o papel de serviço (sem RLS). Usado apenas por rotinas internas
 * com autorização verificada explicitamente: login, sessões e motor do sorteio.
 */
export async function asSystem<T>(fn: (tx: Tx) => Promise<T>, actingUserId?: string): Promise<T> {
  return (await db().begin(async (tx) => {
    if (actingUserId) await tx`select set_config('app.user_id', ${actingUserId}, true)`;
    return fn(tx);
  })) as T;
}

/** Traduz erros do banco para mensagens que orientam o usuário. */
export function friendlyDbError(e: unknown): string {
  const err = e as { code?: string; message?: string; constraint_name?: string };
  if (err?.code === "P0001" && err.message) return err.message; // raise exception das regras
  if (err?.code === "23505") {
    if (err.constraint_name === "lottery_entries_unit_uq")
      return "Esta unidade já está inscrita neste salão e período. Inscrições de outros moradores do mesmo apartamento não geram chances adicionais.";
    if (err.constraint_name === "users_email_uq") return "Já existe um cadastro com este e-mail.";
    if (err.constraint_name === "unit_memberships_open_uq") return "Já existe um vínculo com esta unidade.";
    if (err.constraint_name === "lottery_stages_one_win_per_period")
      return "Esta unidade já venceu um salão neste período.";
    return "Registro duplicado.";
  }
  if (err?.code === "23P01") return "Horário indisponível: já existe uma reserva ou bloqueio neste período.";
  if (err?.code === "42501") return "Você não tem permissão para esta operação.";
  console.error(e);
  return "Não foi possível concluir a operação. Tente novamente; se persistir, avise a administração.";
}

export async function currentEnv(): Promise<"producao" | "demonstracao"> {
  const rows = await db()`select env from environment_marker`;
  return (rows[0]?.env as "producao" | "demonstracao") ?? "producao";
}
