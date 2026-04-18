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
	workspaceConfigKey := pluginConfigKey("setta-fixture-full", PluginScopeWorkspace, PluginSourceManagerSetta)
	globalConfigKey := pluginConfigKey("setta-fixture-full", PluginScopeGlobal, PluginSourceManagerSetta)

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
	savedRaw, ok := state.PluginConfigByID[workspaceConfigKey]
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
	if _, ok := state.PluginConfigByID[globalConfigKey]; ok {
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

func TestServiceWriteConfigKeepsScopedValuesAcrossShadowingLifecycle(t *testing.T) {
	// Config storage should stay keyed by scope so removing a shadowing variant restores the lower-precedence config.
	globalConfigKey := pluginConfigKey("setta-fixture-full", PluginScopeGlobal, PluginSourceManagerSetta)
	workspaceConfigKey := pluginConfigKey("setta-fixture-full", PluginScopeWorkspace, PluginSourceManagerSetta)

	roots := newFilesystemResolverTestRoots(t)
	globalRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeGlobal, "full")
	rewritePluginManifest(t, globalRoot, func(payload map[string]any) {
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/index.js"
		frontend["style"] = "frontend/src/index.css"
	})
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	if _, err := service.WriteConfig(context.Background(), ConfigWriteOptions{
		PluginID: "setta-fixture-full",
		Config: map[string]any{
			"enabled": true,
			"label":   "global-config",
		},
	}); err != nil {
		t.Fatalf("write global plugin config: %v", err)
	}

	workspaceRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "full")
	rewritePluginManifest(t, workspaceRoot, func(payload map[string]any) {
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/index.js"
		frontend["style"] = "frontend/src/index.css"
	})
	if _, err := service.WriteConfig(context.Background(), ConfigWriteOptions{
		PluginID: "setta-fixture-full",
		Config: map[string]any{
			"enabled": true,
			"label":   "workspace-config",
		},
	}); err != nil {
		t.Fatalf("write workspace plugin config: %v", err)
	}

	state, err := service.store.LoadPluginsState()
	if err != nil {
		t.Fatalf("load plugins state after scoped writes: %v", err)
	}
	if _, ok := state.PluginConfigByID[globalConfigKey]; !ok {
		t.Fatalf("expected global-scoped config entry, got %#v", state.PluginConfigByID)
	}
	if _, ok := state.PluginConfigByID[workspaceConfigKey]; !ok {
		t.Fatalf("expected workspace-scoped config entry, got %#v", state.PluginConfigByID)
	}

	uninstallResult, err := service.Uninstall(context.Background(), UninstallOptions{
		PluginID: "setta-fixture-full",
		Scope:    scopePointer(PluginScopeWorkspace),
	})
	if err != nil {
		t.Fatalf("uninstall workspace plugin: %v", err)
	}
	if !uninstallResult.RestartRequired {
		t.Fatalf("expected workspace full uninstall to require restart")
	}

	state, err = service.store.LoadPluginsState()
	if err != nil {
		t.Fatalf("reload plugins state after workspace uninstall: %v", err)
	}
	if _, ok := state.PluginConfigByID[workspaceConfigKey]; ok {
		t.Fatalf("expected workspace-scoped config to be removed, got %#v", state.PluginConfigByID)
	}
	if globalConfig, ok := state.PluginConfigByID[globalConfigKey].(map[string]any); !ok || globalConfig["label"] != "global-config" {
		t.Fatalf("expected preserved global config, got %#v", state.PluginConfigByID[globalConfigKey])
	}

	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime after workspace uninstall: %v", err)
	}
	if len(runtimeResponse.List.Plugins) != 1 {
		t.Fatalf("expected one remaining plugin, got %#v", runtimeResponse.List.Plugins)
	}
	entry := runtimeResponse.List.Plugins[0]
	if entry.PluginID != "setta-fixture-full" || entry.SourceScope != PluginScopeGlobal {
		t.Fatalf("expected global plugin to remain after workspace uninstall, got %#v", entry)
	}
	if got := entry.Config.CurrentConfig["label"]; got != "global-config" {
		t.Fatalf("expected global config label after shadow removal, got %#v", got)
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

func TestServiceUninstallClearsPersistedPluginConfigBeforeRelink(t *testing.T) {
	// Uninstall should clear persisted config so relinking the same plugin starts from defaults.
	workspaceConfigKey := pluginConfigKey("setta-fixture-full", PluginScopeWorkspace, PluginSourceManagerSetta)

	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	sourceRoot := mustCopyAuthoringFixturePlugin(t, roots.workspaceRoot, "full")

	linkResult, err := service.Link(LinkOptions{
		LocalPluginRoot: sourceRoot,
		Scope:           scopePointer(PluginScopeWorkspace),
		Enable:          true,
		Force:           false,
	})
	if err != nil {
		t.Fatalf("link plugin: %v", err)
	}
	if !linkResult.RestartRequired {
		t.Fatalf("expected backend-capable full plugin link to require restart")
	}
	if _, err := service.CommitBackendRuntimeRefresh(); err != nil {
		t.Fatalf("commit backend runtime refresh after link: %v", err)
	}

	if _, err := service.WriteConfig(context.Background(), ConfigWriteOptions{
		PluginID: "setta-fixture-full",
		Config: map[string]any{
			"enabled": true,
			"label":   "persisted-config",
		},
	}); err != nil {
		t.Fatalf("write plugin config: %v", err)
	}

	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime after config write: %v", err)
	}
	if got := runtimeResponse.List.Plugins[0].Config.CurrentConfig["label"]; got != "persisted-config" {
		t.Fatalf("expected persisted config label before uninstall, got %#v", got)
	}

	uninstallResult, err := service.Uninstall(context.Background(), UninstallOptions{
		PluginID: "setta-fixture-full",
		Scope:    scopePointer(PluginScopeWorkspace),
	})
	if err != nil {
		t.Fatalf("uninstall plugin: %v", err)
	}
	if !uninstallResult.RestartRequired {
		t.Fatalf("expected uninstall to require restart for backend-capable plugin")
	}
	if _, err := service.CommitBackendRuntimeRefresh(); err != nil {
		t.Fatalf("commit backend runtime refresh after uninstall: %v", err)
	}

	state, err := service.store.LoadPluginsState()
	if err != nil {
		t.Fatalf("load plugins state after uninstall: %v", err)
	}
	if _, ok := state.PluginConfigByID[workspaceConfigKey]; ok {
		t.Fatalf("expected uninstall to clear persisted plugin config, got %#v", state.PluginConfigByID)
	}

	relinkResult, err := service.Link(LinkOptions{
		LocalPluginRoot: sourceRoot,
		Scope:           scopePointer(PluginScopeWorkspace),
		Enable:          true,
		Force:           false,
	})
	if err != nil {
		t.Fatalf("relink plugin: %v", err)
	}
	if !relinkResult.RestartRequired {
		t.Fatalf("expected relink to require restart for backend-capable plugin")
	}
	if _, err := service.CommitBackendRuntimeRefresh(); err != nil {
		t.Fatalf("commit backend runtime refresh after relink: %v", err)
	}

	runtimeResponse, err = service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime after relink: %v", err)
	}
	if len(runtimeResponse.List.Plugins) != 1 {
		t.Fatalf("expected one relinked plugin, got %#v", runtimeResponse.List.Plugins)
	}
	if len(runtimeResponse.List.Plugins[0].Config.CurrentConfig) != 0 {
		t.Fatalf("expected relinked plugin config to reset to defaults, got %#v", runtimeResponse.List.Plugins[0].Config.CurrentConfig)
	}
}

func TestServiceWriteConfigKeepsSameScopeSourceManagersIsolated(t *testing.T) {
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
	service := mustNewPluginMutationServiceWithPackageManager(t, roots, nil, config.ModeIDE, []string{sitePackages})

	packageManagerConfig := map[string]any{
		"enabled": true,
		"label":   "package-manager-config",
	}
	if _, err := service.WriteConfig(context.Background(), ConfigWriteOptions{
		PluginID: "setta-fixture-frontend",
		Config:   packageManagerConfig,
	}); err != nil {
		t.Fatalf("write package-manager plugin config: %v", err)
	}

	localRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeSettaFiles, "frontend")
	rewritePluginManifest(t, localRoot, func(payload map[string]any) {
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/index.js"
		frontend["style"] = "frontend/src/index.css"
	})

	localConfig := map[string]any{
		"enabled": true,
		"label":   "local-config",
	}
	if _, err := service.WriteConfig(context.Background(), ConfigWriteOptions{
		PluginID: "setta-fixture-frontend",
		Config:   localConfig,
	}); err != nil {
		t.Fatalf("write local setta_files plugin config: %v", err)
	}

	state, err := service.store.LoadPluginsState()
	if err != nil {
		t.Fatalf("load plugins state: %v", err)
	}
	packageManagerKey := pluginConfigKey("setta-fixture-frontend", PluginScopeSettaFiles, PluginSourceManagerPackageManager)
	localKey := pluginConfigKey("setta-fixture-frontend", PluginScopeSettaFiles, PluginSourceManagerSetta)
	if got, ok := state.PluginConfigByID[packageManagerKey].(map[string]any); !ok || got["label"] != "package-manager-config" {
		t.Fatalf("expected package-manager config entry, got %#v", state.PluginConfigByID)
	}
	if got, ok := state.PluginConfigByID[localKey].(map[string]any); !ok || got["label"] != "local-config" {
		t.Fatalf("expected local setta_files config entry, got %#v", state.PluginConfigByID)
	}

	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime with shadowing local plugin: %v", err)
	}
	if len(runtimeResponse.List.Plugins) != 1 {
		t.Fatalf("expected one active runtime plugin, got %#v", runtimeResponse.List.Plugins)
	}
	if got := runtimeResponse.List.Plugins[0].Config.CurrentConfig["label"]; got != "local-config" {
		t.Fatalf("expected local config on active shadowing plugin, got %#v", got)
	}

	uninstallResult, err := service.Uninstall(context.Background(), UninstallOptions{
		PluginID: "setta-fixture-frontend",
		Scope:    scopePointer(PluginScopeSettaFiles),
	})
	if err != nil {
		t.Fatalf("uninstall local setta_files plugin: %v", err)
	}
	if uninstallResult.RemovedFromScope != PluginScopeSettaFiles {
		t.Fatalf("unexpected uninstall scope %#v", uninstallResult)
	}

	state, err = service.store.LoadPluginsState()
	if err != nil {
		t.Fatalf("reload plugins state after uninstall: %v", err)
	}
	if _, ok := state.PluginConfigByID[localKey]; ok {
		t.Fatalf("expected local config entry to be removed, got %#v", state.PluginConfigByID)
	}
	if got, ok := state.PluginConfigByID[packageManagerKey].(map[string]any); !ok || got["label"] != "package-manager-config" {
		t.Fatalf("expected package-manager config to remain, got %#v", state.PluginConfigByID)
	}

	runtimeResponse, err = service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime after local uninstall: %v", err)
	}
	if len(runtimeResponse.List.Plugins) != 1 {
		t.Fatalf("expected one remaining runtime plugin, got %#v", runtimeResponse.List.Plugins)
	}
	if runtimeResponse.List.Plugins[0].SourceManager != PluginSourceManagerPackageManager {
		t.Fatalf("expected package-manager plugin to remain active, got %#v", runtimeResponse.List.Plugins[0].SourceManager)
	}
	if got := runtimeResponse.List.Plugins[0].Config.CurrentConfig["label"]; got != "package-manager-config" {
		t.Fatalf("expected package-manager config after local uninstall, got %#v", got)
	}
}
