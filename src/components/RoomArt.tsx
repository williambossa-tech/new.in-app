/** Ilustração animada de uma suíte do Be My Guest (SVG puro). */
export function RoomArt({ n, busy, className = "" }: { n: 1 | 2; busy: boolean; className?: string }) {
  const sky = n === 1 ? ["#3b1fa8", "#6a3df5"] : ["#1d2b4f", "#3f17b0"];
  const id = `room${n}`;
  return (
    <svg viewBox="0 0 220 140" className={className} role="img" aria-label={`Ilustração da suíte ${n}`}>
      <defs>
        <linearGradient id={`${id}-sky`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={sky[0]} />
          <stop offset="1" stopColor={sky[1]} />
        </linearGradient>
        <radialGradient id={`${id}-glow`} cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ffc83d" stopOpacity="0.85" />
          <stop offset="1" stopColor="#ffc83d" stopOpacity="0" />
        </radialGradient>
      </defs>
      {/* parede e piso */}
      <rect x="0" y="0" width="220" height="140" rx="18" fill="#f3efff" />
      <rect x="0" y="108" width="220" height="32" rx="0" fill="#e4dbff" />
      {/* janela com céu noturno */}
      <g>
        <rect x="128" y="18" width="70" height="56" rx="10" fill={`url(#${id}-sky)`} />
        <circle cx="180" cy="33" r="8" fill="#fff7e0" className="room-moon" />
        <circle cx="176" cy="31" r="7" fill={sky[0]} opacity="0.55" />
        {[[142, 30, 0], [158, 44, 0.6], [146, 58, 1.2], [168, 60, 1.8], [190, 54, 0.9]].map(([x, y, d], i) => (
          <circle key={i} cx={x} cy={y} r="1.6" fill="white" className="room-star" style={{ animationDelay: `${d}s` }} />
        ))}
        <rect x="161" y="18" width="4" height="56" fill="#f3efff" />
        <rect x="128" y="44" width="70" height="4" fill="#f3efff" />
      </g>
      {/* abajur */}
      <g>
        {!busy && <circle cx="34" cy="62" r="30" fill={`url(#${id}-glow)`} className="room-lamp" />}
        <rect x="30" y="74" width="8" height="34" rx="3" fill="#5627e0" />
        <path d="M20 74 L48 74 L42 56 L26 56 Z" fill={busy ? "#c9c1f0" : "#ffc83d"} />
      </g>
      {/* cama */}
      <g>
        <rect x="58" y="70" width="10" height="44" rx="4" fill="#5627e0" />
        <rect x="64" y="84" width="104" height="22" rx="8" fill="white" />
        <rect x="70" y="76" width="28" height="14" rx="7" fill="#ffffff" stroke="#e4dbff" strokeWidth="2" />
        <rect x="96" y="80" width="72" height="26" rx="8" fill="#17b5a6" />
        <rect x="96" y="80" width="72" height="6" rx="3" fill="#13a091" />
        <rect x="64" y="104" width="6" height="10" rx="2" fill="#5627e0" />
        <rect x="162" y="104" width="6" height="10" rx="2" fill="#5627e0" />
      </g>
      {busy && (
        <g className="room-zz" fill="#6a3df5" fontWeight="700" fontFamily="inherit">
          <text x="112" y="66" fontSize="14">z</text>
          <text x="122" y="56" fontSize="18">Z</text>
        </g>
      )}
      {/* número da suíte */}
      <circle cx="26" cy="26" r="15" fill="white" />
      <text x="26" y="32" textAnchor="middle" fontSize="17" fontWeight="700" fill="#5627e0" fontFamily="inherit">{n}</text>
    </svg>
  );
}
