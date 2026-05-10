package plugins

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/config"
)

// The mutation service should support an install/update/rollback/uninstall lifecycle over real plugin fixtures.
func TestServiceInstallUpdateRollbackAndUninstallLifecycle(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, newFixtureCandidateProvider(t, map[string]fixtureCandidateSpec{
		"pypi:setta-fixture-frontend==0.1.0": {
			FixtureName: "frontend",
			Version:     "0.1.0",
		},
		"pypi:setta-fixture-frontend==0.2.0": {
			FixtureName: "frontend",
			Version:     "0.2.0",
		},
	}), config.ModeIDE)

	installResult, err := service.Install(context.Background(), InstallOptions{
		SourceSpec: "pypi:setta-fixture-frontend==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install plugin: %v", err)
	}
	assertFrontendInstallResponse(t, installResult, "0.1.0")

	updateResult, err := service.Update(context.Background(), UpdateOptions{
		PluginID: "setta-fixture-frontend",
		To:       "0.2.0",
	})
	if err != nil {
		t.Fatalf("update plugin: %v", err)
	}
	assertFrontendUpdateResponse(t, updateResult, "0.1.0", "0.2.0")

	metadata := mustGetInstallMetadataEntry(t, service, "setta-fixture-frontend", PluginScopeWorkspace)
	assertInstallMetadataVersionAndHistory(t, metadata, "0.2.0", "0.1.0")

	rollbackResult, err := service.Rollback(context.Background(), RollbackOptions{
		PluginID: "setta-fixture-frontend",
	})
	if err != nil {
		t.Fatalf("rollback plugin: %v", err)
	}
	assertFrontendRollbackResponse(t, rollbackResult, "0.1.0")

	metadata = mustGetInstallMetadataEntry(t, service, "setta-fixture-frontend", PluginScopeWorkspace)
	assertInstallMetadataVersionAndHistory(t, metadata, "0.1.0")

	uninstallResult, err := service.Uninstall(context.Background(), UninstallOptions{
		PluginID: "setta-fixture-frontend",
	})
	if err != nil {
		t.Fatalf("uninstall plugin: %v", err)
	}
	if uninstallResult.RemovedFromScope != PluginScopeWorkspace || uninstallResult.RestartRequired {
		t.Fatalf("unexpected uninstall result: %#v", uninstallResult)
	}

	snapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("rescan after uninstall: %v", err)
	}
	if len(snapshot.Plugins) != 0 {
		t.Fatalf("expected no plugins after uninstall, got %#v", snapshot.Plugins)
	}
}

// Force reinstall should snapshot the previous managed plugin tree and allow rollback to that snapshot.
func TestServiceForceInstallCreatesHistorySnapshotAndSupportsRollback(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, newFixtureCandidateProvider(t, map[string]fixtureCandidateSpec{
		"pypi:setta-fixture-frontend==0.1.0": {
			FixtureName: "frontend",
			Version:     "0.1.0",
		},
	}), config.ModeIDE)

	firstInstall, err := service.Install(context.Background(), InstallOptions{
		SourceSpec: "pypi:setta-fixture-frontend==0.1.0",
		Scope:      scopePointer(PluginScopeWorkspace),
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install plugin: %v", err)
	}
	assertFrontendInstallResponse(t, firstInstall, "0.1.0")

	forcedInstall, err := service.Install(context.Background(), InstallOptions{
		SourceSpec: "pypi:setta-fixture-frontend==0.1.0",
		Scope:      scopePointer(PluginScopeWorkspace),
		Enable:     true,
		Force:      true,
	})
	if err != nil {
		t.Fatalf("force install plugin: %v", err)
	}
	assertFrontendInstallResponse(t, forcedInstall, "0.1.0")

	metadata := mustGetInstallMetadataEntry(t, service, "setta-fixture-frontend", PluginScopeWorkspace)
	assertForceInstallHistorySnapshot(t, metadata)

	rollbackResult, err := service.Rollback(context.Background(), RollbackOptions{
		PluginID: "setta-fixture-frontend",
	})
	if err != nil {
		t.Fatalf("rollback plugin after force install: %v", err)
	}
	assertFrontendRollbackResponse(t, rollbackResult, "0.1.0")

	metadata = mustGetInstallMetadataEntry(t, service, "setta-fixture-frontend", PluginScopeWorkspace)
	assertInstallMetadataVersionAndHistory(t, metadata, "0.1.0")

	snapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("rescan after rollback: %v", err)
	}
	entry := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-fixture-frontend", PluginScopeWorkspace)
	if entry.Version != "0.1.0" || entry.State != PluginRuntimeStateActive || entry.RestartRequired {
		t.Fatalf("expected active frontend plugin after rollback, got %#v", entry)
	}
}

func assertFrontendInstallResponse(t *testing.T, response PluginInstallResponse, version string) {
	t.Helper()

	if response.PluginID != "setta-fixture-frontend" || response.Version != version {
		t.Fatalf("unexpected install result: %#v", response)
	}
	if response.SourceScopeLabel != "workspace" {
		t.Fatalf("expected workspace source scope label, got %#v", response.SourceScopeLabel)
	}
	if response.TrustStatus != PluginSourceTrustStatusUnverified {
		t.Fatalf("expected unverified trust status, got %#v", response.TrustStatus)
	}
	if response.TrustWarning != unverifiedSourceWarning {
		t.Fatalf("expected trust warning %q, got %#v", unverifiedSourceWarning, response.TrustWarning)
	}
	if response.RestartRequired {
		t.Fatalf("expected frontend install not to require restart")
	}
}

func assertFrontendUpdateResponse(t *testing.T, response PluginUpdateResponse, fromVersion string, toVersion string) {
	t.Helper()

	if response.FromVersion != fromVersion || response.ToVersion != toVersion {
		t.Fatalf("unexpected update result: %#v", response)
	}
	if response.RestartRequired {
		t.Fatalf("expected frontend update not to require restart")
	}
}

func assertFrontendRollbackResponse(t *testing.T, response PluginRollbackResponse, restoredVersion string) {
	t.Helper()

	if response.RestoredVersion != restoredVersion || response.RestartRequired {
		t.Fatalf("unexpected rollback result: %#v", response)
	}
}

func mustGetInstallMetadataEntry(t *testing.T, service *Service, pluginID string, scope PluginScope) PluginInstallMetadataEntry {
	t.Helper()

	metadata, ok, err := service.store.GetInstallMetadata(pluginID, scope)
	if err != nil {
		t.Fatalf("get install metadata for %s: %v", pluginID, err)
	}
	if !ok {
		t.Fatalf("expected install metadata for %s in %s", pluginID, scope)
	}
	return metadata
}

func assertInstallMetadataVersionAndHistory(t *testing.T, metadata PluginInstallMetadataEntry, version string, historyVersions ...string) {
	t.Helper()

	if metadata.Version != version {
		t.Fatalf("expected metadata version %q, got %#v", version, metadata)
	}
	if len(metadata.History) != len(historyVersions) {
		t.Fatalf("expected rollback history %v, got %#v", historyVersions, metadata.History)
	}
	for index, expectedVersion := range historyVersions {
		if metadata.History[index].Version != expectedVersion {
			t.Fatalf("expected history version %q at index %d, got %#v", expectedVersion, index, metadata.History)
		}
	}
}

func assertForceInstallHistorySnapshot(t *testing.T, metadata PluginInstallMetadataEntry) {
	t.Helper()

	assertInstallMetadataVersionAndHistory(t, metadata, "0.1.0", "0.1.0")
	historyEntry := metadata.History[0]
	if historyEntry.SourceDigestSHA256 == nil || strings.TrimSpace(*historyEntry.SourceDigestSHA256) == "" {
		t.Fatalf("expected rollback snapshot digest, got %#v", historyEntry.SourceDigestSHA256)
	}

	snapshotManifestPayload, err := os.ReadFile(filepath.Join(historyEntry.SnapshotPath, pluginManifestFileName))
	if err != nil {
		t.Fatalf("read rollback snapshot manifest: %v", err)
	}
	var snapshotManifest map[string]any
	if err := json.Unmarshal(snapshotManifestPayload, &snapshotManifest); err != nil {
		t.Fatalf("decode rollback snapshot manifest: %v", err)
	}
	if got := snapshotManifest["version"]; got != "0.1.0" {
		t.Fatalf("expected rollback snapshot manifest version 0.1.0, got %#v", got)
	}
}

func assertScaffoldedFullInstallResponse(t *testing.T, response PluginInstallResponse, pluginID string) {
	t.Helper()

	if response.PluginID != pluginID || response.Version != "0.1.0" {
		t.Fatalf("unexpected install result %#v", response)
	}
	if response.State != PluginRuntimeStatePendingRestart || !response.RestartRequired {
		t.Fatalf("expected backend-capable full plugin install to require restart, got %#v", response)
	}
	if response.SourceDigestSHA256 == nil || strings.TrimSpace(*response.SourceDigestSHA256) == "" {
		t.Fatalf("expected scaffolded full install source digest to be populated")
	}
}

func assertScaffoldedFullRuntimeResponse(t *testing.T, response PluginRuntimeResponse, pluginID string) {
	t.Helper()

	listEntry := mustFindRuntimeListEntry(t, response.List.Plugins, pluginID)
	if listEntry.SourceScope != PluginScopeWorkspace {
		t.Fatalf("expected workspace scope runtime entry, got %#v", listEntry.SourceScope)
	}
	if listEntry.Frontend.EntrypointURL == nil || !strings.Contains(*listEntry.Frontend.EntrypointURL, "/plugins/"+pluginID+"/frontend/dist/index.js?v=") {
		t.Fatalf("expected runtime entrypoint url for scaffolded full plugin, got %#v", listEntry.Frontend.EntrypointURL)
	}
	if !listEntry.Content.HasBlueprints || !listEntry.Content.HasProjectTemplates || !listEntry.Content.HasPrompts {
		t.Fatalf("expected full scaffold content descriptor, got %#v", listEntry.Content)
	}
}

func assertScaffoldedFullStatusActive(t *testing.T, status PluginStatusResponse, pluginID string) {
	t.Helper()

	statusEntry := mustFindStatusEntry(t, status.Plugins, pluginID, PluginRuntimeStateActive)
	if statusEntry.RestartRequired {
		t.Fatalf("expected active scaffolded full plugin after refresh, got %#v", statusEntry)
	}
	if statusEntry.SourceScope != PluginScopeWorkspace || statusEntry.ShadowedBySourcePath != nil {
		t.Fatalf("expected active workspace status entry after refresh, got %#v", statusEntry)
	}
}
