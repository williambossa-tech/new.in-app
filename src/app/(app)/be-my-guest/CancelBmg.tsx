"use client";
import { cancelarBmgAction } from "@/app/actions/bmg";
import { CancelWithReason } from "@/components/CancelWithReason";

export function CancelBmg({ id }: { id: string }) {
  return <CancelWithReason id={id} action={cancelarBmgAction} hint="A suíte fica livre para outros moradores." />;
}
