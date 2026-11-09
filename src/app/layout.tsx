import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "NEW.IN Reservas", template: "%s · NEW.IN Reservas" },
  description: "Reservas de espaços, Be My Guest e sorteios dos salões do Condomínio NEW.IN — Curitiba/PR.",
  icons: { icon: "/corujinha/ola.webp", apple: "/corujinha/ola.webp" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#6c5ce7",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
