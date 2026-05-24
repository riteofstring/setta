package mcpx

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
	"setta/internal/config"
	"setta/internal/plugins"
)

func TestServerPluginManagementTools(t *testing.T) {
	t.Parallel()

	t.Run("supports rescan and uninstall for preexisting workspace fixture", func(t *testing.T) {
		projectRuntime := openScopedTestProjectRuntime(t)
		roots, service := newTestPluginMutationService(t, nil)

		pluginRoot := filepath.Join(roots.workspaceRoot, ".setta_plugins", "setta-fixture-frontend")
		if err := copyPluginFixtureDir(filepath.Join(pluginFixtureRepoRoot(t), "tests", "fixtures", "plugins", "frontend"), pluginRoot); err != nil {
			t.Fatalf("copy frontend fixture: %v", err)
		}
		if err := rewritePluginManifest(pluginRoot, func(payload map[string]any) {
			frontend := payload["frontend"].(map[string]any)
			frontend["entrypoint"] = "frontend/src/index.js"
			frontend["style"] = "frontend/src/index.css"
		}); err != nil {
			t.Fatalf("rewrite frontend fixture manifest: %v", err)
		}

		_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
			WorkspaceRoot:   roots.workspaceRoot,
			ProjectState:    projectRuntime,
			LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
			PluginMutations: service,
		})
		defer clientSession.Close()

		rescanResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name:      "rescan_plugins",
			Arguments: map[string]any{},
		})
		if err != nil {
			t.Fatalf("call rescan_plugins: %v", err)
		}
		if rescanResult.IsError {
			t.Fatalf("expected rescan_plugins success, got %#v", rescanResult.StructuredContent)
		}
		rescanPayload := mustStructuredMap(t, rescanResult.StructuredContent)
		if rescanPayload["installedPlugins"] != float64(1) {
			t.Fatalf("expected one installed plugin, got %#v", rescanPayload["installedPlugins"])
		}
		if rescanPayload["activePlugins"] != float64(1) {
			t.Fatalf("expected one active plugin, got %#v", rescanPayload["activePlugins"])
		}

		uninstallResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name: "uninstall_plugin",
			Arguments: map[string]any{
				"pluginId": "setta-fixture-frontend",
				"scope":    "workspace",
			},
		})
		if err != nil {
			t.Fatalf("call uninstall_plugin: %v", err)
		}
		if uninstallResult.IsError {
			t.Fatalf("expected uninstall_plugin success, got %#v", uninstallResult.StructuredContent)
		}
		uninstalled := mustStructuredMap(t, uninstallResult.StructuredContent)
		if uninstalled["removedFromScope"] != "workspace" {
			t.Fatalf("expected workspace removedFromScope, got %#v", uninstalled["removedFromScope"])
		}
		if uninstalled["restartRequired"] != false {
			t.Fatalf("expected restartRequired=false, got %#v", uninstalled["restartRequired"])
		}

		finalRescanResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name:      "rescan_plugins",
			Arguments: map[string]any{},
		})
		if err != nil {
			t.Fatalf("call rescan_plugins after uninstall: %v", err)
		}
		if finalRescanResult.IsError {
			t.Fatalf("expected final rescan_plugins success, got %#v", finalRescanResult.StructuredContent)
		}
		finalRescan := mustStructuredMap(t, finalRescanResult.StructuredContent)
		if finalRescan["installedPlugins"] != float64(0) {
			t.Fatalf("expected zero installed plugins, got %#v", finalRescan["installedPlugins"])
		}
		if finalRescan["activePlugins"] != float64(0) {
			t.Fatalf("expected zero active plugins, got %#v", finalRescan["activePlugins"])
		}
	})

	t.Run("supports install rescan update rollback and uninstall", func(t *testing.T) {
		projectRuntime := openScopedTestProjectRuntime(t)
		roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
			"pypi:setta-fixture-frontend==0.1.0": {
				FixtureName: "frontend",
				Version:     "0.1.0",
			},
			"pypi:setta-fixture-frontend==0.2.0": {
				FixtureName: "frontend",
				Version:     "0.2.0",
			},
		})

		_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
			WorkspaceRoot:   roots.workspaceRoot,
			ProjectState:    projectRuntime,
			LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
			PluginMutations: service,
		})
		defer clientSession.Close()

		installResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name: "install_plugin",
			Arguments: map[string]any{
				"sourceSpec": "pypi:setta-fixture-frontend==0.1.0",
				"scope":      "workspace",
				"installer":  "pip",
			},
		})
		if err != nil {
			t.Fatalf("call install_plugin: %v", err)
		}
		if installResult.IsError {
			t.Fatalf("expected install_plugin success, got %#v", installResult.StructuredContent)
		}
		installed := mustStructuredMap(t, installResult.StructuredContent)
		if installed["pluginId"] != "setta-fixture-frontend" {
			t.Fatalf("expected setta-fixture-frontend plugin id, got %#v", installed["pluginId"])
		}
		if installed["sourceScopeLabel"] != "workspace" {
			t.Fatalf("expected workspace source scope label, got %#v", installed["sourceScopeLabel"])
		}
		if installed["trustStatus"] != "unverified" {
			t.Fatalf("expected unverified trust status, got %#v", installed["trustStatus"])
		}

		rescanResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name:      "rescan_plugins",
			Arguments: map[string]any{},
		})
		if err != nil {
			t.Fatalf("call rescan_plugins after install: %v", err)
		}
		if rescanResult.IsError {
			t.Fatalf("expected rescan_plugins success, got %#v", rescanResult.StructuredContent)
		}
		rescanPayload := mustStructuredMap(t, rescanResult.StructuredContent)
		if rescanPayload["installedPlugins"] != float64(1) {
			t.Fatalf("expected one installed plugin, got %#v", rescanPayload["installedPlugins"])
		}
		if rescanPayload["activePlugins"] != float64(1) {
			t.Fatalf("expected one active plugin, got %#v", rescanPayload["activePlugins"])
		}

		updateResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name: "update_plugin",
			Arguments: map[string]any{
				"pluginId": "setta-fixture-frontend",
				"scope":    "workspace",
				"to":       "0.2.0",
			},
		})
		if err != nil {
			t.Fatalf("call update_plugin: %v", err)
		}
		if updateResult.IsError {
			t.Fatalf("expected update_plugin success, got %#v", updateResult.StructuredContent)
		}
		updated := mustStructuredMap(t, updateResult.StructuredContent)
		if updated["fromVersion"] != "0.1.0" || updated["toVersion"] != "0.2.0" {
			t.Fatalf("expected version update 0.1.0 -> 0.2.0, got %#v", updated)
		}

		rollbackResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name: "rollback_plugin",
			Arguments: map[string]any{
				"pluginId": "setta-fixture-frontend",
				"scope":    "workspace",
			},
		})
		if err != nil {
			t.Fatalf("call rollback_plugin: %v", err)
		}
		if rollbackResult.IsError {
			t.Fatalf("expected rollback_plugin success, got %#v", rollbackResult.StructuredContent)
		}
		rolledBack := mustStructuredMap(t, rollbackResult.StructuredContent)
		if rolledBack["restoredVersion"] != "0.1.0" {
			t.Fatalf("expected restored version 0.1.0, got %#v", rolledBack["restoredVersion"])
		}

		uninstallResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name: "uninstall_plugin",
			Arguments: map[string]any{
				"pluginId": "setta-fixture-frontend",
				"scope":    "workspace",
			},
		})
		if err != nil {
			t.Fatalf("call uninstall_plugin: %v", err)
		}
		if uninstallResult.IsError {
			t.Fatalf("expected uninstall_plugin success, got %#v", uninstallResult.StructuredContent)
		}
		uninstalled := mustStructuredMap(t, uninstallResult.StructuredContent)
		if uninstalled["removedFromScope"] != "workspace" {
			t.Fatalf("expected workspace removedFromScope, got %#v", uninstalled["removedFromScope"])
		}

		finalRescanResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name:      "rescan_plugins",
			Arguments: map[string]any{},
		})
		if err != nil {
			t.Fatalf("call rescan_plugins after uninstall: %v", err)
		}
		if finalRescanResult.IsError {
			t.Fatalf("expected final rescan_plugins success, got %#v", finalRescanResult.StructuredContent)
		}
		finalRescan := mustStructuredMap(t, finalRescanResult.StructuredContent)
		if finalRescan["installedPlugins"] != float64(0) {
			t.Fatalf("expected zero installed plugins, got %#v", finalRescan["installedPlugins"])
		}
		if finalRescan["activePlugins"] != float64(0) {
			t.Fatalf("expected zero active plugins, got %#v", finalRescan["activePlugins"])
		}
	})

	t.Run("supports setta_files scope lifecycle", func(t *testing.T) {
		projectRuntime := openScopedTestProjectRuntime(t)
		roots, service := newTestPluginMutationService(t, map[string]pluginFixtureSpec{
			"pypi:setta-fixture-frontend==0.1.0": {
				FixtureName: "frontend",
				Version:     "0.1.0",
			},
		})

		_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
			WorkspaceRoot:   roots.workspaceRoot,
			ProjectState:    projectRuntime,
			LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
			PluginMutations: service,
		})
		defer clientSession.Close()

		installResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name: "install_plugin",
			Arguments: map[string]any{
				"sourceSpec": "pypi:setta-fixture-frontend==0.1.0",
				"scope":      "setta_files",
				"installer":  "pip",
			},
		})
		if err != nil {
			t.Fatalf("call install_plugin: %v", err)
		}
		if installResult.IsError {
			t.Fatalf("expected install_plugin success, got %#v", installResult.StructuredContent)
		}
		installed := mustStructuredMap(t, installResult.StructuredContent)
		if installed["pluginId"] != "setta-fixture-frontend" {
			t.Fatalf("expected setta-fixture-frontend plugin id, got %#v", installed["pluginId"])
		}
		if installed["sourceScope"] != "setta_files" {
			t.Fatalf("expected setta_files source scope, got %#v", installed["sourceScope"])
		}
		if installed["sourceScopeLabel"] != "setta_files" {
			t.Fatalf("expected setta_files source scope label, got %#v", installed["sourceScopeLabel"])
		}

		updateResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name: "update_plugin",
			Arguments: map[string]any{
				"pluginId": "setta-fixture-frontend",
				"scope":    "setta_files",
			},
		})
		if err != nil {
			t.Fatalf("call update_plugin: %v", err)
		}
		if updateResult.IsError {
			t.Fatalf("expected update_plugin success, got %#v", updateResult.StructuredContent)
		}
		updated := mustStructuredMap(t, updateResult.StructuredContent)
		if updated["fromVersion"] != "0.1.0" || updated["toVersion"] != "0.1.0" {
			t.Fatalf("expected version update 0.1.0 -> 0.1.0, got %#v", updated)
		}

		rollbackResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name: "rollback_plugin",
			Arguments: map[string]any{
				"pluginId": "setta-fixture-frontend",
				"scope":    "setta_files",
			},
		})
		if err != nil {
			t.Fatalf("call rollback_plugin: %v", err)
		}
		if rollbackResult.IsError {
			t.Fatalf("expected rollback_plugin success, got %#v", rollbackResult.StructuredContent)
		}
		rolledBack := mustStructuredMap(t, rollbackResult.StructuredContent)
		if rolledBack["restoredVersion"] != "0.1.0" {
			t.Fatalf("expected restored version 0.1.0, got %#v", rolledBack["restoredVersion"])
		}

		uninstallResult, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name: "uninstall_plugin",
			Arguments: map[string]any{
				"pluginId": "setta-fixture-frontend",
				"scope":    "setta_files",
			},
		})
		if err != nil {
			t.Fatalf("call uninstall_plugin: %v", err)
		}
		if uninstallResult.IsError {
			t.Fatalf("expected uninstall_plugin success, got %#v", uninstallResult.StructuredContent)
		}
		uninstalled := mustStructuredMap(t, uninstallResult.StructuredContent)
		if uninstalled["removedFromScope"] != "setta_files" {
			t.Fatalf("expected setta_files removedFromScope, got %#v", uninstalled["removedFromScope"])
		}
	})

	t.Run("rejects unsupported source schemes as invalid arguments", func(t *testing.T) {
		projectRuntime := openScopedTestProjectRuntime(t)
		roots, service := newTestPluginMutationService(t, nil)

		_, clientSession := newScopedTestServerSessionWithOptions(t, roots.workspaceRoot, projectRuntime, ServerOptions{
			WorkspaceRoot:   roots.workspaceRoot,
			ProjectState:    projectRuntime,
			LSPDiagnostics:  openScopedTestLSPDiagnosticsRegistry(),
			PluginMutations: service,
		})
		defer clientSession.Close()

		result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name: "install_plugin",
			Arguments: map[string]any{
				"sourceSpec": "local:/tmp/not-supported",
			},
		})
		if err != nil {
			t.Fatalf("call install_plugin with unsupported scheme: %v", err)
		}
		if !result.IsError {
			t.Fatal("expected install_plugin with unsupported scheme to fail")
		}
		payload := mustStructuredMap(t, result.StructuredContent)
		if payload["code"] != "invalid_arguments" {
			t.Fatalf("expected invalid_arguments, got %#v", payload["code"])
		}
		if !strings.Contains(payload["message"].(string), "Unsupported plugin source scheme") {
			t.Fatalf("expected unsupported source scheme message, got %#v", payload["message"])
		}
	})

	t.Run("reports runtime unavailable when plugin service is missing", func(t *testing.T) {
		projectRuntime := openScopedTestProjectRuntime(t)
		_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
			WorkspaceRoot:  t.TempDir(),
			ProjectState:   projectRuntime,
			LSPDiagnostics: openScopedTestLSPDiagnosticsRegistry(),
		})
		defer clientSession.Close()

		result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
			Name: "install_plugin",
			Arguments: map[string]any{
				"sourceSpec": "pypi:setta-fixture-frontend==0.1.0",
			},
		})
		if err != nil {
			t.Fatalf("call install_plugin without runtime: %v", err)
		}
		if !result.IsError {
			t.Fatal("expected install_plugin without runtime to fail")
		}
		payload := mustStructuredMap(t, result.StructuredContent)
		if payload["code"] != "internal_error" {
			t.Fatalf("expected internal_error code, got %#v", payload["code"])
		}
		if payload["message"] != "Plugin mutation runtime is unavailable." {
			t.Fatalf("expected unavailable message, got %#v", payload["message"])
		}
	})
}

type pluginFixtureSpec struct {
	FixtureName  string
	Version      string
	StripBackend bool
}

type testPluginRoots struct {
	workspaceRoot  string
	settaFilesRoot string
	settaHome      string
}

type pluginFixtureCandidateProvider struct {
	t        *testing.T
	baseRoot string
	entries  map[string]pluginFixtureSpec
}

func newTestPluginMutationService(t *testing.T, entries map[string]pluginFixtureSpec) (testPluginRoots, *plugins.Service) {
	t.Helper()

	root := t.TempDir()
	roots := testPluginRoots{
		workspaceRoot:  filepath.Join(root, "workspace"),
		settaFilesRoot: filepath.Join(root, "setta_files"),
		settaHome:      filepath.Join(root, "setta_home"),
	}
	for _, path := range []string{roots.workspaceRoot, roots.settaFilesRoot, roots.settaHome} {
		if err := os.MkdirAll(path, 0o755); err != nil {
			t.Fatalf("mkdir %s: %v", path, err)
		}
	}

	service, err := plugins.NewService(plugins.ServiceOptions{
		WorkspaceRoot:  roots.workspaceRoot,
		SettaFilesRoot: roots.settaFilesRoot,
		SettaHome:      roots.settaHome,
		ServerMode:     config.ModeIDE,
		CandidateProvider: &pluginFixtureCandidateProvider{
			t:        t,
			baseRoot: t.TempDir(),
			entries:  entries,
		},
	})
	if err != nil {
		t.Fatalf("new plugin service: %v", err)
	}
	return roots, service
}

func (p *pluginFixtureCandidateProvider) ResolveCandidate(_ context.Context, spec plugins.ParsedSourceSpec, _ plugins.PluginInstallerBackend) (plugins.CandidatePlugin, error) {
	fixtureSpec, ok := p.entries[spec.Raw]
	if !ok {
		return plugins.CandidatePlugin{}, &plugins.ServiceError{
			Code:    plugins.ServiceErrorCodeSourceFetchFailed,
			Message: "candidate fixture not configured: " + spec.Raw,
		}
	}

	sourceRoot := filepath.Join(pluginFixtureRepoRoot(p.t), "tests", "fixtures", "plugins", fixtureSpec.FixtureName)
	manifestPath := filepath.Join(sourceRoot, "setta.plugin.json")
	manifestPayload, err := os.ReadFile(manifestPath)
	if err != nil {
		return plugins.CandidatePlugin{}, err
	}
	var manifest struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(manifestPayload, &manifest); err != nil {
		return plugins.CandidatePlugin{}, err
	}
	targetParent := filepath.Join(p.baseRoot, strings.NewReplacer("/", "_", "#", "_", ":", "_", "@", "_", "=", "_").Replace(spec.Raw))
	targetRoot := filepath.Join(targetParent, manifest.ID)
	if err := copyPluginFixtureDir(sourceRoot, targetRoot); err != nil {
		return plugins.CandidatePlugin{}, err
	}
	if fixtureSpec.FixtureName == "frontend" {
		if err := rewritePluginManifest(targetRoot, func(payload map[string]any) {
			frontend := payload["frontend"].(map[string]any)
			frontend["entrypoint"] = "frontend/src/index.js"
			frontend["style"] = "frontend/src/index.css"
		}); err != nil {
			return plugins.CandidatePlugin{}, err
		}
	}
	if fixtureSpec.StripBackend {
		if err := rewritePluginManifest(targetRoot, func(payload map[string]any) {
			delete(payload, "backend")
		}); err != nil {
			return plugins.CandidatePlugin{}, err
		}
	}
	if fixtureSpec.Version != "" {
		if err := rewritePluginManifest(targetRoot, func(payload map[string]any) {
			payload["version"] = fixtureSpec.Version
		}); err != nil {
			return plugins.CandidatePlugin{}, err
		}
	}
	return plugins.CandidatePlugin{
		Root:               targetRoot,
		CanonicalSourceKey: spec.CanonicalSourceKey,
	}, nil
}

func pluginFixtureRepoRoot(t *testing.T) string {
	t.Helper()

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve caller path")
	}
	return filepath.Dir(filepath.Dir(filepath.Dir(file)))
}

func copyPluginFixtureDir(sourceRoot string, targetRoot string) error {
	return filepath.Walk(sourceRoot, func(path string, info os.FileInfo, err error) error {
		if err != nil {
			return err
		}
		relativePath, err := filepath.Rel(sourceRoot, path)
		if err != nil {
			return err
		}
		destination := filepath.Join(targetRoot, relativePath)
		if info.IsDir() {
			return os.MkdirAll(destination, info.Mode())
		}
		payload, err := os.ReadFile(path)
		if err != nil {
			return err
		}
		if err := os.MkdirAll(filepath.Dir(destination), 0o755); err != nil {
			return err
		}
		return os.WriteFile(destination, payload, info.Mode())
	})
}

func rewritePluginManifest(pluginRoot string, mutate func(map[string]any)) error {
	manifestPath := filepath.Join(pluginRoot, "setta.plugin.json")
	payload, err := os.ReadFile(manifestPath)
	if err != nil {
		return err
	}
	var decoded map[string]any
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return err
	}
	mutate(decoded)
	encoded, err := json.MarshalIndent(decoded, "", "  ")
	if err != nil {
		return err
	}
	encoded = append(encoded, '\n')
	return os.WriteFile(manifestPath, encoded, 0o644)
}
