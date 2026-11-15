import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Embedded PostgreSQL (local demo persistence) ships WASM assets; load it from node_modules, not the bundle.
  serverExternalPackages: ['@electric-sql/pglite'],
  /* No prerender caching: health and analysis are request-scoped. */
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
