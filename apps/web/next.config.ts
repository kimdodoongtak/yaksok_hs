import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: false,
  distDir:
    process.env.INVITATION_BROWSER_TEST === "1" ? ".next-browser" : ".next",
};

export default nextConfig;
