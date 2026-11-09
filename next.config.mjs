import createNextIntlPlugin from "next-intl/plugin";

// A plain .mjs file on purpose: next.config.ts needs the TypeScript compiler when the server starts, and the
// production image installs no dev dependencies.

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const securityHeaders = [
  // Browsers ignore this over http, so local and e2e runs are unaffected. No preload: that is a separate, hard-to-undo decision.
  { key: "Strict-Transport-Security", value: "max-age=31536000" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(self), geolocation=()" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'" },
];

/** @type {import("next").NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // pdfkit reads its font metrics and ffmpeg-static points at its binary from their own folders; keep them out of the bundle.
  serverExternalPackages: ["pdfkit", "ffmpeg-static", "archiver"],
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default withNextIntl(nextConfig);