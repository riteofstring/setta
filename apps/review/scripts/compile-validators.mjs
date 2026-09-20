import { readFile, writeFile } from "node:fs/promises";

import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";

const check = process.argv.slice(2).includes("--check");
if (process.argv.length > (check ? 3 : 2)) {
  throw new Error("compile-validators accepts only --check");
}

const schemaPaths = {
  reviewMutation: new URL(
    "../backend/internal/contracts/testdata/review-mutation-v1.schema.json",
    import.meta.url,
  ),
  reviewRequest: new URL(
    "../backend/internal/contracts/testdata/review-request-v1.schema.json",
    import.meta.url,
  ),
  reviewResponse: new URL(
    "../backend/internal/contracts/testdata/review-response-v1.schema.json",
    import.meta.url,
  ),
  reviewSnapshot: new URL(
    "../backend/internal/contracts/testdata/review-snapshot-v1.schema.json",
    import.meta.url,
  ),
};
const outputPath = new URL(
  "../src/api/generatedValidators.js",
  import.meta.url,
);
const declarationPath = new URL(
  "../src/api/generatedValidators.d.ts",
  import.meta.url,
);

const schemas = Object.fromEntries(
  await Promise.all(
    Object.entries(schemaPaths).map(async ([name, schemaPath]) => [
      name,
      JSON.parse(await readFile(schemaPath, "utf8")),
    ]),
  ),
);
const ajv = new Ajv2020({
  allErrors: true,
  code: { esm: true, source: true },
  strict: true,
});
for (const [name, schema] of Object.entries(schemas)) {
  ajv.addSchema(schema, name);
}
const standalone = standaloneCode(ajv, {
  validateReviewMutationDocument: "reviewMutation",
  validateReviewRequestDocument: "reviewRequest",
  validateReviewResponseDocument: "reviewResponse",
  validateReviewSnapshotDocument: "reviewSnapshot",
});
const browserStandalone = standalone.replace(
  /const (func\d+) = require\("ajv\/dist\/runtime\/ucs2length"\)\.default;/gu,
  "const $1 = ucs2Length;",
);
if (browserStandalone.includes("require(")) {
  throw new Error("generated validators contain an unsupported runtime import");
}
const source = `${browserStandalone === standalone ? "" : 'import ucs2Length from "ajv/dist/runtime/ucs2length.js";\n'}${browserStandalone}\n`;
const declaration = `export declare function validateReviewMutationDocument(value: unknown): boolean;\nexport declare function validateReviewRequestDocument(value: unknown): boolean;\nexport declare function validateReviewResponseDocument(value: unknown): boolean;\nexport declare function validateReviewSnapshotDocument(value: unknown): boolean;\n`;

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
