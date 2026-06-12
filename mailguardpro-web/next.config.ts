import type { NextConfig } from "next";
import path from "path";
import { logger } from "./lib/logger";

const nodeBuiltins = [
  "_http_agent",
  "_http_client",
  "_http_common",
  "_http_incoming",
  "_http_outgoing",
  "_http_server",
  "_stream_duplex",
  "_stream_passthrough",
  "_stream_readable",
  "_stream_transform",
  "_stream_wrap",
  "_stream_writable",
  "_tls_common",
  "_tls_wrap",
  "assert",
  "assert/strict",
  "async_hooks",
  "buffer",
  "child_process",
  "cluster",
  "console",
  "constants",
  "crypto",
  "dgram",
  "diagnostics_channel",
  "dns",
  "dns/promises",
  "domain",
  "events",
  "fs",
  "fs/promises",
  "http",
  "http2",
  "https",
  "inspector",
  "module",
  "net",
  "os",
  "path",
  "path/posix",
  "path/win32",
  "perf_hooks",
  "process",
  "punycode",
  "querystring",
  "readline",
  "repl",
  "stream",
  "stream/consumers",
  "stream/promises",
  "stream/web",
  "string_decoder",
  "sys",
  "timers",
  "timers/promises",
  "tls",
  "trace_events",
  "tty",
  "url",
  "util",
  "util/types",
  "v8",
  "vm",
  "wasi",
  "worker_threads",
  "zlib",
];

// Bundle Analyzer - Run with ANALYZE=true npm run build
// npm install --save-dev @next/bundle-analyzer
const nextConfig: NextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Resolve .prisma/client to generated Prisma client
      config.resolve = config.resolve || {};
      config.resolve.alias = {
        ...config.resolve.alias,
        ".prisma/client": path.resolve(__dirname, "node_modules/.prisma/client"),
      };

      // Server-side bundles should not try to bundle Node.js built-ins
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : []),
        (
          { request }: { request: string },
          callback: (err?: Error | null, result?: string) => void,
        ) => {
          if (request && nodeBuiltins.includes(request)) {
            return callback(null, `commonjs ${request}`);
          }
          if (request && request.startsWith("@prisma/client")) {
            return callback(null, `commonjs ${request}`);
          }
          if (request === "pg-native") {
            return callback(null, `commonjs ${request}`);
          }
          callback();
        },
      ];
    }
    return config;
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
      {
        protocol: "https",
        hostname: "avatars.githubusercontent.com",
      },
    ],
  },
  async headers() {
    return [
      {
        // Apply these headers to all routes
        source: "/(.*)",
        headers: [
          // DNS prefetch control
          {
            key: "X-DNS-Prefetch-Control",
            value: "on",
          },
          // Prevent clickjacking
          {
            key: "X-Frame-Options",
            value: "SAMEORIGIN",
          },
          // Prevent MIME type sniffing
          {
            key: "X-Content-Type-Options",
            value: "nosniff",
          },
          // Referrer policy
          {
            key: "Referrer-Policy",
            value: "strict-origin-when-cross-origin",
          },
          // Feature policy - disable unused browser features
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(self)",
          },
          // XSS protection (legacy but still useful)
          {
            key: "X-XSS-Protection",
            value: "1; mode=block",
          },
          // HSTS - only enable in production
          ...(process.env.NODE_ENV === "production"
            ? [
                {
                  key: "Strict-Transport-Security",
                  value: "max-age=31536000; includeSubDomains; preload",
                },
              ]
            : []),
        ],
      },
      {
        // API routes specific headers
        source: "/api/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0",
          },
          {
            key: "Pragma",
            value: "no-cache",
          },
          {
            key: "Expires",
            value: "0",
          },
        ],
      },
      {
        // Static files - allow caching
        source: "/_next/static/(.*)",
        headers: [
          {
            key: "Cache-Control",
            value: "public, max-age=31536000, immutable",
          },
        ],
      },
    ];
  },
};

// Bundle Analyzer wrapper - only activates when ANALYZE=true
let finalConfig = nextConfig;
try {
  const withBundleAnalyzer = require("@next/bundle-analyzer");
  finalConfig = withBundleAnalyzer({
    enabled: process.env.ANALYZE === "true",
  })(nextConfig);
} catch {
  // Bundle analyzer not installed, skip silently
  logger.info("Tip: Install @next/bundle-analyzer for bundle analysis");
}

export default finalConfig;
