package plugins

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	backendruntime "setta/internal/appsubsystem/backendruntime"
	"setta/internal/config"
	"setta/internal/testutil/firstpartyplugin"
	"setta/internal/watchcodecontracts"
)

// Rescan should preserve the documented workspace > setta_files > global precedence and keep shadowed entries visible.
func TestDiscoveryServiceRescanHonorsScopePrecedence(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	globalRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeGlobal, "backend")
	settaFilesRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeSettaFiles, "backend")
	workspaceRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")

	rewritePluginManifest(t, workspaceRoot, func(payload map[string]any) {
		payload["version"] = "0.3.0"
	})
	rewritePluginManifest(t, settaFilesRoot, func(payload map[string]any) {
		payload["version"] = "0.2.0"
	})
	rewritePluginManifest(t, globalRoot, func(payload map[string]any) {
		payload["version"] = "0.1.0"
	})

	service := mustNewDiscoveryService(t, roots, config.ModeIDE)
	snapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("rescan plugins: %v", err)
	}

	if snapshot.InstalledPlugins != 1 {
		t.Fatalf("expected 1 installed plugin, got %d", snapshot.InstalledPlugins)
	}
	if snapshot.ActivePlugins != 1 {
		t.Fatalf("expected 1 active plugin, got %d", snapshot.ActivePlugins)
	}
	if len(snapshot.Plugins) != 3 {
		t.Fatalf("expected 3 discovered entries, got %d", len(snapshot.Plugins))
	}

	active := snapshot.Plugins[0]
	if active.Scope != PluginScopeWorkspace || active.State != PluginRuntimeStateActive {
		t.Fatalf("expected workspace entry to be active, got scope=%q state=%q", active.Scope, active.State)
	}
	if active.ShadowedBySourcePath != "" {
		t.Fatalf("expected active entry not to be shadowed, got %q", active.ShadowedBySourcePath)
	}

	shadowedSettaFiles := snapshot.Plugins[1]
	if shadowedSettaFiles.Scope != PluginScopeSettaFiles || shadowedSettaFiles.State != PluginRuntimeStateShadowed {
		t.Fatalf("expected setta_files entry to be shadowed, got scope=%q state=%q", shadowedSettaFiles.Scope, shadowedSettaFiles.State)
	}
	if shadowedSettaFiles.ShadowedBySourcePath != workspaceRoot {
		t.Fatalf("expected setta_files shadow path %q, got %q", workspaceRoot, shadowedSettaFiles.ShadowedBySourcePath)
	}

	shadowedGlobal := snapshot.Plugins[2]
	if shadowedGlobal.Scope != PluginScopeGlobal || shadowedGlobal.State != PluginRuntimeStateShadowed {
		t.Fatalf("expected global entry to be shadowed, got scope=%q state=%q", shadowedGlobal.Scope, shadowedGlobal.State)
	}
	if shadowedGlobal.ShadowedBySourcePath != workspaceRoot {
		t.Fatalf("expected global shadow path %q, got %q", workspaceRoot, shadowedGlobal.ShadowedBySourcePath)
	}
}

func TestDiscoveryServiceDeploymentScopedIgnoresHostGlobalAndPackageManagerPlugins(
	t *testing.T,
) {
	roots := newFilesystemResolverTestRoots(t)
	copyPluginFixtureToScope(t, roots, filesystemPluginScopeGlobal, "backend")
	sitePackages, _ := installPackageManagerFixture(
		t,
		"frontend",
		"setta-fixture-frontend",
		"0.1.0",
		nil,
	)

	service, err := NewDiscoveryService(DiscoveryServiceOptions{
		WorkspaceRoot:             roots.workspaceRoot,
		SettaFilesRoot:            roots.settaFilesRoot,
		SettaHome:                 roots.settaHome,
		ServerMode:                config.ModeApp,
		DeploymentScoped:          true,
		PackageManagerRuntime:     mustNewPythonRuntime(t),
		PackageManagerSearchPaths: []string{sitePackages},
	})
	if err != nil {
		t.Fatalf("new deployment-scoped discovery service: %v", err)
	}
	snapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("rescan deployment-scoped plugins: %v", err)
	}
	if len(snapshot.Plugins) != 0 || snapshot.InstalledPlugins != 0 || snapshot.ActivePlugins != 0 {
		t.Fatalf("expected deployment-scoped discovery to ignore host plugins, got %#v", snapshot)
	}
}

// Rescan should surface disabled and pending-restart states from persisted plugin state instead of flattening them into active.
func TestDiscoveryServiceRescanUsesPersistedEnablementAndRestartState(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	workspacePluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	settaFilesPluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeSettaFiles, "full")

	writeJSONFile(t, filepath.Join(roots.settaFilesRoot, "plugins_state.json"), map[string]any{
		"disabledPluginIds":              []string{"setta-fixture-backend"},
		"pendingRestartBackendPluginIds": []string{"setta-fixture-full"},
	})

	service := mustNewDiscoveryService(t, roots, config.ModeIDE)
	snapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("rescan plugins: %v", err)
	}
	if snapshot.InstalledPlugins != 2 {
		t.Fatalf("expected 2 installed plugins, got %d", snapshot.InstalledPlugins)
	}
	if snapshot.ActivePlugins != 1 {
		t.Fatalf("expected 1 active/pending plugin, got %d", snapshot.ActivePlugins)
	}

	disabled := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-fixture-backend", PluginScopeWorkspace)
	if disabled.State != PluginRuntimeStateDisabled {
		t.Fatalf("expected disabled workspace plugin, got %q", disabled.State)
	}
	if disabled.SourcePath != workspacePluginRoot {
		t.Fatalf("expected workspace source path %q, got %q", workspacePluginRoot, disabled.SourcePath)
	}
	if disabled.EnablementSource == nil || *disabled.EnablementSource != PluginEnablementSourceWorkspaceDisabled {
		t.Fatalf("expected workspace disabled enablement source, got %#v", disabled.EnablementSource)
	}

	pendingRestart := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-fixture-full", PluginScopeSettaFiles)
	if pendingRestart.State != PluginRuntimeStatePendingRestart {
		t.Fatalf("expected pending restart plugin, got %q", pendingRestart.State)
	}
	if pendingRestart.SourcePath != settaFilesPluginRoot {
		t.Fatalf("expected setta_files source path %q, got %q", settaFilesPluginRoot, pendingRestart.SourcePath)
	}
	if !pendingRestart.RestartRequired {
		t.Fatalf("expected pending restart plugin to require restart")
	}
}

func TestDiscoveryServiceRescanUsesGlobalAutoEnableSource(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	globalPluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeGlobal, "frontend")
	writeJSONFile(t, filepath.Join(roots.settaHome, "plugins_global_state.json"), map[string]any{
		"autoEnabledPluginIds": []string{"setta-fixture-frontend"},
	})

	service := mustNewDiscoveryService(t, roots, config.ModeIDE)
	snapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("rescan plugins: %v", err)
	}

	entry := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-fixture-frontend", PluginScopeGlobal)
	if entry.State != PluginRuntimeStateActive {
		t.Fatalf("expected active global plugin, got %q", entry.State)
	}
	if entry.SourcePath != globalPluginRoot {
		t.Fatalf("expected global source path %q, got %q", globalPluginRoot, entry.SourcePath)
	}
	if entry.EnablementSource == nil || *entry.EnablementSource != PluginEnablementSourceGlobalAutoEnabled {
		t.Fatalf("expected global auto-enabled source, got %#v", entry.EnablementSource)
	}
}

// Invalid manifests should remain visible to rescan, and canonical source keys should prefer persisted install metadata when present.
func TestDiscoveryServiceRescanKeepsInvalidEntriesAndMetadataCanonicalSourceKey(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := filepath.Join(roots.workspaceRoot, ".setta_plugins", "broken-plugin")
	if err := os.MkdirAll(pluginRoot, 0o755); err != nil {
		t.Fatalf("mkdir broken plugin root: %v", err)
	}
	writeJSONFile(t, filepath.Join(roots.settaFilesRoot, "plugins_install_metadata.json"), map[string]any{
		"entries": map[string]any{
			"workspace:broken-plugin": map[string]any{
				"pluginId":           "broken-plugin",
				"scope":              "workspace",
				"sourceSpec":         "github:owner/broken-plugin",
				"canonicalSourceKey": "github:owner/broken-plugin#main",
				"version":            "0.1.0",
				"history":            []any{},
			},
		},
	})

	service := mustNewDiscoveryService(t, roots, config.ModeIDE)
	snapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("rescan plugins: %v", err)
	}
	if snapshot.InstalledPlugins != 1 {
		t.Fatalf("expected 1 installed invalid plugin, got %d", snapshot.InstalledPlugins)
	}
	if snapshot.ActivePlugins != 0 {
		t.Fatalf("expected 0 active plugins, got %d", snapshot.ActivePlugins)
	}

	entry := mustFindDiscoveredPlugin(t, snapshot.Plugins, "broken-plugin", PluginScopeWorkspace)
	if entry.State != PluginRuntimeStateInvalid {
		t.Fatalf("expected invalid plugin state, got %q", entry.State)
	}
	if entry.CanonicalSourceKey != "github:owner/broken-plugin#main" {
		t.Fatalf("expected metadata canonical source key, got %q", entry.CanonicalSourceKey)
	}
	if len(entry.Errors) != 1 || entry.Errors[0].Code != "PLUGIN_SOURCE_MANIFEST_NOT_FOUND" {
		t.Fatalf("expected missing manifest error, got %#v", entry.Errors)
	}
}

func TestDiscoveryServiceRescanMarksPersistedCorruptPluginConfigRootInvalid(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "full")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		delete(payload, "backend")
	})
	schemaPath := filepath.Join(pluginRoot, "content", "config", "schema.json")
	schemaPayloadBytes, err := os.ReadFile(schemaPath)
	if err != nil {
		t.Fatalf("read plugin schema: %v", err)
	}
	var schemaPayload map[string]any
	if err := json.Unmarshal(schemaPayloadBytes, &schemaPayload); err != nil {
		t.Fatalf("decode plugin schema: %v", err)
	}
	schemaPayload["required"] = []any{}
	writeJSONFile(t, schemaPath, schemaPayload)
	writeJSONFile(t, filepath.Join(roots.settaFilesRoot, "plugins_state.json"), map[string]any{
		"pluginConfigById": map[string]any{
			string(PluginScopeWorkspace) + ":setta-fixture-full": "invalid-root",
		},
	})

	service := mustNewDiscoveryService(t, roots, config.ModeIDE)
	snapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("rescan plugins: %v", err)
	}
	if snapshot.InstalledPlugins != 1 {
		t.Fatalf("expected 1 installed invalid plugin, got %d", snapshot.InstalledPlugins)
	}
	if snapshot.ActivePlugins != 0 {
		t.Fatalf("expected 0 active plugins, got %d", snapshot.ActivePlugins)
	}

	entry := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-fixture-full", PluginScopeWorkspace)
	if entry.State != PluginRuntimeStateInvalid {
		t.Fatalf("expected invalid plugin state, got %q", entry.State)
	}
	if len(entry.Errors) != 1 {
		t.Fatalf("expected one config-root error, got %#v", entry.Errors)
	}
	if entry.Errors[0].Code != string(ServiceErrorCodeConfigInvalid) {
		t.Fatalf("expected config invalid error code, got %#v", entry.Errors[0])
	}
	if entry.Errors[0].Message != "Plugin config for setta-fixture-full must be a JSON object." {
		t.Fatalf("expected config-root error message, got %#v", entry.Errors[0].Message)
	}
}

func TestApplyBackendProbeRegistrationsHonorsEffectiveCapabilities(t *testing.T) {
	t.Parallel()

	entry := &DiscoveredPlugin{
		EffectiveCapabilities: []string{
			"registerRouter",
			"registerStaticDir",
			"registerAppSubsystemBackend",
			"registerWatchCodeBackend",
			"registerUISettings",
		},
	}
	probe := backendProbeResponse{
		CodegenTargets: []PluginRegisteredCodegenTarget{
			{PluginID: "setta-fixture-backend", TargetID: "typescript"},
		},
		LanguageServers: []PluginRegisteredLanguageServer{
			{PluginID: "setta-fixture-backend", Name: "fixture-language-server"},
		},
		UISettings: []PluginRegisteredUISetting{
			{PluginID: "setta-fixture-backend", LocalSettingID: "fixture-setting"},
		},
		Routes: []PluginRegisteredBackendRoute{
			{Path: "/health", Methods: []string{"GET"}},
		},
		StaticDirs: []PluginRegisteredStaticDir{
			{RoutePrefix: "/static", Dir: "backend/static"},
		},
		AppSubsystemBackend: &backendProbeAppSubsystemBackendRegistration{
			ContractVersion: backendruntime.AppSubsystemBackendContractVersion,
			ListenerEndpoints: []PluginRegisteredListenerEndpoint{
				{Name: "appsubsystem_get_app_definition"},
			},
		},
		WatchCodeBackend: &backendProbeWatchCodeBackendRegistration{
			ContractVersion:        watchcodecontracts.BackendContractVersion,
			DataSchemaVersion:      watchcodecontracts.BackendDataSchemaVersion,
			Languages:              []string{"python"},
			RequiresLanguageServer: true,
		},
	}

	resetBackendRegistrations(entry)
	applyBackendProbeRegistrations(entry, probe)

	assertBackendProbeEffectiveCapabilityRegistrations(t, entry)
	assertBackendProbeRegistrationsAreCloned(t, entry, probe)
	assertBackendProbeUISettingsRequireCapability(t)
}

func assertBackendProbeEffectiveCapabilityRegistrations(t *testing.T, entry *DiscoveredPlugin) {
	t.Helper()

	if len(entry.RegisteredCodegenTargets) != 0 {
		t.Fatalf("expected codegen targets to stay empty without effective capability, got %#v", entry.RegisteredCodegenTargets)
	}
	if len(entry.RegisteredLanguageServers) != 0 {
		t.Fatalf("expected language servers to stay empty without effective capability, got %#v", entry.RegisteredLanguageServers)
	}
	if len(entry.RegisteredBackendRoutes) != 1 || entry.RegisteredBackendRoutes[0].Path != "/health" {
		t.Fatalf("expected backend routes to be populated, got %#v", entry.RegisteredBackendRoutes)
	}
	if len(entry.RegisteredStaticDirs) != 1 || entry.RegisteredStaticDirs[0].RoutePrefix != "/static" {
		t.Fatalf("expected static dirs to be populated, got %#v", entry.RegisteredStaticDirs)
	}
	if len(entry.RegisteredListenerEndpoints) != 0 {
		t.Fatalf("expected listener endpoints to stay empty without effective capability, got %#v", entry.RegisteredListenerEndpoints)
	}
	if len(entry.RegisteredUISettings) != 1 || entry.RegisteredUISettings[0].LocalSettingID != "fixture-setting" {
		t.Fatalf("expected ui settings to be copied from the probe, got %#v", entry.RegisteredUISettings)
	}
	if entry.appSubsystemBackend == nil || entry.appSubsystemBackend.ContractVersion != backendruntime.AppSubsystemBackendContractVersion {
		t.Fatalf("expected app subsystem backend registration to be copied, got %#v", entry.appSubsystemBackend)
	}
	if entry.watchCodeBackend == nil || entry.watchCodeBackend.ContractVersion != watchcodecontracts.BackendContractVersion {
		t.Fatalf("expected watch code backend registration to be copied, got %#v", entry.watchCodeBackend)
	}
	if len(entry.appSubsystemListenerEndpoints) != 1 || entry.appSubsystemListenerEndpoints[0].Name != "appsubsystem_get_app_definition" {
		t.Fatalf("expected app subsystem listener endpoint to be copied privately, got %#v", entry.appSubsystemListenerEndpoints)
	}
}

func assertBackendProbeRegistrationsAreCloned(
	t *testing.T,
	entry *DiscoveredPlugin,
	probe backendProbeResponse,
) {
	t.Helper()

	probe.UISettings[0].LocalSettingID = "mutated"
	if entry.RegisteredUISettings[0].LocalSettingID != "fixture-setting" {
		t.Fatalf("expected registered ui settings to be cloned, got %#v", entry.RegisteredUISettings)
	}
	probe.AppSubsystemBackend.ContractVersion = 999
	if entry.appSubsystemBackend.ContractVersion != backendruntime.AppSubsystemBackendContractVersion {
		t.Fatalf("expected app subsystem backend registration to be cloned, got %#v", entry.appSubsystemBackend)
	}
	probe.AppSubsystemBackend.ListenerEndpoints[0].Name = "mutated"
	if entry.appSubsystemListenerEndpoints[0].Name != "appsubsystem_get_app_definition" {
		t.Fatalf("expected app subsystem listener endpoints to be cloned, got %#v", entry.appSubsystemListenerEndpoints)
	}
	probe.WatchCodeBackend.Languages[0] = "mutated"
	if entry.watchCodeBackend.Languages[0] != "python" {
		t.Fatalf("expected watch code backend registration to be cloned, got %#v", entry.watchCodeBackend)
	}
}

func assertBackendProbeUISettingsRequireCapability(t *testing.T) {
	t.Helper()

	withoutUISettingsCapability := &DiscoveredPlugin{
		EffectiveCapabilities: []string{"registerRouter"},
	}
	applyBackendProbeRegistrations(withoutUISettingsCapability, backendProbeResponse{
		UISettings: []PluginRegisteredUISetting{
			{PluginID: "setta-fixture-backend", LocalSettingID: "fixture-setting"},
		},
		Routes: []PluginRegisteredBackendRoute{
			{Path: "/health", Methods: []string{"GET"}},
		},
	})
	if len(withoutUISettingsCapability.RegisteredUISettings) != 0 {
		t.Fatalf("expected ui settings to require registerUISettings, got %#v", withoutUISettingsCapability.RegisteredUISettings)
	}
}

// Package-manager discovery should surface environment-managed plugins in setta_files precedence ahead of global Setta-managed copies.
func TestDiscoveryServiceRescanIncludesPackageManagerEntriesAndPrecedence(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	globalRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeGlobal, "frontend")
	rewritePluginManifest(t, globalRoot, func(payload map[string]any) {
		payload["version"] = "0.1.0"
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/index.js"
		frontend["style"] = "frontend/src/index.css"
	})

	sitePackages, packageManagerRoot := installPackageManagerFixture(
		t,
		"frontend",
		"setta-fixture-frontend",
		"0.3.0",
		func(pluginRoot string) {
			rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
				payload["version"] = "0.3.0"
				frontend := payload["frontend"].(map[string]any)
				frontend["entrypoint"] = "frontend/src/index.js"
				frontend["style"] = "frontend/src/index.css"
			})
		},
	)

	service := mustNewDiscoveryServiceWithPackageManager(t, roots, config.ModeIDE, []string{sitePackages})
	snapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("rescan plugins with package manager discovery: %v", err)
	}

	if snapshot.InstalledPlugins != 1 {
		t.Fatalf("expected 1 installed plugin, got %d", snapshot.InstalledPlugins)
	}
	if snapshot.ActivePlugins != 1 {
		t.Fatalf("expected 1 active plugin, got %d", snapshot.ActivePlugins)
	}
	if len(snapshot.Plugins) != 2 {
		t.Fatalf("expected 2 discovered entries, got %d", len(snapshot.Plugins))
	}

	packageManagerEntry := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-fixture-frontend", PluginScopeSettaFiles)
	if packageManagerEntry.SourceManager != PluginSourceManagerPackageManager {
		t.Fatalf("expected package-manager source manager, got %q", packageManagerEntry.SourceManager)
	}
	if packageManagerEntry.State != PluginRuntimeStateActive {
		t.Fatalf("expected package-manager plugin to be active, got %q", packageManagerEntry.State)
	}
	resolvedPackageManagerRoot, err := filepath.EvalSymlinks(packageManagerRoot)
	if err != nil {
		t.Fatalf("resolve package-manager root symlinks: %v", err)
	}
	if packageManagerEntry.SourcePath != resolvedPackageManagerRoot {
		t.Fatalf("expected package-manager root %q, got %q", resolvedPackageManagerRoot, packageManagerEntry.SourcePath)
	}
	if packageManagerEntry.SourceManagerHint != packageManagerSourceHint {
		t.Fatalf("unexpected package-manager hint %q", packageManagerEntry.SourceManagerHint)
	}

	globalEntry := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-fixture-frontend", PluginScopeGlobal)
	if globalEntry.State != PluginRuntimeStateShadowed {
		t.Fatalf("expected global plugin to be shadowed, got %q", globalEntry.State)
	}
	if globalEntry.ShadowedBySourcePath != resolvedPackageManagerRoot {
		t.Fatalf("expected global shadow path %q, got %q", resolvedPackageManagerRoot, globalEntry.ShadowedBySourcePath)
	}
}

func TestDiscoveryServiceRescanKeepsDistinctPackageManagerRootsPerDistribution(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	sitePackages, frontendRoot := installPackageManagerFixture(
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
	contentRoot := installPackageManagerFixtureInSearchPath(
		t,
		sitePackages,
		"content",
		"setta-fixture-content",
		"0.1.0",
		nil,
	)

	service := mustNewDiscoveryServiceWithPackageManager(t, roots, config.ModeIDE, []string{sitePackages})
	snapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("rescan plugins with side-by-side package-manager roots: %v", err)
	}

	frontendEntry := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-fixture-frontend", PluginScopeSettaFiles)
	contentEntry := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-fixture-content", PluginScopeSettaFiles)
	if frontendEntry.SourcePath == contentEntry.SourcePath {
		t.Fatalf("expected distinct package-manager source paths, got %q", frontendEntry.SourcePath)
	}

	resolvedFrontendRoot, err := filepath.EvalSymlinks(frontendRoot)
	if err != nil {
		t.Fatalf("resolve frontend package-manager root symlinks: %v", err)
	}
	resolvedContentRoot, err := filepath.EvalSymlinks(contentRoot)
	if err != nil {
		t.Fatalf("resolve content package-manager root symlinks: %v", err)
	}
	if frontendEntry.SourcePath != resolvedFrontendRoot {
		t.Fatalf("expected frontend package-manager root %q, got %q", resolvedFrontendRoot, frontendEntry.SourcePath)
	}
	if contentEntry.SourcePath != resolvedContentRoot {
		t.Fatalf("expected content package-manager root %q, got %q", resolvedContentRoot, contentEntry.SourcePath)
	}
}

func TestDiscoveryServiceRescanPrefersUsableLowerPrecedenceBasedpyrightWhenWorkspaceCopyIsInvalid(t *testing.T) {
	pythonPath := firstpartyplugin.BasedpyrightPython(t)
	t.Setenv("SETTA_PYTHON", pythonPath)

	roots := newFilesystemResolverTestRoots(t)
	repoRoot := workerRPCTestRepoRoot(t)
	workspaceRoot := filepath.Join(pluginScopeRoot(roots, filesystemPluginScopeWorkspace), "setta-basedpyright")
	copyBackendCodegenFixtureDir(t, filepath.Join(repoRoot, "plugins", "setta-basedpyright"), workspaceRoot)
	if err := os.WriteFile(filepath.Join(workspaceRoot, "content", "config", "schema.json"), []byte("{bad-json"), 0o644); err != nil {
		t.Fatalf("write invalid workspace schema: %v", err)
	}

	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	packageManagerRoot := installFirstPartyBasedpyrightPackageManagerPluginInSearchPath(t, sitePackages)

	service := mustNewDiscoveryServiceWithPackageManager(t, roots, config.ModeIDE, []string{sitePackages})
	snapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("rescan plugins with invalid workspace duplicate: %v", err)
	}

	if snapshot.InstalledPlugins != 2 {
		t.Fatalf("expected both visible installed duplicates, got %d", snapshot.InstalledPlugins)
	}
	if snapshot.ActivePlugins != 1 {
		t.Fatalf("expected one active duplicate, got %d", snapshot.ActivePlugins)
	}

	invalidEntry := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-basedpyright", PluginScopeWorkspace)
	if invalidEntry.State != PluginRuntimeStateInvalid {
		t.Fatalf("expected invalid workspace duplicate, got %#v", invalidEntry)
	}
	if invalidEntry.ShadowedBySourcePath != "" {
		t.Fatalf("expected invalid workspace duplicate to stay visible, got %#v", invalidEntry.ShadowedBySourcePath)
	}
	if len(invalidEntry.Errors) != 1 || invalidEntry.Errors[0].Code != string(ServiceErrorCodeConfigSchemaInvalid) {
		t.Fatalf("expected config schema error on invalid workspace duplicate, got %#v", invalidEntry.Errors)
	}

	activeEntry := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-basedpyright", PluginScopeSettaFiles)
	if activeEntry.SourceManager != PluginSourceManagerPackageManager || activeEntry.State != PluginRuntimeStateActive {
		t.Fatalf("expected active package-manager duplicate, got %#v", activeEntry)
	}
	if activeEntry.ShadowedBySourcePath != "" {
		t.Fatalf("expected active package-manager duplicate to stay unshadowed, got %#v", activeEntry.ShadowedBySourcePath)
	}
	resolvedPackageManagerRoot, err := filepath.EvalSymlinks(packageManagerRoot)
	if err != nil {
		t.Fatalf("resolve package-manager root symlinks: %v", err)
	}
	if activeEntry.SourcePath != resolvedPackageManagerRoot {
		t.Fatalf("expected package-manager root %q, got %q", resolvedPackageManagerRoot, activeEntry.SourcePath)
	}
	if len(activeEntry.RegisteredLanguageServers) != 1 || activeEntry.RegisteredLanguageServers[0].Language != "python" {
		t.Fatalf("expected active package-manager duplicate to keep its python registration, got %#v", activeEntry.RegisteredLanguageServers)
	}
}

func TestDiscoveryServiceRescanFallsBackToActiveLowerPrecedenceDuplicateWhenWorkspaceCopyDefaultsDisabled(t *testing.T) {
	pythonPath := firstpartyplugin.BasedpyrightPython(t)
	t.Setenv("SETTA_PYTHON", pythonPath)

	roots := newFilesystemResolverTestRoots(t)
	repoRoot := workerRPCTestRepoRoot(t)
	workspaceRoot := filepath.Join(pluginScopeRoot(roots, filesystemPluginScopeWorkspace), "setta-basedpyright")
	copyBackendCodegenFixtureDir(t, filepath.Join(repoRoot, "plugins", "setta-basedpyright"), workspaceRoot)
	rewritePluginManifest(t, workspaceRoot, func(payload map[string]any) {
		payload["enabledByDefault"] = false
	})

	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	packageManagerRoot := installFirstPartyBasedpyrightPackageManagerPluginInSearchPath(t, sitePackages)

	service := mustNewDiscoveryServiceWithPackageManager(t, roots, config.ModeIDE, []string{sitePackages})
	snapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("rescan plugins with disabled workspace duplicate: %v", err)
	}

	if snapshot.InstalledPlugins != 2 {
		t.Fatalf("expected both visible installed duplicates, got %d", snapshot.InstalledPlugins)
	}
	if snapshot.ActivePlugins != 1 {
		t.Fatalf("expected one active duplicate, got %d", snapshot.ActivePlugins)
	}
	if len(snapshot.Plugins) != 2 {
		t.Fatalf("expected exactly two duplicates, got %#v", snapshot.Plugins)
	}

	primaryEntry := snapshot.Plugins[0]
	if primaryEntry.PluginID != "setta-basedpyright" ||
		primaryEntry.SourceManager != PluginSourceManagerPackageManager ||
		primaryEntry.State != PluginRuntimeStateActive ||
		primaryEntry.Scope != PluginScopeSettaFiles ||
		primaryEntry.ShadowedBySourcePath != "" {
		t.Fatalf("expected active package-manager duplicate to lead the ordered results, got %#v", primaryEntry)
	}

	disabledEntry := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-basedpyright", PluginScopeWorkspace)
	if disabledEntry.State != PluginRuntimeStateDisabled {
		t.Fatalf("expected disabled workspace duplicate, got %#v", disabledEntry)
	}
	if disabledEntry.ShadowedBySourcePath != "" {
		t.Fatalf("expected disabled workspace duplicate to stay visible, got %#v", disabledEntry.ShadowedBySourcePath)
	}

	activeEntry := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-basedpyright", PluginScopeSettaFiles)
	if activeEntry.SourceManager != PluginSourceManagerPackageManager || activeEntry.State != PluginRuntimeStateActive {
		t.Fatalf("expected active package-manager duplicate, got %#v", activeEntry)
	}
	if activeEntry.ShadowedBySourcePath != "" {
		t.Fatalf("expected active package-manager duplicate to stay unshadowed, got %#v", activeEntry.ShadowedBySourcePath)
	}
	resolvedPackageManagerRoot, err := filepath.EvalSymlinks(packageManagerRoot)
	if err != nil {
		t.Fatalf("resolve package-manager root symlinks: %v", err)
	}
	if activeEntry.SourcePath != resolvedPackageManagerRoot {
		t.Fatalf("expected package-manager root %q, got %q", resolvedPackageManagerRoot, activeEntry.SourcePath)
	}
	if len(activeEntry.RegisteredLanguageServers) != 1 || activeEntry.RegisteredLanguageServers[0].Language != "python" {
		t.Fatalf("expected active package-manager duplicate to keep its python registration, got %#v", activeEntry.RegisteredLanguageServers)
	}
}

// Package-manager source digests should still change when editable/no-hash plugin roots change on disk.
func TestDiscoveryServiceRescanPackageManagerSourceDigestTracksPluginRootChanges(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	sitePackages, packageManagerRoot := installPackageManagerFixture(
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

	service := mustNewDiscoveryServiceWithPackageManager(t, roots, config.ModeIDE, []string{sitePackages})
	firstSnapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("rescan package-manager plugins: %v", err)
	}
	firstEntry := mustFindDiscoveredPlugin(t, firstSnapshot.Plugins, "setta-fixture-frontend", PluginScopeSettaFiles)
	if firstEntry.SourceManager != PluginSourceManagerPackageManager {
		t.Fatalf("expected package-manager source manager, got %q", firstEntry.SourceManager)
	}
	if firstEntry.SourceDigestSHA256 == nil || *firstEntry.SourceDigestSHA256 == "" {
		t.Fatalf("expected first package-manager source digest, got %#v", firstEntry.SourceDigestSHA256)
	}
	firstDigest := *firstEntry.SourceDigestSHA256

	entrypointPath := filepath.Join(packageManagerRoot, "frontend", "src", "index.js")
	payload, err := os.ReadFile(entrypointPath)
	if err != nil {
		t.Fatalf("read package-manager frontend entrypoint: %v", err)
	}
	if err := os.WriteFile(entrypointPath, append(payload, []byte("\n// digest-change\n")...), 0o644); err != nil {
		t.Fatalf("rewrite package-manager frontend entrypoint: %v", err)
	}

	secondSnapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("rescan package-manager plugins after file change: %v", err)
	}
	secondEntry := mustFindDiscoveredPlugin(t, secondSnapshot.Plugins, "setta-fixture-frontend", PluginScopeSettaFiles)
	if secondEntry.SourceDigestSHA256 == nil || *secondEntry.SourceDigestSHA256 == "" {
		t.Fatalf("expected second package-manager source digest, got %#v", secondEntry.SourceDigestSHA256)
	}
	if *secondEntry.SourceDigestSHA256 == firstDigest {
		t.Fatalf("expected package-manager source digest to change after plugin-root edit, got first=%q second=%q", firstDigest, *secondEntry.SourceDigestSHA256)
	}
}

// Package-manager discovery should keep invalid and ambiguous environment distributions visible instead of silently skipping them.
func TestDiscoveryServiceRescanKeepsInvalidPackageManagerEntries(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	sitePackages, _ := installPackageManagerFixture(
		t,
		"frontend",
		"setta-fixture-invalid",
		"0.1.0",
		func(pluginRoot string) {
			writePackageManagerTestFile(t, filepath.Join(pluginRoot, "setta.plugin.json"), "{not-json")
		},
	)
	_ = installPackageManagerFixtureInSearchPath(
		t,
		sitePackages,
		"frontend-react",
		"setta-fixture-ambiguous",
		"0.1.0",
		func(pluginRoot string) {
			rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
				frontend := payload["frontend"].(map[string]any)
				frontend["entrypoint"] = "frontend/src/index.js"
				frontend["style"] = "frontend/src/index.css"
			})
			writeJSONFile(t, filepath.Join(pluginRoot, "duplicate", "setta.plugin.json"), map[string]any{
				"schemaVersion":     1,
				"id":                "setta-fixture-ambiguous",
				"name":              "Setta Fixture Ambiguous",
				"version":           "0.1.0",
				"settaVersionRange": ">=0.0.0",
				"enabledByDefault":  true,
				"capabilities":      []string{"registerPane"},
			})
		},
	)

	service := mustNewDiscoveryServiceWithPackageManager(t, roots, config.ModeIDE, []string{sitePackages})
	snapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("rescan plugins with invalid package-manager entries: %v", err)
	}
	if len(snapshot.Plugins) != 2 {
		t.Fatalf("expected two invalid package-manager entries, got %#v", snapshot.Plugins)
	}

	invalidEntry := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-fixture-invalid", PluginScopeSettaFiles)
	if invalidEntry.State != PluginRuntimeStateInvalid {
		t.Fatalf("expected invalid package-manager entry, got %q", invalidEntry.State)
	}
	if invalidEntry.SourceManager != PluginSourceManagerPackageManager {
		t.Fatalf("expected package-manager source manager, got %q", invalidEntry.SourceManager)
	}
	if len(invalidEntry.Errors) != 1 || invalidEntry.Errors[0].Code != invalidPluginManifestErrorCode {
		t.Fatalf("expected invalid-manifest package-manager error, got %#v", invalidEntry.Errors)
	}

	ambiguousEntry := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-fixture-ambiguous", PluginScopeSettaFiles)
	if ambiguousEntry.State != PluginRuntimeStateInvalid {
		t.Fatalf("expected ambiguous package-manager entry to stay invalid, got %q", ambiguousEntry.State)
	}
	if len(ambiguousEntry.Errors) != 1 || ambiguousEntry.Errors[0].Code != ambiguousPluginRootErrorCode {
		t.Fatalf("expected ambiguous plugin root error, got %#v", ambiguousEntry.Errors)
	}
}

func mustNewDiscoveryService(t *testing.T, roots filesystemResolverTestRoots, mode config.Mode) *DiscoveryService {
	t.Helper()

	service, err := NewDiscoveryService(DiscoveryServiceOptions{
		WorkspaceRoot:  roots.workspaceRoot,
		SettaFilesRoot: roots.settaFilesRoot,
		SettaHome:      roots.settaHome,
		ServerMode:     mode,
	})
	if err != nil {
		t.Fatalf("new discovery service: %v", err)
	}
	return service
}

func mustFindDiscoveredPlugin(t *testing.T, entries []DiscoveredPlugin, pluginID string, scope PluginScope) DiscoveredPlugin {
	t.Helper()

	for _, entry := range entries {
		if entry.PluginID == pluginID && entry.Scope == scope {
			return entry
		}
	}
	t.Fatalf("expected discovered plugin %q in scope %q", pluginID, scope)
	return DiscoveredPlugin{}
}
