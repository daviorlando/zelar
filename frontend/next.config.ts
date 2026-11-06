import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Só em desenvolvimento: deixa outro aparelho da mesma rede abrir o painel por este IP.
  allowedDevOrigins: ["192.168.1.18"],
  // Foto do funcionário vai pelo formulário (até 4 MB, conferido na ação).
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
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
};

export default nextConfig;
