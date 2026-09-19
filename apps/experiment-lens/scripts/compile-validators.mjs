import { readFile, writeFile } from "node:fs/promises";

import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";

const check = process.argv.slice(2).includes("--check");
if (process.argv.length > (check ? 3 : 2)) {
  throw new Error("compile-validators accepts only --check");
}

const schemaPaths = {
  exportResult: new URL(
    "../backend/internal/contracts/testdata/export-result-v1.schema.json",
    import.meta.url,
  ),
  experimentManifest: new URL(
    "../backend/internal/contracts/testdata/experiment-manifest-v1.schema.json",
    import.meta.url,
  ),
  lensMutation: new URL(
    "../backend/internal/contracts/testdata/lens-mutation-v1.schema.json",
    import.meta.url,
  ),
  lensSnapshot: new URL(
    "../backend/internal/contracts/testdata/lens-snapshot-v1.schema.json",
    import.meta.url,
  ),
  mutationResult: new URL(
    "../backend/internal/contracts/testdata/mutation-result-v1.schema.json",
    import.meta.url,
  ),
  observationSource: new URL(
    "../backend/internal/contracts/testdata/observation-source-v1.schema.json",
    import.meta.url,
  ),
  selectionPacket: new URL(
    "../backend/internal/contracts/testdata/selection-packet-v1.schema.json",
    import.meta.url,
  ),
  series: new URL(
    "../backend/internal/contracts/testdata/series-v1.schema.json",
    import.meta.url,
  ),
  structuredError: new URL(
    "../backend/internal/contracts/testdata/structured-error-v1.schema.json",
    import.meta.url,
  ),
};
const outputPath = new URL(
  "../src/backend/generatedValidators.js",
  import.meta.url,
);
const declarationPath = new URL(
  "../src/backend/generatedValidators.d.ts",
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
  validateExportResultDocument: "exportResult",
  validateExperimentManifestDocument: "experimentManifest",
  validateLensMutationDocument: "lensMutation",
  validateLensSnapshotDocument: "lensSnapshot",
  validateMutationResultDocument: "mutationResult",
  validateObservationSourceDocument: "observationSource",
  validateSelectionPacketDocument: "selectionPacket",
  validateSeriesDocument: "series",
  validateStructuredErrorDocument: "structuredError",
});
const browserStandalone = standalone.replace(
  /const (func\d+) = require\("ajv\/dist\/runtime\/ucs2length"\)\.default;/gu,
  "const $1 = ucs2Length;",
);
if (browserStandalone.includes("require(")) {
  throw new Error("generated validators contain an unsupported runtime import");
}
const source = `${browserStandalone === standalone ? "" : 'import ucs2Length from "ajv/dist/runtime/ucs2length.js";\n'}${browserStandalone}\n`;
const declaration = `export declare function validateExperimentManifestDocument(value: unknown): boolean;
export declare function validateExportResultDocument(value: unknown): boolean;
export declare function validateLensMutationDocument(value: unknown): boolean;
export declare function validateLensSnapshotDocument(value: unknown): boolean;
export declare function validateMutationResultDocument(value: unknown): boolean;
export declare function validateObservationSourceDocument(value: unknown): boolean;
export declare function validateSelectionPacketDocument(value: unknown): boolean;
export declare function validateSeriesDocument(value: unknown): boolean;
export declare function validateStructuredErrorDocument(value: unknown): boolean;
`;

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
