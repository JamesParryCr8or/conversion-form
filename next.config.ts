import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
];

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  async headers() {
    // Later entries override earlier ones for the same key.
    // Default: nothing can frame us (admin, login, dashboard) -> clickjacking protection.
    // Public forms (/f/*) may be embedded anywhere. Per-form allowed-domain lists need a
    // request-time proxy and are tracked in to-do.md section 4c.
    // NB: no X-Frame-Options anywhere, it would override frame-ancestors for embeds.
    return [
      {
        source: "/:path*",
        headers: [...securityHeaders, { key: "Content-Security-Policy", value: "frame-ancestors 'none'" }],
      },
      {
        source: "/f/:path*",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors *" }],
      },
    ];
  },
};

export default nextConfig;
