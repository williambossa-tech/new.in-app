/** Ilustração animada das salas do coworking (SVG). */
export function CoworkArt({ kind, className = "" }: { kind: "reunioes" | "mini"; className?: string }) {
  const chairs = kind === "reunioes" ? [40, 70, 100, 130, 160] : [96];
  return (
    <svg viewBox="0 0 220 140" className={className} role="img" aria-label={kind === "reunioes" ? "Sala de reuniões" : "Mini sala"}>
      <rect width="220" height="140" rx="18" fill="#eef9f7" />
      <rect y="108" width="220" height="32" fill="#d9f2ee" />
      {/* quadro/tela */}
      <rect x={kind === "reunioes" ? 70 : 138} y="16" width={kind === "reunioes" ? 80 : 56} height="40" rx="6" fill="#1d2b4f" />
      <rect x={kind === "reunioes" ? 76 : 144} y="22" width={kind === "reunioes" ? 68 : 44} height="28" rx="3" fill="#6a3df5" className="cw-screen" />
      <path d={kind === "reunioes" ? "M84 42 l10 -8 l10 5 l14 -12 l14 9" : "M150 42 l8 -7 l8 4 l10 -9"} stroke="#ffc83d" strokeWidth="2.5" fill="none" strokeLinecap="round" className="cw-chart" />
      {/* planta */}
      <g transform="translate(18 62)">
        <path d="M10 0 q-8 -10 -2 -22 q6 10 2 22 M10 0 q8 -12 16 -14 q-4 12 -16 14" fill="#4cc26b" className="cw-plant" />
        <rect x="2" y="0" width="16" height="16" rx="3" fill="#ff6b5b" />
      </g>
      {/* mesa */}
      {kind === "reunioes" ? (
        <>
          {chairs.map((x, i) => <rect key={i} x={x - 9} y="70" width="18" height="16" rx="5" fill="#17b5a6" className="cw-chair" style={{ animationDelay: `${i * 0.15}s` }} />)}
          <rect x="26" y="82" width="168" height="14" rx="7" fill="#5627e0" />
          <rect x="40" y="96" width="6" height="14" rx="2" fill="#5627e0" /><rect x="174" y="96" width="6" height="14" rx="2" fill="#5627e0" />
          <circle cx="110" cy="80" r="4" fill="#ffc83d" className="cw-dot" />
        </>
      ) : (
        <>
          <rect x="84" y="70" width="18" height="16" rx="5" fill="#17b5a6" className="cw-chair" />
          <rect x="118" y="70" width="18" height="16" rx="5" fill="#17b5a6" className="cw-chair" style={{ animationDelay: "0.2s" }} />
          <rect x="72" y="82" width="76" height="14" rx="7" fill="#5627e0" />
          <rect x="84" y="96" width="6" height="14" rx="2" fill="#5627e0" /><rect x="130" y="96" width="6" height="14" rx="2" fill="#5627e0" />
          <rect x="100" y="74" width="20" height="9" rx="2" fill="#2b2f45" />
        </>
      )}
    </svg>
  );
}
