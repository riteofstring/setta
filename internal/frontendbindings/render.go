package frontendbindings

import (
	"bytes"
	_ "embed"
	"fmt"
	"reflect"
	"regexp"
	"strings"
	"text/template"
)

//go:embed templates/types.ts.tmpl
var typesTemplateText string

// setta-go-type-discovery: skip
type GeneratedBindings struct {
	TypesTS string
}

type emittedSymbol struct {
	Name   string
	Origin string
}

var tsIdentifierPattern = regexp.MustCompile(`^[A-Za-z_$][A-Za-z0-9_$]*$`)

var tsReservedBindingKeywords = map[string]struct{}{
	"break": {}, "case": {}, "catch": {}, "class": {}, "const": {}, "continue": {},
	"debugger": {}, "default": {}, "delete": {}, "do": {}, "else": {}, "enum": {},
	"export": {}, "extends": {}, "false": {}, "finally": {}, "for": {}, "function": {},
	"if": {}, "import": {}, "in": {}, "instanceof": {}, "new": {}, "null": {},
	"return": {}, "super": {}, "switch": {}, "this": {}, "throw": {}, "true": {},
	"try": {}, "typeof": {}, "var": {}, "void": {}, "while": {}, "with": {},
	"implements": {}, "interface": {}, "let": {}, "package": {}, "private": {},
	"protected": {}, "public": {}, "static": {}, "yield": {},
}

func Build() (GeneratedBindings, error) {
	converter := newTypeConverter()
	for _, extraType := range CurrentAdditionalTypeRoots() {
		if err := converter.AddRootType(extraType); err != nil {
			return GeneratedBindings{}, err
		}
	}

	extraDeclarations := CurrentAdditionalDeclarations(converter)
	declarations := append(converter.Declarations(), extraDeclarations...)
	if err := validateTypeDeclarations(declarations); err != nil {
		return GeneratedBindings{}, err
	}

	typesTS, err := renderTemplate(typesTemplateText, map[string]any{
		"Declarations": declarations,
	})
	if err != nil {
		return GeneratedBindings{}, err
	}

	return GeneratedBindings{
		TypesTS: typesTS,
	}, nil
}

func validateTypeDeclarations(declarations []TypeDeclaration) error {
	seenNames := make(map[string]string, len(declarations))
	typeSymbols := map[string]string{
		"ObjectValues":          "shared helper type alias",
		"GeneratedMutableValue": "shared helper type alias",
	}
	valueSymbols := map[string]string{
		"cloneGeneratedValue":   "shared helper function",
		"mergeGeneratedOptions": "shared helper function",
	}
	for index, declaration := range declarations {
		if declaration.Name == "" {
			return fmt.Errorf("declaration at index %d has empty name", index)
		}
		if err := validateTSBindingIdentifier("declaration "+declaration.Name, declaration.Name); err != nil {
			return err
		}
		switch declaration.Kind {
		case "object", "enum", "alias", "local_alias", "set", "type_guard", "function", "const":
		default:
			return fmt.Errorf("declaration %s: unsupported kind %q", declaration.Name, declaration.Kind)
		}
		if err := validateTypeDeclarationShape(declaration); err != nil {
			return err
		}
		if previousKind, exists := seenNames[declaration.Name]; exists {
			return fmt.Errorf(
				"duplicate declaration %q for kinds %q and %q",
				declaration.Name,
				previousKind,
				declaration.Kind,
			)
		}
		seenNames[declaration.Name] = declaration.Kind

		if err := recordEmittedSymbols(typeSymbols, emittedTypeSymbolsForDeclaration(declaration), "type"); err != nil {
			return err
		}
		if err := recordEmittedSymbols(valueSymbols, emittedValueSymbolsForDeclaration(declaration), "value"); err != nil {
			return err
		}
	}

	return nil
}

func emittedTypeSymbolsForDeclaration(declaration TypeDeclaration) []emittedSymbol {
	switch declaration.Kind {
	case "object", "enum", "alias", "local_alias":
		return []emittedSymbol{{
			Name:   declaration.Name,
			Origin: "declaration " + declaration.Name,
		}}
	default:
		return nil
	}
}

func emittedValueSymbolsForDeclaration(declaration TypeDeclaration) []emittedSymbol {
	symbols := make([]emittedSymbol, 0, 2)
	switch declaration.Kind {
	case "enum":
		symbols = append(symbols, emittedSymbol{
			Name:   declaration.Name + "Enum",
			Origin: "declaration " + declaration.Name + " enum helper",
		})
	case "object":
		if declaration.CreateExpr != "" || declaration.CreateBody != "" {
			symbols = append(symbols, emittedSymbol{
				Name:   "create" + declaration.Name,
				Origin: "declaration " + declaration.Name + " factory helper",
			})
		}
	case "alias":
		if declaration.CreateExpr != "" {
			symbols = append(symbols, emittedSymbol{
				Name:   "create" + declaration.Name,
				Origin: "declaration " + declaration.Name + " factory helper",
			})
		}
	case "set", "type_guard", "function", "const":
		symbols = append(symbols, emittedSymbol{
			Name:   declaration.Name,
			Origin: "declaration " + declaration.Name,
		})
	}
	return symbols
}

func recordEmittedSymbols(seen map[string]string, symbols []emittedSymbol, namespace string) error {
	for _, symbol := range symbols {
		if previousOrigin, exists := seen[symbol.Name]; exists {
			return fmt.Errorf(
				"%s symbol %q conflicts between %s and %s",
				namespace,
				symbol.Name,
				previousOrigin,
				symbol.Origin,
			)
		}
		seen[symbol.Name] = symbol.Origin
	}
	return nil
}

func validateTypeDeclarationShape(declaration TypeDeclaration) error {
	switch declaration.Kind {
	case "object":
		if declaration.CreateExpr != "" && declaration.CreateBody != "" {
			return fmt.Errorf("declaration %s: object cannot set both create expr and create body", declaration.Name)
		}
		if err := validateDeclarationProperties(declaration.Name, "property", declaration.Properties); err != nil {
			return err
		}
	case "enum":
		for index, value := range declaration.EnumValues {
			if value.Name == "" {
				return fmt.Errorf("declaration %s: enum value at index %d has empty name", declaration.Name, index)
			}
			if err := validateTSObjectLiteralPropertyName(
				fmt.Sprintf("declaration %s: enum value %q", declaration.Name, value.Name),
				value.Name,
			); err != nil {
				return err
			}
		}
	case "alias", "local_alias":
		if strings.TrimSpace(declaration.Alias) == "" {
			return fmt.Errorf("declaration %s: %s requires alias expression", declaration.Name, declaration.Kind)
		}
	case "set":
		if strings.TrimSpace(declaration.SetElementType) == "" {
			return fmt.Errorf("declaration %s: set requires element type", declaration.Name)
		}
		for index, member := range declaration.SetMembers {
			if strings.TrimSpace(member) == "" {
				return fmt.Errorf("declaration %s: set member at index %d is empty", declaration.Name, index)
			}
		}
	case "type_guard":
		if strings.TrimSpace(declaration.GuardInputType) == "" {
			return fmt.Errorf("declaration %s: type guard requires input type", declaration.Name)
		}
		if strings.TrimSpace(declaration.GuardReturnType) == "" {
			return fmt.Errorf("declaration %s: type guard requires return type", declaration.Name)
		}
		if strings.TrimSpace(declaration.GuardSetName) == "" {
			return fmt.Errorf("declaration %s: type guard requires backing set name", declaration.Name)
		}
	case "function":
		if strings.TrimSpace(declaration.FunctionReturn) == "" {
			return fmt.Errorf("declaration %s: function requires return type", declaration.Name)
		}
		if strings.TrimSpace(declaration.FunctionBody) == "" {
			return fmt.Errorf("declaration %s: function requires body", declaration.Name)
		}
		if err := validateDeclarationProperties(declaration.Name, "function parameter", declaration.FunctionParams); err != nil {
			return err
		}
		for _, param := range declaration.FunctionParams {
			if param.Optional && param.DefaultValue != "" {
				return fmt.Errorf(
					"declaration %s: function parameter %q cannot be optional and have a default value",
					declaration.Name,
					param.Name,
				)
			}
		}
	case "const":
		if strings.TrimSpace(declaration.ConstExpr) == "" {
			return fmt.Errorf("declaration %s: const requires expression", declaration.Name)
		}
	}

	return nil
}

func validateDeclarationProperties(declarationName string, propertyKind string, properties []TypeProperty) error {
	seenNames := make(map[string]struct{}, len(properties))
	for index, property := range properties {
		if property.Name == "" {
			return fmt.Errorf("declaration %s: %s at index %d has empty name", declarationName, propertyKind, index)
		}
		context := fmt.Sprintf("declaration %s: %s %q", declarationName, propertyKind, property.Name)
		if propertyKind == "function parameter" {
			if err := validateTSBindingIdentifier(context, property.Name); err != nil {
				return err
			}
		} else {
			if err := validateTSIdentifier(context, property.Name); err != nil {
				return err
			}
		}
		if strings.TrimSpace(property.TypeExpr) == "" {
			return fmt.Errorf("declaration %s: %s %q has empty type", declarationName, propertyKind, property.Name)
		}
		if _, exists := seenNames[property.Name]; exists {
			return fmt.Errorf("declaration %s: duplicate %s %q", declarationName, propertyKind, property.Name)
		}
		seenNames[property.Name] = struct{}{}
	}

	return nil
}

func validateTSIdentifier(context string, name string) error {
	if tsIdentifierPattern.MatchString(name) {
		return nil
	}
	return fmt.Errorf("%s must be a valid TypeScript identifier", context)
}

func validateTSBindingIdentifier(context string, name string) error {
	if err := validateTSIdentifier(context, name); err != nil {
		return err
	}
	if _, exists := tsReservedBindingKeywords[name]; exists {
		return fmt.Errorf("%s cannot use reserved TypeScript keyword %q", context, name)
	}
	return nil
}

func validateTSObjectLiteralPropertyName(context string, name string) error {
	if err := validateTSIdentifier(context, name); err != nil {
		return err
	}
	if name == "__proto__" {
		return fmt.Errorf("%s cannot be %q in generated object literals", context, name)
	}
	return nil
}

func frontendTypeName(t reflect.Type) string {
	if t == nil {
		return ""
	}
	for t.Kind() == reflect.Pointer {
		t = t.Elem()
	}
	if t == nil || t.Name() == "" || t.PkgPath() == "" {
		return ""
	}
	return frontendBindingTypeName(t)
}

func tsTypeReference(t reflect.Type) string {
	if t == nil {
		return "null"
	}
	nullable := false
	for t.Kind() == reflect.Pointer {
		nullable = true
		t = t.Elem()
	}
	t = canonicalFrontendBindingType(t)
	if t == nil {
		return "null"
	}
	ref := "null"
	if t.PkgPath() != "" && t.Name() != "" {
		ref = "gt." + frontendBindingTypeName(t)
	}
	if nullable && ref != "null" {
		return ref + " | null"
	}
	return ref
}

func renderTemplate(source string, data any) (string, error) {
	tmpl, err := template.New("").Option("missingkey=error").Parse(source)
	if err != nil {
		return "", fmt.Errorf("parse template: %w", err)
	}
	var out bytes.Buffer
	if err := tmpl.Execute(&out, data); err != nil {
		return "", fmt.Errorf("execute template: %w", err)
	}
	return out.String(), nil
}
