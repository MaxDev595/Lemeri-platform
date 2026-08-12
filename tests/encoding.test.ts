import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const extensions=new Set([".ts",".tsx",".css",".sql"]);
const suspicious=["\u0420\u045f","\u0421\u0453","\u0432\u0402","\u0412\u00b7","\u0432\u045a"];
function sourceFiles(path:string):string[]{return readdirSync(path,{withFileTypes:true}).flatMap(entry=>{const file=join(path,entry.name);if(entry.isDirectory())return sourceFiles(file);const dot=entry.name.lastIndexOf(".");return extensions.has(dot>=0?entry.name.slice(dot):"")?[file]:[]})}

test("source files contain no common UTF-8 mojibake sequences",()=>{
  const damaged=sourceFiles("src").filter(file=>suspicious.some(marker=>readFileSync(file,"utf8").includes(marker)));
  assert.deepEqual(damaged,[]);
});
