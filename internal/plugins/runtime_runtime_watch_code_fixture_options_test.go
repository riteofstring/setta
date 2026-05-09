package plugins

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"testing"
	"time"

	"setta/internal/config"
	"setta/internal/watchcodecontracts"
)

type runtimeWatchCodeFixtureOptions struct {
	PluginID                               string
	FixtureName                            string
	EnabledByDefault                       bool
	RegisterWatchCodeBackend               bool
	OmitWatchCodeRouterCapability          bool
	OmitWatchCodeBackendRegistration       bool
	WatchCodeBackendLanguages              []string
	WatchCodeBackendRequiresLanguageServer *bool
	WatchCodeBackendRouteSuffixes          []string
	WatchCode                              map[string]any
}

func installRuntimeWatchCodeFixture(
	t *testing.T,
	roots filesystemResolverTestRoots,
	options runtimeWatchCodeFixtureOptions,
) string {
	t.Helper()

	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, options.FixtureName)
	targetRoot := filepath.Join(pluginScopeRoot(roots, filesystemPluginScopeWorkspace), options.PluginID)
	if err := os.Rename(pluginRoot, targetRoot); err != nil {
		t.Fatalf("rename plugin root %s -> %s: %v", pluginRoot, targetRoot, err)
	}
	rewritePluginManifest(t, targetRoot, func(payload map[string]any) {
		payload["id"] = options.PluginID
		payload["name"] = "Runtime Watch Code Fixture"
		payload["enabledByDefault"] = options.EnabledByDefault
		if options.RegisterWatchCodeBackend {
			payload["backend"] = map[string]any{
				"entrypoint": "runtime_backend/main.py",
			}
			capabilities := []string{"registerWatchCodeBackend"}
			if !options.OmitWatchCodeRouterCapability {
				capabilities = append(capabilities, "registerRouter")
			}
			payload["capabilities"] = capabilities
		} else {
			delete(payload, "backend")
			payload["capabilities"] = []string{}
		}
		payload["featureCapabilities"] = map[string]any{
			"watchCode": options.WatchCode,
		}
	})
	if options.RegisterWatchCodeBackend {
		writeRuntimeWatchCodeBackendProbe(
			t,
			targetRoot,
			options.PluginID,
			!options.OmitWatchCodeBackendRegistration,
			options.WatchCodeBackendLanguages,
			options.WatchCodeBackendRequiresLanguageServer,
			options.WatchCodeBackendRouteSuffixes,
		)
	}
	return targetRoot
}

func writeRuntimeWatchCodeBackendProbe(
	t *testing.T,
	pluginRoot string,
	pluginID string,
	register bool,
	languages []string,
	requiresLanguageServer *bool,
	routeSuffixes []string,
) {
	t.Helper()

	runtimeBackendRoot := filepath.Join(pluginRoot, "runtime_backend")
	if err := os.MkdirAll(runtimeBackendRoot, 0o755); err != nil {
		t.Fatalf("mkdir runtime backend root: %v", err)
	}

	if len(languages) == 0 {
		languages = []string{"python"}
	}
	languagesJSON, err := json.Marshal(languages)
	if err != nil {
		t.Fatalf("marshal watch code backend languages: %v", err)
	}
	requiresLanguageServerValue := "True"
	if requiresLanguageServer != nil && !*requiresLanguageServer {
		requiresLanguageServerValue = "False"
	}
	probePayload := fmt.Sprintf(
		`"watchCodeBackend": {"contractVersion": %d, "dataSchemaVersion": %d, "languages": %s, "requiresLanguageServer": %s},`,
		watchcodecontracts.BackendContractVersion,
		watchcodecontracts.BackendDataSchemaVersion,
		string(languagesJSON),
		requiresLanguageServerValue,
	)
	if !register {
		probePayload = ""
	}
	if routeSuffixes == nil {
		routeSuffixes = watchcodecontracts.BackendRouteSuffixes()
	}
	routes := make([]map[string]any, 0, len(routeSuffixes))
	for _, suffix := range routeSuffixes {
		routes = append(routes, map[string]any{
			"path":    watchcodecontracts.BackendRoutePath(pluginID, suffix),
			"methods": []string{"POST"},
		})
	}
	routesJSON, err := json.Marshal(routes)
	if err != nil {
		t.Fatalf("marshal watch code backend routes: %v", err)
	}
	content := "#!/usr/bin/env python3\n\n" +
		"import json\n" +
		"import sys\n\n" +
		"BACKEND_PROBE_ARG = \"--setta-plugin-backend-probe\"\n" +
		"BACKEND_RUNTIME_ARG = \"--setta-plugin-backend-runtime\"\n\n" +
		"def write_json(payload: object) -> None:\n" +
		"    json.dump(payload, sys.stdout)\n" +
		"    sys.stdout.write(\"\\n\")\n" +
		"    sys.stdout.flush()\n\n" +
		"def main() -> None:\n" +
		"    if len(sys.argv) != 2:\n" +
		"        return\n\n" +
		"    command = sys.argv[1]\n" +
		"    if command == BACKEND_PROBE_ARG:\n" +
		"        write_json({\n" +
		"            \"schemaVersion\": 1,\n" +
		"            " + probePayload + "\n" +
		"            \"codegenTargets\": [],\n" +
		"            \"languageServers\": [],\n" +
		"            \"uiSettings\": [],\n" +
		"            \"routes\": " + string(routesJSON) + ",\n" +
		"            \"staticDirs\": [],\n" +
		"            \"listenerEndpoints\": [],\n" +
		"        })\n" +
		"        return\n\n" +
		"    if command == BACKEND_RUNTIME_ARG:\n" +
		"        write_json({\"schemaVersion\": 1})\n\n" +
		"if __name__ == \"__main__\":\n" +
		"    main()\n"
	if err := os.WriteFile(
		filepath.Join(runtimeBackendRoot, "main.py"),
		[]byte(content),
		0o755,
	); err != nil {
		t.Fatalf("write runtime backend probe: %v", err)
	}
}

func writeWatchCodeRuntimeFrontendBuildOutputs(t *testing.T, frontendRoot string) {
	t.Helper()

	distRoot := filepath.Join(frontendRoot, "dist")
	if err := os.MkdirAll(distRoot, 0o755); err != nil {
		t.Fatalf("mkdir watch code frontend dist: %v", err)
	}
	if err := os.WriteFile(filepath.Join(distRoot, "index.js"), []byte("export default {};\n"), 0o644); err != nil {
		t.Fatalf("write watch code frontend entrypoint: %v", err)
	}
	if err := os.WriteFile(filepath.Join(distRoot, "setta-watch-code-frontend.css"), []byte("body {}\n"), 0o644); err != nil {
		t.Fatalf("write watch code frontend style: %v", err)
	}
}

func writeRuntimeAppSubsystemBackendProbe(
	t *testing.T,
	pluginRoot string,
	register bool,
	endpointNames []string,
) {
	t.Helper()

	runtimeBackendRoot := filepath.Join(pluginRoot, "runtime_backend")
	if err := os.MkdirAll(runtimeBackendRoot, 0o755); err != nil {
		t.Fatalf("mkdir runtime backend root: %v", err)
	}

	listenerEndpointJSON := runtimeAppSubsystemListenerEndpointJSON(t, endpointNames)
	probePayload := `"appSubsystemBackend": {"contractVersion": 1, "listenerEndpoints": ` + listenerEndpointJSON + `},`
	if !register {
		probePayload = ""
	}
	content := "#!/usr/bin/env python3\n\n" +
		"import json\n" +
		"import sys\n\n" +
		"BACKEND_PROBE_ARG = \"--setta-plugin-backend-probe\"\n" +
		"BACKEND_RUNTIME_ARG = \"--setta-plugin-backend-runtime\"\n\n" +
		"def write_json(payload: object) -> None:\n" +
		"    json.dump(payload, sys.stdout)\n" +
		"    sys.stdout.write(\"\\n\")\n" +
		"    sys.stdout.flush()\n\n" +
		"def fail(message: str) -> None:\n" +
		"    sys.stderr.write(message + \"\\n\")\n" +
		"    sys.exit(1)\n\n" +
		"def main() -> None:\n" +
		"    if len(sys.argv) != 2:\n" +
		"        return\n\n" +
		"    command = sys.argv[1]\n" +
		"    if command == BACKEND_PROBE_ARG:\n" +
		"        write_json({\n" +
		"            \"schemaVersion\": 1,\n" +
		"            " + probePayload + "\n" +
		"            \"codegenTargets\": [],\n" +
		"            \"languageServers\": [],\n" +
		"            \"uiSettings\": [],\n" +
		"            \"routes\": [],\n" +
		"            \"staticDirs\": [],\n" +
		"            \"listenerEndpoints\": [],\n" +
		"        })\n" +
		"        return\n\n" +
		"    if command != BACKEND_RUNTIME_ARG:\n" +
		"        return\n\n" +
		"    try:\n" +
		"        request = json.load(sys.stdin)\n" +
		"    except json.JSONDecodeError as error:\n" +
		"        fail(f\"decode backend runtime request: {error}\")\n\n" +
		"    kind = str(request.get(\"kind\", \"\")).strip()\n" +
		"    response: dict[str, object] = {\"schemaVersion\": 1}\n" +
		"    if kind == \"http\":\n" +
		"        response[\"http\"] = {\"statusCode\": 404, \"headers\": {}}\n" +
		"    elif kind == \"listener_endpoint\":\n" +
		"        response[\"listenerEndpoint\"] = {\"result\": None}\n" +
		"    else:\n" +
		"        fail(f\"unsupported backend runtime kind {kind!r}\")\n" +
		"    write_json(response)\n\n" +
		"if __name__ == \"__main__\":\n" +
		"    main()\n"
	if err := os.WriteFile(
		filepath.Join(runtimeBackendRoot, "main.py"),
		[]byte(content),
		0o755,
	); err != nil {
		t.Fatalf("write runtime backend probe: %v", err)
	}
}

func runtimeAppSubsystemListenerEndpointJSON(t *testing.T, endpointNames []string) string {
	t.Helper()

	endpoints := make([]map[string]string, 0, len(endpointNames))
	for _, endpointName := range endpointNames {
		endpoints = append(endpoints, map[string]string{"name": endpointName})
	}
	encoded, err := json.Marshal(endpoints)
	if err != nil {
		t.Fatalf("encode app subsystem listener endpoints: %v", err)
	}
	return string(encoded)
}

func assertRuntimeAppSubsystemSelection(
	t *testing.T,
	selection *PluginAppSubsystemProviderSelection,
	expectedStatus PluginAppSubsystemProviderSelectionStatusKind,
	expectedSelectedPluginID *string,
	expectedActive []string,
	expectedDisabled []string,
	expectedInvalid []string,
	expectedConflicting []string,
) {
	t.Helper()

	if selection == nil {
		t.Fatal("expected app subsystem provider selection")
	}
	if selection.Status != expectedStatus {
		t.Fatalf("expected selection status %q, got %#v", expectedStatus, selection)
	}
	if expectedSelectedPluginID == nil {
		if selection.SelectedPluginID != nil {
			t.Fatalf("expected no selected provider, got %#v", selection.SelectedPluginID)
		}
	} else {
		if selection.SelectedPluginID == nil || *selection.SelectedPluginID != *expectedSelectedPluginID {
			t.Fatalf("expected selected provider %q, got %#v", *expectedSelectedPluginID, selection.SelectedPluginID)
		}
	}
	if !slices.Equal(selection.ActivePluginIDs, emptyStrings(expectedActive)) {
		t.Fatalf("expected active provider ids %#v, got %#v", expectedActive, selection.ActivePluginIDs)
	}
	if !slices.Equal(selection.DisabledPluginIDs, emptyStrings(expectedDisabled)) {
		t.Fatalf("expected disabled provider ids %#v, got %#v", expectedDisabled, selection.DisabledPluginIDs)
	}
	if !slices.Equal(selection.InvalidPluginIDs, emptyStrings(expectedInvalid)) {
		t.Fatalf("expected invalid provider ids %#v, got %#v", expectedInvalid, selection.InvalidPluginIDs)
	}
	if !slices.Equal(selection.ConflictingPluginIDs, emptyStrings(expectedConflicting)) {
		t.Fatalf("expected conflicting provider ids %#v, got %#v", expectedConflicting, selection.ConflictingPluginIDs)
	}
}

func assertRuntimeWatchCodeSelection(
	t *testing.T,
	selection *PluginWatchCodeProviderSelection,
	expectedStatus PluginWatchCodeProviderSelectionStatusKind,
	expectedSelectedPluginID *string,
	expectedActive []string,
	expectedDisabled []string,
	expectedInvalid []string,
	expectedConflicting []string,
	expectedPendingRestart ...[]string,
) {
	t.Helper()

	if selection == nil {
		t.Fatal("expected watch code provider selection")
	}
	if selection.Status != expectedStatus {
		t.Fatalf("expected watch code selection status %q, got %#v", expectedStatus, selection)
	}
	if expectedSelectedPluginID == nil {
		if selection.SelectedPluginID != nil {
			t.Fatalf("expected no selected watch code provider, got %#v", selection.SelectedPluginID)
		}
	} else {
		if selection.SelectedPluginID == nil || *selection.SelectedPluginID != *expectedSelectedPluginID {
			t.Fatalf("expected selected watch code provider %q, got %#v", *expectedSelectedPluginID, selection.SelectedPluginID)
		}
	}
	if !slices.Equal(selection.ActivePluginIDs, emptyStrings(expectedActive)) {
		t.Fatalf("expected active watch code provider ids %#v, got %#v", expectedActive, selection.ActivePluginIDs)
	}
	if !slices.Equal(selection.DisabledPluginIDs, emptyStrings(expectedDisabled)) {
		t.Fatalf("expected disabled watch code provider ids %#v, got %#v", expectedDisabled, selection.DisabledPluginIDs)
	}
	if !slices.Equal(selection.InvalidPluginIDs, emptyStrings(expectedInvalid)) {
		t.Fatalf("expected invalid watch code provider ids %#v, got %#v", expectedInvalid, selection.InvalidPluginIDs)
	}
	expectedPending := []string(nil)
	if len(expectedPendingRestart) != 0 {
		expectedPending = expectedPendingRestart[0]
	}
	if !slices.Equal(selection.PendingRestartPluginIDs, emptyStrings(expectedPending)) {
		t.Fatalf("expected pending restart watch code provider ids %#v, got %#v", expectedPending, selection.PendingRestartPluginIDs)
	}
	if !slices.Equal(selection.ConflictingPluginIDs, emptyStrings(expectedConflicting)) {
		t.Fatalf("expected conflicting watch code provider ids %#v, got %#v", expectedConflicting, selection.ConflictingPluginIDs)
	}
}

func emptyStrings(values []string) []string {
	if len(values) == 0 {
		return []string{}
	}
	return values
}

// Content descriptor scans should ignore symlinked directory loops until a real file appears.
func TestRuntimeDirectoryHasFilesIgnoresSymlinkDirectoryCycles(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := filepath.Join(roots.workspaceRoot, "content-plugin")
	promptsRoot := filepath.Join(pluginRoot, "content", "prompts")
	if err := os.MkdirAll(promptsRoot, 0o755); err != nil {
		t.Fatalf("mkdir prompts root: %v", err)
	}
	if err := os.Symlink(promptsRoot, filepath.Join(promptsRoot, "loop")); err != nil {
		t.Fatalf("create prompts symlink loop: %v", err)
	}

	if runtimeDirectoryHasFiles(pluginRoot, "content/prompts") {
		t.Fatal("expected symlink directory loop alone not to count as content")
	}

	if err := os.WriteFile(filepath.Join(promptsRoot, "prompt.md"), []byte("hello"), 0o644); err != nil {
		t.Fatalf("write prompt file: %v", err)
	}
	if !runtimeDirectoryHasFiles(pluginRoot, "content/prompts") {
		t.Fatal("expected real prompt file to count as content")
	}
}

func TestServiceRuntimeWaitsForServiceLock(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	assertServiceCallWaitsForLock(t, service, func() error {
		_, err := service.Runtime(RuntimeOptions{})
		return err
	})
}

func TestServiceRuntimeAndStatusExposePackageManagerDiscoveryMetadata(t *testing.T) {
	// Runtime/status reads should preserve package-manager discovery metadata for active environment plugins.
	roots := newFilesystemResolverTestRoots(t)
	sitePackages, _ := installPackageManagerFixture(t, "frontend", "setta-fixture-frontend", "0.1.0", nil)
	service := mustNewPluginMutationServiceWithPackageManager(t, roots, nil, config.ModeIDE, []string{sitePackages})

	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}

	if len(runtimeResponse.List.Plugins) != 1 {
		t.Fatalf("expected one runtime list entry, got %#v", runtimeResponse.List.Plugins)
	}
	if len(runtimeResponse.Status.Plugins) != 1 {
		t.Fatalf("expected one runtime status entry, got %#v", runtimeResponse.Status.Plugins)
	}

	listEntry := runtimeResponse.List.Plugins[0]
	if listEntry.PluginID != "setta-fixture-frontend" {
		t.Fatalf("expected package-manager plugin id, got %#v", listEntry.PluginID)
	}
	if listEntry.SourceScope != PluginScopeSettaFiles || listEntry.SourceScopeLabel != "setta_files" {
		t.Fatalf("expected setta_files package-manager scope, got %#v / %#v", listEntry.SourceScope, listEntry.SourceScopeLabel)
	}
	if listEntry.SourceManager != PluginSourceManagerPackageManager {
		t.Fatalf("expected package-manager source manager, got %#v", listEntry.SourceManager)
	}
	if listEntry.CanonicalSourceKey != "pypi:setta-fixture-frontend" {
		t.Fatalf("unexpected package-manager canonical source key %q", listEntry.CanonicalSourceKey)
	}
	if listEntry.SourceManagerHint == nil || *listEntry.SourceManagerHint != packageManagerSourceHint {
		t.Fatalf("unexpected package-manager hint %#v", listEntry.SourceManagerHint)
	}

	statusEntry := runtimeResponse.Status.Plugins[0]
	if statusEntry.SourceScope != PluginScopeSettaFiles || statusEntry.SourceScopeLabel != "setta_files" {
		t.Fatalf("expected setta_files package-manager status scope, got %#v / %#v", statusEntry.SourceScope, statusEntry.SourceScopeLabel)
	}
	if statusEntry.SourceManager != PluginSourceManagerPackageManager {
		t.Fatalf("expected package-manager status source manager, got %#v", statusEntry.SourceManager)
	}
	if statusEntry.CanonicalSourceKey != "pypi:setta-fixture-frontend" {
		t.Fatalf("unexpected status canonical source key %q", statusEntry.CanonicalSourceKey)
	}
	if statusEntry.SourceManagerHint == nil || *statusEntry.SourceManagerHint != packageManagerSourceHint {
		t.Fatalf("unexpected status package-manager hint %#v", statusEntry.SourceManagerHint)
	}
}

func TestServiceRuntimeEncodesFrontendAssetURLs(t *testing.T) {
	// Frontend entrypoint URLs should escape reserved path characters and keep digest versioning.
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "frontend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/entry #main.js"
		frontend["style"] = "frontend/src/index.css"
	})
	if err := os.Rename(
		filepath.Join(pluginRoot, "frontend", "src", "index.js"),
		filepath.Join(pluginRoot, "frontend", "src", "entry #main.js"),
	); err != nil {
		t.Fatalf("rename frontend entrypoint: %v", err)
	}

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}

	if len(runtimeResponse.List.Plugins) != 1 {
		t.Fatalf("expected one plugin, got %#v", runtimeResponse.List.Plugins)
	}
	entrypointURL := runtimeResponse.List.Plugins[0].Frontend.EntrypointURL
	if entrypointURL == nil {
		t.Fatal("expected frontend entrypoint url")
	}
	if !strings.Contains(*entrypointURL, "/plugins/setta-fixture-frontend/frontend/src/entry%20%23main.js") {
		t.Fatalf("expected encoded frontend asset url, got %q", *entrypointURL)
	}
	if !strings.Contains(*entrypointURL, "?v=") {
		t.Fatalf("expected version digest in frontend asset url, got %q", *entrypointURL)
	}
	if strings.Contains(*entrypointURL, "#") {
		t.Fatalf("expected frontend asset url to escape '#', got %q", *entrypointURL)
	}
}

func TestServiceRuntimeRedactsConfigAndSourceOutsideIDE(t *testing.T) {
	// Share/app runtime payloads should hide raw source identity and config payload contents.
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "full")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/index.js"
		frontend["style"] = "frontend/src/index.css"
	})
	writeJSONFile(t, filepath.Join(roots.settaFilesRoot, "plugins_state.json"), map[string]any{
		"pluginConfigById": map[string]any{
			string(PluginScopeWorkspace) + ":setta-fixture-full": map[string]any{
				"enabled": true,
				"secret":  "value",
			},
		},
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeShare)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load redacted runtime payload: %v", err)
	}

	listEntry := runtimeResponse.List.Plugins[0]
	if !strings.Contains(listEntry.CanonicalSourceKey, "redacted:workspace:setta:setta-fixture-full:") {
		t.Fatalf("expected redacted canonical source key, got %q", listEntry.CanonicalSourceKey)
	}
	if listEntry.Config.HasSchema != true || listEntry.Config.SchemaJSON != nil {
		t.Fatalf("expected redacted schema payload, got %#v", listEntry.Config)
	}
	if len(listEntry.Config.CurrentConfig) != 0 {
		t.Fatalf("expected empty redacted config payload, got %#v", listEntry.Config.CurrentConfig)
	}
	if listEntry.Config.CurrentConfigDigestSHA256 != nil {
		t.Fatalf("expected redacted config digest to be omitted, got %#v", listEntry.Config.CurrentConfigDigestSHA256)
	}

	statusEntry := runtimeResponse.Status.Plugins[0]
	if !strings.Contains(statusEntry.SourcePath, "[redacted]:workspace:setta:setta-fixture-full:") {
		t.Fatalf("expected redacted source path, got %q", statusEntry.SourcePath)
	}
}

func TestServiceRuntimeConfigDigestsChangeAfterConfigWrite(t *testing.T) {
	// Runtime list entries should expose config digests and change the current-config digest after writes.
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "full")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/index.js"
		frontend["style"] = "frontend/src/index.css"
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	if _, err := service.WriteConfig(context.Background(), ConfigWriteOptions{
		PluginID: "setta-fixture-full",
		Config: map[string]any{
			"enabled": true,
		},
	}); err != nil {
		t.Fatalf("write initial plugin config: %v", err)
	}

	firstRuntime, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load first runtime payload: %v", err)
	}
	firstEntry := mustFindRuntimeListEntry(t, firstRuntime.List.Plugins, "setta-fixture-full")
	if firstEntry.Config.SchemaJSONDigestSHA256 == nil || len(*firstEntry.Config.SchemaJSONDigestSHA256) != 64 {
		t.Fatalf("expected schema digest on first runtime read, got %#v", firstEntry.Config.SchemaJSONDigestSHA256)
	}
	if firstEntry.Config.CurrentConfigDigestSHA256 == nil || len(*firstEntry.Config.CurrentConfigDigestSHA256) != 64 {
		t.Fatalf("expected current-config digest on first runtime read, got %#v", firstEntry.Config.CurrentConfigDigestSHA256)
	}
	firstSchemaDigest := *firstEntry.Config.SchemaJSONDigestSHA256
	firstCurrentConfigDigest := *firstEntry.Config.CurrentConfigDigestSHA256

	if _, err := service.WriteConfig(context.Background(), ConfigWriteOptions{
		PluginID: "setta-fixture-full",
		Config: map[string]any{
			"enabled": true,
			"label":   "digest-change",
		},
	}); err != nil {
		t.Fatalf("write updated plugin config: %v", err)
	}

	secondRuntime, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load second runtime payload: %v", err)
	}
	secondEntry := mustFindRuntimeListEntry(t, secondRuntime.List.Plugins, "setta-fixture-full")
	if secondEntry.Config.SchemaJSONDigestSHA256 == nil || *secondEntry.Config.SchemaJSONDigestSHA256 != firstSchemaDigest {
		t.Fatalf("expected stable schema digest after config write, got first=%q second=%#v", firstSchemaDigest, secondEntry.Config.SchemaJSONDigestSHA256)
	}
	if secondEntry.Config.CurrentConfigDigestSHA256 == nil {
		t.Fatalf("expected updated current-config digest, got %#v", secondEntry.Config.CurrentConfigDigestSHA256)
	}
	if *secondEntry.Config.CurrentConfigDigestSHA256 == firstCurrentConfigDigest {
		t.Fatalf("expected current-config digest to change after config write, got first=%q second=%q", firstCurrentConfigDigest, *secondEntry.Config.CurrentConfigDigestSHA256)
	}
	if got := secondEntry.Config.CurrentConfig["label"]; got != "digest-change" {
		t.Fatalf("expected updated config label, got %#v", got)
	}
}

func TestServiceRuntimeRedactionKeepsEntriesDistinctAcrossScopes(t *testing.T) {
	// Share/app redaction should keep duplicate plugin ids in different scopes distinguishable.
	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			roots := newFilesystemResolverTestRoots(t)
			workspaceRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "frontend")
			settaFilesRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeSettaFiles, "frontend")
			for _, pluginRoot := range []string{workspaceRoot, settaFilesRoot} {
				rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
					frontend := payload["frontend"].(map[string]any)
					frontend["entrypoint"] = "frontend/src/index.js"
					frontend["style"] = "frontend/src/index.css"
				})
			}

			service := mustNewPluginMutationService(t, roots, nil, mode)
			runtimeResponse, err := service.Runtime(RuntimeOptions{})
			if err != nil {
				t.Fatalf("load redacted runtime payload: %v", err)
			}

			sourcePaths := map[string]struct{}{}
			canonicalSourceKeys := map[string]struct{}{}
			entryCount := 0
			for _, entry := range runtimeResponse.Status.Plugins {
				if entry.PluginID != "setta-fixture-frontend" {
					continue
				}
				entryCount++
				sourcePaths[entry.SourcePath] = struct{}{}
				canonicalSourceKeys[entry.CanonicalSourceKey] = struct{}{}
			}
			if entryCount != 2 {
				t.Fatalf("expected two redacted status entries, got %#v", runtimeResponse.Status.Plugins)
			}
			if len(sourcePaths) != 2 {
				t.Fatalf("expected distinct redacted source paths across scopes, got %#v", sourcePaths)
			}
			if len(canonicalSourceKeys) != 2 {
				t.Fatalf("expected distinct redacted canonical source keys across scopes, got %#v", canonicalSourceKeys)
			}

			activeEntry := mustFindStatusEntry(t, runtimeResponse.Status.Plugins, "setta-fixture-frontend", PluginRuntimeStateActive)
			shadowedEntry := mustFindStatusEntry(t, runtimeResponse.Status.Plugins, "setta-fixture-frontend", PluginRuntimeStateShadowed)
			if activeEntry.SourceScope != PluginScopeWorkspace {
				t.Fatalf("expected workspace entry to stay active, got %#v", activeEntry.SourceScope)
			}
			if shadowedEntry.SourceScope != PluginScopeSettaFiles {
				t.Fatalf("expected setta_files entry to stay shadowed, got %#v", shadowedEntry.SourceScope)
			}
			if !strings.Contains(activeEntry.SourcePath, "[redacted]:workspace:setta:setta-fixture-frontend:") {
				t.Fatalf("expected workspace redacted source path, got %q", activeEntry.SourcePath)
			}
			if !strings.Contains(activeEntry.CanonicalSourceKey, "redacted:workspace:setta:setta-fixture-frontend:") {
				t.Fatalf("expected workspace redacted canonical source key, got %q", activeEntry.CanonicalSourceKey)
			}
			if !strings.Contains(shadowedEntry.SourcePath, "[redacted]:setta_files:setta:setta-fixture-frontend:") {
				t.Fatalf("expected setta_files redacted source path, got %q", shadowedEntry.SourcePath)
			}
			if !strings.Contains(shadowedEntry.CanonicalSourceKey, "redacted:setta_files:setta:setta-fixture-frontend:") {
				t.Fatalf("expected setta_files redacted canonical source key, got %q", shadowedEntry.CanonicalSourceKey)
			}
			if shadowedEntry.ShadowedBySourcePath == nil || *shadowedEntry.ShadowedBySourcePath != activeEntry.SourcePath {
				t.Fatalf("expected redacted shadow path %q, got %#v", activeEntry.SourcePath, shadowedEntry.ShadowedBySourcePath)
			}
		})
	}
}

func TestServiceRuntimeRedactionKeepsSameScopeSourceManagersDistinct(t *testing.T) {
	// Share/app redaction should keep same-scope setta and package-manager duplicates distinguishable.
	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			roots := newFilesystemResolverTestRoots(t)
			sitePackages, _ := installPackageManagerFixture(
				t,
				"frontend",
				"setta-fixture-frontend",
				"0.1.0",
				func(pluginRoot string) {
					rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
						frontend := payload["frontend"].(map[string]any)
						frontend["entrypoint"] = "frontend/src/index.js"
						frontend["style"] = "frontend/src/index.css"
					})
				},
			)
			localRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeSettaFiles, "frontend")
			rewritePluginManifest(t, localRoot, func(payload map[string]any) {
				frontend := payload["frontend"].(map[string]any)
				frontend["entrypoint"] = "frontend/src/index.js"
				frontend["style"] = "frontend/src/index.css"
			})

			service := mustNewPluginMutationServiceWithPackageManager(t, roots, nil, mode, []string{sitePackages})
			runtimeResponse, err := service.Runtime(RuntimeOptions{})
			if err != nil {
				t.Fatalf("load redacted runtime payload with package manager entry: %v", err)
			}
			assertSameScopeSourceManagerRedactionDistinct(t, runtimeResponse.Status.Plugins)
		})
	}
}

func TestServiceRuntimePreservesBlockedCapabilitiesInShareMode(t *testing.T) {
	// Runtime status should surface deterministic blocked-capability reasons outside IDE mode.
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"writeWorkspacePlugins"}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeShare)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load share runtime payload: %v", err)
	}

	if len(runtimeResponse.List.Plugins) != 1 {
		t.Fatalf("expected one active plugin, got %#v", runtimeResponse.List.Plugins)
	}
	if len(runtimeResponse.List.Plugins[0].EffectiveCapabilities) != 0 {
		t.Fatalf("expected blocked writeWorkspacePlugins capability to be removed from effective list, got %#v", runtimeResponse.List.Plugins[0].EffectiveCapabilities)
	}

	statusEntry := runtimeResponse.Status.Plugins[0]
	if len(statusEntry.BlockedCapabilities) != 1 {
		t.Fatalf("expected one blocked capability, got %#v", statusEntry.BlockedCapabilities)
	}
	if statusEntry.BlockedCapabilities[0].Capability != "writeWorkspacePlugins" {
		t.Fatalf("expected writeWorkspacePlugins blocked, got %#v", statusEntry.BlockedCapabilities[0])
	}
	if statusEntry.BlockedCapabilities[0].Reason != PluginBlockedCapabilityReasonModePolicy {
		t.Fatalf("expected mode-policy block, got %#v", statusEntry.BlockedCapabilities[0].Reason)
	}
}

func TestServiceRuntimeBlocksContextMenuCapabilityByHostPolicyInIDE(t *testing.T) {
	// IDE runtime should report registerContextMenu as host-blocked until the host implements it.
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "frontend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerContextMenu", "registerPane"}
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/index.js"
		frontend["style"] = "frontend/src/index.css"
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load IDE runtime payload: %v", err)
	}
	if len(runtimeResponse.List.Plugins) != 1 {
		t.Fatalf("expected one active plugin, got %#v", runtimeResponse.List.Plugins)
	}
	if len(runtimeResponse.List.Plugins[0].EffectiveCapabilities) != 1 || runtimeResponse.List.Plugins[0].EffectiveCapabilities[0] != "registerPane" {
		t.Fatalf("expected only registerPane to stay effective, got %#v", runtimeResponse.List.Plugins[0].EffectiveCapabilities)
	}

	statusEntry := runtimeResponse.Status.Plugins[0]
	if len(statusEntry.RequestedCapabilities) != 2 {
		t.Fatalf("expected requested capabilities to stay visible, got %#v", statusEntry.RequestedCapabilities)
	}
	if len(statusEntry.BlockedCapabilities) != 1 {
		t.Fatalf("expected one blocked capability, got %#v", statusEntry.BlockedCapabilities)
	}
	if statusEntry.BlockedCapabilities[0].Capability != "registerContextMenu" {
		t.Fatalf("expected registerContextMenu to be blocked, got %#v", statusEntry.BlockedCapabilities[0])
	}
	if statusEntry.BlockedCapabilities[0].Reason != PluginBlockedCapabilityReasonHostPolicy {
		t.Fatalf("expected host-policy block, got %#v", statusEntry.BlockedCapabilities[0].Reason)
	}
}

func TestServiceRuntimeBlocksExternalAgentAdapterCapabilityByHostPolicy(t *testing.T) {
	// Plugin external-agent adapter capability is intentionally host-blocked on the current Go surface.
	for _, mode := range []config.Mode{config.ModeIDE, config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			roots := newFilesystemResolverTestRoots(t)
			pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
			rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
				payload["capabilities"] = []string{"registerExternalAgentAdapter"}
			})

			service := mustNewPluginMutationService(t, roots, nil, mode)
			runtimeResponse, err := service.Runtime(RuntimeOptions{})
			if err != nil {
				t.Fatalf("load runtime payload: %v", err)
			}
			if len(runtimeResponse.List.Plugins) != 1 {
				t.Fatalf("expected one plugin, got %#v", runtimeResponse.List.Plugins)
			}
			if len(runtimeResponse.List.Plugins[0].EffectiveCapabilities) != 0 {
				t.Fatalf("expected no effective external-agent adapter capability, got %#v", runtimeResponse.List.Plugins[0].EffectiveCapabilities)
			}

			statusEntry := runtimeResponse.Status.Plugins[0]
			if len(statusEntry.RequestedCapabilities) != 1 || statusEntry.RequestedCapabilities[0] != "registerExternalAgentAdapter" {
				t.Fatalf("expected requested external-agent adapter capability, got %#v", statusEntry.RequestedCapabilities)
			}
			if len(statusEntry.BlockedCapabilities) != 1 {
				t.Fatalf("expected one blocked capability, got %#v", statusEntry.BlockedCapabilities)
			}
			if statusEntry.BlockedCapabilities[0].Capability != "registerExternalAgentAdapter" {
				t.Fatalf("expected registerExternalAgentAdapter to be blocked, got %#v", statusEntry.BlockedCapabilities[0])
			}
			if statusEntry.BlockedCapabilities[0].Reason != PluginBlockedCapabilityReasonHostPolicy {
				t.Fatalf("expected host-policy block, got %#v", statusEntry.BlockedCapabilities[0].Reason)
			}
		})
	}
}

func TestServiceRuntimeBlocksCodegenTargetCapabilityByModePolicy(t *testing.T) {
	// Share/app runtime should block backend codegen target registration and surface deterministic status.
	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			roots := newFilesystemResolverTestRoots(t)
			pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
			rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
				payload["capabilities"] = []string{"registerCodegenTarget"}
			})

			service := mustNewPluginMutationService(t, roots, nil, mode)
			runtimeResponse, err := service.Runtime(RuntimeOptions{})
			if err != nil {
				t.Fatalf("load runtime payload: %v", err)
			}
			if len(runtimeResponse.List.Plugins) != 1 {
				t.Fatalf("expected one plugin, got %#v", runtimeResponse.List.Plugins)
			}
			if len(runtimeResponse.List.Plugins[0].EffectiveCapabilities) != 0 {
				t.Fatalf("expected no effective codegen capability, got %#v", runtimeResponse.List.Plugins[0].EffectiveCapabilities)
			}

			statusEntry := runtimeResponse.Status.Plugins[0]
			if statusEntry.State != PluginRuntimeStateActive {
				t.Fatalf("expected active status entry, got %#v", statusEntry.State)
			}
			if len(statusEntry.RequestedCapabilities) != 1 || statusEntry.RequestedCapabilities[0] != "registerCodegenTarget" {
				t.Fatalf("expected requested codegen capability, got %#v", statusEntry.RequestedCapabilities)
			}
			if len(statusEntry.RegisteredCodegenTargets) != 0 {
				t.Fatalf("expected no registered codegen targets in %s, got %#v", mode, statusEntry.RegisteredCodegenTargets)
			}
			if len(statusEntry.BlockedCapabilities) != 1 {
				t.Fatalf("expected one blocked capability, got %#v", statusEntry.BlockedCapabilities)
			}
			if statusEntry.BlockedCapabilities[0].Capability != "registerCodegenTarget" {
				t.Fatalf("expected registerCodegenTarget to be blocked, got %#v", statusEntry.BlockedCapabilities[0])
			}
			if statusEntry.BlockedCapabilities[0].Reason != PluginBlockedCapabilityReasonModePolicy {
				t.Fatalf("expected mode-policy block, got %#v", statusEntry.BlockedCapabilities[0].Reason)
			}
		})
	}
}

func TestServiceRuntimeBlocksLanguageServerCapabilityByModePolicy(t *testing.T) {
	// Share/app runtime should block backend language-server registration and keep specs empty.
	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			roots := newFilesystemResolverTestRoots(t)
			pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
			rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
				payload["capabilities"] = []string{"registerLanguageServer"}
			})

			service := mustNewPluginMutationService(t, roots, nil, mode)
			runtimeResponse, err := service.Runtime(RuntimeOptions{})
			if err != nil {
				t.Fatalf("load runtime payload: %v", err)
			}
			if len(runtimeResponse.List.Plugins) != 1 {
				t.Fatalf("expected one plugin, got %#v", runtimeResponse.List.Plugins)
			}
			if len(runtimeResponse.List.Plugins[0].EffectiveCapabilities) != 0 {
				t.Fatalf("expected no effective language-server capability, got %#v", runtimeResponse.List.Plugins[0].EffectiveCapabilities)
			}

			statusEntry := runtimeResponse.Status.Plugins[0]
			if statusEntry.State != PluginRuntimeStateActive {
				t.Fatalf("expected active status entry, got %#v", statusEntry.State)
			}
			if len(statusEntry.RequestedCapabilities) != 1 || statusEntry.RequestedCapabilities[0] != "registerLanguageServer" {
				t.Fatalf("expected requested language-server capability, got %#v", statusEntry.RequestedCapabilities)
			}
			if len(statusEntry.BlockedCapabilities) != 1 {
				t.Fatalf("expected one blocked capability, got %#v", statusEntry.BlockedCapabilities)
			}
			if statusEntry.BlockedCapabilities[0].Capability != "registerLanguageServer" {
				t.Fatalf("expected registerLanguageServer to be blocked, got %#v", statusEntry.BlockedCapabilities[0])
			}
			if statusEntry.BlockedCapabilities[0].Reason != PluginBlockedCapabilityReasonModePolicy {
				t.Fatalf("expected mode-policy block, got %#v", statusEntry.BlockedCapabilities[0].Reason)
			}

			specs, err := service.LanguageServerSpecs(context.Background(), nil)
			if err != nil {
				t.Fatalf("load language server specs: %v", err)
			}
			if len(specs) != 0 {
				t.Fatalf("expected no language server specs in %s, got %#v", mode, specs)
			}
		})
	}
}

func TestServiceRuntimeEnablesBackendTransportCapabilitiesInIDE(t *testing.T) {
	// IDE runtime should expose the routed backend capability set directly from the Go-owned backend contract.
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{
			"registerCodegenTarget",
			"registerLanguageServer",
			"registerMcpTools",
			"registerRouter",
			"registerStaticDir",
			"registerListenerEndpoint",
		}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if len(runtimeResponse.List.Plugins) != 1 {
		t.Fatalf("expected one active plugin, got %#v", runtimeResponse.List.Plugins)
	}
	if len(runtimeResponse.List.Plugins[0].EffectiveCapabilities) != 6 {
		t.Fatalf("expected backend transport capabilities to be effective, got %#v", runtimeResponse.List.Plugins[0].EffectiveCapabilities)
	}
	if runtimeResponse.List.Plugins[0].EffectiveCapabilities[0] != "registerCodegenTarget" ||
		runtimeResponse.List.Plugins[0].EffectiveCapabilities[1] != "registerLanguageServer" ||
		runtimeResponse.List.Plugins[0].EffectiveCapabilities[2] != "registerMcpTools" ||
		runtimeResponse.List.Plugins[0].EffectiveCapabilities[3] != "registerRouter" ||
		runtimeResponse.List.Plugins[0].EffectiveCapabilities[4] != "registerStaticDir" ||
		runtimeResponse.List.Plugins[0].EffectiveCapabilities[5] != "registerListenerEndpoint" {
		t.Fatalf("unexpected effective backend capabilities %#v", runtimeResponse.List.Plugins[0].EffectiveCapabilities)
	}

	statusEntry := runtimeResponse.Status.Plugins[0]
	if len(statusEntry.RequestedCapabilities) != 6 {
		t.Fatalf("expected requested backend capabilities, got %#v", statusEntry.RequestedCapabilities)
	}
	if len(statusEntry.BlockedCapabilities) != 0 {
		t.Fatalf("expected no blocked backend capabilities, got %#v", statusEntry.BlockedCapabilities)
	}
}

func TestServiceRuntimeReportsBackendRegistrationsFromProbe(t *testing.T) {
	// IDE runtime status should expose probed backend routes, static mounts, and listener endpoints.
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{
			"registerCodegenTarget",
			"registerRouter",
			"registerStaticDir",
			"registerListenerEndpoint",
		}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if len(runtimeResponse.Status.Plugins) != 1 {
		t.Fatalf("expected one status plugin, got %#v", runtimeResponse.Status.Plugins)
	}
	assertBackendRegistrationStatusEntry(t, runtimeResponse.Status.Plugins[0])
}

func TestServiceRuntimeShadowedEntriesDoNotReportPrimaryBackendRegistrations(t *testing.T) {
	// Shadowed entries should keep their own empty registration slices instead of inheriting the active plugin's backend metadata.
	roots := newFilesystemResolverTestRoots(t)
	workspaceRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	settaFilesRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeSettaFiles, "backend")
	for _, pluginRoot := range []string{workspaceRoot, settaFilesRoot} {
		rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
			payload["capabilities"] = []string{
				"registerCodegenTarget",
				"registerRouter",
				"registerStaticDir",
				"registerListenerEndpoint",
			}
		})
	}

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}

	entries := make([]PluginStatusEntry, 0, 2)
	for _, entry := range runtimeResponse.Status.Plugins {
		if entry.PluginID == "setta-fixture-backend" {
			entries = append(entries, entry)
		}
	}
	if len(entries) != 2 {
		t.Fatalf("expected two backend status entries, got %#v", entries)
	}

	activeEntry := mustFindStatusEntry(t, entries, "setta-fixture-backend", PluginRuntimeStateActive)
	if activeEntry.SourceScope != PluginScopeWorkspace {
		t.Fatalf("expected workspace entry to stay active, got %#v", activeEntry.SourceScope)
	}
	if len(activeEntry.RegisteredCodegenTargets) != 1 ||
		len(activeEntry.RegisteredBackendRoutes) != 2 ||
		len(activeEntry.RegisteredStaticDirs) != 1 ||
		len(activeEntry.RegisteredListenerEndpoints) != 1 {
		t.Fatalf("expected active entry registrations to stay populated, got %#v", activeEntry)
	}

	shadowedEntry := mustFindStatusEntry(t, entries, "setta-fixture-backend", PluginRuntimeStateShadowed)
	if shadowedEntry.SourceScope != PluginScopeSettaFiles || shadowedEntry.ShadowedBySourcePath == nil || *shadowedEntry.ShadowedBySourcePath != activeEntry.SourcePath {
		t.Fatalf("expected setta_files entry to be shadowed by workspace path, got %#v", shadowedEntry)
	}
	if len(shadowedEntry.RegisteredCodegenTargets) != 0 ||
		len(shadowedEntry.RegisteredBackendRoutes) != 0 ||
		len(shadowedEntry.RegisteredStaticDirs) != 0 ||
		len(shadowedEntry.RegisteredListenerEndpoints) != 0 {
		t.Fatalf("expected shadowed entry registrations to stay empty, got %#v", shadowedEntry)
	}
}

func TestServiceRuntimeClearsBackendRegistrationsAfterUninstallCommit(t *testing.T) {
	// Backend runtime refresh after uninstall should clear the live registration surface.
	service := newLinkedBackendRegistrationService(t)

	assertBackendRegistrationsPresentAfterRefresh(t, service)
	uninstallBackendFixtureAndCommitRefresh(t, service)
	assertBackendRegistrationsClearedAfterUninstall(t, service)
}

func TestServiceRuntimeMarksBackendPluginInvalidWhenProbeFailsForRequestedRegistrations(t *testing.T) {
	// Backend plugins that request route/static/listener registrations must implement the probe contract.
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerRouter"}
	})
	if err := os.WriteFile(
		filepath.Join(pluginRoot, "backend", "main.go"),
		[]byte("package main\n\nfunc main() {}\n"),
		0o644,
	); err != nil {
		t.Fatalf("write backend fixture without probe support: %v", err)
	}

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if len(runtimeResponse.List.Plugins) != 0 {
		t.Fatalf("expected no active list plugins, got %#v", runtimeResponse.List.Plugins)
	}
	if len(runtimeResponse.Status.Plugins) != 1 {
		t.Fatalf("expected one status plugin, got %#v", runtimeResponse.Status.Plugins)
	}

	statusEntry := runtimeResponse.Status.Plugins[0]
	if statusEntry.State != PluginRuntimeStateInvalid {
		t.Fatalf("expected invalid status entry, got %#v", statusEntry.State)
	}
	if len(statusEntry.Errors) != 1 {
		t.Fatalf("expected one backend probe error, got %#v", statusEntry.Errors)
	}
	if statusEntry.Errors[0].Code != string(ServiceErrorCodeBackendRuntimeInvalid) {
		t.Fatalf("expected backend runtime invalid error code, got %#v", statusEntry.Errors[0])
	}
}

func TestServiceRuntimeMarksBackendPluginInvalidWhenBackendBuildFails(t *testing.T) {
	// Backend build failures should surface as invalid plugins instead of crashing runtime reads.
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerRouter"}
	})
	if err := os.WriteFile(
		filepath.Join(pluginRoot, "backend", "main.go"),
		[]byte("package main\n\nfunc main( {\n"),
		0o644,
	); err != nil {
		t.Fatalf("write backend fixture with invalid Go syntax: %v", err)
	}

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if len(runtimeResponse.List.Plugins) != 0 {
		t.Fatalf("expected no active list plugins, got %#v", runtimeResponse.List.Plugins)
	}
	if len(runtimeResponse.Status.Plugins) != 1 {
		t.Fatalf("expected one status plugin, got %#v", runtimeResponse.Status.Plugins)
	}

	statusEntry := runtimeResponse.Status.Plugins[0]
	if statusEntry.State != PluginRuntimeStateInvalid {
		t.Fatalf("expected invalid status entry, got %#v", statusEntry.State)
	}
	if len(statusEntry.Errors) != 1 {
		t.Fatalf("expected one backend build error, got %#v", statusEntry.Errors)
	}
	if statusEntry.Errors[0].Code != string(ServiceErrorCodeBackendRuntimeInvalid) {
		t.Fatalf("expected backend runtime invalid error code, got %#v", statusEntry.Errors[0])
	}
	if !strings.Contains(statusEntry.Errors[0].Message, "Plugin backend entrypoint must be valid Go source") {
		t.Fatalf("expected backend build failure message, got %#v", statusEntry.Errors[0].Message)
	}
}

func TestServiceRuntimeMarksBackendPluginInvalidWhenBackendProbeTimesOut(t *testing.T) {
	// Hung backend probes should fail closed instead of stalling runtime/status reads indefinitely.
	previousTimeout := backendProbeTimeout
	backendProbeTimeout = 50 * time.Millisecond
	t.Cleanup(func() {
		backendProbeTimeout = previousTimeout
	})

	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerRouter"}
	})
	if err := os.WriteFile(
		filepath.Join(pluginRoot, "backend", "main.go"),
		[]byte("package main\n\nimport (\n\t\"os\"\n\t\"time\"\n)\n\nconst backendProbeArg = \"--setta-plugin-backend-probe\"\n\nfunc main() {\n\tif len(os.Args) == 2 && os.Args[1] == backendProbeArg {\n\t\ttime.Sleep(200 * time.Millisecond)\n\t}\n}\n"),
		0o644,
	); err != nil {
		t.Fatalf("write backend fixture with hanging probe: %v", err)
	}

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if len(runtimeResponse.List.Plugins) != 0 {
		t.Fatalf("expected no active list plugins, got %#v", runtimeResponse.List.Plugins)
	}
	if len(runtimeResponse.Status.Plugins) != 1 {
		t.Fatalf("expected one status plugin, got %#v", runtimeResponse.Status.Plugins)
	}

	statusEntry := runtimeResponse.Status.Plugins[0]
	if statusEntry.State != PluginRuntimeStateInvalid {
		t.Fatalf("expected invalid status entry, got %#v", statusEntry.State)
	}
	if len(statusEntry.Errors) != 1 {
		t.Fatalf("expected one backend probe timeout error, got %#v", statusEntry.Errors)
	}
	if statusEntry.Errors[0].Code != string(ServiceErrorCodeBackendRuntimeInvalid) {
		t.Fatalf("expected backend runtime invalid error code, got %#v", statusEntry.Errors[0])
	}
	if !strings.Contains(statusEntry.Errors[0].Message, "Plugin backend runtime probe timed out") {
		t.Fatalf("expected backend probe timeout message, got %#v", statusEntry.Errors[0].Message)
	}
}

func TestServiceRuntimeMarksBackendPluginInvalidWhenGoModuleDependencyIsMissing(t *testing.T) {
	// Missing Go module dependencies should fail closed instead of backfilling a hidden runtime env.
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerRouter"}
	})
	if err := os.WriteFile(
		filepath.Join(pluginRoot, "backend", "main.go"),
		[]byte("package main\n\nimport (\n\t\"fmt\"\n\t\"github.com/google/uuid\"\n)\n\nfunc main() {\n\tfmt.Println(uuid.NewString())\n}\n"),
		0o644,
	); err != nil {
		t.Fatalf("write backend fixture with missing module dependency: %v", err)
	}

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if len(runtimeResponse.List.Plugins) != 0 {
		t.Fatalf("expected no active list plugins, got %#v", runtimeResponse.List.Plugins)
	}
	if len(runtimeResponse.Status.Plugins) != 1 {
		t.Fatalf("expected one status plugin, got %#v", runtimeResponse.Status.Plugins)
	}

	statusEntry := runtimeResponse.Status.Plugins[0]
	if statusEntry.State != PluginRuntimeStateInvalid {
		t.Fatalf("expected invalid status entry, got %#v", statusEntry.State)
	}
	if len(statusEntry.Errors) != 1 {
		t.Fatalf("expected one backend dependency error, got %#v", statusEntry.Errors)
	}
	if statusEntry.Errors[0].Code != string(ServiceErrorCodeBackendRuntimeInvalid) {
		t.Fatalf("expected backend runtime invalid error code, got %#v", statusEntry.Errors[0])
	}
}

func TestServiceResolveAssetPathRejectsTraversalAndNonFrontendFiles(t *testing.T) {
	// Asset resolution should allow declared frontend files only.
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "full")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/index.js"
		frontend["style"] = "frontend/src/index.css"
	})
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	assetPath, err := service.ResolveAssetPath("setta-fixture-full", "frontend/src/index.js")
	if err != nil {
		t.Fatalf("resolve frontend asset: %v", err)
	}
	if !strings.HasSuffix(assetPath, filepath.ToSlash("frontend/src/index.js")) && !strings.HasSuffix(assetPath, filepath.Join("frontend", "src", "index.js")) {
		t.Fatalf("unexpected frontend asset path %q", assetPath)
	}

	_, err = service.ResolveAssetPath("setta-fixture-full", "../setta.plugin.json")
	if err == nil {
		t.Fatal("expected traversal to fail")
	}
	var traversalErr *ServiceError
	if !errors.As(err, &traversalErr) || traversalErr.Code != ServiceErrorCodeAssetInvalidPath {
		t.Fatalf("expected asset invalid path error, got %v", err)
	}

	_, err = service.ResolveAssetPath("setta-fixture-full", "backend/main.go")
	if err == nil {
		t.Fatal("expected backend file lookup to fail")
	}
	var notFoundErr *ServiceError
	if !errors.As(err, &notFoundErr) || notFoundErr.Code != ServiceErrorCodeAssetNotFound {
		t.Fatalf("expected asset not found error, got %v", err)
	}
}

func testRuntimeAssetURLBuilder(pluginID string, relativePath string, sourceDigestSHA256 *string) string {
	encodedSegments := []string{url.PathEscape(pluginID)}
	for _, segment := range strings.Split(relativePath, "/") {
		if segment == "" {
			continue
		}
		encodedSegments = append(encodedSegments, url.PathEscape(segment))
	}
	baseURL := "/plugins/" + strings.Join(encodedSegments, "/")
	if sourceDigestSHA256 == nil {
		return baseURL
	}
	return baseURL + "?v=" + url.QueryEscape(*sourceDigestSHA256)
}

func mustFindRuntimeListEntry(t *testing.T, entries []PluginListEntry, pluginID string) PluginListEntry {
	t.Helper()

	for _, entry := range entries {
		if entry.PluginID == pluginID {
			return entry
		}
	}
	t.Fatalf("expected runtime list entry %q", pluginID)
	return PluginListEntry{}
}

func assertSameScopeSourceManagerRedactionDistinct(t *testing.T, entries []PluginStatusEntry) {
	t.Helper()

	sourcePaths := map[string]struct{}{}
	canonicalSourceKeys := map[string]struct{}{}
	entryCount := 0
	for _, entry := range entries {
		if entry.PluginID != "setta-fixture-frontend" || entry.SourceScope != PluginScopeSettaFiles {
			continue
		}
		entryCount++
		sourcePaths[entry.SourcePath] = struct{}{}
		canonicalSourceKeys[entry.CanonicalSourceKey] = struct{}{}
	}
	if entryCount != 2 {
		t.Fatalf("expected two same-scope status entries, got %#v", entries)
	}
	if len(sourcePaths) != 2 {
		t.Fatalf("expected distinct redacted source paths across source managers, got %#v", sourcePaths)
	}
	if len(canonicalSourceKeys) != 2 {
		t.Fatalf("expected distinct redacted canonical source keys across source managers, got %#v", canonicalSourceKeys)
	}
}

func assertBackendRegistrationStatusEntry(t *testing.T, statusEntry PluginStatusEntry) {
	t.Helper()

	if statusEntry.State != PluginRuntimeStateActive {
		t.Fatalf("expected active backend fixture, got %#v", statusEntry.State)
	}
	assertBackendCodegenRegistration(t, statusEntry.RegisteredCodegenTargets)
	assertBackendRouteRegistrations(t, statusEntry.RegisteredBackendRoutes)
	assertBackendStaticDirRegistration(t, statusEntry.RegisteredStaticDirs)
	assertBackendListenerEndpointRegistration(t, statusEntry.RegisteredListenerEndpoints)
}

func assertBackendCodegenRegistration(t *testing.T, targets []PluginRegisteredCodegenTarget) {
	t.Helper()

	if len(targets) != 1 {
		t.Fatalf("expected one codegen target, got %#v", targets)
	}
	got := targets[0]
	if got.TargetID != "typescript" || got.PluginID != "setta-fixture-backend" || got.Language != "setta-fixture-backend-codegen:typescript" || got.Name != "Fixture TypeScript State" || got.DefaultFileName != "fixture_state.ts" {
		t.Fatalf("unexpected codegen target registration %#v", got)
	}
}

func assertBackendRouteRegistrations(t *testing.T, routes []PluginRegisteredBackendRoute) {
	t.Helper()

	if len(routes) != 2 {
		t.Fatalf("expected two backend routes, got %#v", routes)
	}
	if got := routes[0]; got.Path != "/health" || len(got.Methods) != 1 || got.Methods[0] != "GET" {
		t.Fatalf("unexpected first backend route %#v", got)
	}
	if got := routes[1]; got.Path != "/items" || len(got.Methods) != 2 || got.Methods[0] != "DELETE" || got.Methods[1] != "POST" {
		t.Fatalf("unexpected second backend route %#v", got)
	}
}

func assertBackendStaticDirRegistration(t *testing.T, staticDirs []PluginRegisteredStaticDir) {
	t.Helper()

	if len(staticDirs) != 1 {
		t.Fatalf("expected one static dir, got %#v", staticDirs)
	}
	if got := staticDirs[0]; got.RoutePrefix != "/static" || got.Dir != "backend/static" {
		t.Fatalf("unexpected static dir registration %#v", got)
	}
}

func assertBackendListenerEndpointRegistration(t *testing.T, endpoints []PluginRegisteredListenerEndpoint) {
	t.Helper()

	if len(endpoints) != 1 {
		t.Fatalf("expected one listener endpoint, got %#v", endpoints)
	}
	if got := endpoints[0].Name; got != "route_backend_fixture_ping" {
		t.Fatalf("unexpected listener endpoint %q", got)
	}
}

func newLinkedBackendRegistrationService(t *testing.T) *Service {
	t.Helper()

	preparePluginLanguageServerFixture(t)
	roots := newFilesystemResolverTestRoots(t)
	repoRoot := workerRPCTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", "backend")
	linkedRoot := filepath.Join(t.TempDir(), "backend-linked")
	copyBackendCodegenFixtureDir(t, sourceRoot, linkedRoot)
	rewritePluginManifest(t, linkedRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{
			"registerCodegenTarget",
			"registerLanguageServer",
			"registerRouter",
			"registerStaticDir",
			"registerListenerEndpoint",
		}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	linkResult, err := service.Link(LinkOptions{
		LocalPluginRoot: linkedRoot,
		Scope:           scopePointer(PluginScopeWorkspace),
		Enable:          true,
	})
	if err != nil {
		t.Fatalf("link backend plugin: %v", err)
	}
	if !linkResult.RestartRequired || linkResult.State != PluginRuntimeStatePendingRestart {
		t.Fatalf("expected linked backend plugin to require refresh, got %#v", linkResult)
	}
	if _, err := service.CommitBackendRuntimeRefresh(); err != nil {
		t.Fatalf("commit backend runtime refresh after link: %v", err)
	}
	return service
}

func assertBackendRegistrationsPresentAfterRefresh(t *testing.T, service *Service) {
	t.Helper()

	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime payload after link refresh: %v", err)
	}
	if len(runtimeResponse.Status.Plugins) != 1 {
		t.Fatalf("expected one runtime status plugin, got %#v", runtimeResponse.Status.Plugins)
	}
	languageServerSpecs, err := service.LanguageServerSpecs(context.Background(), map[string]*string{
		"fixturedsl": stringPointer("setta-fixture-backend"),
	})
	if err != nil {
		t.Fatalf("load language server specs after link refresh: %v", err)
	}
	if len(languageServerSpecs) != 1 {
		t.Fatalf("expected one language server spec after link refresh, got %#v", languageServerSpecs)
	}
	statusEntry := runtimeResponse.Status.Plugins[0]
	if len(statusEntry.RegisteredCodegenTargets) != 1 ||
		len(statusEntry.RegisteredBackendRoutes) != 2 ||
		len(statusEntry.RegisteredStaticDirs) != 1 ||
		len(statusEntry.RegisteredListenerEndpoints) != 1 {
		t.Fatalf("expected backend registrations after refresh, got %#v", statusEntry)
	}
}

func uninstallBackendFixtureAndCommitRefresh(t *testing.T, service *Service) {
	t.Helper()

	uninstallResult, err := service.Uninstall(context.Background(), UninstallOptions{
		PluginID: "setta-fixture-backend",
		Scope:    scopePointer(PluginScopeWorkspace),
	})
	if err != nil {
		t.Fatalf("uninstall backend plugin: %v", err)
	}
	if !uninstallResult.RestartRequired {
		t.Fatalf("expected backend uninstall to require refresh")
	}
	if _, err := service.CommitBackendRuntimeRefresh(); err != nil {
		t.Fatalf("commit backend runtime refresh after uninstall: %v", err)
	}
}

func assertBackendRegistrationsClearedAfterUninstall(t *testing.T, service *Service) {
	t.Helper()

	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime payload after uninstall refresh: %v", err)
	}
	if len(runtimeResponse.List.Plugins) != 0 || len(runtimeResponse.Status.Plugins) != 0 {
		t.Fatalf("expected backend registrations to clear after uninstall refresh, got list=%#v status=%#v", runtimeResponse.List.Plugins, runtimeResponse.Status.Plugins)
	}
	languageServerSpecs, err := service.LanguageServerSpecs(context.Background(), map[string]*string{
		"fixturedsl": stringPointer("setta-fixture-backend"),
	})
	if err != nil {
		t.Fatalf("load language server specs after uninstall refresh: %v", err)
	}
	if len(languageServerSpecs) != 0 {
		t.Fatalf("expected language server specs to clear after uninstall refresh, got %#v", languageServerSpecs)
	}
}
