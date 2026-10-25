import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only badge: keep it off the mobile header.
  devIndicators: { position: "bottom-right" },
};

export default nextConfig;
