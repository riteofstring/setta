import { C } from "utils/c";

const CONTROL_CHAR_REGEX = /[\x00-\x1F\x7F]/;
const PYTHON_IDENTIFIER_REGEX = /^[A-Za-z_][A-Za-z0-9_]*$/;
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
  if (normalized.includes("/") || normalized.includes("\\")) {
    return `${options.label} cannot include path separators.`;
  }
  if (normalized.includes("..")) {
    return `${options.label} cannot include '..' path segments.`;
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

export function validateProjectNameInput(name: string): string | null {
  return validateName(name, {
    label: "Project name",
    reservedNames: PROJECT_RESERVED_NAMES,
    allowEmpty: false,
    requirePythonIdentifier: false,
  });
}

export function validateSectionNameInput(name: string): string | null {
  return validateName(name, {
    label: "Section name",
    reservedNames: SECTION_RESERVED_NAMES,
    allowEmpty: false,
    requirePythonIdentifier: false,
  });
}

export function validateParamNameInput(
  name: string,
  options: {
    allowEmpty: boolean;
    requirePythonIdentifier: boolean;
  },
): string | null {
  return validateName(name, {
    label: "Param name",
    reservedNames: PARAM_RESERVED_NAMES,
    allowEmpty: options.allowEmpty,
    requirePythonIdentifier: options.requirePythonIdentifier,
  });
}
