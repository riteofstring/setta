import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const generatedRoot = process.argv[2] ?? "src/openapi/http/generated";

function generatedPath(relativePath) {
  return `${generatedRoot}/${relativePath}`;
}

function updateFile(filePath, replacements) {
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    throw new Error(`Expected file not found: ${filePath}`);
  }

  let contents = readFileSync(absPath, "utf8");
  let changed = false;
  for (const [from, to] of replacements) {
    if (contents.includes(from)) {
      contents = contents.split(from).join(to);
      changed = true;
      continue;
    }
    if (!contents.includes(to)) {
      throw new Error(`Expected snippet not found in ${filePath}: ${from}`);
    }
  }

  if (changed) {
    writeFileSync(absPath, contents);
  }
}

function removeIfPresent(filePath, snippets) {
  const absPath = resolve(filePath);
  if (!existsSync(absPath)) {
    return;
  }

  let contents = readFileSync(absPath, "utf8");
  let changed = false;
  for (const snippet of snippets) {
    if (contents.includes(snippet)) {
      contents = contents.split(snippet).join("");
      changed = true;
    }
  }

  if (changed) {
    writeFileSync(absPath, contents);
  }
}

updateFile(generatedPath("client/client.gen.ts"), [
  ["    const opts = {\n", "    const opts: ResolvedRequestOptions = {\n"],
  [
    "        body: opts.body as BodyInit | null | undefined,\n",
    "        ...(opts.body === undefined\n" +
      "          ? {}\n" +
      "          : { body: opts.body as BodyInit | null }),\n",
  ],
]);
removeIfPresent(generatedPath("client/client.gen.ts"), [
  "      serializedBody: undefined,\n",
]);

updateFile(generatedPath("client/types.gen.ts"), [
  [
    "  serializedBody?: string;",
    "  serializedBody?: RequestInit['body'] | undefined;",
  ],
]);

updateFile(generatedPath("core/pathSerializer.gen.ts"), [
  [
    "  allowReserved?: boolean;",
    "  allowReserved?: boolean | undefined;",
  ],
  [
    "  valueOnly?: boolean;",
    "  valueOnly?: boolean | undefined;",
  ],
]);

updateFile(generatedPath("core/params.gen.ts"), [
  ["      map?: string;", "      map?: string | undefined;"],
  ["      key?: string;", "      key?: string | undefined;"],
  ["    map?: string;", "    map?: string | undefined;"],
  [
    "  allowExtra?: Partial<Record<Slot, boolean>>;",
    "  allowExtra?: Partial<Record<Slot, boolean>> | undefined;",
  ],
  [
    "  args?: ReadonlyArray<Field>;",
    "  args?: ReadonlyArray<Field> | undefined;",
  ],
  ["      in?: never;", "      in?: never | undefined;"],
]);

if (existsSync(resolve(generatedPath("core/utils.gen.ts")))) {
  updateFile(generatedPath("core/utils.gen.ts"), [
    ["  baseUrl?: string;", "  baseUrl?: string | undefined;"],
    [
      "  path?: Record<string, unknown>;",
      "  path?: Record<string, unknown> | undefined;",
    ],
    [
      "  query?: Record<string, unknown>;",
      "  query?: Record<string, unknown> | undefined;",
    ],
    ["  body?: unknown;", "  body?: unknown | undefined;"],
    [
      "  bodySerializer?: BodySerializer | null;",
      "  bodySerializer?: BodySerializer | null | undefined;",
    ],
    [
      "  serializedBody?: unknown;",
      "  serializedBody?: unknown | undefined;",
    ],
  ]);
} else {
  updateFile(generatedPath("client/utils.gen.ts"), [
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
}

if (existsSync(resolve(generatedPath("core/serverSentEvents.gen.ts")))) {
  updateFile(generatedPath("core/serverSentEvents.gen.ts"), [
    [
      "    fetch?: typeof fetch;",
      "    fetch?: typeof fetch | undefined;",
    ],
    [
      "    onRequest?: (url: string, init: RequestInit) => Promise<Request>;",
      "    onRequest?: ((url: string, init: RequestInit) => Promise<Request>) | undefined;",
    ],
    [
      "    onSseError?: (error: unknown) => void;",
      "    onSseError?: ((error: unknown) => void) | undefined;",
    ],
    [
      "    onSseEvent?: (event: StreamEvent<TData>) => void;",
      "    onSseEvent?: ((event: StreamEvent<TData>) => void) | undefined;",
    ],
    [
      "    serializedBody?: RequestInit['body'];",
      "    serializedBody?: RequestInit['body'] | undefined;",
    ],
    [
      "    sseDefaultRetryDelay?: number;",
      "    sseDefaultRetryDelay?: number | undefined;",
    ],
    [
      "    sseMaxRetryAttempts?: number;",
      "    sseMaxRetryAttempts?: number | undefined;",
    ],
    [
      "    sseMaxRetryDelay?: number;",
      "    sseMaxRetryDelay?: number | undefined;",
    ],
    [
      "    sseSleepFn?: (ms: number) => Promise<void>;",
      "    sseSleepFn?: ((ms: number) => Promise<void>) | undefined;",
    ],
    ["  event?: string;", "  event?: string | undefined;"],
    ["  id?: string;", "  id?: string | undefined;"],
    ["  retry?: number;", "  retry?: number | undefined;"],
    [
      "          body: options.serializedBody,\n",
      "          ...(options.serializedBody === undefined\n" +
        "            ? {}\n" +
        "            : { body: options.serializedBody }),\n",
    ],
  ]);
}
