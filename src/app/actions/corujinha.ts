"use server";
/* eslint-disable @typescript-eslint/no-unused-vars */

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action";
import { requireRole } from "@/lib/auth";
import { testAi } from "@/lib/corujinha";

export async function testarIaAction(_s: ActionState, _f: FormData): Promise<ActionState> {
  await requireRole("admin");
  const s = await testAi();
  revalidatePath("/corujinha");
  return s.state === "ok" ? { ok: true, message: "Conexão com a IA funcionando." } : { ok: false, message: "A conexão ainda não está funcionando." };
}
