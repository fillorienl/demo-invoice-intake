import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // pdf.js and the native canvas are loaded from node_modules at runtime, not bundled
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  experimental: {
    serverActions: { bodySizeLimit: "12mb" },
  },
};

export default nextConfig;
