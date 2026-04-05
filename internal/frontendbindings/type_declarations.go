package frontendbindings

import (
	"fmt"
	"strings"
)

// setta-go-type-discovery: skip
type TypeDeclaration struct {
	Name            string
	Kind            string
	Alias           string
	TypeParams      string
	Properties      []TypeProperty
	EnumValues      []EnumValue
	CreateExpr      string
	CreateBody      string
	Exported        bool
	SetElementType  string
	SetMembers      []string
	GuardInputType  string
	GuardReturnType string
	GuardSetName    string
	FunctionParams  []TypeProperty
	FunctionBody    string
	FunctionReturn  string
	ConstExpr       string
}

// setta-go-type-discovery: skip
type EnumValue struct {
	Name  string
	Value string
}

// setta-go-type-discovery: skip
type TypeProperty struct {
	Name         string
	TypeExpr     string
	Optional     bool
	DefaultValue string
}

func objectDeclaration(name string, properties ...TypeProperty) TypeDeclaration {
	return TypeDeclaration{
		Name:       name,
		Kind:       "object",
		Properties: properties,
	}
}

func objectDeclarationWithCreateExpr(name string, createExpr string, properties ...TypeProperty) TypeDeclaration {
	declaration := objectDeclaration(name, properties...)
	declaration.CreateExpr = createExpr
	return declaration
}

func objectDeclarationWithCreateBody(name string, createBody string, properties ...TypeProperty) TypeDeclaration {
	declaration := objectDeclaration(name, properties...)
	declaration.CreateBody = createBody
	return declaration
}

func renderInlineAliasObject(properties []TypeProperty, extraLines ...string) string {
	if len(properties) == 0 && len(extraLines) == 0 {
		return "Record<string, never>"
	}
	lines := make([]string, 0, len(properties)+len(extraLines)+2)
	lines = append(lines, "{")
	for _, property := range properties {
		optional := ""
		if property.Optional {
			optional = "?"
		}
		lines = append(lines, fmt.Sprintf("  %s%s: %s;", property.Name, optional, property.TypeExpr))
	}
	for _, line := range extraLines {
		lines = append(lines, "  "+line)
	}
	lines = append(lines, "}")
	return strings.Join(lines, "\n")
}

func aliasObjectDeclarationFromProperties(name string, properties []TypeProperty, extraLines ...string) TypeDeclaration {
	return aliasDeclaration(name, renderInlineAliasObject(properties, extraLines...))
}

func aliasIntersectionDeclarationFromProperties(
	name string,
	baseExpr string,
	properties []TypeProperty,
	extraLines ...string,
) TypeDeclaration {
	return aliasDeclaration(name, baseExpr+" & "+renderInlineAliasObject(properties, extraLines...))
}

func unionAliasExpr(members ...string) string {
	if len(members) == 0 {
		return "never"
	}
	if len(members) == 1 {
		return members[0]
	}
	var builder strings.Builder
	builder.WriteString(members[0])
	for _, member := range members[1:] {
		builder.WriteString("\n  | ")
		builder.WriteString(member)
	}
	return builder.String()
}

func aliasUnionDeclaration(name string, members ...string) TypeDeclaration {
	return aliasDeclaration(name, unionAliasExpr(members...))
}

func localUnionDeclaration(name string, members ...string) TypeDeclaration {
	return localAliasDeclaration(name, "", unionAliasExpr(members...))
}

func aliasDeclaration(name string, alias string) TypeDeclaration {
	return TypeDeclaration{
		Name:  name,
		Kind:  "alias",
		Alias: alias,
	}
}

func aliasDeclarationWithCreateExpr(name string, alias string, createExpr string) TypeDeclaration {
	declaration := aliasDeclaration(name, alias)
	declaration.CreateExpr = createExpr
	return declaration
}

func localAliasDeclaration(name string, typeParams string, alias string) TypeDeclaration {
	return TypeDeclaration{
		Name:       name,
		Kind:       "local_alias",
		TypeParams: typeParams,
		Alias:      alias,
	}
}

func setDeclaration(name string, elementType string, exported bool, members ...string) TypeDeclaration {
	return TypeDeclaration{
		Name:           name,
		Kind:           "set",
		Exported:       exported,
		SetElementType: elementType,
		SetMembers:     append([]string(nil), members...),
	}
}

func typeGuardDeclaration(name string, inputType string, returnType string, setName string) TypeDeclaration {
	return TypeDeclaration{
		Name:            name,
		Kind:            "type_guard",
		GuardInputType:  inputType,
		GuardReturnType: returnType,
		GuardSetName:    setName,
	}
}

func functionDeclaration(
	name string,
	exported bool,
	returnType string,
	body string,
	params ...TypeProperty,
) TypeDeclaration {
	return TypeDeclaration{
		Name:           name,
		Kind:           "function",
		Exported:       exported,
		FunctionParams: append([]TypeProperty(nil), params...),
		FunctionReturn: returnType,
		FunctionBody:   strings.TrimRight(body, "\n"),
	}
}

func exportedFunctionDeclaration(
	name string,
	returnType string,
	body string,
	params ...TypeProperty,
) TypeDeclaration {
	return functionDeclaration(name, true, returnType, body, params...)
}

func constDeclaration(name string, exported bool, expr string) TypeDeclaration {
	return TypeDeclaration{
		Name:      name,
		Kind:      "const",
		Exported:  exported,
		ConstExpr: expr,
	}
}
