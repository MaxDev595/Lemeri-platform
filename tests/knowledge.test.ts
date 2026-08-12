import assert from "node:assert/strict";
import test from "node:test";
import { chunkText } from "../src/lib/knowledge/chunk.ts";
import { extractDocumentText } from "../src/lib/knowledge/documents.ts";
import { isAllowedByRobots, parseRobots } from "../src/lib/knowledge/robots.ts";
test("knowledge chunking preserves content and bounds long paragraphs",()=>{const chunks=chunkText(`Первый раздел\n\n${"длинный ".repeat(300)}`,120);assert.ok(chunks.length>2);assert.ok(chunks.every(chunk=>chunk.length<=900));assert.match(chunks.join(" "),/Первый раздел/)});
test("plain knowledge documents are decoded without persistence",async()=>{assert.equal(await extractDocumentText("prices.txt",Buffer.from("Консультация стоит 3 000 тенге.")),"Консультация стоит 3 000 тенге.");await assert.rejects(()=>extractDocumentText("virus.exe",Buffer.from("not allowed content")),/UNSUPPORTED_DOCUMENT_TYPE/)});
test("website ingestion honors the most specific robots.txt rule",()=>{const rules=parseRobots("User-agent: *\nDisallow: /private\nAllow: /private/public\n");assert.equal(isAllowedByRobots(new URL("https://example.com/private/report"),rules),false);assert.equal(isAllowedByRobots(new URL("https://example.com/private/public/page"),rules),true);assert.equal(isAllowedByRobots(new URL("https://example.com/help"),rules),true)});
