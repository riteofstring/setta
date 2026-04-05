import {
  GENERATED_NAME_VALIDATION_CONTRACT,
  type GeneratedNameValidationContract,
} from "utils/generatedTypes";
import {
  isGeneratedPythonIdentifier,
  sanitizeGeneratedSimpleNameSlug,
  validateGeneratedParamNameInput,
  validateGeneratedSimpleNameInput,
} from "./bindingRuntime";

type ProjectNameValidationOptions = {
  allowReserved?: boolean;
};

type ParamNameValidationOptions = {
  allowEmpty: boolean;
  requirePythonIdentifier: boolean;
  skipPathChecks?: boolean;
};

const generatedNameValidation: GeneratedNameValidationContract =
  GENERATED_NAME_VALIDATION_CONTRACT;

const simpleNameAllowedChars = new Set(
  generatedNameValidation.simpleNameAllowedChars,
);
const projectReservedNames = new Set(
  generatedNameValidation.projectReservedNames,
);
const pythonIdentifierStartChars = new Set(
  generatedNameValidation.pythonIdentifierStartChars,
);
const pythonIdentifierContinueChars = new Set(
  generatedNameValidation.pythonIdentifierContinueChars,
);
const pythonKeywords = new Set(generatedNameValidation.pythonKeywords);
const slugReplacementChars = new Set(
  generatedNameValidation.slugReplacementChars,
);
const emptyNameValidationSet = new Set<string>();

function validateSimpleNameInput(
  name: string,
  label: string,
  reservedNames: ReadonlySet<string>,
  allowReserved: boolean = false,
): string | null {
  return validateGeneratedSimpleNameInput(
    name,
    label,
    reservedNames,
    simpleNameAllowedChars,
    allowReserved,
  );
}

function sanitizeSimpleNameSlug(name: string): string {
  return sanitizeGeneratedSimpleNameSlug(name, slugReplacementChars);
}

function isPythonIdentifier(value: string): boolean {
  return isGeneratedPythonIdentifier(
    value,
    pythonIdentifierStartChars,
    pythonIdentifierContinueChars,
  );
}

export function validateProjectNameInput(
  name: string,
  options: ProjectNameValidationOptions = {},
): string | null {
  const allowReserved = options.allowReserved ?? false;
  const baseError = validateSimpleNameInput(
    name,
    "Project name",
    projectReservedNames,
    allowReserved,
  );
  if (baseError) {
    return baseError;
  }
  if (!sanitizeSimpleNameSlug(name.trim())) {
    return "Project name is invalid after sanitization.";
  }
  return null;
}

export function validateViewModeNameInput(name: string): string | null {
  const baseError = validateSimpleNameInput(
    name,
    "View mode name",
    projectReservedNames,
  );
  if (baseError) {
    return baseError;
  }
  if (!sanitizeSimpleNameSlug(name.trim())) {
    return "View mode name is invalid after sanitization.";
  }
  return null;
}

export function validateWindowSpaceNameInput(name: string): string | null {
  const baseError = validateSimpleNameInput(
    name,
    "Window space name",
    emptyNameValidationSet,
  );
  if (baseError) {
    return baseError;
  }
  if (!sanitizeSimpleNameSlug(name.trim())) {
    return "Window space name is invalid after sanitization.";
  }
  return null;
}

export function validateSectionNameInput(name: string): string | null {
  return validateSimpleNameInput(name, "Section name", emptyNameValidationSet);
}

export function validateParamNameInput(
  name: string,
  options: ParamNameValidationOptions,
): string | null {
  return validateGeneratedParamNameInput(
    name,
    options,
    pythonKeywords,
    isPythonIdentifier,
  );
}
