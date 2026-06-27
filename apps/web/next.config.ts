import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  transpilePackages: ["@masmis/db", "@masmis/shared", "@masmis/ai"]
};

export default nextConfig;
