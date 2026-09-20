import { readFile, writeFile } from "node:fs/promises";

import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";

const check = process.argv.slice(2).includes("--check");
if (process.argv.length > (check ? 3 : 2)) {
  throw new Error("compile-validators accepts only --check");
}

const projectSchemaPath = new URL(
  "../backend/internal/contracts/testdata/project-v2.schema.json",
  import.meta.url,
);
const applyRequestSchemaPath = new URL(
  "../backend/internal/contracts/testdata/apply-request-v2.schema.json",
  import.meta.url,
);
const runtimeSchemaPath = new URL(
  "../backend/internal/contracts/testdata/runtime-v2.schema.json",
  import.meta.url,
);
const runtimeCommandSchemaPath = new URL(
  "../backend/internal/contracts/testdata/runtime-command-v2.schema.json",
  import.meta.url,
);
const contentReferenceSchemaPath = new URL(
  "../backend/internal/contracts/testdata/content-reference-v1.schema.json",
  import.meta.url,
);
const runtimeSourceSchemaPath = new URL(
  "../backend/internal/contracts/testdata/runtime-source-v1.schema.json",
  import.meta.url,
);
const applyRuntimeSourceRequestSchemaPath = new URL(
  "../backend/internal/contracts/testdata/apply-runtime-source-request-v1.schema.json",
  import.meta.url,
);
const applyRuntimeSourceResultSchemaPath = new URL(
  "../backend/internal/contracts/testdata/apply-runtime-source-result-v1.schema.json",
  import.meta.url,
);
const outputPath = new URL(
  "../src/api/generatedValidators.js",
  import.meta.url,
);
const declarationPath = new URL(
  "../src/api/generatedValidators.d.ts",
  import.meta.url,
);

const [
  applyRequestSchema,
  projectSchema,
  runtimeSchema,
  runtimeCommandSchema,
  contentReferenceSchema,
  runtimeSourceSchema,
  applyRuntimeSourceRequestSchema,
  applyRuntimeSourceResultSchema,
] = await Promise.all(
  [
    applyRequestSchemaPath,
    projectSchemaPath,
    runtimeSchemaPath,
    runtimeCommandSchemaPath,
    contentReferenceSchemaPath,
    runtimeSourceSchemaPath,
    applyRuntimeSourceRequestSchemaPath,
    applyRuntimeSourceResultSchemaPath,
  ].map(async (path) => JSON.parse(await readFile(path, "utf8"))),
);
const ajv = new Ajv2020({
  allErrors: true,
  code: { esm: true, source: true },
  strict: true,
});
ajv.addSchema(applyRequestSchema, "applyRequest");
ajv.addSchema(projectSchema, "project");
ajv.addSchema(runtimeSchema, "runtimeEnvelope");
ajv.addSchema(runtimeCommandSchema, "runtimeCommand");
ajv.addSchema(contentReferenceSchema, "contentReference");
ajv.addSchema(runtimeSourceSchema, "runtimeSource");
ajv.addSchema(applyRuntimeSourceRequestSchema, "applyRuntimeSourceRequest");
ajv.addSchema(applyRuntimeSourceResultSchema, "applyRuntimeSourceResult");
const standalone = standaloneCode(ajv, {
  validateApplyRequestDocument: "applyRequest",
  validateApplyRuntimeSourceRequestDocument: "applyRuntimeSourceRequest",
  validateApplyRuntimeSourceResultDocument: "applyRuntimeSourceResult",
  validateContentReferenceDocument: "contentReference",
  validateProjectDocument: "project",
  validateRuntimeCommandDocument: "runtimeCommand",
  validateRuntimeEnvelopeDocument: "runtimeEnvelope",
  validateRuntimeSourceDocument: "runtimeSource",
});
const browserStandalone = standalone.replace(
  /const (func\d+) = require\("ajv\/dist\/runtime\/ucs2length"\)\.default;/gu,
  "const $1 = ucs2Length;",
);
if (browserStandalone.includes("require(")) {
  throw new Error("generated validators contain an unsupported runtime import");
}
const source = `${browserStandalone === standalone ? "" : 'import ucs2Length from "ajv/dist/runtime/ucs2length.js";\n'}${browserStandalone}\n`;
const declaration = `export declare function validateApplyRequestDocument(value: unknown): boolean;\nexport declare function validateApplyRuntimeSourceRequestDocument(value: unknown): boolean;\nexport declare function validateApplyRuntimeSourceResultDocument(value: unknown): boolean;\nexport declare function validateContentReferenceDocument(value: unknown): boolean;\nexport declare function validateProjectDocument(value: unknown): boolean;\nexport declare function validateRuntimeCommandDocument(value: unknown): boolean;\nexport declare function validateRuntimeEnvelopeDocument(value: unknown): boolean;\nexport declare function validateRuntimeSourceDocument(value: unknown): boolean;\n`;

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
