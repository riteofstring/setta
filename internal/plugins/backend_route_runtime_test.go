package plugins

import (
	"context"
	"testing"

	"setta/internal/config"
	"setta/internal/projectstate"
	"setta/internal/realtime"
)

// Tool-only backend plugins should stay live and proxy MCP tool calls over the worker RPC boundary.
func TestBackendRouteRuntimeInvokesToolOnlyFixtureMCPTools(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend-mcp-tools")

	runtime := mustNewBackendRouteRuntime(t, roots, config.ModeIDE)
	defer func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close backend route runtime: %v", err)
		}
	}()

	tools := runtime.MCPTools()
	if len(tools) != 2 {
		t.Fatalf("expected 2 registered backend mcp tools, got %#v", tools)
	}

	result, err := runtime.InvokeMCPTool(context.Background(), "setta_fixture_mcp_read", map[string]any{
		"value": "alpha",
	})
	if err != nil {
		t.Fatalf("invoke read tool: %v", err)
	}
	if result != "read:setta-fixture-backend-mcp-tools:alpha" {
		t.Fatalf("unexpected read tool result %#v", result)
	}
}

// Backend fixture plugins should still support project-state reads over retained MCP tools.
func TestBackendRouteRuntimeSupportsProjectStateReadsOverMCPTools(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")

	projectRuntime := newWorkerHostTestProjectRuntime(t, projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "fixture-project",
		Projects: map[string]projectstate.Project{
			"fixture-project": {
				ID:   "fixture-project",
				Name: "Fixture Project",
			},
		},
	})
	reader, err := NewRuntimeProjectStateReader(RuntimeProjectStateReaderOptions{
		ProjectState: projectRuntime,
	})
	if err != nil {
		t.Fatalf("new project state reader: %v", err)
	}

	runtime := mustNewBackendRouteRuntimeWithOptions(t, roots, config.ModeIDE, reader, nil)
	defer func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close backend route runtime: %v", err)
		}
	}()

	result, err := runtime.InvokeMCPTool(context.Background(), "setta_fixture_backend_project_summary", map[string]any{
		"project_config_id": "fixture-project",
	})
	if err != nil {
		t.Fatalf("invoke project summary tool: %v", err)
	}
	projectSummary, ok := result.(map[string]any)
	if !ok {
		t.Fatalf("expected map project summary result, got %#v", result)
	}
	projectConfig, ok := projectSummary["projectConfig"].(map[string]any)
	if !ok || projectConfig["id"] != "fixture-project" {
		t.Fatalf("unexpected project summary tool result %#v", result)
	}
}

// Mixed tool and language-server backend plugins should still keep one live worker session for retained registrations.
func TestBackendRouteRuntimeSupportsMixedToolAndLanguageServerFixtures(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend-language-server-e2e")

	runtime := mustNewBackendRouteRuntime(t, roots, config.ModeIDE)
	defer func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close backend route runtime: %v", err)
		}
	}()

	tools := runtime.MCPTools()
	if len(tools) != 1 {
		t.Fatalf("expected 1 registered backend mcp tool, got %#v", tools)
	}

	result, err := runtime.InvokeMCPTool(context.Background(), "setta_fixture_backend_language_server_tool", map[string]any{
		"value": "tool",
	})
	if err != nil {
		t.Fatalf("invoke mixed fixture tool: %v", err)
	}
	if result != "language-server:setta-fixture-backend-language-server-e2e:tool" {
		t.Fatalf("unexpected mixed fixture tool result %#v", result)
	}
}

func mustNewBackendRouteRuntime(t *testing.T, roots filesystemResolverTestRoots, mode config.Mode) *BackendRouteRuntime {
	t.Helper()

	return mustNewBackendRouteRuntimeWithOptions(t, roots, mode, nil, nil)
}

func mustNewBackendRouteRuntimeWithOptions(
	t *testing.T,
	roots filesystemResolverTestRoots,
	mode config.Mode,
	reader ProjectStateReader,
	listenerProducer *realtime.ListenerProducer,
) *BackendRouteRuntime {
	t.Helper()

	store, err := NewStore(StoreOptions{
		WorkspaceRoot:  roots.workspaceRoot,
		SettaFilesRoot: roots.settaFilesRoot,
		SettaHome:      roots.settaHome,
	})
	if err != nil {
		t.Fatalf("new backend route runtime store: %v", err)
	}
	discovery, err := NewDiscoveryService(DiscoveryServiceOptions{
		Store:      store,
		ServerMode: mode,
	})
	if err != nil {
		t.Fatalf("new backend route runtime discovery service: %v", err)
	}

	repoRoot := workerRPCTestRepoRoot(t)
	runtime, err := NewBackendRouteRuntime(context.Background(), BackendRouteRuntimeOptions{
		DiscoveryService: discovery,
		RuntimeProvider: WorkerRuntimeProviderFunc(func(context.Context) (WorkerRuntime, error) {
			return WorkerRuntime{
				CommandPrefix:    workerRPCTestCommandPrefix(t, repoRoot),
				Environment:      workerRPCTestEnv(repoRoot),
				WorkingDirectory: repoRoot,
			}, nil
		}),
		ListenerProducer: listenerProducer,
		ProjectStateRead: reader,
		ServerMode:       mode,
	})
	if err != nil {
		t.Fatalf("new backend route runtime: %v", err)
	}
	return runtime
}
