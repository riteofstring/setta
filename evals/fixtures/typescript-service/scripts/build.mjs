import { mkdir, readFile, writeFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";

const sourceURL = new URL("../src/server.ts", import.meta.url);
const outputURL = new URL("../dist/server.js", import.meta.url);
const source = await readFile(sourceURL, "utf8");
const output = stripTypeScriptTypes(source, {
  mode: "strip",
  sourceMap: false,
  sourceUrl: sourceURL.href,
});

await mkdir(new URL("../dist/", import.meta.url), { recursive: true });
await writeFile(outputURL, output, "utf8");
