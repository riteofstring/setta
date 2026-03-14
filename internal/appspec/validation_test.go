package appspec

import (
	"strings"
	"testing"
)

func TestValidatePersistedWriteRejectsUnknownComponent(t *testing.T) {
	t.Parallel()

	appSpec := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "UnknownComponent",
		},
		"elements": map[string]any{},
	}

	err := ValidatePersistedWrite(appSpec, Definition{})
	if err == nil || !strings.Contains(strings.ToLower(err.Error()), "unknown component") {
		t.Fatalf("expected unknown component error, got %v", err)
	}
}

func TestValidatePersistedWriteRejectsUnknownActionType(t *testing.T) {
	t.Parallel()

	appSpec := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
		},
		"elements": map[string]any{},
	}

	err := ValidatePersistedWrite(appSpec, Definition{
		ActionMap: map[string]any{
			"custom": map[string]any{"type": "not-supported"},
		},
	})
	if err == nil || !strings.Contains(strings.ToLower(err.Error()), "unknown type") {
		t.Fatalf("expected unknown action type error, got %v", err)
	}
}

func TestValidatePersistedWriteRejectsInvalidThemeMotion(t *testing.T) {
	t.Parallel()

	appSpec := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
		},
		"elements": map[string]any{},
	}

	err := ValidatePersistedWrite(appSpec, Definition{
		Theme: map[string]any{"motion": "nope"},
	})
	if err == nil || !strings.Contains(err.Error(), "theme.motion") {
		t.Fatalf("expected theme.motion error, got %v", err)
	}
}

func TestValidateSpecRejectsElementKeyMismatch(t *testing.T) {
	t.Parallel()

	appSpec := map[string]any{
		"root": "root",
		"elements": map[string]any{
			"root": map[string]any{
				"key":  "mismatch",
				"type": "Stack",
			},
		},
	}

	err := ValidateSpec(appSpec, ValidationOptions{CatalogID: DefaultCatalogID})
	if err == nil || !strings.Contains(err.Error(), "does not match element.key") {
		t.Fatalf("expected element key mismatch error, got %v", err)
	}
}

func TestValidateSpecAllowsParamInputBindingFromDataBindings(t *testing.T) {
	t.Parallel()

	appSpec := map[string]any{
		"root": map[string]any{
			"key":  "param",
			"type": "ParamInput",
			"props": map[string]any{
				"dataPath": "/params/name",
			},
		},
		"elements": map[string]any{},
	}

	err := ValidateSpec(appSpec, ValidationOptions{
		CatalogID: DefaultCatalogID,
		DataBindings: map[string]any{
			"params": map[string]any{
				"name": map[string]any{
					"sectionId": "section-1",
					"paramId":   "param-1",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("expected data-bound ParamInput to validate, got %v", err)
	}
}

func TestValidateSpecRejectsUnknownProp(t *testing.T) {
	t.Parallel()

	appSpec := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
			"props": map[string]any{
				"unknown": "nope",
			},
			"children": []any{},
		},
		"elements": map[string]any{},
	}

	err := ValidateSpec(appSpec, ValidationOptions{CatalogID: DefaultCatalogID})
	if err == nil || !strings.Contains(err.Error(), "unknown prop") {
		t.Fatalf("expected unknown prop error, got %v", err)
	}
}

func TestValidateSpecRejectsChildlessComponentWithChildren(t *testing.T) {
	t.Parallel()

	appSpec := map[string]any{
		"root": map[string]any{
			"key":  "heading",
			"type": "Heading",
			"props": map[string]any{
				"text": "Hello",
			},
			"children": []any{},
		},
		"elements": map[string]any{},
	}

	err := ValidateSpec(appSpec, ValidationOptions{CatalogID: DefaultCatalogID})
	if err == nil || !strings.Contains(err.Error(), "cannot have children") {
		t.Fatalf("expected childless component error, got %v", err)
	}
}
