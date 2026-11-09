"use client";
/* eslint-disable @next/next/no-img-element */
import Link from "next/link";
import { usePathname } from "next/navigation";

export function FloatingOwl() {
  const path = usePathname();
  if (path.startsWith("/corujinha") || path.startsWith("/admin")) return null;
  return (
    <Link href="/corujinha" aria-label="Pergunte à Corujinha"
      className="no-print group fixed bottom-24 right-4 z-30 flex items-center gap-2 rounded-full bg-white py-1.5 pl-1.5 pr-4 shadow-xl ring-1 ring-linha transition hover:-translate-y-0.5 lg:bottom-8 lg:right-8">
      <span className="grid h-11 w-11 place-items-center overflow-hidden rounded-full bg-violeta-50">
        <img src="/corujinha/pergunta.webp" alt="" className="owl-bob h-10 w-10 object-contain" />
      </span>
      <span className="text-sm font-semibold text-violeta-700">Pergunte</span>
    </Link>
  );
}
