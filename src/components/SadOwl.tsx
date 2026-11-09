/* eslint-disable @next/next/no-img-element */
/** Corujinha triste: olhos fechados, nuvenzinha e uma lágrima. */
export function SadOwl({ size = 110 }: { size?: number }) {
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} aria-hidden>
      <svg viewBox="0 0 60 30" className="sad-cloud absolute -top-[8%] left-1/2 w-[55%] -translate-x-1/2">
        <path d="M14 24 h32 a8 8 0 0 0 0 -16 a11 11 0 0 0 -21 -2 a8 8 0 0 0 -11 18z" fill="#c9cfe0" />
        <path d="M22 26 l-2 4 M32 26 l-2 4 M42 26 l-2 4" stroke="#8ab4f8" strokeWidth="2" strokeLinecap="round" className="sad-rain" />
      </svg>
      <img src="/corujinha/descanso.webp" alt="" className="absolute bottom-0 left-1/2 w-[82%] -translate-x-1/2 grayscale-[35%]" />
      <svg viewBox="0 0 10 14" className="sad-tear absolute left-[38%] top-[48%] w-[7%]">
        <path d="M5 0 C5 0 0 7 0 9.5 A5 4.5 0 0 0 10 9.5 C10 7 5 0 5 0z" fill="#5aa9f2" />
      </svg>
    </div>
  );
}
