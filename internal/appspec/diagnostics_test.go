package appspec

import "testing"

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
