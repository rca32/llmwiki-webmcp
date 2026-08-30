import type { NextConfig } from "next";
import { SECURITY_RESPONSE_HEADERS } from "./lib/security-policy";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  async headers() {
    return ["/", "/:path*"].map((source) => ({
      source,
      headers: SECURITY_RESPONSE_HEADERS.map(({ key, value }) => ({
        key,
        value,
      })),
    }));
  },
};

export default nextConfig;
