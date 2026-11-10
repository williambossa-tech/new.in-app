"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth";
import { asUser } from "@/lib/db";

export async function marcarAvisosLidos() {
  const me = await requireUser();
  await asUser(me.id, (tx) => tx`update notifications set read_at = now() where user_id = ${me.id} and read_at is null`);
  revalidatePath("/", "layout");
}
