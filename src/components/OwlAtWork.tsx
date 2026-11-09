/* eslint-disable @next/next/no-img-element */
/** Corujinha trabalhando: atrás de um notebook, com café quentinho e “digitando…”. */
export function OwlAtWork({ size = 220 }: { size?: number }) {
  return (
    <div className="relative select-none" style={{ width: size, height: size * 0.95 }} aria-hidden>
      {/* balão "digitando" */}
      <div className="typing-bubble absolute left-[8%] top-[2%] flex gap-1 rounded-2xl rounded-bl-sm bg-white px-3 py-2 shadow-md ring-1 ring-linha">
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-violeta" />
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-violeta" style={{ animationDelay: "0.15s" }} />
        <span className="typing-dot h-1.5 w-1.5 rounded-full bg-violeta" style={{ animationDelay: "0.3s" }} />
      </div>
      {/* corujinha focada */}
      <div className="absolute inset-x-0 top-[6%] flex justify-center">
        <img src="/corujinha/surpresa.webp" alt="" className="owl-work" style={{ width: size * 0.6 }} />
      </div>
      {/* mesa, notebook e café */}
      <svg viewBox="0 0 220 120" className="absolute bottom-0 left-0 w-full">
        <ellipse cx="110" cy="112" rx="96" ry="6" fill="#1d2b4f" opacity="0.08" />
        <rect x="8" y="92" width="204" height="14" rx="7" fill="#e4dbff" />
        {/* notebook visto de trás */}
        <path d="M52 22 h116 a9 9 0 0 1 9 9 v61 H43 V31 a9 9 0 0 1 9 -9z" fill="#2b2f45" />
        <path d="M56 26 h108 a7 7 0 0 1 7 7 v57 H49 V33 a7 7 0 0 1 7 -7z" fill="#3a3f5c" />
        <circle cx="110" cy="58" r="10" fill="#6a3df5" className="laptop-logo" />
        <text x="110" y="62.5" textAnchor="middle" fontSize="10" fontWeight="700" fill="white" fontFamily="inherit">N</text>
        <rect x="32" y="90" width="156" height="6" rx="3" fill="#2b2f45" />
        {/* caneca */}
        <g transform="translate(176 66)">
          <path d="M4 6 q-2 -8 4 -12 M12 6 q-2 -8 4 -12" stroke="#8a91a5" strokeWidth="2" fill="none" strokeLinecap="round" className="steam" />
          <rect x="0" y="8" width="20" height="20" rx="5" fill="#ff6b5b" />
          <path d="M20 12 h3 a5 5 0 0 1 0 10 h-3" stroke="#ff6b5b" strokeWidth="3" fill="none" />
        </g>
        {/* bloquinho */}
        <rect x="16" y="80" width="26" height="12" rx="3" fill="#ffc83d" transform="rotate(-6 29 86)" />
      </svg>
    </div>
  );
}
