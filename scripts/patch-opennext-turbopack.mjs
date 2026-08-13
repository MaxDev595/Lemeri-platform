import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const target = fileURLToPath(
  new URL(
    "../node_modules/@opennextjs/cloudflare/dist/cli/build/patches/plugins/turbopack.js",
    import.meta.url,
  ),
);

const source = await readFile(target, "utf8");
const oldFilter = "contentFilter: /loadRuntimeChunkPath/,";
const newFilter = "contentFilter: /loadWebAssemblyModule/,";

if (source.includes(oldFilter)) {
  await writeFile(target, source.replace(oldFilter, newFilter));
  console.log("Patched OpenNext Turbopack WASM detection for Next.js 16.3");
} else if (!source.includes(newFilter)) {
  throw new Error("Unsupported OpenNext Turbopack patch layout");
}
