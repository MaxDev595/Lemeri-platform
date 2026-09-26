import { neonConfig } from "@neondatabase/serverless";

// Local testing only: points the Neon serverless driver (used by the Cloudflare
// Worker build) at a local Neon-protocol emulator in front of a plain PostgreSQL,
// so the exact production code path can be exercised with `wrangler dev`.
// Neither variable is set in the deployed Worker, so this is a no-op there.
const httpEndpoint = process.env.NEON_LOCAL_HTTP_ENDPOINT;
const wsProxy = process.env.NEON_LOCAL_WS_PROXY;
if (httpEndpoint) neonConfig.fetchEndpoint = httpEndpoint;
if (wsProxy) {
  neonConfig.wsProxy = (host, port) => `${wsProxy}?address=${host}:${port}`;
  neonConfig.useSecureWebSocket = false;
  neonConfig.pipelineConnect = false;
  neonConfig.pipelineTLS = false;
}
