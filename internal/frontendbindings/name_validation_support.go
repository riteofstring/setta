package frontendbindings

import (
	_ "embed"
	"strings"

	"setta/internal/projectstate"
)

//go:embed templates/name_validation_validate_named_simple_name.ts.tmpl
var validateNamedSimpleNameTemplate string

type namedSimpleNameValidationTemplateData struct {
	Prelude                         string
	Label                           string
	ReservedNamesSet                string
	AllowReservedExpr               string
	RequireSanitizedSlug            bool
	InvalidAfterSanitizationMessage string
}

// The frontend keeps a minimal mirror of Go-owned name validation so rename
// inputs can reject obviously invalid values before a round trip. Go remains
// authoritative for persistence and websocket validation state.
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
			renderNamedSimpleNameValidationBody(namedSimpleNameValidationTemplateData{
				Prelude:                         "const allowReserved = options.allowReserved ?? false;",
				Label:                           "Project name",
				ReservedNamesSet:                "generatedProjectReservedNames",
				AllowReservedExpr:               "allowReserved",
				RequireSanitizedSlug:            true,
				InvalidAfterSanitizationMessage: "Project name is invalid after sanitization.",
			}),
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
			renderNamedSimpleNameValidationBody(namedSimpleNameValidationTemplateData{
				Label:                           "View mode name",
				ReservedNamesSet:                "generatedProjectReservedNames",
				RequireSanitizedSlug:            true,
				InvalidAfterSanitizationMessage: "View mode name is invalid after sanitization.",
			}),
			TypeProperty{Name: "name", TypeExpr: "string"},
		),
		exportedFunctionDeclaration(
			"validateGeneratedWindowSpaceNameInput",
			"string | null",
			renderNamedSimpleNameValidationBody(namedSimpleNameValidationTemplateData{
				Label:                           "Window space name",
				ReservedNamesSet:                "generatedEmptyNameValidationSet",
				RequireSanitizedSlug:            true,
				InvalidAfterSanitizationMessage: "Window space name is invalid after sanitization.",
			}),
			TypeProperty{Name: "name", TypeExpr: "string"},
		),
		exportedFunctionDeclaration(
			"validateGeneratedSectionNameInput",
			"string | null",
			renderNamedSimpleNameValidationBody(namedSimpleNameValidationTemplateData{
				Label:            "Section name",
				ReservedNamesSet: "generatedEmptyNameValidationSet",
			}),
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
	return strings.Join([]string{
		"  return generatedBindingRuntime.validateGeneratedSimpleNameInput(",
		"    name,",
		"    label,",
		"    reservedNames,",
		"    generatedSimpleNameAllowedChars,",
		"    allowReserved,",
		"  );",
	}, "\n")
}

func buildSanitizeGeneratedSimpleNameSlugBody() string {
	return "  return generatedBindingRuntime.sanitizeGeneratedSimpleNameSlug(name, generatedSlugReplacementChars);"
}

func buildIsGeneratedPythonIdentifierBody() string {
	return strings.Join([]string{
		"  return generatedBindingRuntime.isGeneratedPythonIdentifier(",
		"    value,",
		"    generatedPythonIdentifierStartChars,",
		"    generatedPythonIdentifierContinueChars,",
		"  );",
	}, "\n")
}

func buildValidateGeneratedParamNameInputBody() string {
	return strings.Join([]string{
		"  return generatedBindingRuntime.validateGeneratedParamNameInput(",
		"    name,",
		"    options,",
		"    generatedPythonKeywords,",
		"    (candidate: string) =>",
		"      generatedBindingRuntime.isGeneratedPythonIdentifier(",
		"        candidate,",
		"        generatedPythonIdentifierStartChars,",
		"        generatedPythonIdentifierContinueChars,",
		"      ),",
		"  );",
	}, "\n")
}

func renderNamedSimpleNameValidationBody(data namedSimpleNameValidationTemplateData) string {
	return mustRenderNameValidationTemplate(validateNamedSimpleNameTemplate, data)
}

func mustRenderNameValidationTemplate(source string, data any) string {
	return mustRenderFrontendBindingTemplate("name validation", source, data)
}
