import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  serverExternalPackages: ["dotenv"],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // hammerjs (required by chartjs-plugin-zoom) accesses `window` at module
      // evaluation time and crashes during Next.js server-side prerendering.
      // Resolve it to an empty module on the server; the real library loads only
      // in the browser where `window` exists.
      config.resolve.alias = {
        ...config.resolve.alias,
        hammerjs: false,
      };
    }
    return config;
  },
};

export default nextConfig;
