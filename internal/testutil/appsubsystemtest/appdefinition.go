package appsubsystemtest

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"strings"
	"testing"

	appdefinition "setta/internal/appsubsystem/appdefinition"
	"setta/internal/appsubsystem/appspec"
	"setta/internal/projectstate"
	"setta/internal/testutil/firstpartyplugin"
)

func SetTestAppDefinition(
	t testing.TB,
	runtime *projectstate.Runtime,
	input appdefinition.SetInput,
) {
	t.Helper()

	projectRoot, err := runtime.ProjectRoot()
	if err != nil {
		t.Fatalf("project root: %v", err)
	}
	storage := appdefinition.MustStorageForPlugin(firstpartyplugin.AppSubsystemPluginID)
	appSpecStore := appspec.MustForPlugin(firstpartyplugin.AppSubsystemPluginID)
	metadata := currentTestAppDefinitionMetadata(t, runtime, storage)
	normalizedPath, err := resolveTestAppSpecPath(
		projectRoot,
		appSpecStore,
		metadata,
		input,
	)
	if err != nil {
		t.Fatalf("normalize app spec path: %v", err)
	}
	metadata = applyTestAppDefinitionInput(t, metadata, normalizedPath, input)

	previousAppSpec, err := appSpecStore.Read(projectRoot, normalizedPath)
	if err != nil {
		t.Fatalf("read previous app spec: %v", err)
	}
	_, err = runtime.MutatePersistedWithContext(context.Background(), func(document projectstate.Document) (projectstate.PersistedMutationPlan, error) {
		next := storage.WithStoredDocumentAppDefinition(
			document,
			MustMarshalStoredAppDefinition(t, metadata),
		)
		appSpec := input.AppSpec
		return projectstate.PersistedMutationPlan{
			NextDocument: next,
			ApplyExternalChanges: func() error {
				return appSpecStore.Write(projectRoot, normalizedPath, appSpec)
			},
			RollbackExternalChanges: func() error {
				return RollbackTestAppSpecWrite(projectRoot, normalizedPath, previousAppSpec)
			},
		}, nil
	})
	if err != nil {
		t.Fatalf("set app definition: %v", err)
	}
}

func currentTestAppDefinitionMetadata(
	t testing.TB,
	runtime *projectstate.Runtime,
	storage appdefinition.DocumentStorage,
) appdefinition.AppDefinition {
	t.Helper()

	current := storage.StoredDocumentAppDefinitionRaw(runtime.Snapshot().Document)
	metadata := appdefinition.AppDefinition{}
	if len(current) != 0 {
		metadata = MustDecodeStoredAppDefinition(t, current)
	}
	if strings.TrimSpace(metadata.AppSpecVersion) == "" {
		metadata.AppSpecVersion = "v1"
	}
	if strings.TrimSpace(metadata.CatalogID) == "" {
		metadata.CatalogID = appspec.DefaultCatalogID
	}
	return metadata
}

func resolveTestAppSpecPath(
	projectRoot string,
	appSpecStore appspec.Store,
	metadata appdefinition.AppDefinition,
	input appdefinition.SetInput,
) (string, error) {
	targetPath := appSpecStore.DefaultPath()
	if trimmed := strings.TrimSpace(metadata.AppSpecPath); trimmed != "" {
		targetPath = trimmed
	}
	if input.AppSpecPath != nil && strings.TrimSpace(*input.AppSpecPath) != "" {
		targetPath = *input.AppSpecPath
	}
	return appSpecStore.NormalizePath(projectRoot, targetPath)
}

func applyTestAppDefinitionInput(
	t testing.TB,
	metadata appdefinition.AppDefinition,
	normalizedPath string,
	input appdefinition.SetInput,
) appdefinition.AppDefinition {
	t.Helper()

	metadata.AppSpecPath = normalizedPath
	if input.AppSpecVersion != nil {
		metadata.AppSpecVersion = *input.AppSpecVersion
	}
	if input.CatalogID != nil {
		metadata.CatalogID = *input.CatalogID
	}
	if input.Routes != nil {
		metadata.Routes = append([]appdefinition.AppRoute(nil), (*input.Routes)...)
	}
	applyOptionalRawJSONField(t, &metadata.DataBindings, input.DataBindings, "appDefinition.dataBindings")
	applyOptionalRawJSONField(t, &metadata.Actions, input.Actions, "appDefinition.actions")
	applyOptionalRawJSONField(t, &metadata.Theme, input.Theme, "appDefinition.theme")
	applyOptionalRawJSONField(t, &metadata.Assets, input.Assets, "appDefinition.assets")
	return metadata
}

func applyOptionalRawJSONField[T any](
	t testing.TB,
	target *projectstate.RawJSON,
	value *T,
	field string,
) {
	t.Helper()

	if value == nil {
		return
	}
	*target = MustMarshalTestRawJSON(t, *value, field)
}

func MustMarshalTestRawJSON(t testing.TB, value any, field string) projectstate.RawJSON {
	t.Helper()

	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("marshal %s: %v", field, err)
	}
	return projectstate.RawJSON(encoded)
}

func MustMarshalStoredAppDefinition(
	t testing.TB,
	definition appdefinition.AppDefinition,
) projectstate.RawJSON {
	t.Helper()

	return MustMarshalTestRawJSON(t, definition, "appDefinition")
}

func MustDecodeStoredAppDefinition(
	t testing.TB,
	raw projectstate.RawJSON,
) appdefinition.AppDefinition {
	t.Helper()

	var definition appdefinition.AppDefinition
	if err := json.Unmarshal(raw, &definition); err != nil {
		t.Fatalf("decode stored app definition: %v", err)
	}
	return definition
}

func RollbackTestAppSpecWrite(projectRoot string, appSpecPath string, previousAppSpec any) error {
	if previousAppSpec != nil {
		return appspec.MustForPlugin(firstpartyplugin.AppSubsystemPluginID).Write(projectRoot, appSpecPath, previousAppSpec)
	}

	resolvedPath, err := appspec.MustForPlugin(firstpartyplugin.AppSubsystemPluginID).ResolvePath(projectRoot, appSpecPath)
	if err != nil {
		return err
	}
	if err := os.Remove(resolvedPath); err != nil && !errors.Is(err, os.ErrNotExist) {
		return fmt.Errorf("remove app spec: %w", err)
	}
	return nil
}
