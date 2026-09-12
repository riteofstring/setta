import { readFile, writeFile } from "node:fs/promises";

import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";

const check = process.argv.slice(2).includes("--check");
if (process.argv.length > (check ? 3 : 2)) {
  throw new Error("compile-validators accepts only --check");
}

const projectSchemaPath = new URL(
  "../backend/internal/contracts/testdata/project-v1.schema.json",
  import.meta.url,
);
const snapshotSchemaPath = new URL(
  "../backend/internal/contracts/testdata/snapshot-v1.schema.json",
  import.meta.url,
);
const outputPath = new URL(
  "../src/backend/generatedValidators.js",
  import.meta.url,
);
const declarationPath = new URL(
  "../src/backend/generatedValidators.d.ts",
  import.meta.url,
);

const [projectSchema, snapshotSchema] = await Promise.all(
  [projectSchemaPath, snapshotSchemaPath].map(async (path) =>
    JSON.parse(await readFile(path, "utf8")),
  ),
);
const ajv = new Ajv2020({
  allErrors: true,
  code: { esm: true, source: true },
  strict: true,
});
ajv.addSchema(projectSchema, "project");
ajv.addSchema(snapshotSchema, "snapshot");
const standalone = standaloneCode(ajv, {
  validateApplicationSnapshotDocument: "snapshot",
  validateProjectDocument: "project",
});
const browserStandalone = standalone.replace(
  /const (func\d+) = require\("ajv\/dist\/runtime\/ucs2length"\)\.default;/gu,
  "const $1 = ucs2Length;",
);
if (browserStandalone.includes("require(")) {
  throw new Error("generated validators contain an unsupported runtime import");
}
const source = `${browserStandalone === standalone ? "" : 'import ucs2Length from "ajv/dist/runtime/ucs2length.js";\n'}${browserStandalone}\n`;
const declaration = `export declare function validateApplicationSnapshotDocument(value: unknown): boolean;\nexport declare function validateProjectDocument(value: unknown): boolean;\n`;

if (check) {
  const [currentSource, currentDeclaration] = await Promise.all([
    readFile(outputPath, "utf8"),
    readFile(declarationPath, "utf8"),
  ]);
  if (currentSource !== source || currentDeclaration !== declaration) {
    throw new Error("generated validators are stale");
  }
} else {
  await Promise.all([
    writeFile(outputPath, source, "utf8"),
    writeFile(declarationPath, declaration, "utf8"),
  ]);
}
