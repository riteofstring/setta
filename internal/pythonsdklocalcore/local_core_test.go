package pythonsdklocalcore

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"setta/internal/appsubsystem/appdefinition"
	"setta/internal/appsubsystem/appspec"
	"setta/internal/projectstate"
	"setta/internal/pythonsdkcontracts"
	"setta/internal/watchcodecontracts"
)

func TestRunWritesHandshakeAndHandlesRealtimeRenderCommand(t *testing.T) {
	t.Helper()

	var input bytes.Buffer
	encoder := json.NewEncoder(&input)
	if err := encoder.Encode(pythonsdkcontracts.LocalCoreCommandEnvelope{
		CallID:      "call-1",
		CommandName: CommandListenerRenderRealtimeDependencyValues,
		Payload: map[string]any{
			"dependencyCatalog": map[string]any{
				"entries": []map[string]any{
					{
						"dependencyKey":    "section-config",
						"name":             "Config",
						"fullPathName":     "Config",
						"dependencies":     []string{"section-config.param-count"},
						"includeInCodegen": true,
						"sectionType":      "Dict",
					},
					{
						"dependencyKey":       "section-config.param-count",
						"name":                "count",
						"fullPathName":        "Config.count",
						"includeInCodegen":    true,
						"codeObjType":         "CodeParam",
						"valueRepresentation": "expression",
					},
				},
			},
			"currentDependencyValues": map[string]any{
				"entries": []map[string]any{
					{
						"dependencyKey": "section-config",
						"renderedValue": "{'count': 1}",
					},
					{
						"dependencyKey": "section-config.param-count",
						"renderedValue": "1",
					},
				},
			},
			"deltas": []map[string]any{
				{
					"dependency": "section-config.param-count",
					"value": map[string]any{
						"type":    "Literal",
						"payload": "2",
					},
				},
			},
		},
	}); err != nil {
		t.Fatalf("encode local core command: %v", err)
	}

	var output bytes.Buffer
	if err := Run(RunOptions{
		Stdin:  &input,
		Stdout: &output,
	}); err != nil {
		t.Fatalf("Run() error = %v", err)
	}

	decoder := json.NewDecoder(&output)
	var handshake pythonsdkcontracts.LocalCoreVersionHandshake
	if err := decoder.Decode(&handshake); err != nil {
		t.Fatalf("decode handshake: %v", err)
	}
	if handshake.ProtocolVersion != ProtocolVersion {
		t.Fatalf("expected protocol version %d, got %d", ProtocolVersion, handshake.ProtocolVersion)
	}
	if handshake.SDKContractVersion != pythonsdkcontracts.SDKContractVersion {
		t.Fatalf(
			"expected contract version %d, got %d",
			pythonsdkcontracts.SDKContractVersion,
			handshake.SDKContractVersion,
		)
	}

	var result pythonsdkcontracts.LocalCoreResultEnvelope
	if err := decoder.Decode(&result); err != nil {
		t.Fatalf("decode command result: %v", err)
	}
	if !result.OK {
		t.Fatalf("expected ok result, got error %v", result.Error)
	}
	if result.CallID != "call-1" {
		t.Fatalf("expected call id call-1, got %s", result.CallID)
	}
	encodedResult, err := json.Marshal(result.Result)
	if err != nil {
		t.Fatalf("marshal local core result: %v", err)
	}
	var typedResult renderRealtimeDependencyValuesResultWire
	if err := json.Unmarshal(encodedResult, &typedResult); err != nil {
		t.Fatalf("decode typed local core result: %v", err)
	}
	if len(typedResult.DependencyValues.Entries) != 2 {
		t.Fatalf("expected 2 dependency values, got %d", len(typedResult.DependencyValues.Entries))
	}
	if typedResult.DependencyValues.Entries[0].DependencyKey != "section-config" {
		t.Fatalf(
			"expected first dependency key section-config, got %s",
			typedResult.DependencyValues.Entries[0].DependencyKey,
		)
	}
	if typedResult.DependencyValues.Entries[0].RenderedValue != "{'count': 2}" {
		t.Fatalf(
			"expected first dependency value to refresh dependents, got %q",
			typedResult.DependencyValues.Entries[0].RenderedValue,
		)
	}
	if typedResult.DependencyValues.Entries[1].DependencyKey != "section-config.param-count" {
		t.Fatalf(
			"expected second dependency key section-config.param-count, got %s",
			typedResult.DependencyValues.Entries[1].DependencyKey,
		)
	}
}

func TestRunAppDefinitionCompareAndSetReturnsPlannedDefinitionWithoutPersisting(t *testing.T) {
	t.Helper()

	settaFilesRoot := t.TempDir()
	pluginID := "setta-json-render-app-gen"
	store, err := projectstate.NewStore(
		filepath.Join(settaFilesRoot, projectstate.MainFileName),
		projectstate.StoreOptions{},
	)
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	if err := store.Save(context.Background(), projectstate.NewDocument()); err != nil {
		t.Fatalf("save initial document: %v", err)
	}
	runtime, err := projectstate.OpenRuntimeWithOptions(
		context.Background(),
		store,
		projectstate.RuntimeOptions{},
	)
	if err != nil {
		t.Fatalf("open runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close runtime: %v", err)
		}
	})
	appSpecStore := appspec.MustForPlugin(pluginID)
	appSpecPath := appSpecStore.DefaultPath()
	initialVersion := "v1"
	catalogID := appspec.DefaultCatalogID
	service := appdefinition.NewAppDefinitionService(runtime, pluginID)
	if _, _, err := service.SetAppDefinition(context.Background(), appdefinition.SetInput{
		AppSpec: map[string]any{
			"root": map[string]any{"key": "root", "type": "Stack"},
		},
		AppSpecPath:    &appSpecPath,
		AppSpecVersion: &initialVersion,
		CatalogID:      &catalogID,
	}); err != nil {
		t.Fatalf("seed app definition: %v", err)
	}

	result := runLocalCoreCommand(t, "call-cas", CommandCompareAndSetAppDefinitionSpecVersion, map[string]any{
		"settaFilesRoot":   settaFilesRoot,
		"pluginId":         pluginID,
		"value":            "v2",
		"expectedOldValue": "v1",
	})
	if !result.OK {
		t.Fatalf("expected ok result, got error %v", result.Error)
	}
	typedResult := decodeLocalCoreCommandResult[appdefinition.CompareAndSetMutationResult](t, result)
	if typedResult.CompareResult.OldValue != "v1" || typedResult.CompareResult.NewValue != "v2" {
		t.Fatalf("unexpected compare result %#v", typedResult.CompareResult)
	}
	if typedResult.AppDefinition == nil || typedResult.AppDefinition.AppSpecVersion != "v2" {
		t.Fatalf("expected planned updated app definition, got %#v", typedResult.AppDefinition)
	}

	persisted, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document: %v", err)
	}
	storage := appdefinition.MustStorageForPlugin(pluginID)
	persistedDefinition, err := appdefinition.DecodeStoredAppDefinition(
		storage.StoredDocumentAppDefinitionRaw(persisted),
	)
	if err != nil {
		t.Fatalf("decode persisted app definition: %v", err)
	}
	if persistedDefinition == nil || persistedDefinition.AppSpecVersion != "v1" {
		t.Fatalf("local core command should not persist planned mutation, got %#v", persistedDefinition)
	}
}

func TestRunAppDefinitionPlanningUsesPayloadDocumentInsteadOfPersistedDisk(t *testing.T) {
	t.Helper()

	settaFilesRoot := t.TempDir()
	pluginID := "setta-json-render-app-gen"
	store, err := projectstate.NewStore(
		filepath.Join(settaFilesRoot, projectstate.MainFileName),
		projectstate.StoreOptions{},
	)
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	if err := store.Save(context.Background(), projectstate.NewDocument()); err != nil {
		t.Fatalf("save stale persisted document: %v", err)
	}

	appSpecStore := appspec.MustForPlugin(pluginID)
	appSpecPath := appSpecStore.DefaultPath()
	appSpec := map[string]any{
		"root": "root",
		"elements": map[string]any{
			"root": map[string]any{"key": "root", "type": "Stack"},
		},
	}
	if err := appSpecStore.Write(settaFilesRoot, appSpecPath, appSpec); err != nil {
		t.Fatalf("write app spec: %v", err)
	}

	storage := appdefinition.MustStorageForPlugin(pluginID)
	queuedDefinition := appdefinition.AppDefinition{
		AppSpecVersion: "v3",
		CatalogID:      appspec.DefaultCatalogID,
		AppSpecPath:    appSpecPath,
	}
	encodedDefinition, err := appdefinition.EncodeStoredAppDefinition(&queuedDefinition)
	if err != nil {
		t.Fatalf("encode queued app definition: %v", err)
	}
	queuedDocument := storage.WithStoredDocumentAppDefinition(
		projectstate.NewDocument(),
		encodedDefinition,
	)

	result := runLocalCoreCommand(t, "call-cas", CommandCompareAndSetAppDefinitionSpecVersion, map[string]any{
		"settaFilesRoot":       settaFilesRoot,
		"pluginId":             pluginID,
		"projectStateDocument": queuedDocument,
		"value":                "v4",
		"expectedOldValue":     "v3",
	})
	if !result.OK {
		t.Fatalf("expected queued document to satisfy compare-and-set, got error %v details %#v", result.Error, result.Details)
	}
	typedResult := decodeLocalCoreCommandResult[appdefinition.CompareAndSetMutationResult](t, result)
	if typedResult.CompareResult.OldValue != "v3" || typedResult.CompareResult.NewValue != "v4" {
		t.Fatalf("unexpected compare result %#v", typedResult.CompareResult)
	}

	persisted, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document: %v", err)
	}
	if raw := storage.StoredDocumentAppDefinitionRaw(persisted); len(raw) != 0 {
		t.Fatalf("local core command should not write queued document to disk, got %s", string(raw))
	}
}

func TestRunWatchCodeSetInputsPersistsCurrentPluginContract(t *testing.T) {
	t.Helper()

	settaFilesRoot := t.TempDir()
	workspaceRoot := t.TempDir()
	if err := writeWatchCodeLocalCoreProject(t, settaFilesRoot); err != nil {
		t.Fatalf("seed project state: %v", err)
	}
	watchedDir := filepath.Join(workspaceRoot, "pkg")
	if err := writeWatchCodeLocalCoreFile(t, filepath.Join(watchedDir, "tracked.py"), "def tracked(value):\n    return value\n"); err != nil {
		t.Fatalf("write watched file: %v", err)
	}

	result := runLocalCoreCommand(t, "call-watch-code-inputs", CommandWatchCodeSetInputs, map[string]any{
		"settaFilesRoot":  settaFilesRoot,
		"workspaceRoot":   workspaceRoot,
		"runtimeRoot":     filepath.Join(settaFilesRoot, "runtime"),
		"pluginId":        "setta-watch-code",
		"projectConfigId": "project-alpha",
		"folders": []map[string]any{
			{"path": "pkg", "recursive": true},
		},
		"files": []string{},
	})
	if !result.OK {
		t.Fatalf("expected ok Watch Code result, got error %v details %#v", result.Error, result.Details)
	}
	typedResult := decodeLocalCoreCommandResult[projectstate.WatchCodePluginProjectData](t, result)
	if len(typedResult.Folders) != 1 || typedResult.Folders[0].Path != "pkg" || !typedResult.Folders[0].Recursive {
		t.Fatalf("expected normalized folders in command result, got %#v", typedResult.Folders)
	}

	store, err := projectstate.NewStore(
		filepath.Join(settaFilesRoot, projectstate.MainFileName),
		projectstate.StoreOptions{},
	)
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	persisted, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load persisted document: %v", err)
	}
	projectData, _, err := persisted.WatchCodePluginProjectData("setta-watch-code", "project-alpha")
	if err != nil {
		t.Fatalf("read persisted watch code project data: %v", err)
	}
	if _, ok := projectData.BaselineByPath[filepath.Join(watchedDir, "tracked.py")]; !ok {
		t.Fatalf("expected watched file baseline in persisted data, got %#v", projectData.BaselineByPath)
	}
}

func TestRunWatchCodeSetInputsRejectsLegacyInputFields(t *testing.T) {
	t.Helper()

	settaFilesRoot := t.TempDir()
	if err := writeWatchCodeLocalCoreProject(t, settaFilesRoot); err != nil {
		t.Fatalf("seed project state: %v", err)
	}

	result := runLocalCoreCommand(t, "call-watch-code-legacy-inputs", CommandWatchCodeSetInputs, map[string]any{
		"settaFilesRoot":   settaFilesRoot,
		"workspaceRoot":    t.TempDir(),
		"pluginId":         "setta-watch-code",
		"projectConfigId":  "project-alpha",
		"watchCodeFolders": []map[string]any{},
		"watchCodeFiles":   []string{},
	})
	if result.OK {
		t.Fatalf("expected legacy Watch Code payload to fail, got %#v", result)
	}
	if got := localCoreErrorCode(result); got != watchcodecontracts.BackendErrorInvalidWatchCodeInput {
		t.Fatalf("expected invalid watch code input error, got %q from %#v", got, result)
	}
}

func writeWatchCodeLocalCoreProject(t *testing.T, settaFilesRoot string) error {
	t.Helper()
	store, err := projectstate.NewStore(
		filepath.Join(settaFilesRoot, projectstate.MainFileName),
		projectstate.StoreOptions{},
	)
	if err != nil {
		return err
	}
	return store.Save(context.Background(), projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {
				ID:   "project-alpha",
				Name: "Alpha",
			},
		},
	})
}

func writeWatchCodeLocalCoreFile(t *testing.T, path string, content string) error {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(content), 0o644)
}

func runLocalCoreCommand(
	t *testing.T,
	callID string,
	commandName string,
	payload map[string]any,
) pythonsdkcontracts.LocalCoreResultEnvelope {
	t.Helper()

	var input bytes.Buffer
	if err := json.NewEncoder(&input).Encode(pythonsdkcontracts.LocalCoreCommandEnvelope{
		CallID:      callID,
		CommandName: commandName,
		Payload:     payload,
	}); err != nil {
		t.Fatalf("encode local core command: %v", err)
	}

	var output bytes.Buffer
	if err := Run(RunOptions{
		Stdin:  &input,
		Stdout: &output,
	}); err != nil {
		t.Fatalf("Run() error = %v", err)
	}

	decoder := json.NewDecoder(&output)
	var handshake pythonsdkcontracts.LocalCoreVersionHandshake
	if err := decoder.Decode(&handshake); err != nil {
		t.Fatalf("decode handshake: %v", err)
	}
	var result pythonsdkcontracts.LocalCoreResultEnvelope
	if err := decoder.Decode(&result); err != nil {
		t.Fatalf("decode command result: %v", err)
	}
	return result
}

func decodeLocalCoreCommandResult[T any](
	t *testing.T,
	result pythonsdkcontracts.LocalCoreResultEnvelope,
) T {
	t.Helper()

	var typedResult T
	encodedResult, err := json.Marshal(result.Result)
	if err != nil {
		t.Fatalf("marshal local core result: %v", err)
	}
	if err := json.Unmarshal(encodedResult, &typedResult); err != nil {
		t.Fatalf("decode typed local core result: %v", err)
	}
	return typedResult
}

func localCoreErrorCode(result pythonsdkcontracts.LocalCoreResultEnvelope) string {
	if result.Details == nil {
		return ""
	}
	code, _ := result.Details["code"].(string)
	return code
}
