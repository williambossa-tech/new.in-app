import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Identifica cada publicação: se o navegador estiver com uma versão antiga aberta,
  // o Next recarrega a página em vez de falhar ao chamar uma ação que mudou.
  deploymentId: process.env.RAILWAY_GIT_COMMIT_SHA || process.env.RAILWAY_DEPLOYMENT_ID || undefined,
  serverExternalPackages: ["pdfkit", "postgres"],
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
