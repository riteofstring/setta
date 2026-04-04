package frontendbindings

import "setta/internal/projectstate"

func nameValidationSupportDeclarations() []TypeDeclaration {
	contract := projectstate.FrontendNameValidationContractData()
	return []TypeDeclaration{
		objectDeclaration(
			"GeneratedProjectNameValidationOptions",
			TypeProperty{Name: "allowReserved", TypeExpr: "boolean", Optional: true},
		),
		objectDeclaration(
			"GeneratedParamNameValidationOptions",
			TypeProperty{Name: "allowEmpty", TypeExpr: "boolean"},
			TypeProperty{Name: "requirePythonIdentifier", TypeExpr: "boolean"},
			TypeProperty{Name: "skipPathChecks", TypeExpr: "boolean", Optional: true},
		),
		setDeclaration(
			"generatedSimpleNameAllowedChars",
			"string",
			false,
			tsStringLiteralMembers(contract.SimpleNameAllowedChars)...,
		),
		setDeclaration(
			"generatedProjectReservedNames",
			"string",
			false,
			tsStringLiteralMembers(contract.ProjectReservedNames)...,
		),
		setDeclaration(
			"generatedPythonIdentifierStartChars",
			"string",
			false,
			tsStringLiteralMembers(contract.PythonIdentifierStartChars)...,
		),
		setDeclaration(
			"generatedPythonIdentifierContinueChars",
			"string",
			false,
			tsStringLiteralMembers(contract.PythonIdentifierContinueChars)...,
		),
		setDeclaration(
			"generatedPythonKeywords",
			"string",
			false,
			tsStringLiteralMembers(contract.PythonKeywords)...,
		),
		setDeclaration(
			"generatedSlugReplacementChars",
			"string",
			false,
			tsStringLiteralMembers(contract.SlugReplacementChars)...,
		),
		constDeclaration("generatedEmptyNameValidationSet", false, "new Set<string>()"),
		functionDeclaration(
			"validateGeneratedSimpleNameInput",
			false,
			"string | null",
			buildValidateGeneratedSimpleNameInputBody(),
			TypeProperty{Name: "name", TypeExpr: "string"},
			TypeProperty{Name: "label", TypeExpr: "string"},
			TypeProperty{Name: "reservedNames", TypeExpr: "ReadonlySet<string>"},
			TypeProperty{Name: "allowReserved", TypeExpr: "boolean", DefaultValue: "false"},
		),
		functionDeclaration(
			"sanitizeGeneratedSimpleNameSlug",
			false,
			"string",
			buildSanitizeGeneratedSimpleNameSlugBody(),
			TypeProperty{Name: "name", TypeExpr: "string"},
		),
		functionDeclaration(
			"isGeneratedPythonIdentifier",
			false,
			"boolean",
			buildIsGeneratedPythonIdentifierBody(),
			TypeProperty{Name: "value", TypeExpr: "string"},
		),
		exportedFunctionDeclaration(
			"validateGeneratedProjectNameInput",
			"string | null",
			buildValidateGeneratedProjectNameInputBody(),
			TypeProperty{Name: "name", TypeExpr: "string"},
			TypeProperty{
				Name:         "options",
				TypeExpr:     "GeneratedProjectNameValidationOptions",
				DefaultValue: "{} as GeneratedProjectNameValidationOptions",
			},
		),
		exportedFunctionDeclaration(
			"validateGeneratedViewModeNameInput",
			"string | null",
			buildValidateGeneratedViewModeNameInputBody(),
			TypeProperty{Name: "name", TypeExpr: "string"},
		),
		exportedFunctionDeclaration(
			"validateGeneratedWindowSpaceNameInput",
			"string | null",
			buildValidateGeneratedWindowSpaceNameInputBody(),
			TypeProperty{Name: "name", TypeExpr: "string"},
		),
		exportedFunctionDeclaration(
			"validateGeneratedSectionNameInput",
			"string | null",
			buildValidateGeneratedSectionNameInputBody(),
			TypeProperty{Name: "name", TypeExpr: "string"},
		),
		exportedFunctionDeclaration(
			"validateGeneratedParamNameInput",
			"string | null",
			buildValidateGeneratedParamNameInputBody(),
			TypeProperty{Name: "name", TypeExpr: "string"},
			TypeProperty{Name: "options", TypeExpr: "GeneratedParamNameValidationOptions"},
		),
	}
}

func tsStringLiteralMembers(values []string) []string {
	members := make([]string, 0, len(values))
	for _, value := range values {
		members = append(members, tsStringLiteralExpr(value))
	}
	return members
}

func buildValidateGeneratedSimpleNameInputBody() string {
	return `const normalized = name.trim();
if (!normalized) {
  return label + " cannot be empty.";
}
for (const char of normalized) {
  const codepoint = char.codePointAt(0);
  if (codepoint !== undefined && (codepoint < 32 || codepoint === 127)) {
    return label + " cannot include control characters.";
  }
}
if (normalized.includes("/") || normalized.includes("\\")) {
  return label + " cannot include path separators.";
}
if (normalized.includes("..")) {
  return label + " cannot include '..' path segments.";
}
for (const char of normalized) {
  if (!generatedSimpleNameAllowedChars.has(char)) {
    return label + " can only contain letters, numbers, spaces, '_' and '-'.";
  }
}
if (!allowReserved && reservedNames.has(normalized.toLowerCase())) {
  return label + " '" + normalized + "' is reserved.";
}
return null;`
}

func buildSanitizeGeneratedSimpleNameSlugBody() string {
	return `let output = "";
for (const char of name) {
  output += generatedSlugReplacementChars.has(char) ? "_" : char;
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
return output.toLowerCase();`
}

func buildIsGeneratedPythonIdentifierBody() string {
	return `let index = 0;
for (const char of value) {
  if (index === 0) {
    if (!generatedPythonIdentifierStartChars.has(char)) {
      return false;
    }
  } else if (!generatedPythonIdentifierContinueChars.has(char)) {
    return false;
  }
  index += 1;
}
return index > 0;`
}

func buildValidateGeneratedProjectNameInputBody() string {
	return `const allowReserved = options.allowReserved ?? false;
const baseError = validateGeneratedSimpleNameInput(
  name,
  "Project name",
  generatedProjectReservedNames,
  allowReserved,
);
if (baseError) {
  return baseError;
}
if (!sanitizeGeneratedSimpleNameSlug(name.trim())) {
  return "Project name is invalid after sanitization.";
}
return null;`
}

func buildValidateGeneratedViewModeNameInputBody() string {
	return `const baseError = validateGeneratedSimpleNameInput(
  name,
  "View mode name",
  generatedProjectReservedNames,
);
if (baseError) {
  return baseError;
}
if (!sanitizeGeneratedSimpleNameSlug(name.trim())) {
  return "View mode name is invalid after sanitization.";
}
return null;`
}

func buildValidateGeneratedWindowSpaceNameInputBody() string {
	return `const baseError = validateGeneratedSimpleNameInput(
  name,
  "Window space name",
  generatedEmptyNameValidationSet,
);
if (baseError) {
  return baseError;
}
if (!sanitizeGeneratedSimpleNameSlug(name.trim())) {
  return "Window space name is invalid after sanitization.";
}
return null;`
}

func buildValidateGeneratedSectionNameInputBody() string {
	return `return validateGeneratedSimpleNameInput(
  name,
  "Section name",
  generatedEmptyNameValidationSet,
);`
}

func buildValidateGeneratedParamNameInputBody() string {
	return `const normalized = name.trim();
if (!normalized) {
  return options.allowEmpty ? null : "Param name cannot be empty.";
}
for (const char of normalized) {
  const codepoint = char.codePointAt(0);
  if (codepoint !== undefined && (codepoint < 32 || codepoint === 127)) {
    return "Param name cannot include control characters.";
  }
}
if (!(options.skipPathChecks ?? false)) {
  if (normalized.includes("/") || normalized.includes("\\")) {
    return "Param name cannot include path separators.";
  }
  if (normalized.includes("..")) {
    return "Param name cannot include '..' path segments.";
  }
}
if (options.requirePythonIdentifier) {
  if (!isGeneratedPythonIdentifier(normalized)) {
    return "Param name must be a valid Python identifier.";
  }
  if (generatedPythonKeywords.has(normalized)) {
    return "Param name cannot be a Python keyword.";
  }
}
return null;`
}
