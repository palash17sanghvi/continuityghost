import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
