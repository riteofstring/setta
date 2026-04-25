function formatGeneratedOriginHost(hostname: string): string {
  if (hostname.includes(":") && !hostname.startsWith("[")) {
    return "[" + hostname + "]";
  }
  return hostname;
}

function parseGeneratedOrigin(
  rawOrigin: string | null | undefined,
): URL | null {
  if (typeof rawOrigin !== "string") {
    return null;
  }
  const trimmedOrigin = rawOrigin.trim();
  if (!trimmedOrigin) {
    return null;
  }
  try {
    return new URL(trimmedOrigin);
  } catch {
    return null;
  }
}

function isGeneratedHttpOrigin(parsedOrigin: URL): boolean {
  if (parsedOrigin.protocol !== "http:" && parsedOrigin.protocol !== "https:") {
    return false;
  }
  if (!parsedOrigin.hostname) {
    return false;
  }
  return !parsedOrigin.username && !parsedOrigin.password;
}

function formatNormalizedGeneratedOrigin(parsedOrigin: URL): string {
  const formattedHost = formatGeneratedOriginHost(parsedOrigin.hostname);
  const port = parsedOrigin.port.trim();
  if (!port) {
    return parsedOrigin.protocol + "//" + formattedHost;
  }
  return parsedOrigin.protocol + "//" + formattedHost + ":" + port;
}

export function normalizeGeneratedOrigin(
  rawOrigin: string | null | undefined,
): string | null {
  const parsedOrigin = parseGeneratedOrigin(rawOrigin);
  if (!parsedOrigin) {
    return null;
  }
  if (!isGeneratedHttpOrigin(parsedOrigin)) {
    return null;
  }
  return formatNormalizedGeneratedOrigin(parsedOrigin);
}

export function normalizeGeneratedToolName(
  rawToolName: string | null | undefined,
  singlePrefix: string,
  doublePrefix: string,
  askUserQuestionToolName: string,
): string | null {
  if (typeof rawToolName !== "string") {
    return null;
  }
  const trimmed = rawToolName.trim();
  if (!trimmed) {
    return null;
  }
  let normalized = trimmed;
  if (normalized.startsWith("mcp__")) {
    normalized = normalized.slice("mcp__".length);
  }
  if (
    normalized.startsWith(singlePrefix) &&
    !normalized.startsWith(doublePrefix)
  ) {
    normalized = doublePrefix + normalized.slice(singlePrefix.length);
  }
  if (!trimmed.startsWith("mcp__") && normalized.toLowerCase() === "question") {
    return askUserQuestionToolName;
  }
  return normalized;
}

function hasGeneratedControlCharacters(value: string): boolean {
  for (const char of value) {
    const codepoint = char.codePointAt(0);
    if (codepoint !== undefined && (codepoint < 32 || codepoint === 127)) {
      return true;
    }
  }
  return false;
}

function getGeneratedPathError(value: string, label: string): string | null {
  if (value.includes("/") || value.includes("\\")) {
    return label + " cannot include path separators.";
  }
  if (value.includes("..")) {
    return label + " cannot include '..' path segments.";
  }
  return null;
}

function validateGeneratedCommonNameInput(
  name: string,
  options: {
    allowEmpty: boolean;
    label: string;
    skipPathChecks?: boolean;
  },
): string | null {
  const normalized = name.trim();
  if (!normalized) {
    return options.allowEmpty ? null : options.label + " cannot be empty.";
  }
  if (hasGeneratedControlCharacters(normalized)) {
    return options.label + " cannot include control characters.";
  }
  if (options.skipPathChecks ?? false) {
    return null;
  }
  return getGeneratedPathError(normalized, options.label);
}

export function validateGeneratedSimpleNameInput(
  name: string,
  label: string,
  reservedNames: ReadonlySet<string>,
  allowedChars: ReadonlySet<string>,
  allowReserved: boolean = false,
): string | null {
  const baseError = validateGeneratedCommonNameInput(name, {
    allowEmpty: false,
    label,
  });
  if (baseError) {
    return baseError;
  }
  const normalized = name.trim();
  for (const char of normalized) {
    if (!allowedChars.has(char)) {
      return label + " can only contain letters, numbers, spaces, '_' and '-'.";
    }
  }
  if (!allowReserved && reservedNames.has(normalized.toLowerCase())) {
    return label + " '" + normalized + "' is reserved.";
  }
  return null;
}

export function sanitizeGeneratedSimpleNameSlug(
  name: string,
  replacementChars: ReadonlySet<string>,
): string {
  let output = "";
  for (const char of name) {
    output += replacementChars.has(char) ? "_" : char;
  }
  while (output.includes("__")) {
    output = output.replace("__", "_");
  }
  while (output.startsWith("_")) {
    output = output.slice(1);
  }
  while (output.endsWith("_")) {
    output = output.slice(0, -1);
  }
  return output.toLowerCase();
}

export function isGeneratedPythonIdentifier(
  value: string,
  startChars: ReadonlySet<string>,
  continueChars: ReadonlySet<string>,
): boolean {
  let index = 0;
  for (const char of value) {
    if (index === 0) {
      if (!startChars.has(char)) {
        return false;
      }
    } else if (!continueChars.has(char)) {
      return false;
    }
    index += 1;
  }
  return index > 0;
}

export function validateGeneratedParamNameInput(
  name: string,
  options: {
    allowEmpty: boolean;
    requirePythonIdentifier: boolean;
    skipPathChecks?: boolean;
  },
  pythonKeywords: ReadonlySet<string>,
  isPythonIdentifier: (value: string) => boolean,
): string | null {
  const baseError = validateGeneratedCommonNameInput(name, {
    allowEmpty: options.allowEmpty,
    label: "Param name",
    skipPathChecks: options.skipPathChecks,
  });
  if (baseError) {
    return baseError;
  }
  const normalized = name.trim();
  if (!normalized) {
    return null;
  }
  if (options.requirePythonIdentifier) {
    if (!isPythonIdentifier(normalized)) {
      return "Param name must be a valid Python identifier.";
    }
    if (pythonKeywords.has(normalized)) {
      return "Param name cannot be a Python keyword.";
    }
  }
  return null;
}
