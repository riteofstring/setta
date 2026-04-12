import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

function replaceExact(filePath, replacements) {
  const absPath = resolve(filePath);
  let contents = readFileSync(absPath, "utf8");
  for (const [from, to] of replacements) {
    if (!contents.includes(from)) {
      throw new Error(`Expected snippet not found in ${filePath}: ${from}`);
    }
    contents = contents.replace(from, to);
  }
  writeFileSync(absPath, contents);
}

replaceExact("src/openapi/http/generated/client/client.gen.ts", [
  [
    "      await opts.requestValidator(opts);",
    "      await opts.requestValidator(opts as unknown as ResolvedRequestOptions);",
  ],
  [
    "        request = await fn(request, opts);",
    "        request = await fn(request, opts as unknown as ResolvedRequestOptions);",
  ],
  [
    "        response = await fn(response, request, opts);",
    "        response = await fn(response, request, opts as unknown as ResolvedRequestOptions);",
  ],
  [
    "        finalError = (await fn(error, response, request, opts)) as string;",
    "        finalError = (await fn(error, response, request, opts as unknown as ResolvedRequestOptions)) as string;",
  ],
]);

replaceExact("src/openapi/http/generated/core/pathSerializer.gen.ts", [
  [
    "  allowReserved?: boolean;",
    "  allowReserved?: boolean | undefined;",
  ],
]);

replaceExact("src/openapi/http/generated/core/params.gen.ts", [
  ["      map?: string;", "      map?: string | undefined;"],
  ["      map?: string;", "      map?: string | undefined;"],
  ["    map?: string;", "    map?: string | undefined;"],
]);

replaceExact("src/openapi/http/generated/client/utils.gen.ts", [
  ["  baseUrl?: string;", "  baseUrl?: string | undefined;"],
  [
    "  path?: Record<string, unknown>;",
    "  path?: Record<string, unknown> | undefined;",
  ],
  [
    "  query?: Record<string, unknown>;",
    "  query?: Record<string, unknown> | undefined;",
  ],
]);
