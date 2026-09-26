// Copies the browser build of pdf.js into public/ so PDF text is extracted in the
// user's browser. Keeping pdf.js out of the server keeps the Cloudflare Worker
// under the 3 MiB (free plan) size limit.
import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const root = dirname(require.resolve("pdfjs-dist/package.json"));
const target = join(process.cwd(), "public", "vendor", "pdfjs");
mkdirSync(target, { recursive: true });
for (const file of ["pdf.min.mjs", "pdf.worker.min.mjs"]) copyFileSync(join(root, "legacy", "build", file), join(target, file));
