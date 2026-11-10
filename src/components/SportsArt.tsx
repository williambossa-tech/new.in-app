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

export function SuiteArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden>
      <defs><linearGradient id="suite" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#7b5cff" /><stop offset="1" stopColor="#4a25d8" /></linearGradient></defs>
      <rect x="8" y="20" width="304" height="150" rx="22" fill="url(#suite)" />
      <rect x="196" y="38" width="88" height="62" rx="10" fill="#2a1580" />
      <circle cx="252" cy="62" r="11" fill="#ffe08a" /><circle cx="257" cy="58" r="10" fill="#2a1580" />
      <g fill="#fff" opacity=".85"><circle cx="214" cy="52" r="1.8" /><circle cx="230" cy="80" r="1.5" /><circle cx="270" cy="86" r="1.8" /></g>
      <line x1="240" y1="38" x2="240" y2="100" stroke="#7b5cff" strokeWidth="3" />
      <rect x="34" y="104" width="196" height="44" rx="12" fill="#ff8a7a" />
      <rect x="34" y="94" width="196" height="22" rx="10" fill="#fff" />
      <rect x="44" y="78" width="54" height="26" rx="10" fill="#fff" /><rect x="106" y="78" width="54" height="26" rx="10" fill="#f1edff" />
      <rect x="28" y="70" width="10" height="84" rx="5" fill="#2a1580" />
      <rect x="40" y="148" width="8" height="12" rx="3" fill="#2a1580" /><rect x="216" y="148" width="8" height="12" rx="3" fill="#2a1580" />
    </svg>
  );
}

export function DeskArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden>
      <defs><linearGradient id="desk" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#25cdb9" /><stop offset="1" stopColor="#0e8c80" /></linearGradient></defs>
      <rect x="8" y="20" width="304" height="150" rx="22" fill="url(#desk)" />
      <rect x="40" y="118" width="240" height="12" rx="6" fill="#fff" />
      <rect x="58" y="130" width="8" height="30" rx="3" fill="#e6fbf8" /><rect x="254" y="130" width="8" height="30" rx="3" fill="#e6fbf8" />
      <rect x="112" y="60" width="96" height="58" rx="8" fill="#1b2150" />
      <rect x="118" y="66" width="84" height="46" rx="5" fill="#2c3570" />
      <circle cx="160" cy="89" r="10" fill="#6a3df5" /><text x="160" y="93.5" textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff" fontFamily="sans-serif">N</text>
      <rect x="100" y="112" width="120" height="6" rx="3" fill="#c9d6e3" />
      <rect x="232" y="96" width="20" height="22" rx="5" fill="#ff8a7a" /><path d="M252 102 h5 a5 5 0 0 1 0 10 h-5" stroke="#ff8a7a" strokeWidth="3" fill="none" />
      <rect x="62" y="98" width="20" height="20" rx="4" fill="#ffd166" />
      <path d="M72 98 C 62 80, 58 72, 66 64 M72 98 C 76 82, 84 74, 88 70 M72 98 C 70 86, 72 76, 74 70" stroke="#e6fbf8" strokeWidth="4" fill="none" strokeLinecap="round" />
    </svg>
  );
}

export function CalendarArt({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 320 180" className={className} aria-hidden>
      <rect x="8" y="20" width="304" height="150" rx="22" fill="#f1edff" />
      <rect x="92" y="34" width="136" height="122" rx="16" fill="#fff" stroke="#e4ddff" strokeWidth="2" />
      <rect x="92" y="34" width="136" height="30" rx="16" fill="#6a3df5" /><rect x="92" y="50" width="136" height="14" fill="#6a3df5" />
      <rect x="118" y="26" width="8" height="18" rx="4" fill="#4a25d8" /><rect x="194" y="26" width="8" height="18" rx="4" fill="#4a25d8" />
      <g fill="#e4ddff">
        {[0, 1, 2, 3, 4].map((c) => [0, 1, 2].map((r) => <rect key={`${c}-${r}`} x={104 + c * 24} y={76 + r * 24} width="16" height="16" rx="5" />))}
      </g>
      <rect x="152" y="100" width="16" height="16" rx="5" fill="#12c3b0" />
      <path d="M155 108 l3.5 3.5 l6 -7" stroke="#fff" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="252" cy="132" r="18" fill="#ffd166" /><path d="M244 132 l6 6 l10 -12" stroke="#7a4b00" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
