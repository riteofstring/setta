package plugins

import (
	"context"
	"errors"
	"path/filepath"
	"testing"

	"setta/internal/config"
)

func TestServiceLanguageServerSpecsIncludesRegisteredPluginLanguageServer(t *testing.T) {
	pythonPath, scriptPath := preparePluginLanguageServerFixture(t)

	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerLanguageServer"}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	specs, err := service.LanguageServerSpecs(context.Background())
	if err != nil {
		t.Fatalf("load plugin language server specs: %v", err)
	}
	if len(specs) != 1 {
		t.Fatalf("expected one plugin language server spec, got %#v", specs)
	}

	spec := specs[0]
	if spec.Name != "setta-fixture-backend:fixturedsl" {
		t.Fatalf("unexpected language server name %q", spec.Name)
	}
	if spec.LanguageID != "fixturedsl" {
		t.Fatalf("unexpected language server language %q", spec.LanguageID)
	}
	if spec.Command != pythonPath {
		t.Fatalf("unexpected language server command %q", spec.Command)
	}
	if len(spec.Args) != 1 || spec.Args[0] != scriptPath {
		t.Fatalf("unexpected language server args %#v", spec.Args)
	}
	if spec.SettingsKey == nil || *spec.SettingsKey != "fixtureDslLanguageServer" {
		t.Fatalf("unexpected language server settings key %#v", spec.SettingsKey)
	}
}

func TestServiceLanguageServerSpecsRejectsAmbiguousPluginRegistrations(t *testing.T) {
	preparePluginLanguageServerFixture(t)

	roots := newFilesystemResolverTestRoots(t)
	repoRoot := workerRPCTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", "backend")

	for _, pluginID := range []string{"setta-fixture-backend-a", "setta-fixture-backend-b"} {
		pluginRoot := filepath.Join(pluginScopeRoot(roots, filesystemPluginScopeWorkspace), pluginID)
		copyBackendCodegenFixtureDir(t, sourceRoot, pluginRoot)
		rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
			payload["id"] = pluginID
			payload["name"] = pluginID
			payload["capabilities"] = []string{"registerLanguageServer"}
		})
	}

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	_, err := service.LanguageServerSpecs(context.Background())
	if !errors.Is(err, ErrRegisteredLanguageServerConflict) {
		t.Fatalf("expected conflicting plugin language server registration error, got %v", err)
	}
}
