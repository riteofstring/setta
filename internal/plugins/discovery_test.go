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
	globalRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeGlobal, "backend-codegen")
	settaFilesRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeSettaFiles, "backend-codegen")
	workspaceRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend-codegen")

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
	settaFilesPluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeSettaFiles, "backend-codegen")

	writeJSONFile(t, filepath.Join(roots.settaFilesRoot, "plugins_state.json"), map[string]any{
		"disabledPluginIds":              []string{"setta-fixture-backend"},
		"pendingRestartBackendPluginIds": []string{"setta-fixture-backend-codegen"},
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

	pendingRestart := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-fixture-backend-codegen", PluginScopeSettaFiles)
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
