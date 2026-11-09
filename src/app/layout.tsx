/* eslint-disable @next/next/no-img-element */
import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "NEW.IN Comunidade", template: "%s · NEW.IN" },
  description: "A comunidade do Condomínio NEW.IN — eventos, sorteios e reservas.",
  icons: { icon: "/corujinha/ola.webp", apple: "/corujinha/ola.webp" },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#6a3df5",
  width: "device-width",
  initialScale: 1,
};

// Mostra a abertura uma vez por sessão; nas próximas páginas ela já nasce oculta (sem piscar).
const splashScript = `try{if(sessionStorage.getItem('newin-splash')){document.documentElement.classList.add('no-splash')}else{sessionStorage.setItem('newin-splash','1')}}catch(e){}`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: splashScript }} />
      </head>
      <body className="min-h-dvh">
        <div id="splash" aria-hidden="true">
          <div className="splash-ring" />
          <img src="/corujinha/ola.webp" alt="" width={170} height={170} className="splash-owl" style={{ width: 170, height: 170, objectFit: "contain" }} />
          <div className="splash-brand">
            <p style={{ fontSize: 30, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.1 }}>NEW.IN</p>
            <p style={{ fontSize: 15, opacity: 0.8 }}>Comunidade</p>
          </div>
        </div>
        {children}
      </body>
    </html>
  );
}
