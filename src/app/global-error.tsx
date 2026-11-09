"use client";

export default function GlobalError() {
  return (
    <html lang="pt-BR">
      <body style={{ fontFamily: "system-ui, sans-serif", background: "#f7f6fd", color: "#1d2b4f", display: "grid", placeItems: "center", minHeight: "100dvh", margin: 0 }}>
        <div style={{ textAlign: "center", padding: 24 }}>
          <p style={{ fontSize: 20, fontWeight: 600 }}>O aplicativo foi atualizado</p>
          <p style={{ opacity: 0.75 }}>Recarregue a página para continuar.</p>
          <button onClick={() => window.location.reload()} style={{ marginTop: 16, background: "#6a3df5", color: "white", border: 0, borderRadius: 999, padding: "12px 24px", fontSize: 16, fontWeight: 600 }}>
            Recarregar
          </button>
        </div>
      </body>
    </html>
  );
}
