import type { NextConfig } from "next";

function hostnameOf(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    return new URL(value).hostname;
  } catch {
    return value;
  }
}

const r2Host = hostnameOf(process.env.R2_PUBLIC_HOSTNAME);
const bunnyHost = hostnameOf(process.env.BUNNY_CDN_HOST);

const remoteHosts = [r2Host, bunnyHost].filter((h): h is string => Boolean(h));

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Self-contained runtime bundle (.next/standalone) — keeps the Docker image
  // lean and avoids shipping the full node_modules tree to Coolify.
  output: "standalone",
  images: {
    remotePatterns: [
      ...remoteHosts.map((hostname) => ({ protocol: "https" as const, hostname })),
      { protocol: "https" as const, hostname: "cdn.jwplayer.com" },
    ],
  },
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
