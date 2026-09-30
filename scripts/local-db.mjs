// Local development database. The real code and its dependencies live in
// scripts/local-db-runtime (a separate package), so PGlite never ends up in
// the root node_modules and never reaches the Cloudflare Worker bundle.
//   cd scripts/local-db-runtime && npm install   (once)
//   node scripts/local-db.mjs
import "./local-db-runtime/index.mjs";
