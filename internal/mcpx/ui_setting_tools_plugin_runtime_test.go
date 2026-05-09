package mcpx

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/plugins"
	"setta/internal/realtime"
	"setta/internal/uisettings"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestServerUISettingToolsReturnDefaultForMissingPluginConfigLeafFromRuntime(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, baseService := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName:  "full",
			Version:      "0.1.0",
			StripBackend: true,
		},
	})
	if _, err := baseService.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	}); err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}
	if _, err := baseService.WriteConfig(context.Background(), plugins.ConfigWriteOptions{
		PluginID: "setta-fixture-full",
		Config: map[string]any{
			"enabled": true,
			"label":   "configured",
		},
	}); err != nil {
		t.Fatalf("seed plugin config before runtime override: %v", err)
	}

	// The Go runtime keeps currentConfig typed as an object, but a runtime view can still omit a leaf.
	service := &runtimeOverridePluginMutationService{
		Service: baseService,
		mutateRuntime: func(response plugins.PluginRuntimeResponse) plugins.PluginRuntimeResponse {
			for index := range response.List.Plugins {
				if response.List.Plugins[index].PluginID != "setta-fixture-full" {
					continue
				}
				response.List.Plugins[index].Config.CurrentConfig = map[string]any{}
				response.List.Plugins[index].Config.CurrentConfigDigestSHA256 = nil
				return response
			}
			t.Fatalf("expected runtime override plugin entry, got %#v", response.List.Plugins)
			return response
		},
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call missing-leaf plugin get_ui_setting_value: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected structured missing-leaf plugin response, got %#v", result.StructuredContent)
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["value"] != false {
		t.Fatalf("expected schema default false for missing plugin config leaf, got %#v", payload["value"])
	}

	runtimeResponse, err := baseService.Runtime(plugins.RuntimeOptions{})
	if err != nil {
		t.Fatalf("plugin runtime after missing-leaf read: %v", err)
	}
	pluginEntry := mustFindPluginListEntry(t, runtimeResponse.List.Plugins, "setta-fixture-full")
	if pluginEntry.Config.CurrentConfig["enabled"] != true {
		t.Fatalf("expected persisted plugin config to remain enabled=true, got %#v", pluginEntry.Config.CurrentConfig)
	}
}

func TestServerUISettingToolsSchemaBackedSameValueWriteIsNoOpWithoutPersistingPluginState(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName:  "full",
			Version:      "0.1.0",
			StripBackend: true,
		},
	})
	if _, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	}); err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}

	pluginStatePath := filepath.Join(roots.settaFilesRoot, "plugins_state.json")
	beforeStateInfo, err := os.Stat(pluginStatePath)
	if err != nil {
		t.Fatalf("stat plugin state before same-value write: %v", err)
	}
	beforeStateBytes, err := os.ReadFile(pluginStatePath)
	if err != nil {
		t.Fatalf("read plugin state before same-value write: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
			"value":           false,
		},
	})
	if err != nil {
		t.Fatalf("call same-value set_ui_setting_value for schema-backed plugin setting: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected same-value schema-backed plugin write success, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	if setPayload["oldValue"] != false || setPayload["newValue"] != false || setPayload["changed"] != false {
		t.Fatalf("expected same-value schema-backed plugin write false -> false without change, got %#v", setPayload)
	}
	afterStateInfo, err := os.Stat(pluginStatePath)
	if err != nil {
		t.Fatalf("stat plugin state after same-value write: %v", err)
	}
	afterStateBytes, err := os.ReadFile(pluginStatePath)
	if err != nil {
		t.Fatalf("read plugin state after same-value write: %v", err)
	}
	if !beforeStateInfo.ModTime().Equal(afterStateInfo.ModTime()) {
		t.Fatalf("expected same-value schema-backed plugin write not to rewrite plugin state, before=%v after=%v", beforeStateInfo.ModTime(), afterStateInfo.ModTime())
	}
	if string(beforeStateBytes) != string(afterStateBytes) {
		t.Fatalf("expected same-value schema-backed plugin write to leave plugin state unchanged, before=%q after=%q", string(beforeStateBytes), string(afterStateBytes))
	}
}

func TestServerUISettingToolsRejectSchemaBackedPluginStalePreconditionWithoutClobberingNewerValue(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, baseService := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName:  "full",
			Version:      "0.1.0",
			StripBackend: true,
		},
	})
	if _, err := baseService.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	}); err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}

	service := &concurrentWritePluginMutationService{Service: baseService}
	service.beforeWriteConfig = func(ctx context.Context, _ plugins.ConfigWriteOptions) error {
		_, err := service.Service.WriteConfig(ctx, plugins.ConfigWriteOptions{
			PluginID: "setta-fixture-full",
			Config: map[string]any{
				"enabled": true,
				"label":   "updated-by-other-writer",
			},
		})
		return err
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
			"value":           false,
		},
	})
	if err != nil {
		t.Fatalf("call stale schema-backed set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected structured stale schema-backed plugin response, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	setError := mustStructuredMap(t, setPayload["error"])
	if setError["code"] != string(uisettings.ErrorCodeMutationFailed) {
		t.Fatalf("expected mutation_failed for stale schema-backed plugin write, got %#v", setError["code"])
	}
	message, ok := setError["message"].(string)
	if !ok || !strings.Contains(message, "changed since pre-write validation") {
		t.Fatalf("expected stale-precondition message, got %#v", setError["message"])
	}

	runtimeResponse, err := baseService.Runtime(plugins.RuntimeOptions{})
	if err != nil {
		t.Fatalf("plugin runtime after stale schema-backed write: %v", err)
	}
	pluginEntry := mustFindPluginListEntry(t, runtimeResponse.List.Plugins, "setta-fixture-full")
	if pluginEntry.Config.CurrentConfig["enabled"] != true {
		t.Fatalf("expected concurrent schema-backed plugin value to remain true, got %#v", pluginEntry.Config.CurrentConfig)
	}
	if pluginEntry.Config.CurrentConfig["label"] != "updated-by-other-writer" {
		t.Fatalf("expected concurrent schema-backed plugin label to remain updated-by-other-writer, got %#v", pluginEntry.Config.CurrentConfig)
	}
}

func TestServerUISettingToolsSupportBackendRegisteredPluginSettings(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName: "full",
			Version:     "0.1.0",
		},
	})
	installResult, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}
	writeScopedPluginBackendUISettingFixtureMainGo(t, installResult.SourcePath, false)
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan backend-registered plugin runtime: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	searchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "backend enabled",
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call backend-registered plugin search_ui_settings: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected backend-registered plugin search success, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
	searchResults := mustStructuredList(t, searchPayload["results"])
	if len(searchResults) == 0 {
		t.Fatal("expected backend-registered plugin search results")
	}
	firstResult := mustStructuredMap(t, searchResults[0])
	if firstResult["settingId"] != "plugin::setta-fixture-full::backend_enabled" {
		t.Fatalf("expected backend-registered plugin search result, got %#v", firstResult)
	}

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_enabled",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value for backend-registered plugin setting: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected backend-registered plugin get success, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	if getPayload["value"] != false {
		t.Fatalf("expected default backend-registered plugin value false, got %#v", getPayload["value"])
	}

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_enabled",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call set_ui_setting_value for backend-registered plugin setting: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected backend-registered plugin set success, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	if setPayload["oldValue"] != false || setPayload["newValue"] != true || setPayload["changed"] != true {
		t.Fatalf("expected backend-registered plugin write false -> true, got %#v", setPayload)
	}

	updatedGetResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_enabled",
		},
	})
	if err != nil {
		t.Fatalf("call updated get_ui_setting_value for backend-registered plugin setting: %v", err)
	}
	if updatedGetResult.IsError {
		t.Fatalf("expected updated backend-registered plugin get success, got %#v", updatedGetResult.StructuredContent)
	}
	updatedGetPayload := mustStructuredMap(t, updatedGetResult.StructuredContent)
	if updatedGetPayload["value"] != true {
		t.Fatalf("expected updated backend-registered plugin value true, got %#v", updatedGetPayload["value"])
	}
}

func TestServerUISettingToolsRejectBackendRegisteredPluginStaleExpectedOldValueWithoutWrite(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName: "full",
			Version:     "0.1.0",
		},
	})
	installResult, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}
	writeScopedPluginBackendUISettingFixtureMainGo(t, installResult.SourcePath, false)
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan backend-registered plugin runtime: %v", err)
	}

	backendStatePath := filepath.Join(installResult.SourcePath, "backend_ui_setting_state.json")
	if _, err := os.Stat(backendStatePath); !os.IsNotExist(err) {
		t.Fatalf("expected backend state file to be absent before stale write, got %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId":  "project-alpha",
			"settingId":        "plugin::setta-fixture-full::backend_enabled",
			"value":            true,
			"expectedOldValue": true,
		},
	})
	if err != nil {
		t.Fatalf("call stale backend-registered set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected structured stale backend-registered response, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	setError := mustStructuredMap(t, setPayload["error"])
	if setError["code"] != string(uisettings.ErrorCodeMutationFailed) {
		t.Fatalf("expected mutation_failed for stale backend-registered plugin write, got %#v", setError["code"])
	}
	message, ok := setError["message"].(string)
	if !ok || !strings.Contains(message, "changed since pre-write validation") {
		t.Fatalf("expected stale-precondition message, got %#v", setError["message"])
	}
	if _, err := os.Stat(backendStatePath); !os.IsNotExist(err) {
		t.Fatalf("expected stale backend-registered plugin write not to invoke backend write handler, got %v", err)
	}

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_enabled",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value after stale backend-registered write: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected backend-registered plugin get success after stale write, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	if getPayload["value"] != false {
		t.Fatalf("expected backend-registered plugin value to remain false after stale write, got %#v", getPayload["value"])
	}
}

func TestServerUISettingToolsBackendRegisteredReadTypeMismatchReturnsStructuredError(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName: "full",
			Version:     "0.1.0",
		},
	})
	installResult, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}
	writeScopedPluginBackendUISettingFixtureMainGo(t, installResult.SourcePath, false)
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan backend-registered plugin runtime: %v", err)
	}
	writeScopedPluginBackendUISettingFixtureState(t, installResult.SourcePath, "invalid-string")

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_enabled",
		},
	})
	if err != nil {
		t.Fatalf("call read-mismatch get_ui_setting_value for backend-registered plugin setting: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected structured read-mismatch response, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	getError := mustStructuredMap(t, getPayload["error"])
	if getError["code"] != string(uisettings.ErrorCodeInvalidValueType) {
		t.Fatalf("expected invalid_value_type for backend-registered read mismatch, got %#v", getError["code"])
	}
	message, ok := getError["message"].(string)
	if !ok || !strings.Contains(message, "returned an invalid value") {
		t.Fatalf("expected invalid-value read message, got %#v", getError["message"])
	}
}

func TestServerUISettingToolsRejectInvalidExistingValueBeforeBackendRegisteredWrite(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName: "full",
			Version:     "0.1.0",
		},
	})
	installResult, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}
	writeScopedPluginBackendUISettingFixtureMainGo(t, installResult.SourcePath, false)
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan backend-registered plugin runtime: %v", err)
	}
	writeScopedPluginBackendUISettingFixtureState(t, installResult.SourcePath, "invalid-before-write")

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_enabled",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call invalid-existing-value set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected structured invalid-existing-value response, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	setError := mustStructuredMap(t, setPayload["error"])
	if setError["code"] != string(uisettings.ErrorCodeInvalidValueType) {
		t.Fatalf("expected invalid_value_type for invalid existing backend value, got %#v", setError["code"])
	}
	message, ok := setError["message"].(string)
	if !ok || !strings.Contains(message, "pre-write oldValue read returned an invalid value") {
		t.Fatalf("expected invalid pre-write validation message, got %#v", setError["message"])
	}

	var state struct {
		Enabled any `json:"enabled"`
	}
	statePayload, err := os.ReadFile(filepath.Join(installResult.SourcePath, "backend_ui_setting_state.json"))
	if err != nil {
		t.Fatalf("read backend state after failed pre-write validation: %v", err)
	}
	if err := json.Unmarshal(statePayload, &state); err != nil {
		t.Fatalf("decode backend state after failed pre-write validation: %v", err)
	}
	if state.Enabled != "invalid-before-write" {
		t.Fatalf("expected invalid existing backend value to remain unchanged, got %#v", state.Enabled)
	}
}

func TestServerUISettingToolsBackendRegisteredSameValueWriteIsNoOpWithoutBackendWrite(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName: "full",
			Version:     "0.1.0",
		},
	})
	installResult, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}
	writeScopedPluginBackendUISettingFixtureMainGo(t, installResult.SourcePath, false)
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan backend-registered plugin runtime: %v", err)
	}

	backendStatePath := filepath.Join(installResult.SourcePath, "backend_ui_setting_state.json")
	if _, err := os.Stat(backendStatePath); !os.IsNotExist(err) {
		t.Fatalf("expected backend state file to be absent before same-value write, got %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_enabled",
			"value":           false,
		},
	})
	if err != nil {
		t.Fatalf("call same-value set_ui_setting_value for backend-registered plugin setting: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected same-value backend-registered plugin write success, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	if setPayload["oldValue"] != false || setPayload["newValue"] != false || setPayload["changed"] != false {
		t.Fatalf("expected same-value backend-registered plugin write false -> false without change, got %#v", setPayload)
	}
	if _, err := os.Stat(backendStatePath); !os.IsNotExist(err) {
		t.Fatalf("expected same-value backend-registered plugin write not to invoke backend write handler, got %v", err)
	}
}

func TestServerUISettingToolsRollbackInvalidPostWriteBackendRegisteredPluginValue(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName: "full",
			Version:     "0.1.0",
		},
	})
	installResult, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}
	writeScopedPluginBackendUISettingFixtureMainGo(t, installResult.SourcePath, true)
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan invalid-post-write backend-registered plugin runtime: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_enabled",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call invalid-post-write set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected structured invalid-post-write response, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	setError := mustStructuredMap(t, setPayload["error"])
	if setError["code"] != string(uisettings.ErrorCodeMutationFailed) {
		t.Fatalf("expected mutation_failed for invalid post-write backend value, got %#v", setError["code"])
	}
	message, ok := setError["message"].(string)
	if !ok || !strings.Contains(message, "Rollback restored the previous value.") {
		t.Fatalf("expected rollback-restored message, got %#v", setError["message"])
	}

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_enabled",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value after rollback: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected backend-registered plugin get success after rollback, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	if getPayload["value"] != false {
		t.Fatalf("expected backend-registered plugin value to roll back to false, got %#v", getPayload["value"])
	}
}

func TestServerUISettingToolsReportRollbackFailureForInvalidPostWriteBackendRegisteredPluginValue(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName: "full",
			Version:     "0.1.0",
		},
	})
	installResult, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}
	writeScopedPluginBackendUISettingFixtureMainGoWithBehavior(
		t,
		installResult.SourcePath,
		backendUISettingFixtureBehaviorRollbackWriteFailure,
	)
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan rollback-failure backend-registered plugin runtime: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_enabled",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call rollback-failure set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected structured rollback-failure response, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	setError := mustStructuredMap(t, setPayload["error"])
	if setError["code"] != string(uisettings.ErrorCodeMutationFailed) {
		t.Fatalf("expected mutation_failed for rollback-failure backend value, got %#v", setError["code"])
	}
	message, ok := setError["message"].(string)
	if !ok || !strings.Contains(message, "Rollback failed:") {
		t.Fatalf("expected rollback-failed message, got %#v", setError["message"])
	}

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_enabled",
		},
	})
	if err != nil {
		t.Fatalf("call get_ui_setting_value after rollback failure: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected structured backend-registered plugin get response after rollback failure, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	getError := mustStructuredMap(t, getPayload["error"])
	if getError["code"] != string(uisettings.ErrorCodeInvalidValueType) {
		t.Fatalf("expected invalid_value_type after rollback failure leaves invalid backend value, got %#v", getError["code"])
	}
}

func TestServerUISettingToolsReturnSettingNotFoundForUnknownSettingOnActivePlugin(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName:  "full",
			Version:      "0.1.0",
			StripBackend: true,
		},
	})
	if _, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	}); err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	searchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "full fixture enabled",
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call active plugin search_ui_settings: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected structured active-plugin search response, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
	searchResults := mustStructuredList(t, searchPayload["results"])
	foundEnabled := false
	for _, rawResult := range searchResults {
		resultMap := mustStructuredMap(t, rawResult)
		if resultMap["settingId"] == "plugin::setta-fixture-full::enabled" {
			foundEnabled = true
			break
		}
	}
	if !foundEnabled {
		t.Fatalf("expected active plugin setting in search results, got %#v", searchResults)
	}

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::missing",
		},
	})
	if err != nil {
		t.Fatalf("call unknown active plugin get_ui_setting_value: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected structured plugin missing-setting response, got %#v", result.StructuredContent)
	}
	payload := mustStructuredMap(t, result.StructuredContent)
	errorPayload := mustStructuredMap(t, payload["error"])
	if errorPayload["code"] != string(uisettings.ErrorCodeSettingNotFound) {
		t.Fatalf("expected setting_not_found for unknown active plugin setting, got %#v", errorPayload["code"])
	}
}

func TestServerUISettingToolsDisabledPluginRejectsReadWriteRevealAndHidesSearchResults(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName:  "full",
			Version:      "0.1.0",
			StripBackend: true,
		},
	})
	if _, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	}); err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}
	if _, err := service.Disable(context.Background(), plugins.EnableDisableOptions{
		PluginID: "setta-fixture-full",
	}); err != nil {
		t.Fatalf("disable full fixture plugin: %v", err)
	}
	revealService, err := uisettings.NewRevealService(uisettings.RevealServiceOptions{
		Transport: &stubUISettingRevealTransport{registry: realtime.NewRegistry(realtime.RegistryOptions{})},
		Results:   realtime.NewUISettingRevealResultHub(),
	})
	if err != nil {
		t.Fatalf("new reveal service: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:    roots.workspaceRoot,
		ProjectState:     projectRuntime,
		LSPDiagnostics:   openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations:  service,
		UISettingReveals: revealService,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	searchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "full fixture enabled",
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call disabled plugin search_ui_settings: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected structured disabled plugin search response, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
	searchResults := mustStructuredList(t, searchPayload["results"])
	for _, rawResult := range searchResults {
		resultMap := mustStructuredMap(t, rawResult)
		if resultMap["settingId"] == "plugin::setta-fixture-full::enabled" {
			t.Fatalf("expected disabled plugin setting to disappear from plugin search results, got %#v", searchResults)
		}
	}

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call disabled plugin get_ui_setting_value: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected structured disabled plugin get response, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	getError := mustStructuredMap(t, getPayload["error"])
	if getError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for disabled plugin get, got %#v", getError["code"])
	}

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
			"value":           false,
		},
	})
	if err != nil {
		t.Fatalf("call disabled plugin set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected structured disabled plugin set response, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	setError := mustStructuredMap(t, setPayload["error"])
	if setError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for disabled plugin set, got %#v", setError["code"])
	}

	revealResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call disabled plugin reveal_ui_setting: %v", err)
	}
	if revealResult.IsError {
		t.Fatalf("expected structured disabled plugin reveal response, got %#v", revealResult.StructuredContent)
	}
	revealPayload := mustStructuredMap(t, revealResult.StructuredContent)
	if got := mustStructuredInteger(t, revealPayload["emittedRevealCount"]); got != 0 {
		t.Fatalf("expected emittedRevealCount=0 for disabled plugin reveal, got %d", got)
	}
	statuses := mustStructuredList(t, revealPayload["statuses"])
	if len(statuses) != 1 {
		t.Fatalf("expected one disabled plugin reveal status, got %#v", statuses)
	}
	status := mustStructuredMap(t, statuses[0])
	if status["status"] != "failed" {
		t.Fatalf("expected failed disabled plugin reveal status, got %#v", status["status"])
	}
	revealError := mustStructuredMap(t, status["error"])
	if revealError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for disabled plugin reveal, got %#v", revealError["code"])
	}
}

func TestServerUISettingToolsKeepPendingRestartPluginSettingsAvailable(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName: "full",
			Version:     "0.1.0",
		},
	})
	installResult, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}
	if installResult.State != plugins.PluginRuntimeStatePendingRestart || !installResult.RestartRequired {
		t.Fatalf("expected pending-restart install result, got %#v", installResult)
	}

	runtimeResponse, err := service.Runtime(plugins.RuntimeOptions{})
	if err != nil {
		t.Fatalf("load plugin runtime after pending-restart install: %v", err)
	}
	mustFindPluginListEntry(t, runtimeResponse.List.Plugins, "setta-fixture-full")
	mustFindPluginStatusEntry(t, runtimeResponse.Status.Plugins, "setta-fixture-full", plugins.PluginRuntimeStatePendingRestart)

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	searchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "full fixture enabled",
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call pending-restart plugin search_ui_settings: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected pending-restart plugin search success, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
	searchResults := mustStructuredList(t, searchPayload["results"])
	foundEnabled := false
	for _, rawResult := range searchResults {
		resultMap := mustStructuredMap(t, rawResult)
		if resultMap["settingId"] == "plugin::setta-fixture-full::enabled" {
			foundEnabled = true
			break
		}
	}
	if !foundEnabled {
		t.Fatalf("expected pending-restart plugin setting in search results, got %#v", searchResults)
	}

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::label",
		},
	})
	if err != nil {
		t.Fatalf("call pending-restart plugin get_ui_setting_value: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected pending-restart plugin get success, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	if getPayload["value"] != "unset" {
		t.Fatalf("expected default pending-restart plugin label value, got %#v", getPayload["value"])
	}

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call pending-restart plugin set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected pending-restart plugin set success, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	if setPayload["oldValue"] != false || setPayload["newValue"] != true || setPayload["changed"] != true {
		t.Fatalf("expected pending-restart plugin write false -> true, got %#v", setPayload)
	}
}

func TestServerUISettingToolsKeepShadowedPluginSettingsAvailableThroughEffectiveEntry(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
		"pypi:setta-fixture-full==0.1.0": {
			FixtureName:  "full",
			Version:      "0.1.0",
			StripBackend: true,
		},
	})
	if _, err := service.Install(context.Background(), plugins.InstallOptions{
		SourceSpec: "pypi:setta-fixture-full==0.1.0",
		Enable:     true,
	}); err != nil {
		t.Fatalf("install full fixture plugin: %v", err)
	}

	globalRoot := filepath.Join(roots.settaHome, "plugins", "setta-fixture-full")
	sourceRoot := filepath.Join(pluginFixtureRepoRoot(t), "tests", "fixtures", "plugins", "full")
	if err := copyPluginFixtureDir(sourceRoot, globalRoot); err != nil {
		t.Fatalf("copy shadowed full fixture plugin: %v", err)
	}
	if err := rewritePluginManifest(globalRoot, func(payload map[string]any) {
		payload["version"] = "0.0.9"
		delete(payload, "backend")
	}); err != nil {
		t.Fatalf("rewrite shadowed full fixture plugin manifest: %v", err)
	}
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan plugin runtime after adding shadowed plugin: %v", err)
	}

	status, err := service.Status()
	if err != nil {
		t.Fatalf("load plugin status after adding shadowed plugin: %v", err)
	}
	mustFindPluginStatusEntry(t, status.Plugins, "setta-fixture-full", plugins.PluginRuntimeStateActive)
	shadowed := mustFindPluginStatusEntry(t, status.Plugins, "setta-fixture-full", plugins.PluginRuntimeStateShadowed)
	workspacePluginRoot := filepath.Join(roots.workspaceRoot, ".setta_plugins", "setta-fixture-full")
	if shadowed.ShadowedBySourcePath == nil || *shadowed.ShadowedBySourcePath != workspacePluginRoot {
		t.Fatalf("expected shadowed plugin path %q, got %#v", workspacePluginRoot, shadowed.ShadowedBySourcePath)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	searchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "full fixture label",
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call shadowed plugin search_ui_settings: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected shadowed plugin search success, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
	searchResults := mustStructuredList(t, searchPayload["results"])
	foundLabel := false
	for _, rawResult := range searchResults {
		resultMap := mustStructuredMap(t, rawResult)
		if resultMap["settingId"] == "plugin::setta-fixture-full::label" {
			foundLabel = true
			break
		}
	}
	if !foundLabel {
		t.Fatalf("expected shadowed plugin setting in search results, got %#v", searchResults)
	}

	getResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::label",
		},
	})
	if err != nil {
		t.Fatalf("call shadowed plugin get_ui_setting_value: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected shadowed plugin get success, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	if getPayload["value"] != "unset" {
		t.Fatalf("expected default shadowed plugin label value, got %#v", getPayload["value"])
	}

	setResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call shadowed plugin set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected shadowed plugin set success, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	if setPayload["oldValue"] != false || setPayload["newValue"] != true || setPayload["changed"] != true {
		t.Fatalf("expected shadowed plugin write false -> true, got %#v", setPayload)
	}
}
