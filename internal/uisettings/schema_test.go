package uisettings

import (
	"reflect"
	"testing"
)

func TestValidateValueRejectsMissingRequiredPropertiesInSortedOrder(t *testing.T) {
	t.Parallel()

	err := ValidateValue(
		ValueSchema{
			Type:               ValueTypeObject,
			RequiredProperties: []string{"beta", "alpha"},
		},
		map[string]any{},
	)
	settingErr := requireSettingError(t, err)
	if settingErr.Code != ErrorCodeInvalidValueType {
		t.Fatalf("expected invalid_value_type, got %q", settingErr.Code)
	}
	if settingErr.Message != "Object is missing required properties: alpha, beta." {
		t.Fatalf("unexpected error message %q", settingErr.Message)
	}
}

func TestValidateValueRejectsUnsupportedObjectPropertiesInSortedOrder(t *testing.T) {
	t.Parallel()

	allowAdditional := false
	err := ValidateValue(
		ValueSchema{
			Type: ValueTypeObject,
			Properties: map[string]ValueSchema{
				"path": {Type: ValueTypeString},
			},
			AdditionalProperties: &allowAdditional,
		},
		map[string]any{
			"zeta":  true,
			"alpha": false,
		},
	)
	settingErr := requireSettingError(t, err)
	if settingErr.Code != ErrorCodeInvalidValueType {
		t.Fatalf("expected invalid_value_type, got %q", settingErr.Code)
	}
	if settingErr.Message != "Object contains unsupported properties: alpha, zeta." {
		t.Fatalf("unexpected error message %q", settingErr.Message)
	}
}

func TestValidateValueRejectsNestedArrayItemPropertyPath(t *testing.T) {
	t.Parallel()

	allowAdditional := false
	err := ValidateValue(
		ValueSchema{
			Type: ValueTypeObject,
			Properties: map[string]ValueSchema{
				"folders": {
					Type: ValueTypeArray,
					Items: &ValueSchema{
						Type: ValueTypeObject,
						Properties: map[string]ValueSchema{
							"recursive": {Type: ValueTypeBoolean},
						},
						RequiredProperties:   []string{"recursive"},
						AdditionalProperties: &allowAdditional,
					},
				},
			},
			RequiredProperties:   []string{"folders"},
			AdditionalProperties: &allowAdditional,
		},
		map[string]any{
			"folders": []any{
				map[string]any{
					"recursive": "not-a-boolean",
				},
			},
		},
	)
	settingErr := requireSettingError(t, err)
	if settingErr.Code != ErrorCodeInvalidValueType {
		t.Fatalf("expected invalid_value_type, got %q", settingErr.Code)
	}
	if settingErr.Message != "property folders item 0 property recursive: Expected a boolean value." {
		t.Fatalf("unexpected error message %q", settingErr.Message)
	}
}

func TestValidateValueRejectsStringEnumValue(t *testing.T) {
	t.Parallel()

	err := ValidateValue(
		ValueSchema{
			Type:       ValueTypeString,
			EnumValues: []any{"alpha", "beta"},
		},
		"gamma",
	)
	settingErr := requireSettingError(t, err)
	if settingErr.Code != ErrorCodeInvalidValueRangeOrEnum {
		t.Fatalf("expected invalid_value_range_or_enum, got %q", settingErr.Code)
	}
	if settingErr.Message != "Value must be one of: alpha, beta." {
		t.Fatalf("unexpected error message %q", settingErr.Message)
	}
}

func TestInferPluginValueSchemaBuildsNestedArrayObjectSchema(t *testing.T) {
	t.Parallel()

	schemaJSON := map[string]any{
		"type": "object",
		"properties": map[string]any{
			"settings": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"profiles": map[string]any{
						"type": []any{"array", "null"},
						"items": map[string]any{
							"type": "object",
							"properties": map[string]any{
								"name": map[string]any{
									"type":      "string",
									"minLength": 1,
								},
								"retries": map[string]any{
									"type":    "integer",
									"minimum": 1,
									"maximum": 5,
								},
							},
							"required":             []any{"name", "", 42},
							"additionalProperties": false,
						},
					},
				},
			},
		},
	}

	got, ok := inferPluginValueSchema(schemaJSON, []string{"settings", "profiles"})
	if !ok {
		t.Fatal("expected schema inference to succeed")
	}

	expected := ValueSchema{
		Type: ValueTypeArray,
		Items: &ValueSchema{
			Type: ValueTypeObject,
			Properties: map[string]ValueSchema{
				"name": {
					Type:      ValueTypeString,
					MinLength: intPointer(1),
				},
				"retries": {
					Type:    ValueTypeInteger,
					Minimum: float64Pointer(1),
					Maximum: float64Pointer(5),
				},
			},
			RequiredProperties:   []string{"name"},
			AdditionalProperties: boolPointer(false),
		},
	}
	if !reflect.DeepEqual(got, expected) {
		t.Fatalf("unexpected inferred schema:\n got: %#v\nwant: %#v", got, expected)
	}
}

func TestInferValueSchemaFromSchemaNodeRejectsAmbiguousUnion(t *testing.T) {
	t.Parallel()

	_, ok := inferValueSchemaFromSchemaNode(map[string]any{
		"type": []any{"string", "number"},
	})
	if ok {
		t.Fatal("expected ambiguous union schema to be rejected")
	}
}

func float64Pointer(value float64) *float64 {
	return &value
}
