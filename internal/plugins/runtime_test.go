package plugins

import (
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
	if statusEntry.SourceScopeLabel != "workspace" {
		t.Fatalf("expected workspace source scope label, got %#v", statusEntry.SourceScopeLabel)
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

func TestServiceRuntimePreservesBlockedCapabilitiesInShareMode(t *testing.T) {
	// Runtime status should surface deterministic blocked-capability reasons outside IDE mode.
	roots := newFilesystemResolverTestRoots(t)
	copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend-codegen")

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
		t.Fatalf("expected blocked codegen capability to be removed from effective list, got %#v", runtimeResponse.List.Plugins[0].EffectiveCapabilities)
	}

	statusEntry := runtimeResponse.Status.Plugins[0]
	if len(statusEntry.BlockedCapabilities) != 1 {
		t.Fatalf("expected one blocked capability, got %#v", statusEntry.BlockedCapabilities)
	}
	if statusEntry.BlockedCapabilities[0].Capability != "registerCodegenTarget" {
		t.Fatalf("expected registerCodegenTarget blocked, got %#v", statusEntry.BlockedCapabilities[0])
	}
	if statusEntry.BlockedCapabilities[0].Reason != PluginBlockedCapabilityReasonModePolicy {
		t.Fatalf("expected mode-policy block, got %#v", statusEntry.BlockedCapabilities[0].Reason)
	}
}

func TestServiceRuntimeBlocksRemovedBackendPluginCapabilities(t *testing.T) {
	// Runtime should not surface removed backend plugin capabilities or registrations.
	roots := newFilesystemResolverTestRoots(t)
	copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend-language-server")
	copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend-codegen")

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}

	if len(runtimeResponse.Status.Plugins) != 2 {
		t.Fatalf("expected two status plugins, got %#v", runtimeResponse.Status.Plugins)
	}

	findEntry := func(pluginID string) StatusEntry {
		t.Helper()
		for _, entry := range runtimeResponse.Status.Plugins {
			if entry.PluginID == pluginID {
				return entry
			}
		}
		t.Fatalf("expected runtime status entry for %q", pluginID)
		return StatusEntry{}
	}

	languageServerEntry := findEntry("setta-fixture-backend-language-server")
	if languageServerEntry.State != PluginRuntimeStateActive {
		t.Fatalf("expected active backend language-server plugin, got %#v", languageServerEntry.State)
	}
	if len(languageServerEntry.EffectiveCapabilities) != 0 {
		t.Fatalf("expected removed language-server capability to stay out of the effective list, got %#v", languageServerEntry.EffectiveCapabilities)
	}
	if len(languageServerEntry.BlockedCapabilities) != 1 {
		t.Fatalf("expected one blocked language-server capability, got %#v", languageServerEntry.BlockedCapabilities)
	}
	if languageServerEntry.BlockedCapabilities[0].Capability != "registerLanguageServer" {
		t.Fatalf("expected registerLanguageServer blocked, got %#v", languageServerEntry.BlockedCapabilities[0])
	}
	if languageServerEntry.BlockedCapabilities[0].Reason != PluginBlockedCapabilityReasonHostPolicy {
		t.Fatalf("expected host-policy block, got %#v", languageServerEntry.BlockedCapabilities[0].Reason)
	}
	if len(languageServerEntry.RegisteredLanguageServers) != 0 {
		t.Fatalf("expected no registered language servers after removal, got %#v", languageServerEntry.RegisteredLanguageServers)
	}
	if len(languageServerEntry.Errors) != 0 {
		t.Fatalf("expected no backend registration errors for language-server-only plugin, got %#v", languageServerEntry.Errors)
	}

	statusEntry := findEntry("setta-fixture-backend-codegen")
	if len(statusEntry.RegisteredCodegenTargets) != 0 {
		t.Fatalf("expected no registered codegen targets after runtime removal, got %#v", statusEntry.RegisteredCodegenTargets)
	}
	if len(statusEntry.Errors) != 0 {
		t.Fatalf("expected no backend registration errors for codegen-only plugin, got %#v", statusEntry.Errors)
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

	_, err = service.ResolveAssetPath("setta-fixture-full", "backend/entrypoint.py")
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
