import type { NextConfig } from "next";

// React needs eval() in development for call-stack reconstruction; production never uses it.
const devEval=process.env.NODE_ENV==="production"?"":" 'unsafe-eval'";
const securityHeaders=[
  {key:"X-Content-Type-Options",value:"nosniff"},{key:"X-Frame-Options",value:"DENY"},{key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},{key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"},{key:"Cross-Origin-Opener-Policy",value:"same-origin"},
  {key:"Content-Security-Policy",value:`default-src 'self'; script-src 'self' 'unsafe-inline'${devEval}; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://api.telegram.org https://api.stripe.com https://api.resend.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self' https://checkout.stripe.com`},
];
const widgetHeaders=[
  {key:"X-Content-Type-Options",value:"nosniff"},{key:"Referrer-Policy",value:"no-referrer"},{key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"},
  {key:"Content-Security-Policy",value:"default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors *; base-uri 'none'; form-action 'self'"},
];

const config:NextConfig={
  output:"standalone",
  // The application does not use ImageResponse/next-og. Excluding it prevents
  // Next's broad server trace from adding resvg.wasm (~1.35 MiB) to the Worker.
  outputFileTracingExcludes:{"*":["node_modules/next/dist/compiled/@vercel/og/**/*",
    // The TCP Postgres driver is only used by `next dev` against a local database (see src/lib/db.ts).
    "node_modules/@prisma/adapter-pg/**/*","node_modules/pg/**/*","node_modules/pg-*/**/*","node_modules/pgpass/**/*","node_modules/postgres-*/**/*"]},
  reactStrictMode:true,
  poweredByHeader:false,
  async headers(){return[{source:"/widget/:path*",headers:widgetHeaders},{source:"/:path((?!widget(?:/|$)).*)",headers:securityHeaders}]}
};
export default config;
