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

func TestValidateSpecRejectsParamInputWithoutBinding(t *testing.T) {
	t.Parallel()

	// ParamInput still requires an explicit section/param binding when no data binding is present.
	appSpec := map[string]any{
		"root": map[string]any{
			"key":  "param",
			"type": "ParamInput",
			"props": map[string]any{
				"label": "Missing",
			},
		},
		"elements": map[string]any{},
	}

	err := ValidateSpec(appSpec, ValidationOptions{CatalogID: DefaultCatalogID})
	if err == nil || !strings.Contains(err.Error(), `missing required prop "sectionId"`) {
		t.Fatalf("expected missing sectionId error, got %v", err)
	}
}

func TestValidateSpecAllowsParamInputBindingFromProps(t *testing.T) {
	t.Parallel()

	// Direct sectionId/paramId props remain a valid ParamInput binding source.
	appSpec := map[string]any{
		"root": map[string]any{
			"key":  "param",
			"type": "ParamInput",
			"props": map[string]any{
				"sectionId": "section-1",
				"paramId":   "param-1",
				"label":     "Bound",
			},
		},
		"elements": map[string]any{},
	}

	if err := ValidateSpec(appSpec, ValidationOptions{CatalogID: DefaultCatalogID}); err != nil {
		t.Fatalf("expected prop-bound ParamInput to validate, got %v", err)
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

func TestValidateSpecRejectsMultiConfigWithoutScope(t *testing.T) {
	t.Parallel()

	// Unscoped elements must still fail closed once multiple config scopes are used.
	appSpec := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
			"children": []any{
				map[string]any{
					"key":  "scope-a",
					"type": "ConfigScope",
					"props": map[string]any{
						"configId": "config-a",
					},
					"children": []any{
						map[string]any{
							"key":  "output-a",
							"type": "TextOutput",
							"props": map[string]any{
								"sectionId": "section-a",
							},
						},
					},
				},
				map[string]any{
					"key":  "scope-b",
					"type": "ConfigScope",
					"props": map[string]any{
						"configId": "config-b",
					},
					"children": []any{
						map[string]any{
							"key":  "output-b",
							"type": "TextOutput",
							"props": map[string]any{
								"sectionId": "section-b",
							},
						},
					},
				},
				map[string]any{
					"key":  "unscoped-output",
					"type": "TextOutput",
					"props": map[string]any{
						"sectionId": "section-unscoped",
					},
				},
			},
		},
		"elements": map[string]any{},
	}

	err := ValidateSpec(appSpec, ValidationOptions{CatalogID: DefaultCatalogID})
	if err == nil || !strings.Contains(err.Error(), "multiple configs") {
		t.Fatalf("expected multiple-config scope error, got %v", err)
	}
}

func TestValidateSpecAllowsMultiConfigWhenScoped(t *testing.T) {
	t.Parallel()

	// Multiple config scopes remain valid when every config-bound element stays scoped.
	appSpec := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
			"children": []any{
				map[string]any{
					"key":  "scope-a",
					"type": "ConfigScope",
					"props": map[string]any{
						"configId": "config-a",
					},
					"children": []any{
						map[string]any{
							"key":  "output-a",
							"type": "TextOutput",
							"props": map[string]any{
								"sectionId": "section-a",
							},
						},
					},
				},
				map[string]any{
					"key":  "scope-b",
					"type": "ConfigScope",
					"props": map[string]any{
						"configId": "config-b",
					},
					"children": []any{
						map[string]any{
							"key":  "output-b",
							"type": "TextOutput",
							"props": map[string]any{
								"sectionId": "section-b",
							},
						},
					},
				},
			},
		},
		"elements": map[string]any{},
	}

	if err := ValidateSpec(appSpec, ValidationOptions{CatalogID: DefaultCatalogID}); err != nil {
		t.Fatalf("expected scoped multi-config app spec to validate, got %v", err)
	}
}

func TestValidateSpecRejectsMultipleRunButtonsWithoutMultipleRunActions(t *testing.T) {
	t.Parallel()

	// Duplicate run buttons still require distinct run action registrations.
	appSpec := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
			"children": []any{
				map[string]any{
					"key":  "run-1",
					"type": "ActionButton",
					"props": map[string]any{
						"label":  "Run",
						"action": "run",
					},
				},
				map[string]any{
					"key":  "run-2",
					"type": "ActionButton",
					"props": map[string]any{
						"label":  "Run again",
						"action": "run",
					},
				},
			},
		},
		"elements": map[string]any{},
	}

	err := ValidateSpec(appSpec, ValidationOptions{CatalogID: DefaultCatalogID})
	if err == nil || !strings.Contains(err.Error(), "can only include one run action") {
		t.Fatalf("expected multi-run guardrail error, got %v", err)
	}
}

func TestValidateSpecAllowsMultipleRunButtonsWithMultipleRunActions(t *testing.T) {
	t.Parallel()

	// Multiple run buttons stay valid when a second action is explicitly typed as another run action.
	appSpec := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
			"children": []any{
				map[string]any{
					"key":  "run-1",
					"type": "ActionButton",
					"props": map[string]any{
						"label":  "Run",
						"action": "run",
					},
				},
				map[string]any{
					"key":  "run-2",
					"type": "ActionButton",
					"props": map[string]any{
						"label":  "Run extra",
						"action": "run2",
					},
				},
			},
		},
		"elements": map[string]any{},
	}

	if err := ValidateSpec(appSpec, ValidationOptions{
		CatalogID: DefaultCatalogID,
		ActionDefinitions: map[string]any{
			"run2": map[string]any{"type": "run"},
		},
	}); err != nil {
		t.Fatalf("expected multi-run app spec to validate with explicit run2 action, got %v", err)
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

func TestValidateSpecRejectsConfigScopeWithoutConfigID(t *testing.T) {
	t.Parallel()

	// ConfigScope still requires a configId prop on persisted app specs.
	appSpec := map[string]any{
		"root": map[string]any{
			"key":      "scope",
			"type":     "ConfigScope",
			"children": []any{},
		},
		"elements": map[string]any{},
	}

	err := ValidateSpec(appSpec, ValidationOptions{CatalogID: DefaultCatalogID})
	if err == nil || !strings.Contains(err.Error(), `missing required prop "configId"`) {
		t.Fatalf("expected missing configId error, got %v", err)
	}
}

func TestValidateSpecRejectsTextOutputWithoutSectionID(t *testing.T) {
	t.Parallel()

	// TextOutput still requires a sectionId when no binding supplies one.
	appSpec := map[string]any{
		"root": map[string]any{
			"key":  "output",
			"type": "TextOutput",
			"props": map[string]any{
				"label": "Result",
			},
		},
		"elements": map[string]any{},
	}

	err := ValidateSpec(appSpec, ValidationOptions{CatalogID: DefaultCatalogID})
	if err == nil || !strings.Contains(err.Error(), `missing required prop "sectionId"`) {
		t.Fatalf("expected missing sectionId error, got %v", err)
	}
}

func TestValidateSpecAllowsTextOutputBindingFromDataBindings(t *testing.T) {
	t.Parallel()

	// TextOutput may still satisfy section binding requirements from data bindings.
	appSpec := map[string]any{
		"root": map[string]any{
			"key":  "output",
			"type": "TextOutput",
			"props": map[string]any{
				"dataPath": "/outputs/result",
			},
		},
		"elements": map[string]any{},
	}

	err := ValidateSpec(appSpec, ValidationOptions{
		CatalogID: DefaultCatalogID,
		DataBindings: map[string]any{
			"outputs": map[string]any{
				"result": map[string]any{
					"sectionId": "section-1",
					"label":     "From binding",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("expected data-bound TextOutput to validate, got %v", err)
	}
}

func TestValidateSpecAllowsDimensionStringProps(t *testing.T) {
	t.Parallel()

	// Dimension-valued props still accept CSS-like string expressions.
	appSpec := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
			"props": map[string]any{
				"gap": "clamp(8px, 2vw, 20px)",
			},
			"children": []any{
				map[string]any{
					"key":  "box",
					"type": "Box",
					"props": map[string]any{
						"padding": "1.5rem",
						"radius":  "12px",
					},
					"children": []any{
						map[string]any{
							"key":  "spacer",
							"type": "Spacer",
							"props": map[string]any{
								"size": "2rem",
								"axis": "y",
							},
						},
					},
				},
			},
		},
		"elements": map[string]any{},
	}

	if err := ValidateSpec(appSpec, ValidationOptions{CatalogID: DefaultCatalogID}); err != nil {
		t.Fatalf("expected dimension string props to validate, got %v", err)
	}
}

func TestValidateSpecAllowsResponsiveDimensionProps(t *testing.T) {
	t.Parallel()

	// Responsive dimension objects still accept catalog-supported breakpoints and value types.
	appSpec := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
			"props": map[string]any{
				"gap": map[string]any{
					"base": 8,
					"md":   18,
				},
			},
			"children": []any{
				map[string]any{
					"key":  "box",
					"type": "Box",
					"props": map[string]any{
						"padding": map[string]any{
							"base": 12,
							"lg":   24,
						},
						"radius": map[string]any{
							"base": "10px",
							"lg":   "16px",
						},
					},
					"children": []any{
						map[string]any{
							"key":  "grid",
							"type": "Grid",
							"props": map[string]any{
								"columns": map[string]any{
									"base": 1,
									"md":   2,
								},
							},
							"children": []any{
								map[string]any{
									"key":  "card-a",
									"type": "Card",
									"props": map[string]any{
										"title": "A",
									},
									"children": []any{},
								},
								map[string]any{
									"key":  "card-b",
									"type": "Card",
									"props": map[string]any{
										"title": "B",
									},
									"children": []any{},
								},
							},
						},
					},
				},
			},
		},
		"elements": map[string]any{},
	}

	if err := ValidateSpec(appSpec, ValidationOptions{CatalogID: DefaultCatalogID}); err != nil {
		t.Fatalf("expected responsive dimension props to validate, got %v", err)
	}
}

func TestValidateSpecRejectsResponsiveUnknownBreakpoint(t *testing.T) {
	t.Parallel()

	// Responsive props must still fail closed on unsupported breakpoint names.
	appSpec := map[string]any{
		"root": map[string]any{
			"key":  "root",
			"type": "Stack",
			"props": map[string]any{
				"gap": map[string]any{
					"tablet": 12,
				},
			},
			"children": []any{},
		},
		"elements": map[string]any{},
	}

	err := ValidateSpec(appSpec, ValidationOptions{CatalogID: DefaultCatalogID})
	if err == nil || !strings.Contains(err.Error(), "unknown breakpoint") {
		t.Fatalf("expected unknown breakpoint error, got %v", err)
	}
}

func TestValidateSpecRejectsResponsiveValueTypeMismatch(t *testing.T) {
	t.Parallel()

	// Responsive numeric props must reject string payloads for numeric breakpoints.
	appSpec := map[string]any{
		"root": map[string]any{
			"key":  "grid",
			"type": "Grid",
			"props": map[string]any{
				"columns": map[string]any{
					"base": "two",
				},
			},
			"children": []any{},
		},
		"elements": map[string]any{},
	}

	err := ValidateSpec(appSpec, ValidationOptions{CatalogID: DefaultCatalogID})
	if err == nil || !strings.Contains(err.Error(), "must be a number") {
		t.Fatalf("expected numeric responsive prop error, got %v", err)
	}
}

func TestValidateSpecAllowsMotionPrimitives(t *testing.T) {
	t.Parallel()

	// Motion and Stagger components remain valid persisted app-spec primitives.
	appSpec := map[string]any{
		"root": map[string]any{
			"key":  "motion",
			"type": "Motion",
			"props": map[string]any{
				"preset":     "fadeIn",
				"durationMs": 120,
			},
			"children": []any{
				map[string]any{
					"key":  "stagger",
					"type": "Stagger",
					"props": map[string]any{
						"preset":    "slideUp",
						"staggerMs": 50,
					},
					"children": []any{
						map[string]any{
							"key":  "t1",
							"type": "Text",
							"props": map[string]any{
								"text": "One",
							},
						},
						map[string]any{
							"key":  "t2",
							"type": "Text",
							"props": map[string]any{
								"text": "Two",
							},
						},
					},
				},
			},
		},
		"elements": map[string]any{},
	}

	if err := ValidateSpec(appSpec, ValidationOptions{CatalogID: DefaultCatalogID}); err != nil {
		t.Fatalf("expected motion primitives to validate, got %v", err)
	}
}
