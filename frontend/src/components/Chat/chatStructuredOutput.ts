import { normalizeToolName } from "utils/claudeTools";
import {
  type CodeLanguage,
  resolveCodeLanguageFromPath,
} from "utils/codeLanguage";
import { CodeLanguageEnum } from "utils/generatedTypes";

type StructuredOutputKind = "plain" | "code" | "diff";
export type StructuredOutputPayload = {
  text: string;
  kind: StructuredOutputKind;
  language: CodeLanguage | null;
  useJsx: boolean;
  pathHint: string | null;
};

export type StructuredOutputPart = "input" | "output";

type StructuredOutputRunState = "running" | "success" | "failed" | "stopped";
type ResolvedLanguageHint = {
  language: CodeLanguage | null;
  useJsx: boolean;
};

const NO_LANGUAGE_HINT: ResolvedLanguageHint = {
  language: null,
  useJsx: false,
};
const JSON_LANGUAGE_HINT: ResolvedLanguageHint = {
  language: CodeLanguageEnum.json,
  useJsx: false,
};
const YAML_LANGUAGE_HINT: ResolvedLanguageHint = {
  language: CodeLanguageEnum.yaml,
  useJsx: false,
};
const MARKDOWN_LANGUAGE_HINT: ResolvedLanguageHint = {
  language: CodeLanguageEnum.markdown,
  useJsx: false,
};
const TOML_LANGUAGE_HINT: ResolvedLanguageHint = {
  language: CodeLanguageEnum.toml,
  useJsx: false,
};
const JAVASCRIPT_LANGUAGE_HINT: ResolvedLanguageHint = {
  language: CodeLanguageEnum.javascript,
  useJsx: false,
};
const TYPESCRIPT_LANGUAGE_HINT: ResolvedLanguageHint = {
  language: CodeLanguageEnum.typescript,
  useJsx: false,
};
const TYPESCRIPT_JSX_LANGUAGE_HINT: ResolvedLanguageHint = {
  language: CodeLanguageEnum.typescript,
  useJsx: true,
};
const JAVASCRIPT_JSX_LANGUAGE_HINT: ResolvedLanguageHint = {
  language: CodeLanguageEnum.javascript,
  useJsx: true,
};

const PATH_HINT_KEYS = [
  "path",
  "filePath",
  "filepath",
  "targetPath",
  "target",
  "file",
  "filename",
  "fileName",
  "uri",
] as const;
const MIME_HINT_KEYS = [
  "mimeType",
  "mimetype",
  "contentType",
  "content_type",
] as const;
const MIME_TYPE_LANGUAGE_HINTS = new Map<string, ResolvedLanguageHint>([
  ["application/json", JSON_LANGUAGE_HINT],
  ["text/json", JSON_LANGUAGE_HINT],
  ["application/yaml", YAML_LANGUAGE_HINT],
  ["text/yaml", YAML_LANGUAGE_HINT],
  ["application/x-yaml", YAML_LANGUAGE_HINT],
  ["text/x-yaml", YAML_LANGUAGE_HINT],
  ["text/markdown", MARKDOWN_LANGUAGE_HINT],
  ["application/toml", TOML_LANGUAGE_HINT],
  ["text/x-toml", TOML_LANGUAGE_HINT],
  ["application/x-toml", TOML_LANGUAGE_HINT],
  ["application/javascript", JAVASCRIPT_LANGUAGE_HINT],
  ["text/javascript", JAVASCRIPT_LANGUAGE_HINT],
  ["application/x-javascript", JAVASCRIPT_LANGUAGE_HINT],
  ["application/typescript", TYPESCRIPT_LANGUAGE_HINT],
  ["text/typescript", TYPESCRIPT_LANGUAGE_HINT],
]);
const MIME_TYPE_SUFFIX_LANGUAGE_HINTS = [
  ["+json", JSON_LANGUAGE_HINT],
] as const satisfies ReadonlyArray<
  readonly [suffix: string, hint: ResolvedLanguageHint]
>;
const DIFF_FILE_PREFIXES = ["+++ ", "--- "] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function extractNonEmptyStringArg(args: unknown, key: string): string | null {
  if (!isRecord(args)) {
    return null;
  }
  const value = args[key];
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function formatStructuredOutputValue(args: unknown): string {
  if (!args) {
    return "{}";
  }
  if (typeof args === "string") {
    return args;
  }
  try {
    return JSON.stringify(args, null, 2);
  } catch {
    return String(args);
  }
}

function resolveCodeLanguageFromMimeType(
  mimeType: string | null,
): ResolvedLanguageHint {
  if (!mimeType) {
    return NO_LANGUAGE_HINT;
  }
  const normalized = mimeType.trim().toLowerCase();
  const exactMatch = MIME_TYPE_LANGUAGE_HINTS.get(normalized);
  if (exactMatch) {
    return exactMatch;
  }
  return (
    MIME_TYPE_SUFFIX_LANGUAGE_HINTS.find(([suffix]) =>
      normalized.endsWith(suffix),
    )?.[1] ?? NO_LANGUAGE_HINT
  );
}

function resolveLanguageFromPathHint(
  pathHint: string | null,
): ResolvedLanguageHint {
  if (!pathHint) {
    return NO_LANGUAGE_HINT;
  }
  const normalized = pathHint.toLowerCase();
  if (normalized.endsWith(".tsx")) {
    return TYPESCRIPT_JSX_LANGUAGE_HINT;
  }
  if (normalized.endsWith(".jsx")) {
    return JAVASCRIPT_JSX_LANGUAGE_HINT;
  }
  const language = resolveCodeLanguageFromPath(pathHint);
  if (language === CodeLanguageEnum.plaintext) {
    return NO_LANGUAGE_HINT;
  }
  return { language, useJsx: false };
}

function resolveFirstStringHint(
  value: unknown,
  keys: readonly string[],
): string | null {
  for (const key of keys) {
    const resolved = extractNonEmptyStringArg(value, key);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

function resolvePathHintFromUnknown(value: unknown): string | null {
  return resolveFirstStringHint(value, PATH_HINT_KEYS);
}

function resolveMimeTypeHintFromUnknown(value: unknown): string | null {
  return resolveFirstStringHint(value, MIME_HINT_KEYS);
}

function resolveCommandInputText(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const command = value.command;
  if (typeof command !== "string") {
    return null;
  }
  const trimmed = command.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return command;
}

function resolveDiffTextFromUnknown(value: unknown): string | null {
  if (!isRecord(value)) {
    return null;
  }
  const diff = value.diff;
  if (typeof diff !== "string") {
    return null;
  }
  const trimmed = diff.trim();
  if (trimmed.length === 0) {
    return null;
  }
  return diff;
}

function lineStartsWithAny(line: string, prefixes: readonly string[]): boolean {
  return prefixes.some((prefix) => line.startsWith(prefix));
}

function isUnifiedDiffText(text: string): boolean {
  const lines = text.split(/\r?\n/u);
  const hasDiffHeader = lines.some((line) => line.startsWith("diff --git "));
  const hasFileHeader = lines.some((line) =>
    lineStartsWithAny(line, DIFF_FILE_PREFIXES),
  );
  const hasHunk = lines.some((line) => line.startsWith("@@"));
  const hasBinaryHeader = lines.some((line) =>
    line.startsWith("Binary files "),
  );
  return (
    (hasDiffHeader && (hasFileHeader || hasHunk || hasBinaryHeader)) ||
    (hasFileHeader && hasHunk)
  );
}

function tryParseObjectOrArrayJson(text: string): unknown | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (Array.isArray(parsed) || isRecord(parsed)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

function createStructuredOutputPayload({
  text,
  kind,
  language = null,
  useJsx = false,
  pathHint,
}: {
  text: string;
  kind: StructuredOutputKind;
  language?: CodeLanguage | null;
  useJsx?: boolean;
  pathHint: string | null;
}): StructuredOutputPayload {
  return {
    text,
    kind,
    language,
    useJsx,
    pathHint,
  };
}

function resolveStructuredOutputHints(
  value: unknown,
  contextValue: unknown,
): {
  pathHint: string | null;
  resolvedLanguage: ResolvedLanguageHint;
} {
  const pathHint =
    resolvePathHintFromUnknown(value) ??
    resolvePathHintFromUnknown(contextValue) ??
    null;
  const mimeTypeHint =
    resolveMimeTypeHintFromUnknown(value) ??
    resolveMimeTypeHintFromUnknown(contextValue) ??
    null;
  const pathLanguage = resolveLanguageFromPathHint(pathHint);
  return {
    pathHint,
    resolvedLanguage:
      pathLanguage.language !== null
        ? pathLanguage
        : resolveCodeLanguageFromMimeType(mimeTypeHint),
  };
}

function resolveSpecialToolPayload({
  value,
  toolName,
  part,
  pathHint,
}: {
  value: unknown;
  toolName: string;
  part: StructuredOutputPart;
  pathHint: string | null;
}): StructuredOutputPayload | null {
  if (toolName === "file_change") {
    const diffFromObject = resolveDiffTextFromUnknown(value);
    if (diffFromObject && isUnifiedDiffText(diffFromObject)) {
      return createStructuredOutputPayload({
        text: diffFromObject,
        kind: "diff",
        pathHint,
      });
    }
  }

  if (toolName !== "command_execution" || part !== "input") {
    return null;
  }

  const commandText = resolveCommandInputText(value);
  if (!commandText) {
    return null;
  }
  return createStructuredOutputPayload({
    text: commandText,
    kind: "code",
    language: CodeLanguageEnum.bash,
    pathHint,
  });
}

function resolveStringStructuredOutputPayload({
  value,
  pathHint,
  resolvedLanguage,
}: {
  value: string;
  pathHint: string | null;
  resolvedLanguage: ResolvedLanguageHint;
}): StructuredOutputPayload | null {
  if (value.trim().length === 0) {
    return null;
  }
  if (isUnifiedDiffText(value)) {
    return createStructuredOutputPayload({
      text: value,
      kind: "diff",
      pathHint,
    });
  }
  const parsedJson = tryParseObjectOrArrayJson(value);
  if (parsedJson !== null) {
    return createStructuredOutputPayload({
      text: JSON.stringify(parsedJson, null, 2),
      kind: "code",
      language: CodeLanguageEnum.json,
      pathHint,
    });
  }
  if (resolvedLanguage.language !== null) {
    return createStructuredOutputPayload({
      text: value,
      kind: "code",
      language: resolvedLanguage.language,
      useJsx: resolvedLanguage.useJsx,
      pathHint,
    });
  }
  return createStructuredOutputPayload({
    text: value,
    kind: "plain",
    pathHint,
  });
}

function resolveDefaultStructuredOutputPayload(args: {
  value: unknown;
  pathHint: string | null;
  resolvedLanguage: ResolvedLanguageHint;
}): StructuredOutputPayload | null {
  if (typeof args.value === "string") {
    return resolveStringStructuredOutputPayload({
      value: args.value,
      pathHint: args.pathHint,
      resolvedLanguage: args.resolvedLanguage,
    });
  }
  if (typeof args.value === "number" || typeof args.value === "boolean") {
    return createStructuredOutputPayload({
      text: String(args.value),
      kind: "plain",
      pathHint: args.pathHint,
    });
  }
  if (Array.isArray(args.value) || isRecord(args.value)) {
    return createStructuredOutputPayload({
      text: formatStructuredOutputValue(args.value),
      kind: "code",
      language: CodeLanguageEnum.json,
      pathHint: args.pathHint,
    });
  }
  return createStructuredOutputPayload({
    text: String(args.value),
    kind: "plain",
    pathHint: args.pathHint,
  });
}

export function resolveStructuredOutputPayload({
  value,
  toolName,
  part,
  contextValue,
}: {
  value: unknown;
  toolName: string;
  part: StructuredOutputPart;
  contextValue?: unknown;
}): StructuredOutputPayload | null {
  if (value === null || value === undefined) {
    return null;
  }
  const normalizedToolName = normalizeToolName(toolName) ?? toolName;
  const { pathHint, resolvedLanguage } = resolveStructuredOutputHints(
    value,
    contextValue,
  );
  const specialToolPayload = resolveSpecialToolPayload({
    value,
    toolName: normalizedToolName,
    part,
    pathHint,
  });
  if (specialToolPayload) {
    return specialToolPayload;
  }
  return resolveDefaultStructuredOutputPayload({
    value,
    pathHint,
    resolvedLanguage,
  });
}

export function resolveStructuredOutputFallbackPayload({
  runState,
  failedLabel,
  successLabel,
  stoppedLabel,
}: {
  runState: StructuredOutputRunState;
  failedLabel: string;
  successLabel: string;
  stoppedLabel: string;
}): StructuredOutputPayload | null {
  if (runState === "failed") {
    return {
      text: failedLabel,
      kind: "plain",
      language: null,
      useJsx: false,
      pathHint: null,
    };
  }
  if (runState === "success") {
    return {
      text: successLabel,
      kind: "plain",
      language: null,
      useJsx: false,
      pathHint: null,
    };
  }
  if (runState === "stopped") {
    return {
      text: stoppedLabel,
      kind: "plain",
      language: null,
      useJsx: false,
      pathHint: null,
    };
  }
  return null;
}
