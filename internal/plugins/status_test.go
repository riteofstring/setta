package plugins

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"setta/internal/config"
)

// Status should surface ordered entries plus the same restart/shadow/error details the CLI needs.
func TestServiceStatusIncludesOrderedEntriesAndManualRestartCapability(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	workspaceFrontendRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "frontend")
	globalRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeGlobal, "frontend")
	backendRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeSettaFiles, "backend")
	rewritePluginManifest(t, workspaceFrontendRoot, func(payload map[string]any) {
		payload["version"] = "0.2.0"
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/index.js"
		frontend["style"] = "frontend/src/index.css"
	})
	rewritePluginManifest(t, globalRoot, func(payload map[string]any) {
		payload["version"] = "0.1.0"
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/index.js"
		frontend["style"] = "frontend/src/index.css"
	})
	writeJSONFile(t, filepath.Join(roots.settaFilesRoot, "plugins_state.json"), map[string]any{
		"pendingRestartBackendPluginIds": []string{"setta-fixture-backend"},
	})
	brokenRoot := filepath.Join(roots.settaFilesRoot, "plugins", "broken-plugin")
	if err := writePluginFile(brokenRoot, pluginManifestFileName, "{not-json"); err != nil {
		t.Fatalf("write broken manifest: %v", err)
	}

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	status, err := service.Status()
	if err != nil {
		t.Fatalf("load status: %v", err)
	}

	if status.SchemaVersion != pluginStatusSchemaVersion {
		t.Fatalf("expected schema version %d, got %d", pluginStatusSchemaVersion, status.SchemaVersion)
	}
	if status.ServerMode != config.ModeIDE {
		t.Fatalf("expected ide mode, got %q", status.ServerMode)
	}
	if status.RestartCapability.Mode != RestartCapabilityModeManual {
		t.Fatalf("expected manual restart capability, got %#v", status.RestartCapability)
	}
	if status.RestartCapability.Command == nil || *status.RestartCapability.Command != "setta" {
		t.Fatalf("expected manual restart command, got %#v", status.RestartCapability.Command)
	}
	if status.RestartCapability.Reason == nil || *status.RestartCapability.Reason != "Programmatic restart is not available in this runtime." {
		t.Fatalf("unexpected restart reason %#v", status.RestartCapability.Reason)
	}
	if len(status.Plugins) != 4 {
		t.Fatalf("expected 4 status entries, got %d", len(status.Plugins))
	}

	broken := mustFindStatusEntry(t, status.Plugins, "broken-plugin", PluginRuntimeStateInvalid)
	if len(broken.Errors) != 1 || broken.Errors[0].Code != "PLUGIN_MANIFEST_INVALID" {
		t.Fatalf("expected invalid-manifest error, got %#v", broken.Errors)
	}

	pending := mustFindStatusEntry(t, status.Plugins, "setta-fixture-backend", PluginRuntimeStatePendingRestart)
	if pending.SourceScopeLabel != "setta_files" {
		t.Fatalf("expected setta_files scope label, got %q", pending.SourceScopeLabel)
	}
	if !pending.RestartRequired {
		t.Fatalf("expected backend entry to require restart")
	}
	if pending.RuntimePayloadDigestSHA256 == "" {
		t.Fatalf("expected runtime digest for pending entry")
	}
	if pending.SourcePath != backendRoot {
		t.Fatalf("expected backend source path %q, got %q", backendRoot, pending.SourcePath)
	}

	active := mustFindStatusEntry(t, status.Plugins, "setta-fixture-frontend", PluginRuntimeStateActive)
	if active.SourceScopeLabel != "workspace" {
		t.Fatalf("expected workspace scope label, got %q", active.SourceScopeLabel)
	}

	shadowed := mustFindStatusEntry(t, status.Plugins, "setta-fixture-frontend", PluginRuntimeStateShadowed)
	if shadowed.ShadowedBySourcePath == nil || *shadowed.ShadowedBySourcePath != workspaceFrontendRoot {
		t.Fatalf("expected shadowed path %q, got %#v", workspaceFrontendRoot, shadowed.ShadowedBySourcePath)
	}
}

// Restart-required should preserve pending IDs even when no discovered status entry remains after a service reload.
func TestServiceRestartRequiredSummaryIncludesPendingIDsWithoutStatus(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, newFixtureCandidateProvider(t, map[string]fixtureCandidateSpec{
		"pypi:setta-fixture-backend==0.1.0": {
			FixtureName: "backend",
			Version:     "0.1.0",
		},
	}), config.ModeIDE)

	installResult, err := service.Install(context.Background(), InstallOptions{
		SourceSpec: "pypi:setta-fixture-backend==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install backend plugin: %v", err)
	}
	if !installResult.RestartRequired {
		t.Fatalf("expected install to require restart")
	}
	if _, err := service.Uninstall(context.Background(), UninstallOptions{
		PluginID: "setta-fixture-backend",
	}); err != nil {
		t.Fatalf("uninstall backend plugin: %v", err)
	}

	reloaded := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	summary, err := reloaded.RestartRequiredSummary()
	if err != nil {
		t.Fatalf("load restart-required summary: %v", err)
	}

	if len(summary.PendingPlugins) != 0 {
		t.Fatalf("expected no discovered pending plugins after reload, got %#v", summary.PendingPlugins)
	}
	if len(summary.PendingPluginIDs) != 1 || summary.PendingPluginIDs[0] != "setta-fixture-backend" {
		t.Fatalf("unexpected pending ids %#v", summary.PendingPluginIDs)
	}
	if len(summary.PendingPluginIDsWithoutStatus) != 1 || summary.PendingPluginIDsWithoutStatus[0] != "setta-fixture-backend" {
		t.Fatalf("unexpected pending ids without status %#v", summary.PendingPluginIDsWithoutStatus)
	}
	if summary.RestartCapability.Mode != RestartCapabilityModeManual {
		t.Fatalf("expected manual restart capability, got %#v", summary.RestartCapability)
	}
}

// Restart should preserve the shipped manual-only packaged CLI payload until a real Go restart hook exists.
func TestServiceRestartReturnsManualCapabilityPayload(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	result, err := service.Restart(context.Background())
	if err != nil {
		t.Fatalf("restart service: %v", err)
	}
	if result.Accepted {
		t.Fatalf("expected manual restart payload to be rejected")
	}
	if result.Mode != RestartCapabilityModeManual {
		t.Fatalf("expected manual restart mode, got %#v", result.Mode)
	}
	if result.Command == nil || *result.Command != "setta" {
		t.Fatalf("expected manual restart command, got %#v", result.Command)
	}
	if result.Reason == nil || *result.Reason != "Programmatic restart is not available in this runtime." {
		t.Fatalf("unexpected restart reason %#v", result.Reason)
	}
}

func writePluginFile(root string, relativePath string, content string) error {
	path := filepath.Join(root, relativePath)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return err
	}
	return os.WriteFile(path, []byte(content), 0o644)
}

func mustFindStatusEntry(t *testing.T, entries []StatusEntry, pluginID string, state PluginRuntimeState) StatusEntry {
	t.Helper()

	for _, entry := range entries {
		if entry.PluginID == pluginID && entry.State == state {
			return entry
		}
	}
	t.Fatalf("expected status entry %q in state %q", pluginID, state)
	return StatusEntry{}
}
