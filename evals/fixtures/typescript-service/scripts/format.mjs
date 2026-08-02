import { readdir, readFile, writeFile } from "node:fs/promises";

const ignoredDirectories = new Set([".git", "dist", "node_modules"]);
const textExtensions = new Set([".json", ".md", ".mjs", ".ts", ".yaml", ".yml"]);
const root = new URL("../", import.meta.url);
const checkOnly = process.argv.includes("--check");
const unformatted = [];

for await (const fileURL of textFiles(root)) {
  const content = await readFile(fileURL, "utf8");
  const formatted = `${content
    .replaceAll("\r\n", "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd()}\n`;
  if (formatted !== content) {
    if (checkOnly) {
      unformatted.push(fileURL.pathname);
    } else {
      await writeFile(fileURL, formatted, "utf8");
    }
  }
}

if (unformatted.length > 0) {
  process.stderr.write(`Files need formatting:\n${unformatted.join("\n")}\n`);
  process.exitCode = 1;
}

async function* textFiles(directoryURL) {
  const entries = await readdir(directoryURL, { withFileTypes: true });
  entries.sort((left, right) => left.name.localeCompare(right.name));
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (!ignoredDirectories.has(entry.name)) {
        yield* textFiles(new URL(`${entry.name}/`, directoryURL));
      }
      continue;
    }
    const extensionIndex = entry.name.lastIndexOf(".");
    const extension = extensionIndex === -1 ? "" : entry.name.slice(extensionIndex);
    if (textExtensions.has(extension)) {
      yield new URL(entry.name, directoryURL);
    }
  }
}
