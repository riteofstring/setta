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

function resolveCodeLanguageFromMimeType(mimeType: string | null): {
  language: CodeLanguage | null;
  useJsx: boolean;
} {
  if (!mimeType) {
    return { language: null, useJsx: false };
  }
  const normalized = mimeType.trim().toLowerCase();
  if (
    normalized === "application/json" ||
    normalized.endsWith("+json") ||
    normalized === "text/json"
  ) {
    return { language: CodeLanguageEnum.json, useJsx: false };
  }
  if (
    normalized === "application/yaml" ||
    normalized === "text/yaml" ||
    normalized === "application/x-yaml" ||
    normalized === "text/x-yaml"
  ) {
    return { language: CodeLanguageEnum.yaml, useJsx: false };
  }
  if (normalized === "text/markdown") {
    return { language: CodeLanguageEnum.markdown, useJsx: false };
  }
  if (
    normalized === "application/toml" ||
    normalized === "text/x-toml" ||
    normalized === "application/x-toml"
  ) {
    return { language: CodeLanguageEnum.toml, useJsx: false };
  }
  if (
    normalized === "application/javascript" ||
    normalized === "text/javascript" ||
    normalized === "application/x-javascript"
  ) {
    return { language: CodeLanguageEnum.javascript, useJsx: false };
  }
  if (
    normalized === "application/typescript" ||
    normalized === "text/typescript"
  ) {
    return { language: CodeLanguageEnum.typescript, useJsx: false };
  }
  return { language: null, useJsx: false };
}

function resolveLanguageFromPathHint(pathHint: string | null): {
  language: CodeLanguage | null;
  useJsx: boolean;
} {
  if (!pathHint) {
    return { language: null, useJsx: false };
  }
  const normalized = pathHint.toLowerCase();
  if (normalized.endsWith(".tsx")) {
    return { language: CodeLanguageEnum.typescript, useJsx: true };
  }
  if (normalized.endsWith(".jsx")) {
    return { language: CodeLanguageEnum.javascript, useJsx: true };
  }
  const language = resolveCodeLanguageFromPath(pathHint);
  if (language === CodeLanguageEnum.plaintext) {
    return { language: null, useJsx: false };
  }
  return { language, useJsx: false };
}

function resolvePathHintFromUnknown(value: unknown): string | null {
  const pathKeys = [
    "path",
    "filePath",
    "filepath",
    "targetPath",
    "target",
    "file",
    "filename",
    "fileName",
    "uri",
  ];
  for (const key of pathKeys) {
    const resolved = extractNonEmptyStringArg(value, key);
    if (resolved) {
      return resolved;
    }
  }
  return null;
}

function resolveMimeTypeHintFromUnknown(value: unknown): string | null {
  const mimeKeys = ["mimeType", "mimetype", "contentType", "content_type"];
  for (const key of mimeKeys) {
    const resolved = extractNonEmptyStringArg(value, key);
    if (resolved) {
      return resolved;
    }
  }
  return null;
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

export function classifyDiffLineForChat(
  line: string,
): "add" | "del" | "hunk" | "file" | "meta" | "context" {
  if (line.startsWith("@@")) {
    return "hunk";
  }
  if (line.startsWith("diff --git")) {
    return "meta";
  }
  if (
    line.startsWith("index ") ||
    line.startsWith("new file mode ") ||
    line.startsWith("deleted file mode ") ||
    line.startsWith("similarity index ") ||
    line.startsWith("rename from ") ||
    line.startsWith("rename to ") ||
    line.startsWith("\\ No newline at end of file")
  ) {
    return "meta";
  }
  if (line.startsWith("+++ ") || line.startsWith("--- ")) {
    return "file";
  }
  if (line.startsWith("+") && !line.startsWith("+++")) {
    return "add";
  }
  if (line.startsWith("-") && !line.startsWith("---")) {
    return "del";
  }
  return "context";
}

export function isUnifiedDiffText(text: string): boolean {
  const lines = text.split(/\r?\n/u);
  let hasFileHeader = false;
  let hasHunk = false;
  let hasDiffHeader = false;
  let hasBinaryHeader = false;
  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      hasDiffHeader = true;
    } else if (line.startsWith("--- ") || line.startsWith("+++ ")) {
      hasFileHeader = true;
    } else if (line.startsWith("@@")) {
      hasHunk = true;
    } else if (line.startsWith("Binary files ")) {
      hasBinaryHeader = true;
    }
  }
  if (hasDiffHeader && (hasFileHeader || hasHunk || hasBinaryHeader)) {
    return true;
  }
  if (hasFileHeader && hasHunk) {
    return true;
  }
  return false;
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
  const pathHint =
    resolvePathHintFromUnknown(value) ??
    resolvePathHintFromUnknown(contextValue) ??
    null;
  const mimeTypeHint =
    resolveMimeTypeHintFromUnknown(value) ??
    resolveMimeTypeHintFromUnknown(contextValue) ??
    null;
  const pathLanguage = resolveLanguageFromPathHint(pathHint);
  const mimeLanguage = resolveCodeLanguageFromMimeType(mimeTypeHint);
  const resolvedLanguage =
    pathLanguage.language !== null ? pathLanguage : mimeLanguage;

  if (normalizedToolName === "file_change") {
    const diffFromObject = resolveDiffTextFromUnknown(value);
    if (diffFromObject && isUnifiedDiffText(diffFromObject)) {
      return {
        text: diffFromObject,
        kind: "diff",
        language: null,
        useJsx: false,
        pathHint,
      };
    }
  }

  if (part === "input" && normalizedToolName === "command_execution") {
    const commandText = resolveCommandInputText(value);
    if (commandText) {
      return {
        text: commandText,
        kind: "code",
        language: CodeLanguageEnum.bash,
        useJsx: false,
        pathHint,
      };
    }
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (trimmed.length === 0) {
      return null;
    }
    if (isUnifiedDiffText(value)) {
      return {
        text: value,
        kind: "diff",
        language: null,
        useJsx: false,
        pathHint,
      };
    }
    const parsedJson = tryParseObjectOrArrayJson(value);
    if (parsedJson !== null) {
      return {
        text: JSON.stringify(parsedJson, null, 2),
        kind: "code",
        language: CodeLanguageEnum.json,
        useJsx: false,
        pathHint,
      };
    }
    if (resolvedLanguage.language !== null) {
      return {
        text: value,
        kind: "code",
        language: resolvedLanguage.language,
        useJsx: resolvedLanguage.useJsx,
        pathHint,
      };
    }
    return {
      text: value,
      kind: "plain",
      language: null,
      useJsx: false,
      pathHint,
    };
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return {
      text: String(value),
      kind: "plain",
      language: null,
      useJsx: false,
      pathHint,
    };
  }

  if (Array.isArray(value) || isRecord(value)) {
    return {
      text: formatStructuredOutputValue(value),
      kind: "code",
      language: CodeLanguageEnum.json,
      useJsx: false,
      pathHint,
    };
  }

  return {
    text: String(value),
    kind: "plain",
    language: null,
    useJsx: false,
    pathHint,
  };
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
