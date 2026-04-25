package plugins

import (
	"context"
	"net/http"
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"setta/internal/config"
)

func TestResolvePluginBackendLaunchIncludesPluginRootOnPythonPath(t *testing.T) {
	pythonPath, _ := preparePluginLanguageServerFixture(t)
	t.Setenv("SETTA_PYTHON", pythonPath)
	t.Setenv("PYTHONPATH", "")

	pluginRoot := writePythonBackendImportFixturePlugin(t, t.TempDir(), "setta-python-backend-env")
	launch, err := ResolvePluginBackendLaunch(pluginRoot, PluginManifest{
		ID: "setta-python-backend-env",
		Backend: &PluginBackendManifest{
			Entrypoint: "backend/main.py",
		},
	}, t.TempDir())
	if err != nil {
		t.Fatalf("resolve python backend launch: %v", err)
	}

	pythonPathEnv, ok := launch.Environment["PYTHONPATH"]
	if !ok {
		t.Fatalf("expected PYTHONPATH launch environment, got %#v", launch.Environment)
	}
	entries := filepath.SplitList(pythonPathEnv)
	if len(entries) == 0 || entries[0] != pluginRoot {
		t.Fatalf("expected plugin root %q to lead PYTHONPATH, got %#v", pluginRoot, entries)
	}
	if len(entries) != 1 {
		t.Fatalf("expected only plugin root in PYTHONPATH, got %#v", entries)
	}
}

func TestResolvePluginBackendLaunchForInstalledPythonPluginUsesOnlyPackageOwnedRoots(
	t *testing.T,
) {
	pythonPath, _ := preparePluginLanguageServerFixture(t)
	t.Setenv("SETTA_PYTHON", pythonPath)
	t.Setenv("PYTHONPATH", "")

	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	pluginRoot := writePythonBackendImportFixturePlugin(
		t,
		sitePackages,
		"setta-python-backend-installed",
	)
	vendoredSitePackages := filepath.Join(pluginRoot, pythonBackendSitePackagesDirName)
	if err := os.MkdirAll(vendoredSitePackages, 0o755); err != nil {
		t.Fatalf("mkdir vendored site-packages: %v", err)
	}
	if err := os.WriteFile(
		filepath.Join(vendoredSitePackages, "vendored_helper.py"),
		[]byte("VALUE = 1\n"),
		0o644,
	); err != nil {
		t.Fatalf("write vendored helper: %v", err)
	}
	if err := os.MkdirAll(
		filepath.Join(sitePackages, "setta_python_backend_installed-0.1.0.dist-info"),
		0o755,
	); err != nil {
		t.Fatalf("mkdir plugin dist-info: %v", err)
	}

	launch, err := ResolvePluginBackendLaunch(pluginRoot, PluginManifest{
		ID: "setta-python-backend-installed",
		Backend: &PluginBackendManifest{
			Entrypoint: "backend/main.py",
		},
	}, t.TempDir())
	if err != nil {
		t.Fatalf("resolve python backend launch for installed plugin: %v", err)
	}

	entries := filepath.SplitList(launch.Environment["PYTHONPATH"])
	want := []string{pluginRoot, vendoredSitePackages, sitePackages}
	if !reflect.DeepEqual(entries, want) {
		t.Fatalf("unexpected installed-plugin PYTHONPATH entries: got %#v want %#v", entries, want)
	}
}

func TestServiceValidateFolderAcceptsPythonBackendImportingPluginRootHelper(t *testing.T) {
	pythonPath, _ := preparePluginLanguageServerFixture(t)
	t.Setenv("SETTA_PYTHON", pythonPath)

	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	pluginRoot := writePythonBackendImportFixturePlugin(t, t.TempDir(), "setta-python-backend-validate")

	if _, err := service.ValidateFolder(ValidateFolderOptions{PluginRoot: pluginRoot}); err != nil {
		t.Fatalf("validate python backend importing plugin-root helper: %v", err)
	}
}

func TestServiceRuntimeActivatesLinkedPythonBackendPluginImportingPluginRootHelper(t *testing.T) {
	pythonPath, _ := preparePluginLanguageServerFixture(t)
	t.Setenv("SETTA_PYTHON", pythonPath)

	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	localPluginRoot := writePythonBackendImportFixturePlugin(t, t.TempDir(), "setta-python-backend-linked")

	scope := PluginScopeWorkspace
	linkResult, err := service.Link(LinkOptions{
		LocalPluginRoot: localPluginRoot,
		Scope:           &scope,
		Enable:          true,
	})
	if err != nil {
		t.Fatalf("link python backend plugin: %v", err)
	}
	if !linkResult.RestartRequired {
		t.Fatalf("expected linked python backend plugin to require refresh, got %#v", linkResult)
	}
	if _, err := service.CommitBackendRuntimeRefresh(); err != nil {
		t.Fatalf("commit backend runtime refresh after link: %v", err)
	}

	status, err := service.Status()
	if err != nil {
		t.Fatalf("load status after link: %v", err)
	}
	entry := mustFindStatusEntry(t, status.Plugins, "setta-python-backend-linked", PluginRuntimeStateActive)
	if len(entry.RegisteredBackendRoutes) != 1 || entry.RegisteredBackendRoutes[0].Path != "/helper" {
		t.Fatalf("expected helper route registration after activation, got %#v", entry.RegisteredBackendRoutes)
	}

	response, matched, err := service.DispatchRegisteredBackendRoute(context.Background(), BackendHTTPRequest{
		Context: BackendRequestContext{
			ServerMode: config.ModeIDE,
		},
		Method: http.MethodGet,
		Path:   "/helper",
	})
	if err != nil {
		t.Fatalf("dispatch helper backend route: %v", err)
	}
	if !matched {
		t.Fatal("expected helper backend route match")
	}
	if response.StatusCode != http.StatusOK {
		t.Fatalf("expected helper backend route 200, got %#v", response.StatusCode)
	}
	if got := response.Headers["X-Helper"]; len(got) != 1 || got[0] != "plugin-root-imported" {
		t.Fatalf("expected helper header from plugin-root import, got %#v", response.Headers)
	}
}

func writePythonBackendImportFixturePlugin(t *testing.T, root string, pluginID string) string {
	t.Helper()

	pluginRoot := filepath.Join(root, pluginID)
	writeJSONFile(t, filepath.Join(pluginRoot, "setta.plugin.json"), map[string]any{
		"schemaVersion":     1,
		"id":                pluginID,
		"name":              pluginID,
		"version":           "0.1.0",
		"settaVersionRange": ">=0.0.0",
		"enabledByDefault":  true,
		"backend": map[string]any{
			"entrypoint": "backend/main.py",
		},
		"capabilities": []string{"registerRouter"},
	})
	if err := os.WriteFile(filepath.Join(pluginRoot, "helper_module.py"), []byte("ROUTE_VALUE = \"plugin-root-imported\"\n"), 0o644); err != nil {
		t.Fatalf("write python backend helper module: %v", err)
	}

	mainSource := strings.Join([]string{
		"#!/usr/bin/env python3",
		"",
		"import json",
		"import sys",
		"",
		"import helper_module",
		"",
		"BACKEND_PROBE_ARG = \"--setta-plugin-backend-probe\"",
		"BACKEND_RUNTIME_ARG = \"--setta-plugin-backend-runtime\"",
		"",
		"",
		"def write(payload):",
		"    json.dump(payload, sys.stdout)",
		"    sys.stdout.write(\"\\n\")",
		"",
		"",
		"def main():",
		"    if len(sys.argv) != 2:",
		"        return",
		"    if sys.argv[1] == BACKEND_PROBE_ARG:",
		"        write({",
		"            \"schemaVersion\": 1,",
		"            \"routes\": [{\"path\": \"/helper\", \"methods\": [\"GET\"]}],",
		"        })",
		"        return",
		"    if sys.argv[1] != BACKEND_RUNTIME_ARG:",
		"        return",
		"    request = json.load(sys.stdin)",
		"    if request.get(\"kind\") != \"http\":",
		"        raise SystemExit(\"expected http runtime request\")",
		"    http_request = request.get(\"http\") or {}",
		"    if http_request.get(\"path\") != \"/helper\":",
		"        raise SystemExit(\"unexpected route path\")",
		"    write({",
		"        \"schemaVersion\": 1,",
		"        \"http\": {",
		"            \"statusCode\": 200,",
		"            \"headers\": {\"X-Helper\": [helper_module.ROUTE_VALUE]},",
		"        },",
		"    })",
		"",
		"",
		"if __name__ == \"__main__\":",
		"    main()",
		"",
	}, "\n")
	if err := os.MkdirAll(filepath.Join(pluginRoot, "backend"), 0o755); err != nil {
		t.Fatalf("mkdir python backend dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(pluginRoot, "backend", "main.py"), []byte(mainSource), 0o755); err != nil {
		t.Fatalf("write python backend main: %v", err)
	}
	return pluginRoot
}
