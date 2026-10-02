// Post-build: replace WebAssembly files that ship inside Next's compiled dev/test
// tooling with an empty module. Wrangler would otherwise upload them with the
// Worker (~40 KiB gzip) although production never loads them:
//  - source-map08/mappings.wasm   → only used by the dev-server error overlay
//  - @mswjs/interceptors llhttp   → only used by Next's experimental test mode
import { existsSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const base = ".open-next/server-functions/default/node_modules/next/dist/compiled";
const targets = ["source-map08/mappings.wasm", "@mswjs/interceptors/ClientRequest/llhttp/llhttp.wasm"];
const emptyModule = Uint8Array.from([0x00, 0x61, 0x73, 0x6d, 0x01, 0x00, 0x00, 0x00]);
let saved = 0;
for (const target of targets) {
  const file = join(base, target);
  if (!existsSync(file)) continue;
  saved += statSync(file).size;
  writeFileSync(file, emptyModule);
}
console.log(`slim-worker: stubbed unused wasm (${Math.round(saved / 1024)} KiB)`);
