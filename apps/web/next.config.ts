import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const API_URL = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // The browser only ever talks to this app's origin; /api/* is proxied
  // server-side to the NestJS API. Keeps auth cookies first-party
  // (onrender.com is on the Public Suffix List — subdomains are cross-site).
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${API_URL}/:path*` }];
  },
};

export default withNextIntl(nextConfig);
