import type { NextConfig } from "next";

// React needs eval() in development for call-stack reconstruction; production never uses it.
const devEval=process.env.NODE_ENV==="production"?"":" 'unsafe-eval'";
const securityHeaders=[
  {key:"X-Content-Type-Options",value:"nosniff"},{key:"X-Frame-Options",value:"DENY"},{key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},{key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"},{key:"Cross-Origin-Opener-Policy",value:"same-origin"},
  {key:"Content-Security-Policy",value:`default-src 'self'; script-src 'self' 'unsafe-inline'${devEval}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://api.telegram.org https://api.stripe.com https://api.resend.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com`},
];
const widgetHeaders=[
  {key:"X-Content-Type-Options",value:"nosniff"},{key:"Referrer-Policy",value:"no-referrer"},{key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"},
  {key:"Content-Security-Policy",value:`default-src 'self'; script-src 'self' 'unsafe-inline'${devEval}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors *; base-uri 'none'; form-action 'self'`},
];

const config:NextConfig={
  output:"standalone",
  // The application does not use ImageResponse/next-og. Excluding it prevents
  // Next's broad server trace from adding resvg.wasm (~1.35 MiB) to the Worker.
  outputFileTracingExcludes:{"*":["node_modules/next/dist/compiled/@vercel/og/**/*",
    // The TCP Postgres driver is only used by `next dev` against a local database (see src/lib/db.ts).
    "node_modules/@prisma/adapter-pg/**/*","node_modules/pg/**/*","node_modules/pg-*/**/*","node_modules/pgpass/**/*","node_modules/postgres-*/**/*",
    // Prisma CLI / engines (schema engine, per-database query engines) are build tools. The
    // Worker only needs the generated client's own query compiler in src/generated/prisma.
    // Since OpenNext statically bundles every traced .wasm, leaving them in pushed the Worker
    // far beyond Cloudflare's size limit.
    "node_modules/prisma/**/*","node_modules/@prisma/engines/**/*","node_modules/@prisma/prisma-schema-wasm/**/*","node_modules/@prisma/query-compiler-wasm/**/*","node_modules/@prisma/query-engine-wasm/**/*",
    // Build/dev tooling that must never ship in the server bundle.
    "node_modules/wrangler/**/*","node_modules/miniflare/**/*","node_modules/@cloudflare/workerd-*/**/*","node_modules/blake3-wasm/**/*","node_modules/@opennextjs/cloudflare/dist/cli/**/*",
    // pdf.js runs only in the browser (served from public/vendor/pdfjs).
    "node_modules/pdfjs-dist/**/*"]},
  reactStrictMode:true,
  poweredByHeader:false,
  async headers(){return[{source:"/widget/:path*",headers:widgetHeaders},{source:"/:path((?!widget(?:/|$)).*)",headers:securityHeaders}]}
};
export default config;
