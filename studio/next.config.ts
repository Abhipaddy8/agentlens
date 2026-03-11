import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Studio API endpoint — configurable via env
  env: {
    STUDIO_API_URL: process.env.STUDIO_API_URL || "http://localhost:3001",
  },
};

export default nextConfig;
