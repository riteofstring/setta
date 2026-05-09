package mcpx

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/plugins"
	"setta/internal/realtime"
	"setta/internal/uisettings"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

func TestServerUISettingToolsSkipDuplicatePluginSettingIDsAndKeepUnknownSettingDistinct(t *testing.T) {
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

	schemaPath := filepath.Join(
		roots.workspaceRoot,
		".setta_plugins",
		"setta-fixture-full",
		"content",
		"config",
		"schema.json",
	)
	schemaPayload, err := os.ReadFile(schemaPath)
	if err != nil {
		t.Fatalf("read plugin schema: %v", err)
	}
	var schema map[string]any
	if err := json.Unmarshal(schemaPayload, &schema); err != nil {
		t.Fatalf("decode plugin schema: %v", err)
	}
	rawEntries, ok := schema["x-setta-ui-settings"].([]any)
	if !ok || len(rawEntries) == 0 {
		t.Fatalf("expected x-setta-ui-settings entries, got %#v", schema["x-setta-ui-settings"])
	}
	firstEntry, ok := rawEntries[0].(map[string]any)
	if !ok {
		t.Fatalf("expected first ui setting entry to be an object, got %#v", rawEntries[0])
	}
	duplicateEntry := make(map[string]any, len(firstEntry))
	for key, value := range firstEntry {
		duplicateEntry[key] = value
	}
	schema["x-setta-ui-settings"] = append(rawEntries, duplicateEntry)
	encodedSchema, err := json.MarshalIndent(schema, "", "  ")
	if err != nil {
		t.Fatalf("encode plugin schema: %v", err)
	}
	encodedSchema = append(encodedSchema, '\n')
	if err := os.WriteFile(schemaPath, encodedSchema, 0o644); err != nil {
		t.Fatalf("write plugin schema: %v", err)
	}
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan plugin runtime after duplicate setting injection: %v", err)
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
		t.Fatalf("call duplicate-setting search_ui_settings: %v", err)
	}
	if searchResult.IsError {
		t.Fatalf("expected duplicate-setting search_ui_settings success, got %#v", searchResult.StructuredContent)
	}
	searchPayload := mustStructuredMap(t, searchResult.StructuredContent)
	searchResults := mustStructuredList(t, searchPayload["results"])
	searchResultIDs := make([]string, 0, len(searchResults))
	for _, rawResult := range searchResults {
		searchResultIDs = append(searchResultIDs, mustStructuredMap(t, rawResult)["settingId"].(string))
	}
	for _, settingID := range searchResultIDs {
		if settingID == "plugin::setta-fixture-full::enabled" {
			t.Fatalf("expected duplicated setting id to be omitted from search results, got %#v", searchResultIDs)
		}
	}
	foundLabel := false
	for _, settingID := range searchResultIDs {
		if settingID == "plugin::setta-fixture-full::label" {
			foundLabel = true
			break
		}
	}
	if !foundLabel {
		t.Fatalf("expected healthy plugin setting to remain searchable, got %#v", searchResultIDs)
	}

	knownInvalidResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call duplicated plugin setting get_ui_setting_value: %v", err)
	}
	if knownInvalidResult.IsError {
		t.Fatalf("expected structured duplicated-setting response, got %#v", knownInvalidResult.StructuredContent)
	}
	knownInvalidPayload := mustStructuredMap(t, knownInvalidResult.StructuredContent)
	knownInvalidError := mustStructuredMap(t, knownInvalidPayload["error"])
	if knownInvalidError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for duplicated plugin setting, got %#v", knownInvalidError["code"])
	}

	unknownResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::unknown_setting",
		},
	})
	if err != nil {
		t.Fatalf("call unknown plugin setting get_ui_setting_value: %v", err)
	}
	if unknownResult.IsError {
		t.Fatalf("expected structured unknown-setting response, got %#v", unknownResult.StructuredContent)
	}
	unknownPayload := mustStructuredMap(t, unknownResult.StructuredContent)
	unknownError := mustStructuredMap(t, unknownPayload["error"])
	if unknownError["code"] != string(uisettings.ErrorCodeSettingNotFound) {
		t.Fatalf("expected setting_not_found for unknown plugin setting, got %#v", unknownError["code"])
	}
}

func TestServerUISettingToolsReturnPluginUnavailableForSchemaInvalidSettingAndKeepHealthySibling(t *testing.T) {
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

	schemaPath := filepath.Join(
		roots.workspaceRoot,
		".setta_plugins",
		"setta-fixture-full",
		"content",
		"config",
		"schema.json",
	)
	schemaPayload, err := os.ReadFile(schemaPath)
	if err != nil {
		t.Fatalf("read plugin schema: %v", err)
	}
	var schema map[string]any
	if err := json.Unmarshal(schemaPayload, &schema); err != nil {
		t.Fatalf("decode plugin schema: %v", err)
	}
	rawEntries, ok := schema["x-setta-ui-settings"].([]any)
	if !ok || len(rawEntries) == 0 {
		t.Fatalf("expected x-setta-ui-settings entries, got %#v", schema["x-setta-ui-settings"])
	}
	firstEntry, ok := rawEntries[0].(map[string]any)
	if !ok {
		t.Fatalf("expected first ui setting entry to be an object, got %#v", rawEntries[0])
	}
	firstEntry["defaultValue"] = "not-a-boolean-default"
	encodedSchema, err := json.MarshalIndent(schema, "", "  ")
	if err != nil {
		t.Fatalf("encode plugin schema: %v", err)
	}
	encodedSchema = append(encodedSchema, '\n')
	if err := os.WriteFile(schemaPath, encodedSchema, 0o644); err != nil {
		t.Fatalf("write plugin schema: %v", err)
	}
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan plugin runtime after invalid default injection: %v", err)
	}

	_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
		PluginMutations: service,
	})
	defer clientSession.Close()

	setUISettingAgenticContext(t, clientSession, "project-alpha", "chat-1", "chat-section", true)

	coreSearchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "project name",
			"sourceFilter":    "core",
		},
	})
	if err != nil {
		t.Fatalf("call core search_ui_settings with schema-invalid plugin setting: %v", err)
	}
	if coreSearchResult.IsError {
		t.Fatalf("expected core search_ui_settings success with schema-invalid plugin setting, got %#v", coreSearchResult.StructuredContent)
	}
	coreSearchPayload := mustStructuredMap(t, coreSearchResult.StructuredContent)
	coreSearchResults := mustStructuredList(t, coreSearchPayload["results"])
	foundCoreProjectName := false
	for _, rawResult := range coreSearchResults {
		resultMap := mustStructuredMap(t, rawResult)
		if resultMap["settingId"] == "core.project.name" {
			foundCoreProjectName = true
			break
		}
	}
	if !foundCoreProjectName {
		t.Fatalf("expected core.project.name to remain searchable, got %#v", coreSearchResults)
	}

	pluginSearchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "full fixture enabled",
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call plugin search_ui_settings with schema-invalid plugin setting: %v", err)
	}
	if pluginSearchResult.IsError {
		t.Fatalf("expected plugin search_ui_settings success with schema-invalid plugin setting, got %#v", pluginSearchResult.StructuredContent)
	}
	pluginSearchPayload := mustStructuredMap(t, pluginSearchResult.StructuredContent)
	pluginSearchResults := mustStructuredList(t, pluginSearchPayload["results"])
	for _, rawResult := range pluginSearchResults {
		resultMap := mustStructuredMap(t, rawResult)
		if resultMap["settingId"] == "plugin::setta-fixture-full::enabled" {
			t.Fatalf("expected schema-invalid plugin setting to be omitted from search results, got %#v", pluginSearchResults)
		}
	}

	healthySearchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "full label",
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call healthy plugin search_ui_settings with schema-invalid sibling: %v", err)
	}
	if healthySearchResult.IsError {
		t.Fatalf("expected healthy plugin search_ui_settings success, got %#v", healthySearchResult.StructuredContent)
	}
	healthySearchPayload := mustStructuredMap(t, healthySearchResult.StructuredContent)
	healthySearchResults := mustStructuredList(t, healthySearchPayload["results"])
	foundHealthyLabel := false
	for _, rawResult := range healthySearchResults {
		resultMap := mustStructuredMap(t, rawResult)
		if resultMap["settingId"] == "plugin::setta-fixture-full::label" {
			foundHealthyLabel = true
			break
		}
	}
	if !foundHealthyLabel {
		t.Fatalf("expected healthy sibling plugin setting to remain searchable, got %#v", healthySearchResults)
	}

	invalidResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call schema-invalid plugin setting get_ui_setting_value: %v", err)
	}
	if invalidResult.IsError {
		t.Fatalf("expected structured schema-invalid response, got %#v", invalidResult.StructuredContent)
	}
	invalidPayload := mustStructuredMap(t, invalidResult.StructuredContent)
	invalidError := mustStructuredMap(t, invalidPayload["error"])
	if invalidError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for schema-invalid plugin setting, got %#v", invalidError["code"])
	}
	message, ok := invalidError["message"].(string)
	if !ok || !strings.Contains(message, "defaultValue is invalid") {
		t.Fatalf("expected invalid defaultValue message, got %#v", invalidError["message"])
	}

	healthyResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::label",
		},
	})
	if err != nil {
		t.Fatalf("call healthy sibling plugin get_ui_setting_value: %v", err)
	}
	if healthyResult.IsError {
		t.Fatalf("expected healthy sibling plugin setting success, got %#v", healthyResult.StructuredContent)
	}
	healthyPayload := mustStructuredMap(t, healthyResult.StructuredContent)
	if healthyPayload["value"] != "unset" {
		t.Fatalf("expected healthy sibling plugin setting to remain readable, got %#v", healthyPayload["value"])
	}
}

func TestServerUISettingToolsReturnPluginUnavailableForBackendRegisteredSettingWithInvalidValueSchemaAndKeepHealthySibling(t *testing.T) {
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
	writeScopedPluginBackendUISettingInvalidSchemaFixtureMainGo(t, installResult.SourcePath)
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan backend-registered plugin runtime after invalid valueSchema injection: %v", err)
	}

	runtimeResponse, err := service.Runtime(plugins.RuntimeOptions{})
	if err != nil {
		t.Fatalf("runtime after invalid backend ui setting schema injection: %v", err)
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

	invalidSearchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "backend enabled",
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call invalid backend-registered plugin search_ui_settings: %v", err)
	}
	if invalidSearchResult.IsError {
		t.Fatalf("expected invalid backend-registered plugin search success, got %#v", invalidSearchResult.StructuredContent)
	}
	invalidSearchPayload := mustStructuredMap(t, invalidSearchResult.StructuredContent)
	invalidSearchResults := mustStructuredList(t, invalidSearchPayload["results"])
	for _, rawResult := range invalidSearchResults {
		resultMap := mustStructuredMap(t, rawResult)
		if resultMap["settingId"] == "plugin::setta-fixture-full::backend_enabled" {
			t.Fatalf("expected invalid backend-registered plugin setting to be omitted from search results, got %#v", invalidSearchResults)
		}
	}

	healthySearchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "backend label",
			"sourceFilter":    "plugin",
		},
	})
	if err != nil {
		t.Fatalf("call healthy backend-registered plugin search_ui_settings: %v", err)
	}
	if healthySearchResult.IsError {
		t.Fatalf("expected healthy backend-registered plugin search success, got %#v", healthySearchResult.StructuredContent)
	}
	healthySearchPayload := mustStructuredMap(t, healthySearchResult.StructuredContent)
	healthySearchResults := mustStructuredList(t, healthySearchPayload["results"])
	foundHealthyLabel := false
	for _, rawResult := range healthySearchResults {
		resultMap := mustStructuredMap(t, rawResult)
		if resultMap["settingId"] == "plugin::setta-fixture-full::backend_label" {
			foundHealthyLabel = true
			break
		}
	}
	if !foundHealthyLabel {
		t.Fatalf("expected healthy backend-registered plugin setting to remain searchable, got %#v", healthySearchResults)
	}

	invalidResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_enabled",
		},
	})
	if err != nil {
		t.Fatalf("call invalid backend-registered plugin get_ui_setting_value: %v", err)
	}
	if invalidResult.IsError {
		t.Fatalf("expected structured invalid backend-registered response, got %#v", invalidResult.StructuredContent)
	}
	invalidPayload := mustStructuredMap(t, invalidResult.StructuredContent)
	invalidError := mustStructuredMap(t, invalidPayload["error"])
	if invalidError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for invalid backend-registered plugin setting, got %#v", invalidError["code"])
	}
	message, ok := invalidError["message"].(string)
	if !ok || !strings.Contains(message, "valueSchema type is invalid") {
		t.Fatalf("expected invalid valueSchema message, got %#v", invalidError["message"])
	}

	healthyResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::backend_label",
		},
	})
	if err != nil {
		t.Fatalf("call healthy backend-registered plugin get_ui_setting_value: %v", err)
	}
	if healthyResult.IsError {
		t.Fatalf("expected healthy backend-registered plugin get success, got %#v", healthyResult.StructuredContent)
	}
	healthyPayload := mustStructuredMap(t, healthyResult.StructuredContent)
	if healthyPayload["value"] != "unset" {
		t.Fatalf("expected healthy backend-registered plugin setting to remain readable, got %#v", healthyPayload["value"])
	}
}

func TestServerUISettingToolsIsolateCrossSourceDuplicatePluginSettingIDs(t *testing.T) {
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
	writeScopedPluginBackendUISettingFixtureMainGoForLocalSetting(t, installResult.SourcePath, "enabled", false)
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan plugin runtime after cross-source duplicate injection: %v", err)
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

	coreSearchResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "search_ui_settings",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"query":           "project name",
			"sourceFilter":    "core",
		},
	})
	if err != nil {
		t.Fatalf("call core search_ui_settings with cross-source duplicate plugin setting: %v", err)
	}
	if coreSearchResult.IsError {
		t.Fatalf("expected core search_ui_settings success with cross-source duplicate plugin setting, got %#v", coreSearchResult.StructuredContent)
	}
	coreSearchPayload := mustStructuredMap(t, coreSearchResult.StructuredContent)
	coreSearchResults := mustStructuredList(t, coreSearchPayload["results"])
	foundCoreProjectName := false
	for _, rawResult := range coreSearchResults {
		resultMap := mustStructuredMap(t, rawResult)
		if resultMap["settingId"] == "core.project.name" {
			foundCoreProjectName = true
			break
		}
	}
	if !foundCoreProjectName {
		t.Fatalf("expected core.project.name to remain searchable, got %#v", coreSearchResults)
	}

	healthyGetResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::label",
		},
	})
	if err != nil {
		t.Fatalf("call healthy sibling get_ui_setting_value with cross-source duplicate: %v", err)
	}
	if healthyGetResult.IsError {
		t.Fatalf("expected healthy sibling get_ui_setting_value success, got %#v", healthyGetResult.StructuredContent)
	}
	healthyGetPayload := mustStructuredMap(t, healthyGetResult.StructuredContent)
	if _, ok := healthyGetPayload["value"].(string); !ok {
		t.Fatalf("expected healthy sibling plugin setting value to remain string, got %#v", healthyGetPayload["value"])
	}

	conflictingGetResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "get_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call conflicting get_ui_setting_value: %v", err)
	}
	if conflictingGetResult.IsError {
		t.Fatalf("expected structured conflicting get response, got %#v", conflictingGetResult.StructuredContent)
	}
	conflictingGetPayload := mustStructuredMap(t, conflictingGetResult.StructuredContent)
	conflictingGetError := mustStructuredMap(t, conflictingGetPayload["error"])
	if conflictingGetError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for cross-source duplicate get, got %#v", conflictingGetError["code"])
	}
	getMessage, ok := conflictingGetError["message"].(string)
	if !ok || !strings.Contains(getMessage, "declared in both schema and backend registration") {
		t.Fatalf("expected cross-source duplicate get message, got %#v", conflictingGetError["message"])
	}

	conflictingSetResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_ui_setting_value",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
			"value":           true,
		},
	})
	if err != nil {
		t.Fatalf("call conflicting set_ui_setting_value: %v", err)
	}
	if conflictingSetResult.IsError {
		t.Fatalf("expected structured conflicting set response, got %#v", conflictingSetResult.StructuredContent)
	}
	conflictingSetPayload := mustStructuredMap(t, conflictingSetResult.StructuredContent)
	conflictingSetError := mustStructuredMap(t, conflictingSetPayload["error"])
	if conflictingSetError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for cross-source duplicate set, got %#v", conflictingSetError["code"])
	}

	conflictingRevealResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "reveal_ui_setting",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"settingId":       "plugin::setta-fixture-full::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call conflicting reveal_ui_setting: %v", err)
	}
	if conflictingRevealResult.IsError {
		t.Fatalf("expected structured conflicting reveal response, got %#v", conflictingRevealResult.StructuredContent)
	}
	conflictingRevealPayload := mustStructuredMap(t, conflictingRevealResult.StructuredContent)
	if got := mustStructuredInteger(t, conflictingRevealPayload["emittedRevealCount"]); got != 0 {
		t.Fatalf("expected emittedRevealCount=0 for cross-source duplicate reveal, got %d", got)
	}
	conflictingRevealStatuses := mustStructuredList(t, conflictingRevealPayload["statuses"])
	if len(conflictingRevealStatuses) != 1 {
		t.Fatalf("expected one cross-source duplicate reveal status, got %#v", conflictingRevealStatuses)
	}
	conflictingRevealStatus := mustStructuredMap(t, conflictingRevealStatuses[0])
	if conflictingRevealStatus["status"] != "failed" {
		t.Fatalf("expected failed cross-source duplicate reveal status, got %#v", conflictingRevealStatus["status"])
	}
	conflictingRevealError := mustStructuredMap(t, conflictingRevealStatus["error"])
	if conflictingRevealError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for cross-source duplicate reveal, got %#v", conflictingRevealError["code"])
	}
}

func TestServerUISettingToolsRejectPersistedCorruptPluginConfigRootWithoutRewrite(t *testing.T) {
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

	pluginsStatePath := filepath.Join(roots.settaFilesRoot, "plugins_state.json")
	pluginsStatePayload, err := os.ReadFile(pluginsStatePath)
	if err != nil {
		t.Fatalf("read plugins state: %v", err)
	}
	var pluginsState map[string]any
	if err := json.Unmarshal(pluginsStatePayload, &pluginsState); err != nil {
		t.Fatalf("decode plugins state: %v", err)
	}
	pluginsState["pluginConfigById"] = map[string]any{
		string(plugins.PluginScopeWorkspace) + ":setta-fixture-full": "invalid-root",
	}
	encodedState, err := json.MarshalIndent(pluginsState, "", "  ")
	if err != nil {
		t.Fatalf("encode plugins state: %v", err)
	}
	encodedState = append(encodedState, '\n')
	if err := os.WriteFile(pluginsStatePath, encodedState, 0o644); err != nil {
		t.Fatalf("write corrupt plugins state: %v", err)
	}
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan plugin runtime after corrupt config root injection: %v", err)
	}

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
			"settingId":       "plugin::setta-fixture-full::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call corrupt-root plugin get_ui_setting_value: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected structured corrupt-root get response, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	getError := mustStructuredMap(t, getPayload["error"])
	if getError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for corrupt-root get, got %#v", getError["code"])
	}
	if getError["message"] != "Plugin setta-fixture-full is unavailable (state=invalid)." {
		t.Fatalf("expected invalid-state message for corrupt-root get, got %#v", getError["message"])
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
		t.Fatalf("call corrupt-root plugin set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected structured corrupt-root set response, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	setError := mustStructuredMap(t, setPayload["error"])
	if setError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for corrupt-root set, got %#v", setError["code"])
	}
	if setError["message"] != getError["message"] {
		t.Fatalf("expected corrupt-root get/set to share the same error, got get=%#v set=%#v", getError, setError)
	}

	persistedStatePayload, err := os.ReadFile(pluginsStatePath)
	if err != nil {
		t.Fatalf("read plugins state after failed write: %v", err)
	}
	var persistedState map[string]any
	if err := json.Unmarshal(persistedStatePayload, &persistedState); err != nil {
		t.Fatalf("decode plugins state after failed write: %v", err)
	}
	pluginConfigByID, ok := persistedState["pluginConfigById"].(map[string]any)
	if !ok {
		t.Fatalf("expected pluginConfigById object after failed write, got %#v", persistedState["pluginConfigById"])
	}
	if pluginConfigByID[string(plugins.PluginScopeWorkspace)+":setta-fixture-full"] != "invalid-root" {
		t.Fatalf("expected corrupt persisted root to remain unchanged, got %#v", pluginConfigByID)
	}
}

func TestServerUISettingToolsReturnPluginUnavailableForReadWriteWhenRegisterPaneCapabilityNotEffective(t *testing.T) {
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

	manifestPath := filepath.Join(
		roots.workspaceRoot,
		".setta_plugins",
		"setta-fixture-full",
		"setta.plugin.json",
	)
	manifestPayload, err := os.ReadFile(manifestPath)
	if err != nil {
		t.Fatalf("read plugin manifest: %v", err)
	}
	var manifest map[string]any
	if err := json.Unmarshal(manifestPayload, &manifest); err != nil {
		t.Fatalf("decode plugin manifest: %v", err)
	}
	manifest["capabilities"] = []any{"registerSectionKinds", "registerCommand"}
	encodedManifest, err := json.MarshalIndent(manifest, "", "  ")
	if err != nil {
		t.Fatalf("encode plugin manifest: %v", err)
	}
	encodedManifest = append(encodedManifest, '\n')
	if err := os.WriteFile(manifestPath, encodedManifest, 0o644); err != nil {
		t.Fatalf("write plugin manifest: %v", err)
	}
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan plugin runtime after capability edit: %v", err)
	}

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
			"settingId":       "plugin::setta-fixture-full::enabled",
		},
	})
	if err != nil {
		t.Fatalf("call capability-gated get_ui_setting_value: %v", err)
	}
	if getResult.IsError {
		t.Fatalf("expected structured capability-gated read response, got %#v", getResult.StructuredContent)
	}
	getPayload := mustStructuredMap(t, getResult.StructuredContent)
	getError := mustStructuredMap(t, getPayload["error"])
	if getError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for capability-gated read, got %#v", getError["code"])
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
		t.Fatalf("call capability-gated set_ui_setting_value: %v", err)
	}
	if setResult.IsError {
		t.Fatalf("expected structured capability-gated write response, got %#v", setResult.StructuredContent)
	}
	setPayload := mustStructuredMap(t, setResult.StructuredContent)
	setError := mustStructuredMap(t, setPayload["error"])
	if setError["code"] != string(uisettings.ErrorCodePluginUnavailable) {
		t.Fatalf("expected plugin_unavailable for capability-gated write, got %#v", setError["code"])
	}
}

func mustFindPluginListEntry(t *testing.T, entries []plugins.PluginListEntry, pluginID string) plugins.PluginListEntry {
	t.Helper()

	for _, entry := range entries {
		if entry.PluginID == pluginID {
			return entry
		}
	}
	t.Fatalf("expected plugin list entry for %s, got %#v", pluginID, entries)
	return plugins.PluginListEntry{}
}

func mustFindPluginStatusEntry(
	t *testing.T,
	entries []plugins.PluginStatusEntry,
	pluginID string,
	state plugins.PluginRuntimeState,
) plugins.PluginStatusEntry {
	t.Helper()

	for _, entry := range entries {
		if entry.PluginID == pluginID && entry.State == state {
			return entry
		}
	}
	t.Fatalf("expected plugin status entry for %s in state %s, got %#v", pluginID, state, entries)
	return plugins.PluginStatusEntry{}
}

func testStringPointer(value string) *string {
	return &value
}

type backendUISettingFixtureBehavior string

const (
	backendUISettingFixtureBehaviorNormal               backendUISettingFixtureBehavior = "normal"
	backendUISettingFixtureBehaviorInvalidPostWrite     backendUISettingFixtureBehavior = "invalid_post_write"
	backendUISettingFixtureBehaviorRollbackWriteFailure backendUISettingFixtureBehavior = "rollback_write_failure"
)

func writeScopedPluginBackendUISettingFixtureMainGo(t *testing.T, pluginRoot string, invalidPostWrite bool) {
	behavior := backendUISettingFixtureBehaviorNormal
	if invalidPostWrite {
		behavior = backendUISettingFixtureBehaviorInvalidPostWrite
	}
	writeScopedPluginBackendUISettingFixtureMainGoForLocalSettingWithBehavior(
		t,
		pluginRoot,
		"backend_enabled",
		behavior,
	)
}

func writeScopedPluginBackendUISettingFixtureMainGoWithBehavior(t *testing.T, pluginRoot string, behavior backendUISettingFixtureBehavior) {
	writeScopedPluginBackendUISettingFixtureMainGoForLocalSettingWithBehavior(
		t,
		pluginRoot,
		"backend_enabled",
		behavior,
	)
}

func writeScopedPluginBackendUISettingFixtureMainGoForLocalSetting(t *testing.T, pluginRoot string, localSettingID string, invalidPostWrite bool) {
	behavior := backendUISettingFixtureBehaviorNormal
	if invalidPostWrite {
		behavior = backendUISettingFixtureBehaviorInvalidPostWrite
	}
	writeScopedPluginBackendUISettingFixtureMainGoForLocalSettingWithBehavior(
		t,
		pluginRoot,
		localSettingID,
		behavior,
	)
}

func writeScopedPluginBackendUISettingFixtureMainGoForLocalSettingWithBehavior(
	t *testing.T,
	pluginRoot string,
	localSettingID string,
	behavior backendUISettingFixtureBehavior,
) {
	t.Helper()

	if err := rewritePluginManifest(pluginRoot, func(payload map[string]any) {
		rawCapabilities, _ := payload["capabilities"].([]any)
		for _, rawCapability := range rawCapabilities {
			if rawCapability == "registerUISettings" {
				return
			}
		}
		payload["capabilities"] = append(rawCapabilities, "registerUISettings")
	}); err != nil {
		t.Fatalf("enable backend ui setting fixture capability: %v", err)
	}

	assignment := "state.Enabled = value"
	switch behavior {
	case backendUISettingFixtureBehaviorNormal:
	case backendUISettingFixtureBehaviorInvalidPostWrite:
		assignment = "if value {\n\t\tstate.Enabled = \"invalid-value\"\n\t} else {\n\t\tstate.Enabled = value\n\t}"
	case backendUISettingFixtureBehaviorRollbackWriteFailure:
		assignment = "if value {\n\t\tstate.Enabled = \"invalid-value\"\n\t} else {\n\t\tfail(\"rollback write failed\")\n\t}"
	default:
		t.Fatalf("unsupported backend ui setting fixture behavior %q", behavior)
	}

	source := fmt.Sprintf(`package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	backendProbeArg = "--setta-plugin-backend-probe"
	backendRuntimeArg = "--setta-plugin-backend-runtime"
)

type runtimeRequest struct {
	SchemaVersion int               `+"`json:\"schemaVersion\"`"+`
	Kind          string            `+"`json:\"kind\"`"+`
	UISetting     *uiSettingRequest `+"`json:\"uiSetting,omitempty\"`"+`
}

type backendRequestContext struct {
	ServerMode      string `+"`json:\"serverMode\"`"+`
	HasAuth         bool   `+"`json:\"hasAuth\"`"+`
	SessionID       string `+"`json:\"sessionId,omitempty\"`"+`
	ShareSessionID  string `+"`json:\"shareSessionId,omitempty\"`"+`
	ProjectConfigID string `+"`json:\"projectConfigId,omitempty\"`"+`
	WorkspaceRoot   string `+"`json:\"workspaceRoot,omitempty\"`"+`
	SettaFilesRoot  string `+"`json:\"settaFilesRoot,omitempty\"`"+`
	RuntimeRoot     string `+"`json:\"runtimeRoot,omitempty\"`"+`
}

type uiSettingRequest struct {
	Context         backendRequestContext `+"`json:\"context\"`"+`
	HandlerID       string                `+"`json:\"handlerId\"`"+`
	Operation       string                `+"`json:\"operation\"`"+`
	ProjectConfigID string                `+"`json:\"projectConfigId\"`"+`
	Value           any                   `+"`json:\"value,omitempty\"`"+`
}

type runtimeResponse struct {
	SchemaVersion int            `+"`json:\"schemaVersion\"`"+`
	UISetting     map[string]any `+"`json:\"uiSetting,omitempty\"`"+`
}

type stateFile struct {
	Enabled any `+"`json:\"enabled\"`"+`
}

func main() {
	if len(os.Args) != 2 {
		return
	}
	switch os.Args[1] {
	case backendProbeArg:
		writeJSON(map[string]any{
			"schemaVersion": 1,
			"uiSettings": []map[string]any{
				{
					"id":             %q,
					"title":          "Backend Enabled",
					"description":    "Enable backend-provided fixture behavior.",
					"paneId":         "full-settings-pane",
					"revealKey":      "full-settings",
					"synonyms":       []string{"backend enabled"},
					"mutability":     "writable",
					"valueSchema":    map[string]any{"type": "boolean"},
					"readHandlerId":  "read-backend-enabled",
					"writeHandlerId": "write-backend-enabled",
				},
			},
			"routes":            []map[string]any{},
			"staticDirs":        []map[string]any{},
			"listenerEndpoints": []map[string]any{},
		})
	case backendRuntimeArg:
		handleRuntime()
	}
}

func handleRuntime() {
	var request runtimeRequest
	decoder := json.NewDecoder(os.Stdin)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		fail("decode backend runtime request: %%v", err)
	}
	switch strings.TrimSpace(request.Kind) {
	case "ui_setting":
		if request.UISetting == nil {
			fail("ui setting runtime payload is required")
		}
		handleUISetting(*request.UISetting)
	default:
		fail("unsupported backend runtime kind %%q", request.Kind)
	}
}

func handleUISetting(request uiSettingRequest) {
	switch strings.TrimSpace(request.HandlerID) {
	case "read-backend-enabled":
		if strings.TrimSpace(request.Operation) != "read" {
			fail("unexpected ui setting operation %%q", request.Operation)
		}
		state := loadState()
		writeJSON(runtimeResponse{
			SchemaVersion: 1,
			UISetting: map[string]any{
				"value": state.Enabled,
			},
		})
	case "write-backend-enabled":
		if strings.TrimSpace(request.Operation) != "write" {
			fail("unexpected ui setting operation %%q", request.Operation)
		}
		value, ok := request.Value.(bool)
		if !ok {
			fail("ui setting write value must be boolean")
		}
		state := loadState()
		%s
		saveState(state)
		writeJSON(runtimeResponse{
			SchemaVersion: 1,
			UISetting: map[string]any{
				"value": state.Enabled,
			},
		})
	default:
		fail("unsupported ui setting handler %%q", request.HandlerID)
	}
}

func statePath() string {
	return filepath.Join(".", "backend_ui_setting_state.json")
}

func loadState() stateFile {
	bytes, err := os.ReadFile(statePath())
	if err != nil {
		if os.IsNotExist(err) {
			return stateFile{Enabled: false}
		}
		fail("read ui setting state: %%v", err)
	}
	var state stateFile
	if err := json.Unmarshal(bytes, &state); err != nil {
		fail("decode ui setting state: %%v", err)
	}
	if state.Enabled == nil {
		state.Enabled = false
	}
	return state
}

func saveState(state stateFile) {
	payload, err := json.Marshal(state)
	if err != nil {
		fail("encode ui setting state: %%v", err)
	}
	if err := os.WriteFile(statePath(), payload, 0o644); err != nil {
		fail("write ui setting state: %%v", err)
	}
}

func writeJSON(payload any) {
	if err := json.NewEncoder(os.Stdout).Encode(payload); err != nil {
		fail("encode payload: %%v", err)
	}
}

func fail(format string, args ...any) {
	_, _ = fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
`, localSettingID, assignment)

	if err := os.WriteFile(filepath.Join(pluginRoot, "backend", "main.go"), []byte(source), 0o644); err != nil {
		t.Fatalf("write scoped backend ui setting fixture main.go: %v", err)
	}
}

func writeScopedPluginBackendUISettingFixtureState(t *testing.T, pluginRoot string, enabled any) {
	t.Helper()

	payload, err := json.Marshal(map[string]any{"enabled": enabled})
	if err != nil {
		t.Fatalf("encode scoped backend ui setting state: %v", err)
	}
	if err := os.WriteFile(filepath.Join(pluginRoot, "backend_ui_setting_state.json"), payload, 0o644); err != nil {
		t.Fatalf("write scoped backend ui setting state: %v", err)
	}
}

func writeScopedPluginBackendUISettingInvalidSchemaFixtureMainGo(t *testing.T, pluginRoot string) {
	t.Helper()

	if err := rewritePluginManifest(pluginRoot, func(payload map[string]any) {
		rawCapabilities, _ := payload["capabilities"].([]any)
		for _, rawCapability := range rawCapabilities {
			if rawCapability == "registerUISettings" {
				return
			}
		}
		payload["capabilities"] = append(rawCapabilities, "registerUISettings")
	}); err != nil {
		t.Fatalf("enable backend ui setting invalid-schema fixture capability: %v", err)
	}

	source := `package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
)

const (
	backendProbeArg = "--setta-plugin-backend-probe"
	backendRuntimeArg = "--setta-plugin-backend-runtime"
)

type runtimeRequest struct {
	SchemaVersion int               ` + "`json:\"schemaVersion\"`" + `
	Kind          string            ` + "`json:\"kind\"`" + `
	UISetting     *uiSettingRequest ` + "`json:\"uiSetting,omitempty\"`" + `
}

type backendRequestContext struct {
	ServerMode      string ` + "`json:\"serverMode\"`" + `
	HasAuth         bool   ` + "`json:\"hasAuth\"`" + `
	SessionID       string ` + "`json:\"sessionId,omitempty\"`" + `
	ShareSessionID  string ` + "`json:\"shareSessionId,omitempty\"`" + `
	ProjectConfigID string ` + "`json:\"projectConfigId,omitempty\"`" + `
	WorkspaceRoot   string ` + "`json:\"workspaceRoot,omitempty\"`" + `
	SettaFilesRoot  string ` + "`json:\"settaFilesRoot,omitempty\"`" + `
	RuntimeRoot     string ` + "`json:\"runtimeRoot,omitempty\"`" + `
}

type uiSettingRequest struct {
	Context         backendRequestContext ` + "`json:\"context\"`" + `
	HandlerID       string                ` + "`json:\"handlerId\"`" + `
	Operation       string                ` + "`json:\"operation\"`" + `
	ProjectConfigID string                ` + "`json:\"projectConfigId\"`" + `
	Value           any                   ` + "`json:\"value,omitempty\"`" + `
}

type runtimeResponse struct {
	SchemaVersion int            ` + "`json:\"schemaVersion\"`" + `
	UISetting     map[string]any ` + "`json:\"uiSetting,omitempty\"`" + `
}

type stateFile struct {
	Enabled any    ` + "`json:\"enabled\"`" + `
	Label   string ` + "`json:\"label\"`" + `
}

func main() {
	if len(os.Args) != 2 {
		return
	}
	switch os.Args[1] {
	case backendProbeArg:
		writeJSON(map[string]any{
			"schemaVersion": 1,
			"uiSettings": []map[string]any{
				{
					"id":             "backend_enabled",
					"title":          "Backend Enabled",
					"description":    "Enable backend-provided fixture behavior.",
					"paneId":         "full-settings-pane",
					"revealKey":      "full-settings",
					"synonyms":       []string{"backend enabled"},
					"mutability":     "writable",
					"valueSchema":    map[string]any{"type": "totally_invalid"},
					"readHandlerId":  "read-backend-enabled",
					"writeHandlerId": "write-backend-enabled",
				},
				{
					"id":            "backend_label",
					"title":         "Backend Label",
					"description":   "Healthy backend-provided label setting.",
					"paneId":        "full-settings-pane",
					"revealKey":     "full-settings",
					"synonyms":      []string{"backend label"},
					"mutability":    "readOnly",
					"valueSchema":   map[string]any{"type": "string"},
					"readHandlerId": "read-backend-label",
				},
			},
			"routes":            []map[string]any{},
			"staticDirs":        []map[string]any{},
			"listenerEndpoints": []map[string]any{},
		})
	case backendRuntimeArg:
		handleRuntime()
	}
}

func handleRuntime() {
	var request runtimeRequest
	decoder := json.NewDecoder(os.Stdin)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		fail("decode backend runtime request: %v", err)
	}
	switch strings.TrimSpace(request.Kind) {
	case "ui_setting":
		if request.UISetting == nil {
			fail("ui setting runtime payload is required")
		}
		handleUISetting(*request.UISetting)
	default:
		fail("unsupported backend runtime kind %q", request.Kind)
	}
}

func handleUISetting(request uiSettingRequest) {
	switch strings.TrimSpace(request.HandlerID) {
	case "read-backend-enabled":
		if strings.TrimSpace(request.Operation) != "read" {
			fail("unexpected ui setting operation %q", request.Operation)
		}
		state := loadState()
		writeJSON(runtimeResponse{
			SchemaVersion: 1,
			UISetting: map[string]any{
				"value": state.Enabled,
			},
		})
	case "write-backend-enabled":
		if strings.TrimSpace(request.Operation) != "write" {
			fail("unexpected ui setting operation %q", request.Operation)
		}
		value, ok := request.Value.(bool)
		if !ok {
			fail("ui setting write value must be boolean")
		}
		state := loadState()
		state.Enabled = value
		saveState(state)
		writeJSON(runtimeResponse{
			SchemaVersion: 1,
			UISetting: map[string]any{
				"value": state.Enabled,
			},
		})
	case "read-backend-label":
		if strings.TrimSpace(request.Operation) != "read" {
			fail("unexpected ui setting operation %q", request.Operation)
		}
		state := loadState()
		writeJSON(runtimeResponse{
			SchemaVersion: 1,
			UISetting: map[string]any{
				"value": state.Label,
			},
		})
	default:
		fail("unsupported ui setting handler %q", request.HandlerID)
	}
}

func statePath() string {
	return filepath.Join(".", "backend_ui_setting_state.json")
}

func loadState() stateFile {
	bytes, err := os.ReadFile(statePath())
	if err != nil {
		if os.IsNotExist(err) {
			return stateFile{Enabled: false, Label: "unset"}
		}
		fail("read ui setting state: %v", err)
	}
	var state stateFile
	if err := json.Unmarshal(bytes, &state); err != nil {
		fail("decode ui setting state: %v", err)
	}
	if state.Enabled == nil {
		state.Enabled = false
	}
	if strings.TrimSpace(state.Label) == "" {
		state.Label = "unset"
	}
	return state
}

func saveState(state stateFile) {
	payload, err := json.Marshal(state)
	if err != nil {
		fail("encode ui setting state: %v", err)
	}
	if err := os.WriteFile(statePath(), payload, 0o644); err != nil {
		fail("write ui setting state: %v", err)
	}
}

func writeJSON(payload any) {
	if err := json.NewEncoder(os.Stdout).Encode(payload); err != nil {
		fail("encode payload: %v", err)
	}
}

func fail(format string, args ...any) {
	_, _ = fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
`

	if err := os.WriteFile(filepath.Join(pluginRoot, "backend", "main.go"), []byte(source), 0o644); err != nil {
		t.Fatalf("write scoped backend ui setting invalid-schema fixture main.go: %v", err)
	}
}
