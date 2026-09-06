import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["@zvec/zvec", "mysql2"],
  output: "standalone"
};

export default nextConfig;

// Enable a smoother local dev experience with OpenNext on Cloudflare.
// This is safe to keep in source control; it only affects `next dev`.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
