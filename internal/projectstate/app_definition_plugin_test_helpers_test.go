package projectstate

import (
	"encoding/json"
	"testing"
)

const appSubsystemPluginDataKey = "setta-json-render-app-gen"

type AppRoute struct {
	Path    string `json:"path"`
	Name    string `json:"name,omitempty"`
	RootKey string `json:"rootKey,omitempty"`
}

type AppDefinition struct {
	AppSpecVersion string     `json:"appSpecVersion,omitempty"`
	CatalogID      string     `json:"catalogId,omitempty"`
	AppSpecPath    string     `json:"appSpecPath,omitempty"`
	Routes         []AppRoute `json:"routes,omitempty"`
	DataBindings   RawJSON    `json:"dataBindings,omitempty"`
	Actions        RawJSON    `json:"actions,omitempty"`
	Theme          RawJSON    `json:"theme,omitempty"`
	Assets         RawJSON    `json:"assets,omitempty"`
}

type SetAppDefinitionInput struct {
	AppSpec        any
	AppSpecPath    *string
	AppSpecVersion *string
	CatalogID      *string
	Routes         *[]AppRoute
	DataBindings   *map[string]any
	Actions        *map[string]any
	Theme          *map[string]any
	Assets         *[]any
}

func mustMarshalTestRawJSON(t *testing.T, value any, field string) RawJSON {
	t.Helper()

	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal %s: %v", field, err)
	}
	return RawJSON(encoded)
}

func mustMarshalStoredAppDefinition(t *testing.T, definition AppDefinition) RawJSON {
	t.Helper()

	return mustMarshalTestRawJSON(t, definition, "appDefinition")
}

func mustDecodeStoredAppDefinition(t *testing.T, raw RawJSON) AppDefinition {
	t.Helper()

	var definition AppDefinition
	if err := json.Unmarshal(raw, &definition); err != nil {
		t.Fatalf("decode stored app definition: %v", err)
	}
	return definition
}
