import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactCompiler: true,
  async rewrites() {
    return [
      {
        source: "/.well-known/oauth-protected-resource/mcp",
        destination: "/oauth/protected-resource",
      },
      {
        source: "/.well-known/oauth-authorization-server",
        destination: "/oauth/authorization-server",
      },
    ];
  },
};

export default nextConfig;
