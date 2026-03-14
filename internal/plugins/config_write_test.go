package plugins

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"setta/internal/config"
)

func TestServiceWriteConfigPersistsForHighestPrecedencePlugin(t *testing.T) {
	// Config writes should target the active highest-precedence plugin scope and refresh runtime reads.
	roots := newFilesystemResolverTestRoots(t)
	globalRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeGlobal, "full")
	rewritePluginManifest(t, globalRoot, func(payload map[string]any) {
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/index.js"
		frontend["style"] = "frontend/src/index.css"
	})
	workspaceRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "full")
	rewritePluginManifest(t, workspaceRoot, func(payload map[string]any) {
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/index.js"
		frontend["style"] = "frontend/src/index.css"
	})
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	result, err := service.WriteConfig(context.Background(), ConfigWriteOptions{
		PluginID: "setta-fixture-full",
		Config: map[string]any{
			"enabled": true,
			"label":   "workspace-config",
		},
	})
	if err != nil {
		t.Fatalf("write plugin config: %v", err)
	}
	if result.PluginID != "setta-fixture-full" {
		t.Fatalf("expected plugin id setta-fixture-full, got %q", result.PluginID)
	}
	if !result.Validation.OK {
		t.Fatalf("expected successful validation payload, got %#v", result.Validation)
	}

	state, err := service.store.LoadPluginsState()
	if err != nil {
		t.Fatalf("load plugins state: %v", err)
	}
	savedRaw, ok := state.PluginConfigByID["workspace:setta-fixture-full"]
	if !ok {
		t.Fatalf("expected workspace-scoped plugin config, got %#v", state.PluginConfigByID)
	}
	savedConfig, ok := savedRaw.(map[string]any)
	if !ok {
		t.Fatalf("expected workspace config object, got %#v", savedRaw)
	}
	if got := savedConfig["label"]; got != "workspace-config" {
		t.Fatalf("expected saved workspace label, got %#v", got)
	}
	if _, ok := state.PluginConfigByID["global:setta-fixture-full"]; ok {
		t.Fatalf("expected global-scoped config to remain untouched, got %#v", state.PluginConfigByID)
	}

	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime response: %v", err)
	}
	if len(runtimeResponse.List.Plugins) != 1 {
		t.Fatalf("expected one active plugin, got %#v", runtimeResponse.List.Plugins)
	}
	entry := runtimeResponse.List.Plugins[0]
	if entry.SourceScope != PluginScopeWorkspace {
		t.Fatalf("expected workspace highest-precedence plugin, got %#v", entry.SourceScope)
	}
	if got := entry.Config.CurrentConfig["label"]; got != "workspace-config" {
		t.Fatalf("expected runtime current config label workspace-config, got %#v", got)
	}
}

func TestServiceWriteConfigRejectsInvalidSchemaValue(t *testing.T) {
	// Schema-backed config writes should reject invalid payloads with a plugin config error.
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "full")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/index.js"
		frontend["style"] = "frontend/src/index.css"
	})
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	_, err := service.WriteConfig(context.Background(), ConfigWriteOptions{
		PluginID: "setta-fixture-full",
		Config: map[string]any{
			"enabled": "yes",
		},
	})
	if err == nil {
		t.Fatal("expected invalid plugin config to fail")
	}
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) {
		t.Fatalf("expected service error, got %v", err)
	}
	if serviceErr.Code != ServiceErrorCodeConfigInvalid {
		t.Fatalf("expected config invalid error code, got %#v", serviceErr.Code)
	}
}

func TestServiceWriteConfigRejectsInvalidSchemaDocument(t *testing.T) {
	// Malformed schema files should fail with an explicit config-schema error before persistence.
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "full")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/index.js"
		frontend["style"] = "frontend/src/index.css"
	})
	schemaPath := filepath.Join(pluginRoot, "content", "config", "schema.json")
	if err := os.WriteFile(schemaPath, []byte("{\n"), 0o644); err != nil {
		t.Fatalf("write malformed schema: %v", err)
	}
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	_, err := service.WriteConfig(context.Background(), ConfigWriteOptions{
		PluginID: "setta-fixture-full",
		Config: map[string]any{
			"enabled": true,
		},
	})
	if err == nil {
		t.Fatal("expected malformed schema to fail")
	}
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) {
		t.Fatalf("expected service error, got %v", err)
	}
	if serviceErr.Code != ServiceErrorCodeConfigSchemaInvalid {
		t.Fatalf("expected config schema invalid error code, got %#v", serviceErr.Code)
	}

	state, err := service.store.LoadPluginsState()
	if err != nil {
		t.Fatalf("load plugins state: %v", err)
	}
	if len(state.PluginConfigByID) != 0 {
		t.Fatalf("expected malformed schema write to skip persistence, got %#v", state.PluginConfigByID)
	}
}
