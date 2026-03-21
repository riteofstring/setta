package plugins

import (
	"context"
	"errors"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/config"
)

func TestServiceRuntimeBuildsFrontendListAndStatusPayloads(t *testing.T) {
	// Runtime reads should expose active frontend bootstrap data plus full status entries.
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
				"label":   "fixture",
			},
		},
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}

	if runtimeResponse.SchemaVersion != pluginRuntimeSchemaVersion {
		t.Fatalf("expected runtime schema version %d, got %d", pluginRuntimeSchemaVersion, runtimeResponse.SchemaVersion)
	}
	if runtimeResponse.List.SchemaVersion != pluginListSchemaVersion {
		t.Fatalf("expected list schema version %d, got %d", pluginListSchemaVersion, runtimeResponse.List.SchemaVersion)
	}
	if len(runtimeResponse.List.Plugins) != 1 {
		t.Fatalf("expected one active list plugin, got %#v", runtimeResponse.List.Plugins)
	}
	if len(runtimeResponse.Status.Plugins) != 1 {
		t.Fatalf("expected one status plugin, got %#v", runtimeResponse.Status.Plugins)
	}

	listEntry := runtimeResponse.List.Plugins[0]
	if listEntry.PluginID != "setta-fixture-full" {
		t.Fatalf("expected full fixture plugin id, got %#v", listEntry.PluginID)
	}
	if len(listEntry.Components) != 3 || listEntry.Components[0] != "backend" || listEntry.Components[1] != "frontend" || listEntry.Components[2] != "content" {
		t.Fatalf("expected backend/frontend/content components, got %#v", listEntry.Components)
	}
	if listEntry.Frontend.EntrypointURL == nil || !strings.Contains(*listEntry.Frontend.EntrypointURL, "/plugins/setta-fixture-full/frontend/src/index.js?v=") {
		t.Fatalf("expected versioned frontend entrypoint url, got %#v", listEntry.Frontend.EntrypointURL)
	}
	if !listEntry.Content.HasBlueprints || !listEntry.Content.HasProjectTemplates || !listEntry.Content.HasPrompts {
		t.Fatalf("expected full content descriptor, got %#v", listEntry.Content)
	}
	if !listEntry.Config.HasSchema || listEntry.Config.SchemaJSON == nil {
		t.Fatalf("expected config schema payload, got %#v", listEntry.Config)
	}
	if got := listEntry.Config.CurrentConfig["label"]; got != "fixture" {
		t.Fatalf("expected current config label fixture, got %#v", got)
	}
	if listEntry.Config.SchemaJSONDigestSHA256 == nil || len(*listEntry.Config.SchemaJSONDigestSHA256) != 64 {
		t.Fatalf("expected schema digest, got %#v", listEntry.Config.SchemaJSONDigestSHA256)
	}
	if listEntry.Config.CurrentConfigDigestSHA256 == nil || len(*listEntry.Config.CurrentConfigDigestSHA256) != 64 {
		t.Fatalf("expected current config digest, got %#v", listEntry.Config.CurrentConfigDigestSHA256)
	}

	statusEntry := runtimeResponse.Status.Plugins[0]
	if statusEntry.State != PluginRuntimeStateActive {
		t.Fatalf("expected active status entry, got %#v", statusEntry.State)
	}
	if len(statusEntry.Components) != 3 || statusEntry.Components[0] != "backend" || statusEntry.Components[1] != "frontend" || statusEntry.Components[2] != "content" {
		t.Fatalf("expected backend/frontend/content status components, got %#v", statusEntry.Components)
	}
	if statusEntry.SourceScopeLabel != "workspace" {
		t.Fatalf("expected workspace source scope label, got %#v", statusEntry.SourceScopeLabel)
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

			sourcePaths := map[string]struct{}{}
			canonicalSourceKeys := map[string]struct{}{}
			entryCount := 0
			for _, entry := range runtimeResponse.Status.Plugins {
				if entry.PluginID != "setta-fixture-frontend" || entry.SourceScope != PluginScopeSettaFiles {
					continue
				}
				entryCount++
				sourcePaths[entry.SourcePath] = struct{}{}
				canonicalSourceKeys[entry.CanonicalSourceKey] = struct{}{}
			}
			if entryCount != 2 {
				t.Fatalf("expected two same-scope status entries, got %#v", runtimeResponse.Status.Plugins)
			}
			if len(sourcePaths) != 2 {
				t.Fatalf("expected distinct redacted source paths across source managers, got %#v", sourcePaths)
			}
			if len(canonicalSourceKeys) != 2 {
				t.Fatalf("expected distinct redacted canonical source keys across source managers, got %#v", canonicalSourceKeys)
			}

			activeEntry := mustFindStatusEntry(t, runtimeResponse.Status.Plugins, "setta-fixture-frontend", PluginRuntimeStateActive)
			shadowedEntry := mustFindStatusEntry(t, runtimeResponse.Status.Plugins, "setta-fixture-frontend", PluginRuntimeStateShadowed)
			if activeEntry.SourceScope != PluginScopeSettaFiles || activeEntry.SourceManager != PluginSourceManagerSetta {
				t.Fatalf("expected active setta entry in setta_files scope, got scope=%q manager=%q", activeEntry.SourceScope, activeEntry.SourceManager)
			}
			if shadowedEntry.SourceScope != PluginScopeSettaFiles || shadowedEntry.SourceManager != PluginSourceManagerPackageManager {
				t.Fatalf("expected shadowed package-manager entry in setta_files scope, got scope=%q manager=%q", shadowedEntry.SourceScope, shadowedEntry.SourceManager)
			}
			if !strings.Contains(activeEntry.SourcePath, "[redacted]:setta_files:setta:setta-fixture-frontend:") {
				t.Fatalf("expected setta redacted source path, got %q", activeEntry.SourcePath)
			}
			if !strings.Contains(activeEntry.CanonicalSourceKey, "redacted:setta_files:setta:setta-fixture-frontend:") {
				t.Fatalf("expected setta redacted canonical source key, got %q", activeEntry.CanonicalSourceKey)
			}
			if !strings.Contains(shadowedEntry.SourcePath, "[redacted]:setta_files:package_manager:setta-fixture-frontend:") {
				t.Fatalf("expected package-manager redacted source path, got %q", shadowedEntry.SourcePath)
			}
			if !strings.Contains(shadowedEntry.CanonicalSourceKey, "redacted:setta_files:package_manager:setta-fixture-frontend:") {
				t.Fatalf("expected package-manager redacted canonical source key, got %q", shadowedEntry.CanonicalSourceKey)
			}
			if shadowedEntry.ShadowedBySourcePath == nil || *shadowedEntry.ShadowedBySourcePath != activeEntry.SourcePath {
				t.Fatalf("expected redacted shadow path %q, got %#v", activeEntry.SourcePath, shadowedEntry.ShadowedBySourcePath)
			}
			if *shadowedEntry.ShadowedBySourcePath == shadowedEntry.SourcePath {
				t.Fatalf("expected shadowed entry to keep a distinct shadow target, got source=%q shadow=%q", shadowedEntry.SourcePath, *shadowedEntry.ShadowedBySourcePath)
			}
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

	statusEntry := runtimeResponse.Status.Plugins[0]
	if statusEntry.State != PluginRuntimeStateActive {
		t.Fatalf("expected active backend fixture, got %#v", statusEntry.State)
	}
	if len(statusEntry.RegisteredCodegenTargets) != 1 {
		t.Fatalf("expected one codegen target, got %#v", statusEntry.RegisteredCodegenTargets)
	}
	if got := statusEntry.RegisteredCodegenTargets[0]; got.TargetID != "typescript" || got.PluginID != "setta-fixture-backend" || got.Language != "setta-fixture-backend-codegen:typescript" || got.Name != "Fixture TypeScript State" || got.DefaultFileName != "fixture_state.ts" {
		t.Fatalf("unexpected codegen target registration %#v", got)
	}
	if len(statusEntry.RegisteredBackendRoutes) != 2 {
		t.Fatalf("expected two backend routes, got %#v", statusEntry.RegisteredBackendRoutes)
	}
	if got := statusEntry.RegisteredBackendRoutes[0]; got.Path != "/health" || len(got.Methods) != 1 || got.Methods[0] != "GET" {
		t.Fatalf("unexpected first backend route %#v", got)
	}
	if got := statusEntry.RegisteredBackendRoutes[1]; got.Path != "/items" || len(got.Methods) != 2 || got.Methods[0] != "DELETE" || got.Methods[1] != "POST" {
		t.Fatalf("unexpected second backend route %#v", got)
	}
	if len(statusEntry.RegisteredStaticDirs) != 1 {
		t.Fatalf("expected one static dir, got %#v", statusEntry.RegisteredStaticDirs)
	}
	if got := statusEntry.RegisteredStaticDirs[0]; got.RoutePrefix != "/static" || got.Dir != "backend/static" {
		t.Fatalf("unexpected static dir registration %#v", got)
	}
	if len(statusEntry.RegisteredListenerEndpoints) != 1 {
		t.Fatalf("expected one listener endpoint, got %#v", statusEntry.RegisteredListenerEndpoints)
	}
	if got := statusEntry.RegisteredListenerEndpoints[0].Name; got != "route_backend_fixture_ping" {
		t.Fatalf("unexpected listener endpoint %q", got)
	}
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

func mustFindRuntimeListEntry(t *testing.T, entries []ListEntry, pluginID string) ListEntry {
	t.Helper()

	for _, entry := range entries {
		if entry.PluginID == pluginID {
			return entry
		}
	}
	t.Fatalf("expected runtime list entry %q", pluginID)
	return ListEntry{}
}
