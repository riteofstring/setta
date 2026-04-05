package frontendbindings

import (
	"strings"

	"setta/internal/stringenumvalues"
)

// setta-go-type-discovery: skip
type TypeDeclaration struct {
	Name            string
	Kind            string
	Alias           string
	Properties      []TypeProperty
	EnumValues      []stringenumvalues.EnumValue
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

func aliasDeclaration(name string, alias string) TypeDeclaration {
	return TypeDeclaration{
		Name:  name,
		Kind:  "alias",
		Alias: alias,
	}
}

func setDeclaration(name string, elementType string, members ...string) TypeDeclaration {
	return TypeDeclaration{
		Name:           name,
		Kind:           "set",
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
