/* eslint-disable @next/next/no-img-element */
export type Pose = "ola" | "dica" | "aponta" | "pergunta" | "festa" | "silencio" | "descanso" | "surpresa";

export function Corujinha({ pose = "ola", size = 120, className = "", alt }: { pose?: Pose; size?: number; className?: string; alt?: string }) {
  return (
    <img
      src={`/corujinha/${pose}.webp`}
      width={size}
      height={size}
      alt={alt ?? "Corujinha do NEW.IN"}
      className={`select-none object-contain ${className}`}
      style={{ width: size, height: size }}
      draggable={false}
    />
  );
}
