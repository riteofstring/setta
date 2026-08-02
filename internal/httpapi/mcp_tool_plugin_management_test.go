package httpapi

import (
	"context"
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/config"
	"setta/internal/mcpx"
	"setta/internal/modes"
	"setta/internal/plugins"
)

func TestMCPToolCallRouteSupportsPluginManagementTools(t *testing.T) {
	t.Parallel()

	projectRuntime := openMCPToolRouteProjectRuntime(t)
	diagnostics := openMCPToolRouteDiagnosticsRegistry()
	roots, service := newRoutePluginMutationService(t, map[string]routePluginFixtureSpec{
		"pypi:setta-fixture-frontend==0.1.0": {
			FixtureName: "frontend",
			Version:     "0.1.0",
		},
		"pypi:setta-fixture-frontend==0.2.0": {
			FixtureName: "frontend",
			Version:     "0.2.0",
		},
	})
	server, err := mcpx.NewServer(mcpx.ServerOptions{
		WorkspaceRoot:   roots.workspaceRoot,
		ProjectState:    projectRuntime,
		SectionNames:    routeSectionNameService{runtime: projectRuntime},
		LSPDiagnostics:  diagnostics,
		PluginMutations: service,
	})
	if err != nil {
		t.Fatalf("new mcp server: %v", err)
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: "ide", info: RuntimeInfo{Mode: "ide"}},
		ModePolicy: modes.NewPolicy(config.ModeIDE),
		RegisterAuthenticatedRoot: func(r chi.Router) {
			if err := RegisterMCPRootRoutes(r, MCPRootRouteDependencies{
				ModePolicy: modes.NewPolicy(config.ModeIDE),
				Server:     server,
			}); err != nil {
				panic(err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}

	installResponse := postMCPToolRoute(t, handler, `{
		"tool":"install_plugin",
		"arguments":{
			"sourceSpec":"pypi:setta-fixture-frontend==0.1.0",
			"scope":"workspace",
			"installer":"pip"
		}
	}`)
	if installResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", installResponse.Code, installResponse.Body.String())
	}
	installPayload := decodeCallToolRouteResult(t, installResponse.Body.Bytes())
	if installPayload.IsError {
		t.Fatalf("expected install_plugin success, got %#v", installPayload.StructuredContent)
	}
	installed := mustStructuredMapForRoute(t, installPayload.StructuredContent)
	if installed["pluginId"] != "setta-fixture-frontend" {
		t.Fatalf("expected setta-fixture-frontend plugin id, got %#v", installed["pluginId"])
	}

	rescanResponse := postMCPToolRoute(t, handler, `{"tool":"rescan_plugins","arguments":{}}`)
	if rescanResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", rescanResponse.Code, rescanResponse.Body.String())
	}
	rescanPayload := decodeCallToolRouteResult(t, rescanResponse.Body.Bytes())
	if rescanPayload.IsError {
		t.Fatalf("expected rescan_plugins success, got %#v", rescanPayload.StructuredContent)
	}
	rescan := mustStructuredMapForRoute(t, rescanPayload.StructuredContent)
	if rescan["installedPlugins"] != float64(1) {
		t.Fatalf("expected one installed plugin, got %#v", rescan["installedPlugins"])
	}

	updateResponse := postMCPToolRoute(t, handler, `{
		"tool":"update_plugin",
		"arguments":{
			"pluginId":"setta-fixture-frontend",
			"scope":"workspace",
			"to":"0.2.0"
		}
	}`)
	if updateResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", updateResponse.Code, updateResponse.Body.String())
	}
	updatePayload := decodeCallToolRouteResult(t, updateResponse.Body.Bytes())
	if updatePayload.IsError {
		t.Fatalf("expected update_plugin success, got %#v", updatePayload.StructuredContent)
	}
	updated := mustStructuredMapForRoute(t, updatePayload.StructuredContent)
	if updated["toVersion"] != "0.2.0" {
		t.Fatalf("expected updated version 0.2.0, got %#v", updated["toVersion"])
	}

	rollbackResponse := postMCPToolRoute(t, handler, `{
		"tool":"rollback_plugin",
		"arguments":{
			"pluginId":"setta-fixture-frontend",
			"scope":"workspace"
		}
	}`)
	if rollbackResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", rollbackResponse.Code, rollbackResponse.Body.String())
	}
	rollbackPayload := decodeCallToolRouteResult(t, rollbackResponse.Body.Bytes())
	if rollbackPayload.IsError {
		t.Fatalf("expected rollback_plugin success, got %#v", rollbackPayload.StructuredContent)
	}
	rolledBack := mustStructuredMapForRoute(t, rollbackPayload.StructuredContent)
	if rolledBack["restoredVersion"] != "0.1.0" {
		t.Fatalf("expected restored version 0.1.0, got %#v", rolledBack["restoredVersion"])
	}

	uninstallResponse := postMCPToolRoute(t, handler, `{
		"tool":"uninstall_plugin",
		"arguments":{
			"pluginId":"setta-fixture-frontend",
			"scope":"workspace"
		}
	}`)
	if uninstallResponse.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", uninstallResponse.Code, uninstallResponse.Body.String())
	}
	uninstallPayload := decodeCallToolRouteResult(t, uninstallResponse.Body.Bytes())
	if uninstallPayload.IsError {
		t.Fatalf("expected uninstall_plugin success, got %#v", uninstallPayload.StructuredContent)
	}
	uninstalled := mustStructuredMapForRoute(t, uninstallPayload.StructuredContent)
	if uninstalled["removedFromScope"] != "workspace" {
		t.Fatalf("expected workspace removedFromScope, got %#v", uninstalled["removedFromScope"])
	}
}

type routePluginFixtureSpec struct {
	FixtureName string
	Version     string
}

type routePluginRoots struct {
	workspaceRoot  string
	settaFilesRoot string
	settaHome      string
}

type routePluginFixtureProvider struct {
	t        *testing.T
	baseRoot string
	entries  map[string]routePluginFixtureSpec
}

func newRoutePluginMutationService(t *testing.T, entries map[string]routePluginFixtureSpec) (routePluginRoots, *plugins.Service) {
	t.Helper()

	root := t.TempDir()
	roots := routePluginRoots{
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
		CandidateProvider: &routePluginFixtureProvider{
			t:        t,
			baseRoot: t.TempDir(),
			entries:  entries,
		},
	})
	if err != nil {
		t.Fatalf("new route plugin service: %v", err)
	}
	return roots, service
}

func (p *routePluginFixtureProvider) ResolveCandidate(_ context.Context, spec plugins.ParsedSourceSpec, _ plugins.PluginInstallerBackend) (plugins.CandidatePlugin, error) {
	fixtureSpec, ok := p.entries[spec.Raw]
	if !ok {
		return plugins.CandidatePlugin{}, &plugins.ServiceError{
			Code:    plugins.ServiceErrorCodeSourceFetchFailed,
			Message: "candidate fixture not configured: " + spec.Raw,
		}
	}
	sourceRoot := filepath.Join(routePluginFixtureRepoRoot(p.t), "tests", "fixtures", "plugins", fixtureSpec.FixtureName)
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
	if err := copyRoutePluginFixtureDir(sourceRoot, targetRoot); err != nil {
		return plugins.CandidatePlugin{}, err
	}
	if fixtureSpec.FixtureName == "frontend" {
		if err := rewriteRoutePluginManifest(targetRoot, func(payload map[string]any) {
			frontend := payload["frontend"].(map[string]any)
			frontend["entrypoint"] = "frontend/src/index.js"
			frontend["style"] = "frontend/src/index.css"
		}); err != nil {
			return plugins.CandidatePlugin{}, err
		}
	}
	if fixtureSpec.Version != "" {
		if err := rewriteRoutePluginManifest(targetRoot, func(payload map[string]any) {
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

func routePluginFixtureRepoRoot(t *testing.T) string {
	t.Helper()

	_, file, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve caller path")
	}
	return filepath.Dir(filepath.Dir(filepath.Dir(file)))
}

func copyRoutePluginFixtureDir(sourceRoot string, targetRoot string) error {
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

func rewriteRoutePluginManifest(pluginRoot string, mutate func(map[string]any)) error {
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
