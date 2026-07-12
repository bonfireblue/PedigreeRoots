import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Force clean build - cache bust v2
  cleanDistDir: true,
};

export default nextConfig;
