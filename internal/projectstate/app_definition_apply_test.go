package projectstate

import (
	"encoding/json"
	"math"
	"reflect"
	"strings"
	"testing"
)

func TestApplyValidateAppDefinitionInputAppliesOptionalOverrides(t *testing.T) {
	t.Parallel()

	appSpecVersion := " v2 "
	catalogID := " custom-catalog "
	routes := []AppRoute{{Path: " /home ", Name: " Home ", RootKey: " root "}}
	dataBindings := map[string]any{"title": map[string]any{"text": "hello"}}
	actions := map[string]any{"run": map[string]any{"type": "action"}}
	theme := map[string]any{"mode": "dark"}
	assets := []any{map[string]any{"href": "/app.css"}}

	updated, err := applyValidateAppDefinitionInput(AppDefinition{
		AppSpecVersion: "v1",
		CatalogID:      "default",
		AppSpecPath:    " app_specs/current.json ",
		Routes:         []AppRoute{{Path: "/old", Name: "Old", RootKey: "old"}},
	}, ValidateAppDefinitionInput{
		AppSpecVersion: &appSpecVersion,
		CatalogID:      &catalogID,
		Routes:         &routes,
		DataBindings:   &dataBindings,
		Actions:        &actions,
		Theme:          &theme,
		Assets:         &assets,
	})
	if err != nil {
		t.Fatalf("apply validate app definition input: %v", err)
	}

	if updated.AppSpecVersion != "v2" {
		t.Fatalf("expected normalized app spec version v2, got %q", updated.AppSpecVersion)
	}
	if updated.CatalogID != "custom-catalog" {
		t.Fatalf("expected normalized catalog id custom-catalog, got %q", updated.CatalogID)
	}
	if updated.AppSpecPath != "app_specs/current.json" {
		t.Fatalf("expected normalized app spec path app_specs/current.json, got %q", updated.AppSpecPath)
	}

	wantRoutes := []AppRoute{{Path: "/home", Name: "Home", RootKey: "root"}}
	if !reflect.DeepEqual(updated.Routes, wantRoutes) {
		t.Fatalf("expected normalized routes %#v, got %#v", wantRoutes, updated.Routes)
	}
	if got := mustUnmarshalAppDefinitionRawJSON(t, updated.DataBindings); !reflect.DeepEqual(got, any(dataBindings)) {
		t.Fatalf("expected data bindings %#v, got %#v", dataBindings, got)
	}
	if got := mustUnmarshalAppDefinitionRawJSON(t, updated.Actions); !reflect.DeepEqual(got, any(actions)) {
		t.Fatalf("expected actions %#v, got %#v", actions, got)
	}
	if got := mustUnmarshalAppDefinitionRawJSON(t, updated.Theme); !reflect.DeepEqual(got, any(theme)) {
		t.Fatalf("expected theme %#v, got %#v", theme, got)
	}
	if got := mustUnmarshalAppDefinitionRawJSON(t, updated.Assets); !reflect.DeepEqual(got, any(assets)) {
		t.Fatalf("expected assets %#v, got %#v", assets, got)
	}
}

func TestApplySetAppDefinitionInputAppliesOptionalOverrides(t *testing.T) {
	t.Parallel()

	appSpecVersion := " v2 "
	catalogID := " custom-catalog "
	routes := []AppRoute{{Path: " /home ", Name: " Home ", RootKey: " root "}}
	dataBindings := map[string]any{"title": map[string]any{"text": "hello"}}
	actions := map[string]any{"run": map[string]any{"type": "action"}}
	theme := map[string]any{"mode": "dark"}
	assets := []any{map[string]any{"href": "/app.css"}}

	updated, err := applySetAppDefinitionInput(AppDefinition{
		AppSpecVersion: "v1",
		CatalogID:      "default",
		AppSpecPath:    "app_specs/current.json",
		Routes:         []AppRoute{{Path: "/old", Name: "Old", RootKey: "old"}},
	}, SetAppDefinitionInput{
		AppSpecVersion: &appSpecVersion,
		CatalogID:      &catalogID,
		Routes:         &routes,
		DataBindings:   &dataBindings,
		Actions:        &actions,
		Theme:          &theme,
		Assets:         &assets,
	}, "app_specs/custom.json")
	if err != nil {
		t.Fatalf("apply set app definition input: %v", err)
	}

	if updated.AppSpecVersion != appSpecVersion {
		t.Fatalf("expected app spec version %q, got %q", appSpecVersion, updated.AppSpecVersion)
	}
	if updated.CatalogID != catalogID {
		t.Fatalf("expected catalog id %q, got %q", catalogID, updated.CatalogID)
	}
	if updated.AppSpecPath != "app_specs/custom.json" {
		t.Fatalf("expected app spec path app_specs/custom.json, got %q", updated.AppSpecPath)
	}
	if !reflect.DeepEqual(updated.Routes, routes) {
		t.Fatalf("expected routes %#v, got %#v", routes, updated.Routes)
	}
	if got := mustUnmarshalAppDefinitionRawJSON(t, updated.DataBindings); !reflect.DeepEqual(got, any(dataBindings)) {
		t.Fatalf("expected data bindings %#v, got %#v", dataBindings, got)
	}
	if got := mustUnmarshalAppDefinitionRawJSON(t, updated.Actions); !reflect.DeepEqual(got, any(actions)) {
		t.Fatalf("expected actions %#v, got %#v", actions, got)
	}
	if got := mustUnmarshalAppDefinitionRawJSON(t, updated.Theme); !reflect.DeepEqual(got, any(theme)) {
		t.Fatalf("expected theme %#v, got %#v", theme, got)
	}
	if got := mustUnmarshalAppDefinitionRawJSON(t, updated.Assets); !reflect.DeepEqual(got, any(assets)) {
		t.Fatalf("expected assets %#v, got %#v", assets, got)
	}
}

func TestApplyValidateAppDefinitionInputRejectsInvalidJSONField(t *testing.T) {
	t.Parallel()

	theme := map[string]any{"durationMs": math.Inf(1)}
	_, err := applyValidateAppDefinitionInput(AppDefinition{}, ValidateAppDefinitionInput{Theme: &theme})
	if err == nil {
		t.Fatal("expected error for invalid theme payload")
	}
	if !strings.Contains(err.Error(), "appDefinition.theme") {
		t.Fatalf("expected appDefinition.theme error, got %v", err)
	}
}

func mustUnmarshalAppDefinitionRawJSON(t *testing.T, raw RawJSON) any {
	t.Helper()

	var value any
	if err := json.Unmarshal(raw, &value); err != nil {
		t.Fatalf("unmarshal raw json: %v", err)
	}
	return value
}
