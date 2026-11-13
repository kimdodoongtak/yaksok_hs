import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir:
    process.env.INVITATION_BROWSER_TEST === "1" ? ".next-browser" : ".next",
};

export default nextConfig;
