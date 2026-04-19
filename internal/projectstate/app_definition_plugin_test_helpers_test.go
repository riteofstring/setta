package projectstate

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"

	"setta/plugins/setta-json-render-app-gen/backend/appspec"
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

func setTestAppDefinition(
	t *testing.T,
	runtime *Runtime,
	input SetAppDefinitionInput,
) {
	t.Helper()

	projectRoot, err := runtime.ProjectRoot()
	if err != nil {
		t.Fatalf("project root: %v", err)
	}
	current := runtime.Snapshot().Document.PluginData[appSubsystemPluginDataKey]
	metadata := AppDefinition{}
	if len(current) != 0 {
		metadata = mustDecodeStoredAppDefinition(t, current)
	}
	if strings.TrimSpace(metadata.AppSpecVersion) == "" {
		metadata.AppSpecVersion = "v1"
	}
	if strings.TrimSpace(metadata.CatalogID) == "" {
		metadata.CatalogID = appspec.DefaultCatalogID
	}

	targetPath := appspec.MustForPlugin("setta-json-render-app-gen").DefaultPath()
	if trimmed := strings.TrimSpace(metadata.AppSpecPath); trimmed != "" {
		targetPath = trimmed
	}
	if input.AppSpecPath != nil && strings.TrimSpace(*input.AppSpecPath) != "" {
		targetPath = *input.AppSpecPath
	}
	normalizedPath, err := appspec.MustForPlugin("setta-json-render-app-gen").NormalizePath(projectRoot, targetPath)
	if err != nil {
		t.Fatalf("normalize app spec path: %v", err)
	}
	metadata.AppSpecPath = normalizedPath
	if input.AppSpecVersion != nil {
		metadata.AppSpecVersion = *input.AppSpecVersion
	}
	if input.CatalogID != nil {
		metadata.CatalogID = *input.CatalogID
	}
	if input.Routes != nil {
		metadata.Routes = append([]AppRoute(nil), (*input.Routes)...)
	}
	if input.DataBindings != nil {
		metadata.DataBindings = mustMarshalTestRawJSON(t, *input.DataBindings, "appDefinition.dataBindings")
	}
	if input.Actions != nil {
		metadata.Actions = mustMarshalTestRawJSON(t, *input.Actions, "appDefinition.actions")
	}
	if input.Theme != nil {
		metadata.Theme = mustMarshalTestRawJSON(t, *input.Theme, "appDefinition.theme")
	}
	if input.Assets != nil {
		metadata.Assets = mustMarshalTestRawJSON(t, *input.Assets, "appDefinition.assets")
	}

	previousAppSpec, err := appspec.MustForPlugin("setta-json-render-app-gen").Read(projectRoot, normalizedPath)
	if err != nil {
		t.Fatalf("read previous app spec: %v", err)
	}
	_, err = runtime.MutatePersistedWithContext(context.Background(), func(document Document) (PersistedMutationPlan, error) {
		next := document.Clone()
		if next.PluginData == nil {
			next.PluginData = map[string]RawJSON{}
		}
		next.PluginData[appSubsystemPluginDataKey] = mustMarshalStoredAppDefinition(t, metadata)
		appSpec := input.AppSpec
		return PersistedMutationPlan{
			NextDocument: next,
			ApplyExternalChanges: func() error {
				return appspec.MustForPlugin("setta-json-render-app-gen").Write(projectRoot, normalizedPath, appSpec)
			},
			RollbackExternalChanges: func() error {
				return rollbackTestAppSpecWrite(projectRoot, normalizedPath, previousAppSpec)
			},
		}, nil
	})
	if err != nil {
		t.Fatalf("set app definition: %v", err)
	}
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

func rollbackTestAppSpecWrite(projectRoot string, appSpecPath string, previousAppSpec any) error {
	if previousAppSpec != nil {
		return appspec.MustForPlugin("setta-json-render-app-gen").Write(projectRoot, appSpecPath, previousAppSpec)
	}

	resolvedPath, err := appspec.MustForPlugin("setta-json-render-app-gen").ResolvePath(projectRoot, appSpecPath)
	if err != nil {
		return err
	}
	if err := os.Remove(resolvedPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove app spec: %w", err)
	}
	return nil
}
