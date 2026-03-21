package plugins

import (
	"os"
	"path/filepath"
	"testing"

	"setta/internal/config"
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
		"frontend",
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
