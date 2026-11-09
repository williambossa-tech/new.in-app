"use client";

import { useEffect } from "react";
import { Corujinha } from "@/components/Corujinha";

function isStaleVersion(e: Error) {
  const m = `${e?.name} ${e?.message}`;
  return /Server Action|ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|deployment/i.test(m);
}

export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (isStaleVersion(error)) {
      const k = "newin-reload-once";
      try {
        if (!sessionStorage.getItem(k)) { sessionStorage.setItem(k, "1"); window.location.reload(); return; }
        sessionStorage.removeItem(k);
      } catch { window.location.reload(); }
    }
  }, [error]);
  return (
    <div className="mx-auto flex min-h-[60dvh] max-w-md flex-col items-center justify-center px-6 text-center">
      <Corujinha pose="pergunta" size={120} alt="" />
      <h1 className="mt-4 text-xl font-semibold">Algo não saiu como esperado</h1>
      <p className="mt-2 text-noite-70">O aplicativo foi atualizado ou a conexão oscilou. Recarregue a página para continuar.</p>
      <div className="mt-6 flex gap-3">
        <button className="btn-primary" onClick={() => window.location.reload()}>Recarregar</button>
        <button className="btn-secondary" onClick={() => reset()}>Tentar de novo</button>
      </div>
    </div>
  );
}
