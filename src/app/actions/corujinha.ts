"use server";
/* eslint-disable @typescript-eslint/no-unused-vars */

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/action";
import { testAi } from "@/lib/ai";
import { requireRole } from "@/lib/auth";
import { APRESENTACAO, FALAS } from "@/lib/voice/falas";
import { getSpeech, VoiceError } from "@/lib/voice/service";

export async function testarIaAction(_s: ActionState, _f: FormData): Promise<ActionState> {
  await requireRole("admin");
  const s = await testAi();
  revalidatePath("/corujinha");
  return s.state === "ok" ? { ok: true, message: "Conexão com a IA funcionando." } : { ok: false, message: "A conexão ainda não está funcionando." };
}

const vozMsg = (e: unknown) => (e instanceof VoiceError ? e.message : "Falha ao gerar a voz.");

export async function testarVozAction(_s: ActionState, _f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  try {
    const f = FALAS["teste-voz"];
    const r = await getSpeech({ text: f.texto, emocao: f.emocao, userId: me.id, bypassUserLimit: true });
    revalidatePath("/corujinha");
    return { ok: true, message: r.cached ? "Voz funcionando (áudio já guardado)." : "Voz gerada e guardada.", data: { tocar: Date.now() } };
  } catch (e) {
    revalidatePath("/corujinha");
    return { ok: false, message: vozMsg(e) };
  }
}

/** Gera e guarda todas as falas da apresentação (evita espera no primeiro acesso dos moradores). */
export async function prepararFalasAction(_s: ActionState, _f: FormData): Promise<ActionState> {
  const me = await requireRole("admin");
  let novas = 0, prontas = 0;
  try {
    for (const f of APRESENTACAO) {
      const r = await getSpeech({ text: f.texto, emocao: f.emocao, userId: me.id, bypassUserLimit: true });
      if (r.cached) prontas++; else novas++;
    }
  } catch (e) {
    return { ok: false, message: `${vozMsg(e)} (${novas + prontas} de ${APRESENTACAO.length} falas prontas)` };
  }
  revalidatePath("/corujinha");
  return { ok: true, message: `Apresentação pronta: ${novas} falas geradas agora, ${prontas} já estavam guardadas.` };
}
