import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const [, , inputPathArg, outputPathArg] = process.argv;

if (!inputPathArg || !outputPathArg) {
  throw new Error(
    "usage: node ./generation/prune_app_subsystem_sdk_openapi.mjs <input-openapi.json> <output-openapi.json>",
  );
}

const sdkScope = "app-subsystem";
const httpMethods = new Set([
  "delete",
  "get",
  "head",
  "options",
  "patch",
  "post",
  "put",
  "trace",
]);

function isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function operationHasScope(operation) {
  if (!isObject(operation)) {
    return false;
  }
  const scopes = operation["x-setta-frontend-sdk-scopes"];
  return Array.isArray(scopes) && scopes.includes(sdkScope);
}

function collectRefs(value, refs) {
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectRefs(entry, refs);
    }
    return;
  }
  if (!isObject(value)) {
    return;
  }
  const ref = value.$ref;
  if (typeof ref === "string" && ref.startsWith("#/components/schemas/")) {
    refs.add(decodeURIComponent(ref.slice("#/components/schemas/".length)));
  }
  for (const entry of Object.values(value)) {
    collectRefs(entry, refs);
  }
}

function selectedPathsFromDocument(document, refs) {
  const selected = {};
  for (const pathName of Object.keys(document.paths ?? {}).sort()) {
    const pathItem = document.paths[pathName];
    if (!isObject(pathItem)) {
      continue;
    }
    const nextPathItem = {};
    for (const [key, value] of Object.entries(pathItem)) {
      if (!httpMethods.has(key)) {
        nextPathItem[key] = value;
        continue;
      }
      if (!operationHasScope(value)) {
        continue;
      }
      nextPathItem[key] = value;
      collectRefs(value, refs);
    }
    if (Object.keys(nextPathItem).some((key) => httpMethods.has(key))) {
      selected[pathName] = nextPathItem;
    }
  }
  return selected;
}

function selectedSchemasFromDocument(document, refs) {
  const sourceSchemas = document.components?.schemas ?? {};
  const selected = {};
  const pending = [...refs].sort();
  for (let index = 0; index < pending.length; index += 1) {
    const name = pending[index];
    if (Object.hasOwn(selected, name)) {
      continue;
    }
    const schema = sourceSchemas[name];
    if (!schema) {
      throw new Error(
        `OpenAPI schema ${JSON.stringify(name)} is referenced but missing.`,
      );
    }
    selected[name] = schema;
    const nestedRefs = new Set();
    collectRefs(schema, nestedRefs);
    for (const nestedRef of [...nestedRefs].sort()) {
      if (!Object.hasOwn(selected, nestedRef)) {
        pending.push(nestedRef);
      }
    }
  }
  return Object.fromEntries(
    Object.entries(selected).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  );
}

const inputPath = resolve(inputPathArg);
const outputPath = resolve(outputPathArg);
const document = JSON.parse(readFileSync(inputPath, "utf8"));
const refs = new Set();
const paths = selectedPathsFromDocument(document, refs);

if (Object.keys(paths).length === 0) {
  throw new Error(
    `No OpenAPI operations are scoped to ${JSON.stringify(sdkScope)}.`,
  );
}

const output = {
  ...document,
  info: {
    ...document.info,
    title: `${document.info?.title ?? "Setta HTTP API"} App Subsystem SDK`,
  },
  paths,
  components: {
    ...(document.components ?? {}),
    schemas: selectedSchemasFromDocument(document, refs),
  },
  "x-setta-contract-source": `${document["x-setta-contract-source"]};frontend-sdk-scope=${sdkScope}`,
};

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, `${JSON.stringify(output, null, 2)}\n`);
