import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
