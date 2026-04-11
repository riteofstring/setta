package sharedtypes

import (
	"reflect"
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
