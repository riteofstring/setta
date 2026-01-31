import { C } from "utils/c";

const CONTROL_CHAR_REGEX = /[\x00-\x1F\x7F]/;
const SIMPLE_NAME_REGEX = /^[A-Za-z0-9 _-]+$/;
const PYTHON_IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
const PYTHON_IDENTIFIER_INVALID_CHARS = /\W/g;
const PYTHON_KEYWORDS = new Set([
  "False",
  "None",
  "True",
  "and",
  "as",
  "assert",
  "async",
  "await",
  "break",
  "class",
  "continue",
  "def",
  "del",
  "elif",
  "else",
  "except",
  "finally",
  "for",
  "from",
  "global",
  "if",
  "import",
  "in",
  "is",
  "lambda",
  "match",
  "nonlocal",
  "not",
  "or",
  "pass",
  "case",
  "raise",
  "return",
  "type",
  "try",
  "while",
  "with",
  "yield",
]);

const PROJECT_RESERVED_NAMES = ["home", C.SETTINGS_PROJECT_NAME].map((name) =>
  name.toLowerCase(),
);
const SECTION_RESERVED_NAMES: Array<string> = [];
const PARAM_RESERVED_NAMES: Array<string> = [];

type NameValidationOptions = {
  label: string;
  reservedNames: Array<string>;
  allowEmpty: boolean;
  requirePythonIdentifier: boolean;
  allowedCharsRegex?: RegExp;
  skipPathChecks?: boolean;
};

function validateName(
  value: string,
  options: NameValidationOptions,
): string | null {
  const normalized = value.trim();
  if (!normalized) {
    if (options.allowEmpty) {
      return null;
    }
    return `${options.label} cannot be empty.`;
  }
  if (CONTROL_CHAR_REGEX.test(normalized)) {
    return `${options.label} cannot include control characters.`;
  }
  if (!options.skipPathChecks) {
    if (normalized.includes("/") || normalized.includes("\\")) {
      return `${options.label} cannot include path separators.`;
    }
    if (normalized.includes("..")) {
      return `${options.label} cannot include '..' path segments.`;
    }
  }
  if (
    options.allowedCharsRegex &&
    !options.allowedCharsRegex.test(normalized)
  ) {
    return `${options.label} can only contain letters, numbers, spaces, '_' and '-'.`;
  }
  if (options.reservedNames.includes(normalized.toLowerCase())) {
    return `${options.label} '${normalized}' is reserved.`;
  }
  if (options.requirePythonIdentifier) {
    if (!PYTHON_IDENTIFIER_REGEX.test(normalized)) {
      return `${options.label} must be a valid Python identifier.`;
    }
    if (PYTHON_KEYWORDS.has(normalized)) {
      return `${options.label} cannot be a Python keyword.`;
    }
  }
  return null;
}

export function validateProjectNameInput(
  name: string,
  options?: { allowReserved?: boolean },
): string | null {
  const allowReserved = options?.allowReserved ?? false;
  const reservedNames = allowReserved ? [] : PROJECT_RESERVED_NAMES;
  const baseError = validateName(name, {
    label: "Project name",
    reservedNames,
    allowEmpty: false,
    allowedCharsRegex: SIMPLE_NAME_REGEX,
    requirePythonIdentifier: false,
  });
  if (baseError) {
    return baseError;
  }
  const normalized = name.trim();
  const slug = sanitizeNameForSlug(normalized);
  if (!slug) {
    return "Project name is invalid after sanitization.";
  }
  return null;
}

export function validateViewModeNameInput(name: string): string | null {
  const baseError = validateName(name, {
    label: "View mode name",
    reservedNames: PROJECT_RESERVED_NAMES,
    allowEmpty: false,
    allowedCharsRegex: SIMPLE_NAME_REGEX,
    requirePythonIdentifier: false,
  });
  if (baseError) {
    return baseError;
  }
  const normalized = name.trim();
  const slug = sanitizeNameForSlug(normalized);
  if (!slug) {
    return "View mode name is invalid after sanitization.";
  }
  return null;
}

export function validateSectionNameInput(name: string): string | null {
  return validateName(name, {
    label: "Section name",
    reservedNames: SECTION_RESERVED_NAMES,
    allowEmpty: false,
    allowedCharsRegex: SIMPLE_NAME_REGEX,
    requirePythonIdentifier: false,
  });
}

export function validateParamNameInput(
  name: string,
  options: {
    allowEmpty: boolean;
    requirePythonIdentifier: boolean;
    skipPathChecks?: boolean;
  },
): string | null {
  return validateName(name, {
    label: "Param name",
    reservedNames: PARAM_RESERVED_NAMES,
    allowEmpty: options.allowEmpty,
    requirePythonIdentifier: options.requirePythonIdentifier,
    skipPathChecks: options.skipPathChecks,
  });
}

export function sanitizeNameForSlug(name: string): string {
  const invalidChars = "[]\"' ";
  let output = "";
  for (const char of name) {
    output += invalidChars.includes(char) ? "_" : char;
  }
  while (output.includes("__")) {
    output = output.replace("__", "_");
  }
  return output.replace(/^_+|_+$/g, "").toLowerCase();
}

export function sanitizeNameForPythonIdentifier(name: string): string {
  let sanitized = name.replace(PYTHON_IDENTIFIER_INVALID_CHARS, "_");
  if (!sanitized) {
    sanitized = "_";
  }
  if (/^\d/.test(sanitized)) {
    sanitized = `_${sanitized}`;
  }
  if (PYTHON_KEYWORDS.has(sanitized)) {
    sanitized = `_${sanitized}`;
  }
  if (!PYTHON_IDENTIFIER_REGEX.test(sanitized)) {
    sanitized = sanitized.replace(/[^A-Za-z0-9_]/g, "_");
    if (!sanitized) {
      sanitized = "_";
    }
    if (/^\d/.test(sanitized)) {
      sanitized = `_${sanitized}`;
    }
    if (PYTHON_KEYWORDS.has(sanitized)) {
      sanitized = `_${sanitized}`;
    }
  }
  return sanitized;
}
