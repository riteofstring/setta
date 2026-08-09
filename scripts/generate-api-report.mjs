import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { repositoryRoot, runPnpm } from "./lib/process.mjs";

runPnpm(["run", "build:package"]);

const declarationsDirectory = path.join(repositoryRoot, "packages/workspace/dist");
const packageManifest = JSON.parse(
  readFileSync(path.join(repositoryRoot, "packages/workspace/package.json"), "utf8"),
);

function packageSpecifier(exportKey) {
  return exportKey === "."
    ? packageManifest.name
    : `${packageManifest.name}/${exportKey.replace(/^\.\//u, "")}`;
}

function exportTarget(exportValue, condition) {
  if (typeof exportValue === "string") {
    return condition === "import" ? exportValue : null;
  }
  if (exportValue === null || typeof exportValue !== "object") {
    return null;
  }
  const target = exportValue[condition];
  return typeof target === "string" ? target : null;
}

function reportCell(value) {
  return value === null ? "—" : `\`${value}\``;
}

const entrypointRows = Object.entries(packageManifest.exports).map(
  ([exportKey, exportValue]) =>
    `| \`${packageSpecifier(exportKey)}\` | ${reportCell(exportTarget(exportValue, "types"))} | ${reportCell(exportTarget(exportValue, "import"))} |`,
);
const declarationEntrypoints = Object.values(packageManifest.exports).flatMap((exportValue) => {
  if (
    typeof exportValue !== "object" ||
    exportValue === null ||
    typeof exportValue.types !== "string"
  ) {
    return [];
  }
  const relativeTarget = exportValue.types.replace(/^\.\/dist\//u, "");
  return relativeTarget.endsWith(".d.ts") ? [relativeTarget] : [];
});

function relativeDeclarationImports(contents) {
  const specifiers = [...contents.matchAll(/(?:from\s+|import\s*\(\s*)["'](\.[^"']+)["']/gu)].map(
    (match) => match[1],
  );
  return specifiers.filter((specifier) => specifier.endsWith(".js"));
}

function declarationClosure(entrypoints) {
  const pending = [...entrypoints];
  const visited = new Set();
  while (pending.length > 0) {
    const relativeFile = pending.pop();
    if (!relativeFile || visited.has(relativeFile)) {
      continue;
    }
    const absoluteFile = path.resolve(declarationsDirectory, relativeFile);
    if (
      !absoluteFile.startsWith(`${declarationsDirectory}${path.sep}`) ||
      !existsSync(absoluteFile)
    ) {
      throw new Error(`Public declaration reference is missing or escapes dist: ${relativeFile}`);
    }
    visited.add(relativeFile);
    const contents = readFileSync(absoluteFile, "utf8");
    if (/@(?:xyflow|dnd-kit)\//u.test(contents)) {
      throw new Error(`Public declaration closure leaks an upstream adapter type: ${relativeFile}`);
    }
    for (const specifier of relativeDeclarationImports(contents)) {
      const dependency = path
        .normalize(path.join(path.dirname(relativeFile), specifier.replace(/\.js$/u, ".d.ts")))
        .split(path.sep)
        .join("/");
      pending.push(dependency);
    }
  }
  return [...visited].sort();
}

const declarationFiles = declarationClosure(declarationEntrypoints);
const report = declarationFiles
  .map((name) => `### ${name}\n\n${readFileSync(path.join(declarationsDirectory, name), "utf8")}`)
  .join("\n");
const reportsDirectory = path.join(repositoryRoot, ".reports");
mkdirSync(reportsDirectory, { recursive: true });
writeFileSync(
  path.join(reportsDirectory, "public-api.md"),
  `# Generated public API review\n\n${packageManifest.description}\n\nThis file is a human-review artifact generated from the built package. It is not a compatibility promise or a checked-in API snapshot.\n\n## Declared package entry points\n\n| Specifier | Types | Import |\n| --- | --- | --- |\n${entrypointRows.join("\n")}\n\n## Declaration closure (${String(declarationFiles.length)} files)\n\n${report}`,
);

console.log("Generated .reports/public-api.md.");
