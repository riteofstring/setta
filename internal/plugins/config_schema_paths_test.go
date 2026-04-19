package plugins

import (
	"context"
	"net/url"
	"path/filepath"
	"runtime"
	"testing"

	"setta/internal/config"
)

func TestPluginConfigSchemaPathFromFileURIForOS(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name   string
		rawURI string
		goos   string
		want   string
	}{
		{
			name:   "unix local path",
			rawURI: "file:///tmp/plugin/schema.json",
			goos:   "darwin",
			want:   "/tmp/plugin/schema.json",
		},
		{
			name:   "windows drive letter",
			rawURI: "file:///C:/tmp/plugin/schema.json",
			goos:   "windows",
			want:   `C:\tmp\plugin\schema.json`,
		},
		{
			name:   "windows unc host",
			rawURI: "file://server/share/plugin/schema.json",
			goos:   "windows",
			want:   `\\server\share\plugin\schema.json`,
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			uri, err := url.Parse(tc.rawURI)
			if err != nil {
				t.Fatalf("parse URI: %v", err)
			}
			got, err := pluginConfigSchemaPathFromFileURIForOS(uri, tc.goos)
			if err != nil {
				t.Fatalf("resolve schema path: %v", err)
			}
			if got != tc.want {
				t.Fatalf("expected %q, got %q", tc.want, got)
			}
		})
	}
}

func TestServiceLanguageServerSpecsKeepsFirstPartyBasedpyrightActiveOnWindowsSchemaPaths(t *testing.T) {
	if runtime.GOOS != "windows" {
		t.Skip("windows-only schema path regression")
	}

	pythonPath, _ := preparePluginLanguageServerFixture(t)
	t.Setenv("SETTA_PYTHON", pythonPath)

	roots := newFilesystemResolverTestRoots(t)
	repoRoot := workerRPCTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "plugins", "setta-basedpyright")
	targetRoot := filepath.Join(pluginScopeRoot(roots, filesystemPluginScopeWorkspace), "setta-basedpyright")
	copyBackendCodegenFixtureDir(t, sourceRoot, targetRoot)

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	runtimeResponse, err := service.Runtime(RuntimeOptions{})
	if err != nil {
		t.Fatalf("load runtime payload: %v", err)
	}
	if len(runtimeResponse.Status.Plugins) != 1 {
		t.Fatalf("expected one plugin status entry, got %#v", runtimeResponse.Status.Plugins)
	}
	if runtimeResponse.Status.Plugins[0].State != PluginRuntimeStateActive {
		t.Fatalf("expected active plugin status, got %#v", runtimeResponse.Status.Plugins[0])
	}

	specs, err := service.LanguageServerSpecs(context.Background(), map[string]*string{
		"python": testStringPointer("setta-basedpyright"),
	})
	if err != nil {
		t.Fatalf("load basedpyright language server specs: %v", err)
	}
	if len(specs) != 1 {
		t.Fatalf("expected one basedpyright spec, got %#v", specs)
	}

	basedpyrightSettings, ok := specs[0].Settings["basedpyright"].(map[string]any)
	if !ok {
		t.Fatalf("expected basedpyright settings root, got %#v", specs[0].Settings)
	}
	analysis, ok := basedpyrightSettings["analysis"].(map[string]any)
	if !ok {
		t.Fatalf("expected basedpyright analysis settings, got %#v", basedpyrightSettings["analysis"])
	}
	overrides, ok := analysis["diagnosticSeverityOverrides"].(map[string]any)
	if !ok {
		t.Fatalf("expected diagnosticSeverityOverrides map, got %#v", analysis["diagnosticSeverityOverrides"])
	}
	if overrides["reportUnknownVariableType"] != "none" {
		t.Fatalf("expected basedpyright defaults to remain loaded, got %#v", overrides)
	}
}
