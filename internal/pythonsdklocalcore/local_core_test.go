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

func TestRunWatchCodeGetProjectDataIgnoresOldTopLevelFields(t *testing.T) {
	t.Helper()

	_, settaFilesRoot := seedWatchCodeLocalCoreProjectStore(t)
	storePath := filepath.Join(settaFilesRoot, projectstate.MainFileName)
	payload := map[string]any{}
	if err := json.Unmarshal(mustReadFile(t, storePath), &payload); err != nil {
		t.Fatalf("decode seeded project store: %v", err)
	}
	payload["watchCodeEnabled"] = true
	payload["watchCodeFiles"] = []string{"old.py"}
	encoded, err := json.MarshalIndent(payload, "", "  ")
	if err != nil {
		t.Fatalf("encode legacy-shaped project store: %v", err)
	}
	if err := os.WriteFile(storePath, append(encoded, '\n'), 0o644); err != nil {
		t.Fatalf("write legacy-shaped project store: %v", err)
	}

	result := runLocalCoreCommand(t, "call-watch-data", CommandWatchCodeGetProjectData, map[string]any{
		"settaFilesRoot":   settaFilesRoot,
		"pluginId":         watchCodeLocalCoreProviderID,
		"projectConfigId":  "project-alpha",
		"watchCodeEnabled": true,
	})
	if result.OK {
		t.Fatal("expected unknown local-core payload field to fail loudly")
	}
	if got := localCoreErrorCode(result); got != "invalid_request" {
		t.Fatalf("expected invalid_request for unknown payload field, got %q", got)
	}

	result = runLocalCoreCommand(t, "call-watch-data", CommandWatchCodeGetProjectData, map[string]any{
		"settaFilesRoot":  settaFilesRoot,
		"pluginId":        watchCodeLocalCoreProviderID,
		"projectConfigId": "project-alpha",
	})
	if !result.OK {
		t.Fatalf("expected ok result, got error %v details %#v", result.Error, result.Details)
	}
	projectData := decodeLocalCoreCommandResult[projectstate.WatchCodePluginProjectData](t, result)
	if projectData.Enabled || len(projectData.Files) != 0 || len(projectData.Folders) != 0 {
		t.Fatalf("expected old top-level watch code fields to be ignored, got %#v", projectData)
	}
}

func TestRunWatchCodeSetEnabledPersistsProviderPluginData(t *testing.T) {
	t.Helper()

	workspaceRoot, settaFilesRoot := seedWatchCodeLocalCoreProjectStore(t)

	result := runLocalCoreCommand(t, "call-watch-enabled", CommandWatchCodeSetEnabled, map[string]any{
		"settaFilesRoot":  settaFilesRoot,
		"workspaceRoot":   workspaceRoot,
		"pluginId":        watchCodeLocalCoreProviderID,
		"projectConfigId": "project-alpha",
		"enabled":         true,
	})
	if !result.OK {
		t.Fatalf("expected ok result, got error %v details %#v", result.Error, result.Details)
	}
	projectData := decodeLocalCoreCommandResult[projectstate.WatchCodePluginProjectData](t, result)
	if !projectData.Enabled {
		t.Fatalf("expected result to enable watch code, got %#v", projectData)
	}

	document := loadWatchCodeLocalCoreDocument(t, settaFilesRoot)
	persisted, existed, err := document.WatchCodePluginProjectData(watchCodeLocalCoreProviderID, "project-alpha")
	if err != nil {
		t.Fatalf("read persisted watch code project data: %v", err)
	}
	if !existed || !persisted.Enabled {
		t.Fatalf("expected provider-keyed persisted plugin data, existed=%v data=%#v", existed, persisted)
	}
	if _, exists := document.PluginData["setta-watch-code"]; exists {
		t.Fatal("local-core command wrote first-party watch code plugin id instead of the caller provider id")
	}
}

func TestRunWatchCodeSetInputsNormalizesAndRejectsWorkspaceEscapes(t *testing.T) {
	t.Helper()

	workspaceRoot, settaFilesRoot := seedWatchCodeLocalCoreProjectStore(t)

	result := runLocalCoreCommand(t, "call-watch-inputs", CommandWatchCodeSetInputs, map[string]any{
		"settaFilesRoot":  settaFilesRoot,
		"workspaceRoot":   workspaceRoot,
		"pluginId":        watchCodeLocalCoreProviderID,
		"projectConfigId": "project-alpha",
		"watchCodeFolders": []map[string]any{
			{"path": " pkg/../pkg ", "recursive": true},
			{"path": "pkg", "recursive": true},
		},
		"watchCodeFiles": []string{"pkg/file.py", "pkg/./file.py"},
	})
	if !result.OK {
		t.Fatalf("expected ok result, got error %v details %#v", result.Error, result.Details)
	}
	projectData := decodeLocalCoreCommandResult[projectstate.WatchCodePluginProjectData](t, result)
	if len(projectData.Folders) != 1 ||
		projectData.Folders[0] != (projectstate.WatchCodeFolder{Path: "pkg", Recursive: true}) {
		t.Fatalf("expected normalized unique folder input, got %#v", projectData.Folders)
	}
	if len(projectData.Files) != 1 || projectData.Files[0] != "pkg/file.py" {
		t.Fatalf("expected normalized unique file input, got %#v", projectData.Files)
	}

	result = runLocalCoreCommand(t, "call-watch-inputs-invalid", CommandWatchCodeSetInputs, map[string]any{
		"settaFilesRoot":  settaFilesRoot,
		"workspaceRoot":   workspaceRoot,
		"pluginId":        watchCodeLocalCoreProviderID,
		"projectConfigId": "project-alpha",
		"watchCodeFolders": []map[string]any{
			{"path": "../outside", "recursive": false},
		},
		"watchCodeFiles": []string{},
	})
	if result.OK {
		t.Fatal("expected workspace escape to fail")
	}
	if got := localCoreErrorCode(result); got != "invalid_watch_code_input" {
		t.Fatalf("expected invalid_watch_code_input, got %q", got)
	}
}

func TestRunWatchCodeReadAndWriteSettingCommands(t *testing.T) {
	t.Helper()

	workspaceRoot, settaFilesRoot := seedWatchCodeLocalCoreProjectStore(t)

	writeResult := runLocalCoreCommand(t, "call-watch-write-enabled", CommandWatchCodeWriteSetting, map[string]any{
		"settaFilesRoot":  settaFilesRoot,
		"workspaceRoot":   workspaceRoot,
		"pluginId":        watchCodeLocalCoreProviderID,
		"projectConfigId": "project-alpha",
		"settingId":       "enabled",
		"value":           true,
	})
	if !writeResult.OK {
		t.Fatalf("expected enabled write ok, got error %v details %#v", writeResult.Error, writeResult.Details)
	}
	if got := decodeLocalCoreCommandResult[bool](t, writeResult); !got {
		t.Fatalf("expected enabled write result true, got %v", got)
	}

	writeResult = runLocalCoreCommand(t, "call-watch-write-files", CommandWatchCodeWriteSetting, map[string]any{
		"settaFilesRoot":  settaFilesRoot,
		"workspaceRoot":   workspaceRoot,
		"pluginId":        watchCodeLocalCoreProviderID,
		"projectConfigId": "project-alpha",
		"settingId":       "files",
		"value":           []string{"pkg/file.py"},
	})
	if !writeResult.OK {
		t.Fatalf("expected files write ok, got error %v details %#v", writeResult.Error, writeResult.Details)
	}

	readResult := runLocalCoreCommand(t, "call-watch-read-files", CommandWatchCodeReadSetting, map[string]any{
		"settaFilesRoot":  settaFilesRoot,
		"pluginId":        watchCodeLocalCoreProviderID,
		"projectConfigId": "project-alpha",
		"settingId":       "files",
	})
	if !readResult.OK {
		t.Fatalf("expected files read ok, got error %v details %#v", readResult.Error, readResult.Details)
	}
	files := decodeLocalCoreCommandResult[[]string](t, readResult)
	if len(files) != 1 || files[0] != "pkg/file.py" {
		t.Fatalf("expected files setting to round trip, got %#v", files)
	}

	writeResult = runLocalCoreCommand(t, "call-watch-write-folder-extra", CommandWatchCodeWriteSetting, map[string]any{
		"settaFilesRoot":  settaFilesRoot,
		"workspaceRoot":   workspaceRoot,
		"pluginId":        watchCodeLocalCoreProviderID,
		"projectConfigId": "project-alpha",
		"settingId":       "folders",
		"value": []map[string]any{
			{"path": "pkg", "recursive": true, "extra": "rejected"},
		},
	})
	if writeResult.OK {
		t.Fatal("expected unsupported folder property to fail")
	}
	if got := localCoreErrorCode(writeResult); got != "invalid_watch_code_input" {
		t.Fatalf("expected invalid_watch_code_input, got %q", got)
	}
}

func TestRunWatchCodeCommandsRejectRequiredFields(t *testing.T) {
	t.Helper()

	workspaceRoot, settaFilesRoot := seedWatchCodeLocalCoreProjectStore(t)
	testCases := []struct {
		name    string
		payload map[string]any
		code    string
	}{
		{
			name: "missing plugin id",
			payload: map[string]any{
				"settaFilesRoot":  settaFilesRoot,
				"workspaceRoot":   workspaceRoot,
				"projectConfigId": "project-alpha",
				"enabled":         true,
			},
			code: "watch_code_provider_required",
		},
		{
			name: "missing project config id",
			payload: map[string]any{
				"settaFilesRoot": settaFilesRoot,
				"workspaceRoot":  workspaceRoot,
				"pluginId":       watchCodeLocalCoreProviderID,
				"enabled":        true,
			},
			code: "project_config_id_required",
		},
		{
			name: "missing workspace root for mutation",
			payload: map[string]any{
				"settaFilesRoot":  settaFilesRoot,
				"pluginId":        watchCodeLocalCoreProviderID,
				"projectConfigId": "project-alpha",
				"enabled":         true,
			},
			code: "invalid_watch_code_input",
		},
		{
			name: "unknown project config id",
			payload: map[string]any{
				"settaFilesRoot":  settaFilesRoot,
				"workspaceRoot":   workspaceRoot,
				"pluginId":        watchCodeLocalCoreProviderID,
				"projectConfigId": "missing-project",
				"enabled":         true,
			},
			code: "project_config_not_found",
		},
	}
	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			result := runLocalCoreCommand(t, "call-watch-required", CommandWatchCodeSetEnabled, testCase.payload)
			if result.OK {
				t.Fatal("expected command to fail")
			}
			if got := localCoreErrorCode(result); got != testCase.code {
				t.Fatalf("expected error code %q, got %q (error %v)", testCase.code, got, result.Error)
			}
		})
	}
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

const watchCodeLocalCoreProviderID = "setta-fixture-watch-code-provider"

func seedWatchCodeLocalCoreProjectStore(t *testing.T) (string, string) {
	t.Helper()

	workspaceRoot := t.TempDir()
	settaFilesRoot := filepath.Join(workspaceRoot, "setta_files")
	if err := os.MkdirAll(settaFilesRoot, 0o755); err != nil {
		t.Fatalf("create setta files root: %v", err)
	}
	if err := os.MkdirAll(filepath.Join(workspaceRoot, "pkg"), 0o755); err != nil {
		t.Fatalf("create package dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(workspaceRoot, "pkg", "file.py"), []byte("def watched():\n    return 1\n"), 0o644); err != nil {
		t.Fatalf("write watched file: %v", err)
	}

	store, err := projectstate.NewStore(
		filepath.Join(settaFilesRoot, projectstate.MainFileName),
		projectstate.StoreOptions{},
	)
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	document := projectstate.NewDocument()
	document.DefaultProjectID = "project-alpha"
	document.Projects = map[string]projectstate.Project{
		"project-alpha": {
			ID:   "project-alpha",
			Name: "Alpha",
		},
	}
	if err := store.Save(context.Background(), document); err != nil {
		t.Fatalf("save project store: %v", err)
	}
	return workspaceRoot, settaFilesRoot
}

func loadWatchCodeLocalCoreDocument(t *testing.T, settaFilesRoot string) projectstate.Document {
	t.Helper()

	store, err := projectstate.NewStore(
		filepath.Join(settaFilesRoot, projectstate.MainFileName),
		projectstate.StoreOptions{},
	)
	if err != nil {
		t.Fatalf("new project store: %v", err)
	}
	document, err := store.Load(context.Background())
	if err != nil {
		t.Fatalf("load project store: %v", err)
	}
	return document
}

func mustReadFile(t *testing.T, path string) []byte {
	t.Helper()

	content, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read %s: %v", path, err)
	}
	return content
}

func localCoreErrorCode(result pythonsdkcontracts.LocalCoreResultEnvelope) string {
	if result.Details == nil {
		return ""
	}
	code, _ := result.Details["code"].(string)
	return code
}
