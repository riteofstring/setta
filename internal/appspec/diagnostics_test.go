package appspec

import "testing"

func hasIssueMessage(issues []AppValidationIssue, want string) bool {
	for _, issue := range issues {
		if issue.Message == want {
			return true
		}
	}
	return false
}

func TestBuildCapabilitiesReturnsCatalogVersionAndFeatureFlags(t *testing.T) {
	t.Parallel()

	capabilities := BuildCapabilities(Definition{
		AppSpecVersion: "v1",
		CatalogID:      DefaultCatalogID,
	})

	if capabilities.CatalogID != DefaultCatalogID {
		t.Fatalf("expected catalog id %q, got %q", DefaultCatalogID, capabilities.CatalogID)
	}
	if capabilities.CatalogVersion != DefaultCatalogVersion {
		t.Fatalf("expected catalog version %q, got %q", DefaultCatalogVersion, capabilities.CatalogVersion)
	}
	if capabilities.ThemeSchemaVersion != "v1" {
		t.Fatalf("expected theme schema version v1, got %q", capabilities.ThemeSchemaVersion)
	}
	if !capabilities.Features["responsive"] || !capabilities.Features["motion"] || !capabilities.Features["componentTokens"] {
		t.Fatalf("expected feature flags to include responsive, motion, and componentTokens, got %#v", capabilities.Features)
	}
	if capabilities.Features["customComponents"] {
		t.Fatalf("expected customComponents to remain false, got %#v", capabilities.Features)
	}
}

func TestCollectThemeValidationIssuesWarnsOnIgnoredVarsAndRejectsMotionObject(t *testing.T) {
	t.Parallel()

	errors, warnings := CollectThemeValidationIssues(map[string]any{
		"vars": map[string]any{
			"accent":       "#fff",
			"--app-accent": "#fff",
		},
		"motion": "nope",
	})

	if len(errors) == 0 {
		t.Fatal("expected theme errors")
	}
	foundMotionError := false
	for _, issue := range errors {
		if issue.Message == "theme.motion must be an object." {
			foundMotionError = true
			break
		}
	}
	if !foundMotionError {
		t.Fatalf("expected theme.motion error, got %#v", errors)
	}

	foundVarWarning := false
	for _, issue := range warnings {
		if issue.Message == "theme.vars contains keys that do not start with '--app-' and will be ignored: accent" {
			foundVarWarning = true
			break
		}
	}
	if !foundVarWarning {
		t.Fatalf("expected ignored theme var warning, got %#v", warnings)
	}
}

func TestValidateDefinitionPayloadWarnsOnRunMissingSectionIDAndExternalAssets(t *testing.T) {
	t.Parallel()

	errors, warnings := ValidateDefinitionPayload(map[string]any{
		"root": map[string]any{
			"key":  "run-btn",
			"type": "ActionButton",
			"props": map[string]any{
				"label":  "Run",
				"action": "run",
			},
		},
		"elements": map[string]any{},
	}, Definition{
		AppSpecVersion: "v1",
		CatalogID:      DefaultCatalogID,
		Assets: []any{
			map[string]any{"href": "https://example.com/app.css"},
		},
	})

	if len(errors) != 0 {
		t.Fatalf("expected no validation errors, got %#v", errors)
	}

	foundRunWarning := false
	foundAssetWarning := false
	for _, issue := range warnings {
		if issue.Message == "Run ActionButton is missing sectionId." && issue.ElementKey == "run-btn" {
			foundRunWarning = true
		}
		if issue.Message == "assets includes external URLs which will be filtered when external links are disallowed: https://example.com/app.css" {
			foundAssetWarning = true
		}
	}
	if !foundRunWarning {
		t.Fatalf("expected missing sectionId warning, got %#v", warnings)
	}
	if !foundAssetWarning {
		t.Fatalf("expected external asset warning, got %#v", warnings)
	}
}

func TestCollectSpecValidationIssuesReportsUnknownActionWithElementMetadata(t *testing.T) {
	t.Parallel()

	issues := CollectSpecValidationIssues(map[string]any{
		"root": map[string]any{
			"key":  "ship-btn",
			"type": "ActionButton",
			"props": map[string]any{
				"label":  "Ship",
				"action": "ship",
			},
		},
	}, ValidationOptions{})

	found := false
	for _, issue := range issues {
		if issue.Message != `App spec action "ship" is not registered (element "ship-btn").` {
			continue
		}
		if issue.ElementKey != "ship-btn" || issue.ElementType != "ActionButton" {
			t.Fatalf("expected element metadata on unknown-action issue, got %#v", issue)
		}
		found = true
	}
	if !found {
		t.Fatalf("expected unknown-action issue, got %#v", issues)
	}
}

func TestCollectSpecValidationIssuesReportsUnscopedElementsAcrossMultipleConfigs(t *testing.T) {
	t.Parallel()

	issues := CollectSpecValidationIssues(map[string]any{
		"root": map[string]any{
			"key":  "layout",
			"type": "Stack",
			"children": []any{
				"cfg-a",
				"cfg-b",
				map[string]any{
					"key":  "orphan-output",
					"type": "TextOutput",
					"props": map[string]any{
						"sectionId": "summary",
					},
				},
			},
		},
		"elements": map[string]any{
			"cfg-a": map[string]any{
				"key":  "cfg-a",
				"type": "ConfigScope",
				"props": map[string]any{
					"configId": "alpha",
				},
				"children": []any{
					map[string]any{
						"key":  "input-a",
						"type": "ParamInput",
						"props": map[string]any{
							"sectionId": "prompt",
							"paramId":   "topic",
						},
					},
				},
			},
			"cfg-b": map[string]any{
				"key":  "cfg-b",
				"type": "ConfigScope",
				"props": map[string]any{
					"configId": "beta",
				},
				"children": []any{
					map[string]any{
						"key":  "input-b",
						"type": "ParamInput",
						"props": map[string]any{
							"sectionId": "prompt",
							"paramId":   "tone",
						},
					},
				},
			},
		},
	}, ValidationOptions{})

	want := "App spec uses multiple configs but some elements are not scoped. Wrap them in ConfigScope or set configId explicitly. Missing scope for: orphan-output."
	if !hasIssueMessage(issues, want) {
		t.Fatalf("expected multi-config scope issue, got %#v", issues)
	}
}

func TestCollectSpecValidationIssuesRejectsMultipleDefaultRunButtons(t *testing.T) {
	t.Parallel()

	issues := CollectSpecValidationIssues(map[string]any{
		"root": map[string]any{
			"key":  "layout",
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
	}, ValidationOptions{})

	want := "App spec can only include one run action. Define an additional run action to allow multiple run buttons."
	if !hasIssueMessage(issues, want) {
		t.Fatalf("expected multi-run issue, got %#v", issues)
	}
}

func TestCollectSpecValidationIssuesAllowsNamedAdditionalRunActions(t *testing.T) {
	t.Parallel()

	issues := CollectSpecValidationIssues(map[string]any{
		"root": map[string]any{
			"key":  "layout",
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
						"label":  "Run alt",
						"action": "rerun",
					},
				},
			},
		},
	}, ValidationOptions{
		ActionDefinitions: map[string]any{
			"rerun": map[string]any{
				"type": "run",
			},
		},
	})

	if len(issues) != 0 {
		t.Fatalf("expected no validation issues, got %#v", issues)
	}
}

func TestCollectThemeValidationIssuesAcceptsMotionTokens(t *testing.T) {
	t.Parallel()

	// Supported motion tokens should validate without warnings or errors.
	errors, warnings := CollectThemeValidationIssues(map[string]any{
		"motion": map[string]any{
			"durationMs": 480,
			"delayMs":    12,
			"staggerMs":  90,
			"easing":     "linear",
		},
	})

	if len(errors) != 0 || len(warnings) != 0 {
		t.Fatalf("expected clean motion validation, got errors=%#v warnings=%#v", errors, warnings)
	}
}

func TestCollectThemeValidationIssuesAcceptsTypographyTokens(t *testing.T) {
	t.Parallel()

	// Typography tokens still accept mixed numeric and string values.
	errors, warnings := CollectThemeValidationIssues(map[string]any{
		"typography": map[string]any{
			"bodySize":          15,
			"bodyLineHeight":    1.6,
			"headingLineHeight": 1.15,
			"headingSizes": map[string]any{
				"h2": 40,
				"h3": "1.25rem",
			},
		},
	})

	if len(errors) != 0 || len(warnings) != 0 {
		t.Fatalf("expected clean typography validation, got errors=%#v warnings=%#v", errors, warnings)
	}
}

func TestCollectThemeValidationIssuesAcceptsTypographyScaleTokens(t *testing.T) {
	t.Parallel()

	// Typography scale tokens still accept the documented breakpoint family.
	errors, warnings := CollectThemeValidationIssues(map[string]any{
		"typography": map[string]any{
			"scale": map[string]any{
				"xs":  12,
				"2xl": "2.25rem",
			},
		},
	})

	if len(errors) != 0 || len(warnings) != 0 {
		t.Fatalf("expected clean typography scale validation, got errors=%#v warnings=%#v", errors, warnings)
	}
}

func TestCollectThemeValidationIssuesAcceptsComponentTokens(t *testing.T) {
	t.Parallel()

	// Supported component token families remain valid app-theme inputs.
	errors, warnings := CollectThemeValidationIssues(map[string]any{
		"components": map[string]any{
			"button": map[string]any{
				"bg":   "#ff00ff",
				"ring": "rgba(255, 0, 255, 0.5)",
			},
			"page": map[string]any{
				"bgImage": "linear-gradient(180deg, red, blue)",
			},
		},
	})

	if len(errors) != 0 || len(warnings) != 0 {
		t.Fatalf("expected clean component-token validation, got errors=%#v warnings=%#v", errors, warnings)
	}
}

func TestCollectThemeValidationIssuesReportsInvalidComponentTokenValue(t *testing.T) {
	t.Parallel()

	// Component tokens must still reject values with the wrong scalar type.
	errors, warnings := CollectThemeValidationIssues(map[string]any{
		"components": map[string]any{
			"button": map[string]any{
				"bg": 123,
			},
		},
	})

	if len(warnings) != 0 {
		t.Fatalf("expected no warnings, got %#v", warnings)
	}
	if !hasIssueMessage(errors, "theme.components.button.bg must be a string.") {
		t.Fatalf("expected invalid component token error, got %#v", errors)
	}
}

func TestCollectThemeValidationIssuesWarnsOnUnknownComponentKeys(t *testing.T) {
	t.Parallel()

	// Unknown component token buckets and nested keys should stay warnings, not hard errors.
	errors, warnings := CollectThemeValidationIssues(map[string]any{
		"components": map[string]any{
			"extra": map[string]any{"x": "y"},
			"button": map[string]any{
				"extra": "x",
			},
		},
	})

	if len(errors) != 0 {
		t.Fatalf("expected no errors, got %#v", errors)
	}
	if !hasIssueMessage(warnings, "theme.components contains unknown keys and they will be ignored: extra") {
		t.Fatalf("expected unknown component warning, got %#v", warnings)
	}
	if !hasIssueMessage(warnings, "theme.components.button contains unknown keys and they will be ignored: extra") {
		t.Fatalf("expected nested unknown component warning, got %#v", warnings)
	}
}

func TestCollectThemeValidationIssuesAcceptsShadowTokens(t *testing.T) {
	t.Parallel()

	// Supported shadow tokens should validate cleanly.
	errors, warnings := CollectThemeValidationIssues(map[string]any{
		"shadows": map[string]any{
			"sm": "0 1px 2px 0 rgb(0 0 0 / 0.05)",
			"lg": "0 25px 50px -12px rgb(0 0 0 / 0.25)",
		},
	})

	if len(errors) != 0 || len(warnings) != 0 {
		t.Fatalf("expected clean shadow validation, got errors=%#v warnings=%#v", errors, warnings)
	}
}

func TestCollectThemeValidationIssuesReportsInvalidShadowValue(t *testing.T) {
	t.Parallel()

	// Shadow tokens must reject non-string payloads.
	errors, warnings := CollectThemeValidationIssues(map[string]any{
		"shadows": map[string]any{
			"sm": 123,
		},
	})

	if len(warnings) != 0 {
		t.Fatalf("expected no warnings, got %#v", warnings)
	}
	if !hasIssueMessage(errors, "theme.shadows.sm must be a string.") {
		t.Fatalf("expected invalid shadow error, got %#v", errors)
	}
}

func TestCollectThemeValidationIssuesWarnsOnUnknownShadowKeys(t *testing.T) {
	t.Parallel()

	// Unknown shadow names remain non-fatal warnings.
	errors, warnings := CollectThemeValidationIssues(map[string]any{
		"shadows": map[string]any{
			"extra": "x",
		},
	})

	if len(errors) != 0 {
		t.Fatalf("expected no errors, got %#v", errors)
	}
	if !hasIssueMessage(warnings, "theme.shadows contains unknown keys and they will be ignored: extra") {
		t.Fatalf("expected unknown shadow warning, got %#v", warnings)
	}
}

func TestCollectThemeValidationIssuesReportsInvalidMode(t *testing.T) {
	t.Parallel()

	// Theme mode still fails closed on unsupported values.
	errors, warnings := CollectThemeValidationIssues(map[string]any{
		"mode": "nope",
	})

	if len(warnings) != 0 {
		t.Fatalf("expected no warnings, got %#v", warnings)
	}
	if !hasIssueMessage(errors, "theme.mode must be one of: light, dark, auto.") {
		t.Fatalf("expected invalid mode error, got %#v", errors)
	}
}

func TestCollectThemeValidationIssuesWarnsOnUnknownKeys(t *testing.T) {
	t.Parallel()

	// Unknown top-level theme keys should stay warnings so payloads can be diagnosed without hard failure.
	errors, warnings := CollectThemeValidationIssues(map[string]any{
		"unknownKey": "value",
	})

	if len(errors) != 0 {
		t.Fatalf("expected no errors, got %#v", errors)
	}
	if !hasIssueMessage(warnings, "theme contains unknown keys and they will be ignored: unknownKey") {
		t.Fatalf("expected unknown top-level theme warning, got %#v", warnings)
	}
}
