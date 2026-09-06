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
const runtimeSchemaPath = new URL(
  "../backend/internal/contracts/testdata/runtime-v1.schema.json",
  import.meta.url,
);
const runtimeCommandSchemaPath = new URL(
  "../backend/internal/contracts/testdata/runtime-command-v1.schema.json",
  import.meta.url,
);
const contentReferenceSchemaPath = new URL(
  "../backend/internal/contracts/testdata/content-reference-v1.schema.json",
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

const [
  projectSchema,
  runtimeSchema,
  runtimeCommandSchema,
  contentReferenceSchema,
] = await Promise.all(
  [
    projectSchemaPath,
    runtimeSchemaPath,
    runtimeCommandSchemaPath,
    contentReferenceSchemaPath,
  ].map(async (path) => JSON.parse(await readFile(path, "utf8"))),
);
const ajv = new Ajv2020({
  allErrors: true,
  code: { esm: true, source: true },
  strict: true,
});
ajv.addSchema(projectSchema, "project");
ajv.addSchema(runtimeSchema, "runtimeEnvelope");
ajv.addSchema(runtimeCommandSchema, "runtimeCommand");
ajv.addSchema(contentReferenceSchema, "contentReference");
const source = `${standaloneCode(ajv, {
  validateContentReferenceDocument: "contentReference",
  validateProjectDocument: "project",
  validateRuntimeCommandDocument: "runtimeCommand",
  validateRuntimeEnvelopeDocument: "runtimeEnvelope",
})}\n`;
const declaration = `export declare function validateContentReferenceDocument(value: unknown): boolean;\nexport declare function validateProjectDocument(value: unknown): boolean;\nexport declare function validateRuntimeCommandDocument(value: unknown): boolean;\nexport declare function validateRuntimeEnvelopeDocument(value: unknown): boolean;\n`;

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
