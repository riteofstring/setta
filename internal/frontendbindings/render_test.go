package frontendbindings

import (
	"strings"
	"testing"
)

func TestBuildRetainsDiscoveredValueTypeDeclarations(t *testing.T) {
	t.Parallel()

	bindings, err := Build()
	if err != nil {
		t.Fatalf("Build(): %v", err)
	}

	for _, snippet := range []string{
		"export type Policy = gt.Policy;",
		"export function createPolicy(",
		"return options as Policy;",
		"export const DefaultAppPolicy = {",
	} {
		if !strings.Contains(bindings.TypesTS, snippet) {
			t.Fatalf("generated bindings missing %q", snippet)
		}
	}
}

func TestBuildCastsTypeGuardDiscriminatorsToGeneratedEnumSets(t *testing.T) {
	t.Parallel()

	bindings, err := Build()
	if err != nil {
		t.Fatalf("Build(): %v", err)
	}

	for _, snippet := range []string{
		"return BaseChildlessCodeObjImplTypeSet.has(x.type as CodeObjType);",
		"return BaseParentSectionImplTypeSet.has(x.type as SectionType);",
	} {
		if !strings.Contains(bindings.TypesTS, snippet) {
			t.Fatalf("generated bindings missing %q", snippet)
		}
	}
}

func TestValidateTypeDeclarationShapeAcceptsEachSupportedKind(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		declaration TypeDeclaration
	}{
		{
			name: "object",
			declaration: TypeDeclaration{
				Name: "Widget",
				Kind: "object",
				Properties: []TypeProperty{{
					Name:     "title",
					TypeExpr: "string",
				}},
			},
		},
		{
			name: "enum",
			declaration: TypeDeclaration{
				Name: "WidgetKind",
				Kind: "enum",
				EnumValues: []TypeEnumValue{{
					Name:  "primary",
					Value: "\"primary\"",
				}},
			},
		},
		{
			name: "alias",
			declaration: TypeDeclaration{
				Name:  "WidgetID",
				Kind:  "alias",
				Alias: "string",
			},
		},
		{
			name: "set",
			declaration: TypeDeclaration{
				Name:           "WidgetKinds",
				Kind:           "set",
				SetElementType: "string",
				SetMembers:     []string{"primary"},
			},
		},
		{
			name: "type guard",
			declaration: TypeDeclaration{
				Name:            "isWidgetKind",
				Kind:            "type_guard",
				GuardInputType:  "unknown",
				GuardReturnType: "WidgetKind",
				GuardSetName:    "WidgetKinds",
			},
		},
		{
			name: "function",
			declaration: TypeDeclaration{
				Name:           "createWidget",
				Kind:           "function",
				FunctionReturn: "Widget",
				FunctionBody:   "return { title };",
				FunctionParams: []TypeProperty{{
					Name:     "title",
					TypeExpr: "string",
				}},
			},
		},
		{
			name: "const",
			declaration: TypeDeclaration{
				Name:      "DefaultWidgetTitle",
				Kind:      "const",
				ConstExpr: "\"default\"",
			},
		},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			if err := validateTypeDeclarationShape(test.declaration); err != nil {
				t.Fatalf("validateTypeDeclarationShape(%s): %v", test.name, err)
			}
		})
	}
}

func TestValidateTypeDeclarationShapeRejectsInvalidKindSpecificShapes(t *testing.T) {
	t.Parallel()

	tests := []struct {
		name        string
		declaration TypeDeclaration
		wantErr     string
	}{
		{
			name: "object property type required",
			declaration: TypeDeclaration{
				Name: "Widget",
				Kind: "object",
				Properties: []TypeProperty{{
					Name: "title",
				}},
			},
			wantErr: `declaration Widget: property "title" has empty type`,
		},
		{
			name: "enum value name required",
			declaration: TypeDeclaration{
				Name: "WidgetKind",
				Kind: "enum",
				EnumValues: []TypeEnumValue{{
					Value: "\"primary\"",
				}},
			},
			wantErr: "declaration WidgetKind: enum value at index 0 has empty name",
		},
		{
			name: "alias expression required",
			declaration: TypeDeclaration{
				Name: "WidgetID",
				Kind: "alias",
			},
			wantErr: "declaration WidgetID: alias requires alias expression",
		},
		{
			name: "set element type required",
			declaration: TypeDeclaration{
				Name:       "WidgetKinds",
				Kind:       "set",
				SetMembers: []string{"primary"},
			},
			wantErr: "declaration WidgetKinds: set requires element type",
		},
		{
			name: "type guard backing set required",
			declaration: TypeDeclaration{
				Name:            "isWidgetKind",
				Kind:            "type_guard",
				GuardInputType:  "unknown",
				GuardReturnType: "WidgetKind",
			},
			wantErr: "declaration isWidgetKind: type guard requires backing set name",
		},
		{
			name: "function optional default conflict",
			declaration: TypeDeclaration{
				Name:           "createWidget",
				Kind:           "function",
				FunctionReturn: "Widget",
				FunctionBody:   "return {};",
				FunctionParams: []TypeProperty{{
					Name:         "title",
					TypeExpr:     "string",
					Optional:     true,
					DefaultValue: "\"default\"",
				}},
			},
			wantErr: `declaration createWidget: function parameter "title" cannot be optional and have a default value`,
		},
		{
			name: "const expression required",
			declaration: TypeDeclaration{
				Name: "DefaultWidgetTitle",
				Kind: "const",
			},
			wantErr: "declaration DefaultWidgetTitle: const requires expression",
		},
	}

	for _, test := range tests {
		test := test
		t.Run(test.name, func(t *testing.T) {
			t.Parallel()

			err := validateTypeDeclarationShape(test.declaration)
			if err == nil {
				t.Fatalf("validateTypeDeclarationShape(%s): expected error", test.name)
			}
			if !strings.Contains(err.Error(), test.wantErr) {
				t.Fatalf("validateTypeDeclarationShape(%s): got %q want substring %q", test.name, err.Error(), test.wantErr)
			}
		})
	}
}
