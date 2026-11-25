import type { NextConfig } from "next";

const supabase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const dev = process.env.NODE_ENV === "development";

// CSP sem nonce: nonce obriga a renderizar toda página na hora e não combina com cacheComponents.
// Os scripts inline são os do Next e o do tema em layout.tsx. Fotos e áudios vêm por URL
// assinada do Supabase, e o quadro ao vivo usa o realtime dele (websocket).
const csp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  `img-src 'self' data: blob: ${supabase}`,
  `media-src 'self' blob: ${supabase}`,
  `connect-src 'self' blob: ${supabase} ${supabase.replace(/^http/, "ws")}`,
  "font-src 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  // Só em desenvolvimento: outro aparelho da mesma rede abre o painel por estes IPs (ZELAR_DEV_ORIGINS, separados por vírgula).
  allowedDevOrigins: (process.env.ZELAR_DEV_ORIGINS ?? "").split(",").map((o) => o.trim()).filter(Boolean),
  // Foto do funcionário vai pelo formulário (até 4 MB, conferido na ação).
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  poweredByHeader: false,
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        // Câmera liberada para o próprio painel: a foto do funcionário pode ser tirada na hora.
        { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=()" },
        { key: "Content-Security-Policy", value: csp },
      ],
    },
  ],
};

export default nextConfig;
