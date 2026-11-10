"use client";
import { useEffect, useRef, useState } from "react";
import { Corujinha } from "./Corujinha";

/** Coruja clicável que abre o vídeo da Corujinha explicando o app. */
export function OwlVideo({ className = "", size = 160 }: { className?: string; size?: number }) {
  const [open, setOpen] = useState(false);
  const video = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow; document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    video.current?.play().catch(() => { /* o morador toca no play */ });
    return () => { document.body.style.overflow = prev; window.removeEventListener("keydown", onKey); };
  }, [open]);

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label="Assistir: a Corujinha explica o app"
        className={`group ${className}`}>
        <Corujinha pose="ola" size={size} className="owl-bob transition group-hover:scale-105" alt="" />
        <span className="absolute -top-1 right-0 flex items-center gap-1 rounded-full bg-violeta px-2.5 py-1 text-xs font-semibold text-white shadow-md transition group-hover:bg-violeta-700">
          <span aria-hidden>▶</span> Como funciona
        </span>
      </button>

      {open && (
        <div role="dialog" aria-modal="true" aria-label="Vídeo: a Corujinha explica o app"
          className="fixed inset-0 z-50 grid place-items-center bg-noite/70 p-4 backdrop-blur-sm" onClick={() => setOpen(false)}>
          <div className="relative" onClick={(e) => e.stopPropagation()}>
            <video ref={video} src="/video/corujinha-explica.mp4" poster="/video/corujinha-explica.jpg" controls playsInline preload="metadata"
              className="max-h-[86dvh] w-auto max-w-[92vw] rounded-[24px] bg-black shadow-2xl" style={{ aspectRatio: "9 / 16" }} />
            <button type="button" onClick={() => setOpen(false)} aria-label="Fechar vídeo"
              className="absolute -right-3 -top-3 grid h-10 w-10 place-items-center rounded-full bg-white text-xl font-semibold text-noite shadow-lg hover:bg-violeta-50">×</button>
          </div>
        </div>
      )}
    </>
  );
}
