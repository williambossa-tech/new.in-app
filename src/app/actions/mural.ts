"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action";
import { requireUser } from "@/lib/auth";
import { friendlyDbError } from "@/lib/db";
import { RuleError } from "@/lib/lottery/engine";
import * as m from "@/lib/mural/service";

const errMsg = (e: unknown) => (e instanceof RuleError ? e.message : friendlyDbError(e));

async function readInput(f: FormData) {
  const file = f.get("attachment");
  const isFile = file instanceof File && file.size > 0;
  const att = m.checkAttachment(isFile ? file : null, isFile ? Buffer.from(await file.arrayBuffer()) : null);
  return {
    category: String(f.get("category")) as m.Category, title: String(f.get("title") ?? ""), body: String(f.get("body") ?? ""),
    pinned: f.get("pinned") === "on", expiresOn: String(f.get("expires_on") ?? "") || null, attachment: att, removeAttachment: f.get("remove_attachment") === "on",
  };
}

export async function publicarAvisoAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireUser();
  let id: string;
  try {
    const input = await readInput(f);
    id = (await m.createPost({ id: me.id, label: me.fullName }, { ...input, as: String(f.get("as")) as m.AuthorRole, notify: f.get("notify") === "on" })).id;
  } catch (e) { return { message: errMsg(e) }; }
  revalidatePath("/mural"); revalidatePath("/");
  redirect(`/mural/${id}?publicado=1`);
}

export async function editarAvisoAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireUser();
  const id = String(f.get("id"));
  try { await m.updatePost({ id: me.id, label: me.fullName }, id, await readInput(f)); }
  catch (e) { return { message: errMsg(e) }; }
  revalidatePath("/mural"); revalidatePath(`/mural/${id}`); revalidatePath("/");
  redirect(`/mural/${id}`);
}

export async function arquivarAvisoAction(_: ActionState, f: FormData): Promise<ActionState> {
  const me = await requireUser();
  try { await m.archivePost({ id: me.id, label: me.fullName }, String(f.get("booking_id")), String(f.get("reason") ?? "")); }
  catch (e) { return { message: errMsg(e) }; }
  revalidatePath("/mural"); revalidatePath("/");
  redirect("/mural");
}
