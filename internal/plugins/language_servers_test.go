package plugins

import (
	"path/filepath"
	"testing"

	"setta/internal/config"
)

func TestServiceLanguageServerSpecsRequiresExplicitSelection(t *testing.T) {
	preparePluginLanguageServerFixture(t)

	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerLanguageServer"}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	specs := loadSelectedLanguageServerSpecs(t, service, nil)
	if len(specs) != 0 {
		t.Fatalf("expected no active language server specs without explicit selection, got %#v", specs)
	}
}

func TestServiceLanguageServerSpecsIncludesSelectedPluginLanguageServer(t *testing.T) {
	pythonPath, scriptPath := preparePluginLanguageServerFixture(t)

	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerLanguageServer"}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	specs := loadSelectedLanguageServerSpecs(t, service, map[string]*string{
		"fixturedsl": testStringPointer("setta-fixture-backend"),
	})
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

func TestServiceLanguageServerSpecsAllowsSameLanguagePluginsUntilSelectionChoosesOne(t *testing.T) {
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
	specs := loadSelectedLanguageServerSpecs(t, service, map[string]*string{
		"fixturedsl": testStringPointer("setta-fixture-backend-b"),
	})
	if len(specs) != 1 {
		t.Fatalf("expected one selected language server spec, got %#v", specs)
	}
	if specs[0].PluginID != "setta-fixture-backend-b" {
		t.Fatalf("expected selected plugin b, got %#v", specs[0])
	}
}

func TestLanguageServerSpecsFromSnapshotKeepsPrimaryPluginCopyForDuplicatePluginIDs(t *testing.T) {
	t.Parallel()

	snapshot := DiscoverySnapshot{
		Plugins: []DiscoveredPlugin{
			{
				PluginID:              "setta-basedpyright",
				State:                 PluginRuntimeStateActive,
				Manifest:              &PluginManifest{ID: "setta-basedpyright"},
				EffectiveCapabilities: []string{"registerLanguageServer"},
				RegisteredLanguageServers: []PluginRegisteredLanguageServer{{
					PluginID: "setta-basedpyright",
					Name:     "basedpyright",
					Language: "python",
					Command:  "/workspace/basedpyright",
				}},
			},
			{
				PluginID:              "setta-basedpyright",
				State:                 PluginRuntimeStateActive,
				Manifest:              &PluginManifest{ID: "setta-basedpyright"},
				EffectiveCapabilities: []string{"registerLanguageServer"},
				RegisteredLanguageServers: []PluginRegisteredLanguageServer{{
					PluginID: "setta-basedpyright",
					Name:     "basedpyright",
					Language: "python",
					Command:  "/package-manager/basedpyright",
				}},
			},
		},
	}

	specs, err := languageServerSpecsFromSnapshotWithState(
		snapshot,
		&PluginsStateFile{},
		map[string]*string{"python": testStringPointer("setta-basedpyright")},
		t.TempDir(),
	)
	if err != nil {
		t.Fatalf("build selected language server specs: %v", err)
	}
	if len(specs) != 1 {
		t.Fatalf("expected one selected language server spec, got %#v", specs)
	}
	if specs[0].Command != "/workspace/basedpyright" {
		t.Fatalf("expected higher-precedence plugin command, got %#v", specs[0])
	}
}

func TestServiceLanguageServerSpecsKeepsMissingSelectionInactive(t *testing.T) {
	preparePluginLanguageServerFixture(t)

	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerLanguageServer"}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	specs := loadSelectedLanguageServerSpecs(t, service, map[string]*string{
		"fixturedsl": testStringPointer("missing-plugin"),
	})
	if len(specs) != 0 {
		t.Fatalf("expected missing selection to stay inactive, got %#v", specs)
	}
}

func TestServiceLanguageServerSpecsIncludesFirstPartyBasedpyrightDefaults(t *testing.T) {
	pythonPath, _ := preparePluginLanguageServerFixture(t)
	t.Setenv("SETTA_PYTHON", pythonPath)

	roots := newFilesystemResolverTestRoots(t)
	repoRoot := workerRPCTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "plugins", "setta-basedpyright")
	targetRoot := filepath.Join(pluginScopeRoot(roots, filesystemPluginScopeWorkspace), "setta-basedpyright")
	copyBackendCodegenFixtureDir(t, sourceRoot, targetRoot)

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	specs := loadSelectedLanguageServerSpecs(t, service, map[string]*string{
		"python": testStringPointer("setta-basedpyright"),
	})
	if len(specs) != 1 {
		t.Fatalf("expected one basedpyright spec, got %#v", specs)
	}

	spec := specs[0]
	if spec.Command != pythonPath {
		t.Fatalf("expected plugin to resolve current interpreter %q, got %q", pythonPath, spec.Command)
	}
	if spec.SettingsKey == nil || *spec.SettingsKey != "basedpyright" {
		t.Fatalf("unexpected basedpyright settings key %#v", spec.SettingsKey)
	}

	basedpyrightSettings, ok := spec.Settings["basedpyright"].(map[string]any)
	if !ok {
		t.Fatalf("expected plugin-owned basedpyright settings root, got %#v", spec.Settings)
	}
	analysis, ok := basedpyrightSettings["analysis"].(map[string]any)
	if !ok {
		t.Fatalf("expected analysis settings, got %#v", basedpyrightSettings["analysis"])
	}
	overrides, ok := analysis["diagnosticSeverityOverrides"].(map[string]any)
	if !ok {
		t.Fatalf("expected diagnosticSeverityOverrides map, got %#v", analysis["diagnosticSeverityOverrides"])
	}
	expectedRules := []string{
		"reportUnknownVariableType",
		"reportUnknownMemberType",
		"reportUnannotatedClassAttribute",
		"reportSelfClsParameterName",
	}
	for _, rule := range expectedRules {
		if overrides[rule] != "none" {
			t.Fatalf("expected %s to default to none, got %#v", rule, overrides[rule])
		}
	}
}

func testStringPointer(value string) *string {
	return &value
}
