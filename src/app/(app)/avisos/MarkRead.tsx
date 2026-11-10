"use client";
import { useEffect } from "react";

/** Marca os avisos como lidos ao abrir a página (os destaques continuam visíveis nesta visita). */
export function MarkRead({ action }: { action: () => Promise<void> }) {
  useEffect(() => { const t = setTimeout(() => { void action(); }, 1500); return () => clearTimeout(t); }, [action]);
  return null;
}
