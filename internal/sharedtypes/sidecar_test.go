package sharedtypes

import (
	"reflect"
	"strings"
	"testing"
)

type SemanticSidecarTestEmbedded struct {
	Enabled bool `json:"enabled,omitempty"`
}

type semanticSidecarTestNested struct {
	Mode string `json:"mode,omitempty"`
}

type semanticSidecarTestRoot struct {
	SemanticSidecarTestEmbedded
	Name   string                    `json:"name,omitempty"`
	Nested semanticSidecarTestNested `json:"nested,omitempty"`
}

func TestNormalizeSemanticSidecarValueRestoresOmittedScalarFields(t *testing.T) {
	t.Parallel()

	normalized, err := normalizeSemanticSidecarValue(struct {
		Name    string `json:"name,omitempty"`
		Enabled bool   `json:"enabled,omitempty"`
	}{})
	if err != nil {
		t.Fatalf("normalizeSemanticSidecarValue() error = %v", err)
	}

	if got, want := normalized, map[string]any{
		"name":    "",
		"enabled": false,
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("normalized value = %#v, want %#v", got, want)
	}
}

func TestNormalizeSemanticSidecarValueMergesEmbeddedStructFields(t *testing.T) {
	t.Parallel()

	normalized, err := normalizeSemanticSidecarValue(semanticSidecarTestRoot{})
	if err != nil {
		t.Fatalf("normalizeSemanticSidecarValue() error = %v", err)
	}

	if got, want := normalized, map[string]any{
		"enabled": false,
		"name":    "",
		"nested": map[string]any{
			"mode": "",
		},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("normalized value = %#v, want %#v", got, want)
	}
}

func TestNormalizeSemanticSidecarValueRecursesIntoNestedStructs(t *testing.T) {
	t.Parallel()

	normalized, err := normalizeSemanticSidecarValue(struct {
		Nested semanticSidecarTestNested `json:"nested,omitempty"`
	}{
		Nested: semanticSidecarTestNested{},
	})
	if err != nil {
		t.Fatalf("normalizeSemanticSidecarValue() error = %v", err)
	}

	if got, want := normalized, map[string]any{
		"nested": map[string]any{
			"mode": "",
		},
	}; !reflect.DeepEqual(got, want) {
		t.Fatalf("normalized value = %#v, want %#v", got, want)
	}
}

func TestNormalizeSemanticSidecarForJSONNormalizesAllValueSections(t *testing.T) {
	t.Parallel()

	sidecar := SemanticSidecar{
		Defaults: []DefaultEntry{{
			Profile: "frontend",
			Type:    "ExampleDefault",
			Value: struct {
				Enabled bool `json:"enabled,omitempty"`
			}{},
		}},
		ExportedValues: []ExportedValueEntry{{
			Name: "ExampleExport",
			Type: "ExampleExportType",
			Value: struct {
				Mode string `json:"mode,omitempty"`
			}{},
		}},
		DiscriminatedFamilies: []DiscriminatedFamilyEntry{{
			BaseType: "ExampleFamily",
			DefaultValuesByDiscriminator: map[string]any{
				"member": struct {
					Active bool `json:"active,omitempty"`
				}{},
			},
		}},
	}

	normalized, err := NormalizeSemanticSidecarForJSON(sidecar)
	if err != nil {
		t.Fatalf("NormalizeSemanticSidecarForJSON() error = %v", err)
	}

	if got, want := normalized.Defaults[0].Value, map[string]any{"enabled": false}; !reflect.DeepEqual(got, want) {
		t.Fatalf("normalized default value = %#v, want %#v", got, want)
	}
	if got, want := normalized.ExportedValues[0].Value, map[string]any{"mode": ""}; !reflect.DeepEqual(got, want) {
		t.Fatalf("normalized exported value = %#v, want %#v", got, want)
	}
	if got, want := normalized.DiscriminatedFamilies[0].DefaultValuesByDiscriminator["member"], map[string]any{"active": false}; !reflect.DeepEqual(got, want) {
		t.Fatalf("normalized family default = %#v, want %#v", got, want)
	}
}

func TestNormalizeSemanticSidecarForJSONIncludesDiscriminatorContextInErrors(t *testing.T) {
	t.Parallel()

	sidecar := SemanticSidecar{
		DiscriminatedFamilies: []DiscriminatedFamilyEntry{{
			BaseType: "ExampleFamily",
			DefaultValuesByDiscriminator: map[string]any{
				"member": func() {},
			},
		}},
	}

	_, err := NormalizeSemanticSidecarForJSON(sidecar)
	if err == nil {
		t.Fatal("NormalizeSemanticSidecarForJSON() error = nil, want error")
	}
	if !strings.Contains(err.Error(), `shared sidecar family ExampleFamily discriminator "member" default`) {
		t.Fatalf("NormalizeSemanticSidecarForJSON() error = %q, want discriminator context", err)
	}
}
