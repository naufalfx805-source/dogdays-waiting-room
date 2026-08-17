import type { NextConfig } from "next";

// STATIC_EXPORT=1 builds the GitHub Pages copy: no server, no API routes.
// BASE_PATH is the repo name, because project pages are served from a subpath.
const isStatic = process.env.STATIC_EXPORT === "1";

const nextConfig: NextConfig = {
  ...(isStatic
    ? {
        output: "export",
        basePath: process.env.BASE_PATH || "",
        images: { unoptimized: true },
      }
    : {}),
};

export default nextConfig;
