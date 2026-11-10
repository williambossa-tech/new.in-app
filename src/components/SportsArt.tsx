/** Ilustrações dos espaços esportivos e da piscina (SVG leve, no estilo do app). */
export function CourtArt({ kind, className = "" }: { kind: "poli" | "areia"; className?: string }) {
  if (kind === "areia") {
    return (
      <svg viewBox="0 0 320 180" className={className} aria-hidden>
        <defs><linearGradient id="sand" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#fbe3b0" /><stop offset="1" stopColor="#f2c97d" /></linearGradient></defs>
        <rect x="8" y="20" width="304" height="150" rx="22" fill="url(#sand)" />
        <rect x="34" y="42" width="252" height="106" rx="6" fill="none" stroke="#fff" strokeWidth="4" opacity=".9" />
        <line x1="160" y1="30" x2="160" y2="160" stroke="#5b4636" strokeWidth="3" />
        <rect x="150" y="28" width="20" height="134" fill="none" />
        <path d="M160 34 L160 156" stroke="#fff" strokeWidth="8" strokeDasharray="2 6" opacity=".85" />
        <circle cx="160" cy="30" r="5" fill="#5b4636" /><circle cx="160" cy="160" r="5" fill="#5b4636" />
        <circle cx="222" cy="78" r="13" fill="#fff" /><path d="M210 78 a12 12 0 0 1 24 0 M222 66 a12 12 0 0 0 0 24" stroke="#7aa7ff" strokeWidth="3" fill="none" />
        <circle cx="70" cy="140" r="3" fill="#e2b46a" /><circle cx="110" cy="62" r="2.5" fill="#e2b46a" /><circle cx="262" cy="132" r="3" fill="#e2b46a" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden>
      <rect x="8" y="20" width="304" height="150" rx="22" fill="#2f7de1" />
      <rect x="30" y="38" width="260" height="114" rx="4" fill="#ff8a5b" />
      <g fill="none" stroke="#fff" strokeWidth="3" opacity=".95">
        <rect x="30" y="38" width="260" height="114" rx="4" /><line x1="160" y1="38" x2="160" y2="152" /><circle cx="160" cy="95" r="20" />
        <path d="M30 70 h34 a25 25 0 0 1 0 50 h-34" /><path d="M290 70 h-34 a25 25 0 0 0 0 50 h34" />
      </g>
      <circle cx="205" cy="80" r="12" fill="#ffd166" stroke="#7a4b00" strokeWidth="2" />
      <path d="M193 80 h24 M205 68 v24" stroke="#7a4b00" strokeWidth="2" />
    </svg>
  );
}

export function PoolArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden>
      <defs><linearGradient id="water" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#6fe0f0" /><stop offset="1" stopColor="#1fb3d1" /></linearGradient></defs>
      <rect x="8" y="20" width="304" height="150" rx="26" fill="#e9fbff" />
      <rect x="24" y="36" width="272" height="118" rx="18" fill="url(#water)" />
      <g stroke="#fff" strokeWidth="4" fill="none" strokeLinecap="round" opacity=".75">
        <path d="M44 72 q16 -10 32 0 t32 0 t32 0" /><path d="M150 112 q16 -10 32 0 t32 0 t32 0" /><path d="M60 132 q12 -8 24 0 t24 0" />
      </g>
      <g stroke="#c9d6e3" strokeWidth="5" fill="none" strokeLinecap="round"><path d="M262 30 v54 M282 30 v54" /><path d="M262 46 h20 M262 62 h20" /></g>
      <circle cx="96" cy="104" r="16" fill="#ff7aa2" /><circle cx="96" cy="104" r="7" fill="url(#water)" />
    </svg>
  );
}
