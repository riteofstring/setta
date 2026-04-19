package plugins

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	"setta/internal/config"
	"setta/internal/testutil/firstpartyplugin"
)

func TestServiceLanguageServerSpecsRequiresExplicitSelection(t *testing.T) {
	preparePluginLanguageServerFixture(t)

	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerLanguageServer"}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	specs, err := service.LanguageServerSpecs(context.Background(), nil)
	if err != nil {
		t.Fatalf("load plugin language server specs: %v", err)
	}
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
	specs, err := service.LanguageServerSpecs(context.Background(), map[string]*string{
		"fixturedsl": testStringPointer("setta-fixture-backend"),
	})
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

func TestServiceLanguageServerSpecsSchemaLessPluginUsesEmptySettingsMap(t *testing.T) {
	preparePluginLanguageServerFixture(t)

	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerLanguageServer"}
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	specs, err := service.LanguageServerSpecs(context.Background(), map[string]*string{
		"fixturedsl": testStringPointer("setta-fixture-backend"),
	})
	if err != nil {
		t.Fatalf("load plugin language server specs: %v", err)
	}
	if len(specs) != 1 {
		t.Fatalf("expected one plugin language server spec, got %#v", specs)
	}
	if specs[0].Settings == nil || len(specs[0].Settings) != 0 {
		t.Fatalf("expected schema-less plugin settings to resolve to an explicit empty object, got %#v", specs[0].Settings)
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
	specs, err := service.LanguageServerSpecs(context.Background(), map[string]*string{
		"fixturedsl": testStringPointer("setta-fixture-backend-b"),
	})
	if err != nil {
		t.Fatalf("load selected language server specs: %v", err)
	}
	if len(specs) != 1 {
		t.Fatalf("expected one selected language server spec, got %#v", specs)
	}
	if specs[0].PluginID != "setta-fixture-backend-b" {
		t.Fatalf("expected selected plugin b, got %#v", specs[0])
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
	specs, err := service.LanguageServerSpecs(context.Background(), map[string]*string{
		"fixturedsl": testStringPointer("missing-plugin"),
	})
	if err != nil {
		t.Fatalf("load language server specs with missing selection: %v", err)
	}
	if len(specs) != 0 {
		t.Fatalf("expected missing selection to stay inactive, got %#v", specs)
	}
}

func TestServiceLanguageServerSpecsIncludesPendingRestartLanguageServerOnlyPlugin(t *testing.T) {
	preparePluginLanguageServerFixture(t)

	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerLanguageServer"}
	})
	writeJSONFile(t, filepath.Join(roots.settaFilesRoot, "plugins_state.json"), map[string]any{
		"pendingRestartBackendPluginIds": []string{"setta-fixture-backend"},
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	specs, err := service.LanguageServerSpecs(context.Background(), map[string]*string{
		"fixturedsl": testStringPointer("setta-fixture-backend"),
	})
	if err != nil {
		t.Fatalf("load pending language-server-only specs: %v", err)
	}
	if len(specs) != 1 {
		t.Fatalf("expected one pending language-server-only spec, got %#v", specs)
	}
}

func TestServiceLanguageServerSpecsExcludesPendingRestartMixedBackendPlugin(t *testing.T) {
	preparePluginLanguageServerFixture(t)

	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerLanguageServer", "registerRouter"}
	})
	writeJSONFile(t, filepath.Join(roots.settaFilesRoot, "plugins_state.json"), map[string]any{
		"pendingRestartBackendPluginIds": []string{"setta-fixture-backend"},
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	specs, err := service.LanguageServerSpecs(context.Background(), map[string]*string{
		"fixturedsl": testStringPointer("setta-fixture-backend"),
	})
	if err != nil {
		t.Fatalf("load pending mixed-backend specs: %v", err)
	}
	if len(specs) != 0 {
		t.Fatalf("expected mixed pending_restart plugin to stay inactive for LSP selection, got %#v", specs)
	}
}

func TestServiceLanguageServerSpecsIncludesFirstPartyBasedpyrightDefaults(t *testing.T) {
	pythonPath := firstpartyplugin.BasedpyrightPython(t)
	t.Setenv("SETTA_PYTHON", pythonPath)

	roots := newFilesystemResolverTestRoots(t)
	repoRoot := workerRPCTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "plugins", "setta-basedpyright")
	targetRoot := filepath.Join(pluginScopeRoot(roots, filesystemPluginScopeWorkspace), "setta-basedpyright")
	copyBackendCodegenFixtureDir(t, sourceRoot, targetRoot)

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	specs, err := service.LanguageServerSpecs(context.Background(), map[string]*string{
		"python": testStringPointer("setta-basedpyright"),
	})
	if err != nil {
		t.Fatalf("load first-party basedpyright language server specs: %v", err)
	}
	if len(specs) != 1 {
		t.Fatalf("expected one basedpyright spec, got %#v", specs)
	}

	spec := specs[0]
	assertEquivalentLanguageServerCommandPath(t, spec.Command, pythonPath)
	expectedArgs := []string{"-c", "from basedpyright.langserver import main; main()", "--stdio"}
	if len(spec.Args) != len(expectedArgs) {
		t.Fatalf("expected basedpyright args %#v, got %#v", expectedArgs, spec.Args)
	}
	for index, expected := range expectedArgs {
		if spec.Args[index] != expected {
			t.Fatalf("expected basedpyright args %#v, got %#v", expectedArgs, spec.Args)
		}
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
	extraPaths, ok := analysis["extraPaths"].([]any)
	if !ok || len(extraPaths) != 1 || extraPaths[0] != roots.settaFilesRoot {
		t.Fatalf("expected setta_files extra path %#v, got %#v", roots.settaFilesRoot, analysis["extraPaths"])
	}
}

func TestServiceLanguageServerSpecsFallsBackToUsableLowerPrecedenceBasedpyrightDuplicate(t *testing.T) {
	pythonPath := firstpartyplugin.BasedpyrightPython(t)
	t.Setenv("SETTA_PYTHON", pythonPath)

	roots := newFilesystemResolverTestRoots(t)
	repoRoot := workerRPCTestRepoRoot(t)
	workspaceRoot := filepath.Join(pluginScopeRoot(roots, filesystemPluginScopeWorkspace), "setta-basedpyright")
	copyBackendCodegenFixtureDir(t, filepath.Join(repoRoot, "plugins", "setta-basedpyright"), workspaceRoot)
	if err := os.WriteFile(filepath.Join(workspaceRoot, "content", "config", "schema.json"), []byte("{bad-json"), 0o644); err != nil {
		t.Fatalf("write invalid workspace schema: %v", err)
	}

	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	installFirstPartyBasedpyrightPackageManagerPluginInSearchPath(t, sitePackages)

	service := mustNewPluginMutationServiceWithPackageManager(t, roots, nil, config.ModeIDE, []string{sitePackages})
	specs, err := service.LanguageServerSpecs(context.Background(), map[string]*string{
		"python": testStringPointer("setta-basedpyright"),
	})
	if err != nil {
		t.Fatalf("load basedpyright specs with invalid workspace duplicate: %v", err)
	}
	if len(specs) != 1 {
		t.Fatalf("expected one basedpyright spec from the usable duplicate, got %#v", specs)
	}
	if specs[0].PluginID != "setta-basedpyright" || specs[0].LanguageID != "python" {
		t.Fatalf("unexpected basedpyright spec %#v", specs[0])
	}
	assertEquivalentLanguageServerCommandPath(t, specs[0].Command, pythonPath)
	if _, ok := specs[0].Settings["basedpyright"].(map[string]any); !ok {
		t.Fatalf("expected plugin-owned basedpyright settings root, got %#v", specs[0].Settings)
	}
}

func TestServiceLanguageServerSpecsFallsBackToActiveLowerPrecedenceDuplicateWhenWorkspaceCopyDefaultsDisabled(t *testing.T) {
	pythonPath := firstpartyplugin.BasedpyrightPython(t)
	t.Setenv("SETTA_PYTHON", pythonPath)

	roots := newFilesystemResolverTestRoots(t)
	repoRoot := workerRPCTestRepoRoot(t)
	workspaceRoot := filepath.Join(pluginScopeRoot(roots, filesystemPluginScopeWorkspace), "setta-basedpyright")
	copyBackendCodegenFixtureDir(t, filepath.Join(repoRoot, "plugins", "setta-basedpyright"), workspaceRoot)
	rewritePluginManifest(t, workspaceRoot, func(payload map[string]any) {
		payload["enabledByDefault"] = false
	})

	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	installFirstPartyBasedpyrightPackageManagerPluginInSearchPath(t, sitePackages)

	service := mustNewPluginMutationServiceWithPackageManager(t, roots, nil, config.ModeIDE, []string{sitePackages})
	specs, err := service.LanguageServerSpecs(context.Background(), map[string]*string{
		"python": testStringPointer("setta-basedpyright"),
	})
	if err != nil {
		t.Fatalf("load basedpyright specs with disabled workspace duplicate: %v", err)
	}
	if len(specs) != 1 {
		t.Fatalf("expected one basedpyright spec from the active lower-precedence duplicate, got %#v", specs)
	}
	if specs[0].PluginID != "setta-basedpyright" || specs[0].LanguageID != "python" {
		t.Fatalf("unexpected basedpyright spec %#v", specs[0])
	}
	assertEquivalentLanguageServerCommandPath(t, specs[0].Command, pythonPath)
	if _, ok := specs[0].Settings["basedpyright"].(map[string]any); !ok {
		t.Fatalf("expected plugin-owned basedpyright settings root, got %#v", specs[0].Settings)
	}
}

func TestServiceLanguageServerSpecsKeepsBasedpyrightConfigAcrossUsableDuplicatePromotion(t *testing.T) {
	pythonPath := firstpartyplugin.BasedpyrightPython(t)
	t.Setenv("SETTA_PYTHON", pythonPath)

	roots := newFilesystemResolverTestRoots(t)
	sitePackages := filepath.Join(t.TempDir(), "site-packages")
	installFirstPartyBasedpyrightPackageManagerPluginInSearchPath(t, sitePackages)

	repoRoot := workerRPCTestRepoRoot(t)
	workspaceRoot := filepath.Join(pluginScopeRoot(roots, filesystemPluginScopeWorkspace), "setta-basedpyright")
	copyBackendCodegenFixtureDir(t, filepath.Join(repoRoot, "plugins", "setta-basedpyright"), workspaceRoot)

	service := mustNewPluginMutationServiceWithPackageManager(t, roots, nil, config.ModeIDE, []string{sitePackages})
	if err := service.store.SavePluginsState(PluginsStateFile{
		PluginConfigByID: map[string]any{
			pluginConfigKey("setta-basedpyright", PluginScopeSettaFiles): map[string]any{
				"basedpyright": map[string]any{
					"analysis": map[string]any{
						"extraPaths": []any{"/tmp/custom"},
					},
				},
			},
		},
	}); err != nil {
		t.Fatalf("save package-manager config state: %v", err)
	}

	specs, err := service.LanguageServerSpecs(context.Background(), map[string]*string{
		"python": testStringPointer("setta-basedpyright"),
	})
	if err != nil {
		t.Fatalf("load basedpyright specs after duplicate promotion: %v", err)
	}
	if len(specs) != 1 {
		t.Fatalf("expected one basedpyright spec, got %#v", specs)
	}

	basedpyrightSettings, ok := specs[0].Settings["basedpyright"].(map[string]any)
	if !ok {
		t.Fatalf("expected plugin-owned basedpyright settings root, got %#v", specs[0].Settings)
	}
	analysis, ok := basedpyrightSettings["analysis"].(map[string]any)
	if !ok {
		t.Fatalf("expected analysis settings, got %#v", basedpyrightSettings["analysis"])
	}
	extraPaths, ok := analysis["extraPaths"].([]any)
	if !ok {
		t.Fatalf("expected extraPaths array, got %#v", analysis["extraPaths"])
	}
	expected := []any{"/tmp/custom", roots.settaFilesRoot}
	if len(extraPaths) != len(expected) {
		t.Fatalf("expected extraPaths %#v, got %#v", expected, extraPaths)
	}
	for index, path := range expected {
		if extraPaths[index] != path {
			t.Fatalf("expected extraPaths %#v, got %#v", expected, extraPaths)
		}
	}
}

func TestServiceLanguageServerSpecsMergesConfiguredBasedpyrightExtraPathsWithSettaFilesRoot(t *testing.T) {
	pythonPath := firstpartyplugin.BasedpyrightPython(t)
	t.Setenv("SETTA_PYTHON", pythonPath)

	roots := newFilesystemResolverTestRoots(t)
	repoRoot := workerRPCTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "plugins", "setta-basedpyright")
	targetRoot := filepath.Join(pluginScopeRoot(roots, filesystemPluginScopeWorkspace), "setta-basedpyright")
	copyBackendCodegenFixtureDir(t, sourceRoot, targetRoot)

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	if err := service.store.SavePluginsState(PluginsStateFile{
		PluginConfigByID: map[string]any{
			pluginConfigKey("setta-basedpyright", PluginScopeWorkspace): map[string]any{
				"basedpyright": map[string]any{
					"analysis": map[string]any{
						"extraPaths": []any{" /tmp/custom ", roots.settaFilesRoot},
					},
				},
			},
		},
	}); err != nil {
		t.Fatalf("save plugin config state: %v", err)
	}

	specs, err := service.LanguageServerSpecs(context.Background(), map[string]*string{
		"python": testStringPointer("setta-basedpyright"),
	})
	if err != nil {
		t.Fatalf("load first-party basedpyright language server specs: %v", err)
	}
	if len(specs) != 1 {
		t.Fatalf("expected one basedpyright spec, got %#v", specs)
	}

	basedpyrightSettings, ok := specs[0].Settings["basedpyright"].(map[string]any)
	if !ok {
		t.Fatalf("expected plugin-owned basedpyright settings root, got %#v", specs[0].Settings)
	}
	analysis, ok := basedpyrightSettings["analysis"].(map[string]any)
	if !ok {
		t.Fatalf("expected analysis settings, got %#v", basedpyrightSettings["analysis"])
	}
	extraPaths, ok := analysis["extraPaths"].([]any)
	if !ok {
		t.Fatalf("expected extraPaths array, got %#v", analysis["extraPaths"])
	}
	expected := []any{"/tmp/custom", roots.settaFilesRoot}
	if len(extraPaths) != len(expected) {
		t.Fatalf("expected extraPaths %#v, got %#v", expected, extraPaths)
	}
	for index, path := range expected {
		if extraPaths[index] != path {
			t.Fatalf("expected extraPaths %#v, got %#v", expected, extraPaths)
		}
	}
}

func TestServiceLanguageServerSpecsLoadsDefaultsFromResolvedPluginConfigSchema(t *testing.T) {
	preparePluginLanguageServerFixture(t)

	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerLanguageServer"}
		payload["configSchemaPath"] = "content/config/schema.json"
	})
	writeJSONFile(t, filepath.Join(pluginRoot, "content", "config", "schema.json"), map[string]any{
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"type":    "object",
		"properties": map[string]any{
			"fixtureDslLanguageServer": map[string]any{
				"allOf": []any{
					map[string]any{"$ref": "#/$defs/fixtureDslSettings"},
				},
			},
		},
		"$defs": map[string]any{
			"fixtureDslSettings": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"analysis": map[string]any{
						"$ref": "#/$defs/analysisSettings",
					},
				},
			},
			"analysisSettings": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"emitDiagnostics": map[string]any{
						"type":    "boolean",
						"default": true,
					},
				},
			},
		},
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	specs, err := service.LanguageServerSpecs(context.Background(), map[string]*string{
		"fixturedsl": testStringPointer("setta-fixture-backend"),
	})
	if err != nil {
		t.Fatalf("load plugin language server specs: %v", err)
	}
	if len(specs) != 1 {
		t.Fatalf("expected one plugin language server spec, got %#v", specs)
	}

	settingsRoot, ok := specs[0].Settings["fixtureDslLanguageServer"].(map[string]any)
	if !ok {
		t.Fatalf("expected fixture language-server settings root, got %#v", specs[0].Settings)
	}
	analysis, ok := settingsRoot["analysis"].(map[string]any)
	if !ok {
		t.Fatalf("expected analysis settings, got %#v", settingsRoot["analysis"])
	}
	if analysis["emitDiagnostics"] != true {
		t.Fatalf("expected referenced default emitDiagnostics=true, got %#v", analysis["emitDiagnostics"])
	}
}

func TestServiceLanguageServerSpecsScopesSettingsToSettingsKey(t *testing.T) {
	preparePluginLanguageServerFixture(t)

	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerLanguageServer"}
		payload["configSchemaPath"] = "content/config/schema.json"
	})
	writeJSONFile(t, filepath.Join(pluginRoot, "content", "config", "schema.json"), map[string]any{
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"type":    "object",
		"properties": map[string]any{
			"fixtureDslLanguageServer": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"analysis": map[string]any{
						"type": "object",
						"properties": map[string]any{
							"emitDiagnostics": map[string]any{
								"type":    "boolean",
								"default": true,
							},
						},
					},
				},
			},
			"ui": map[string]any{
				"type": "object",
				"properties": map[string]any{
					"label": map[string]any{
						"type":    "string",
						"default": "keep-out",
					},
				},
			},
		},
	})
	writeJSONFile(t, filepath.Join(roots.settaFilesRoot, "plugins_state.json"), map[string]any{
		"pluginConfigById": map[string]any{
			pluginConfigKey("setta-fixture-backend", PluginScopeWorkspace): map[string]any{
				"fixtureDslLanguageServer": map[string]any{
					"analysis": map[string]any{
						"emitDiagnostics": false,
					},
				},
				"ui": map[string]any{
					"label": "sibling",
				},
			},
		},
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	specs, err := service.LanguageServerSpecs(context.Background(), map[string]*string{
		"fixturedsl": testStringPointer("setta-fixture-backend"),
	})
	if err != nil {
		t.Fatalf("load plugin language server specs: %v", err)
	}
	if len(specs) != 1 {
		t.Fatalf("expected one plugin language server spec, got %#v", specs)
	}
	if len(specs[0].Settings) != 1 {
		t.Fatalf("expected only the keyed settings branch, got %#v", specs[0].Settings)
	}
	if _, ok := specs[0].Settings["ui"]; ok {
		t.Fatalf("expected sibling plugin settings to stay out of the LSP payload, got %#v", specs[0].Settings)
	}

	settingsRoot, ok := specs[0].Settings["fixtureDslLanguageServer"].(map[string]any)
	if !ok {
		t.Fatalf("expected keyed fixture language-server settings root, got %#v", specs[0].Settings)
	}
	analysis, ok := settingsRoot["analysis"].(map[string]any)
	if !ok {
		t.Fatalf("expected analysis settings, got %#v", settingsRoot["analysis"])
	}
	if analysis["emitDiagnostics"] != false {
		t.Fatalf("expected runtime config to override keyed emitDiagnostics default, got %#v", analysis["emitDiagnostics"])
	}
}

func TestServiceLanguageServerSpecsRejectsInvalidPluginConfigSchema(t *testing.T) {
	pythonPath := firstpartyplugin.BasedpyrightPython(t)
	t.Setenv("SETTA_PYTHON", pythonPath)

	roots := newFilesystemResolverTestRoots(t)
	repoRoot := workerRPCTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "plugins", "setta-basedpyright")
	targetRoot := filepath.Join(pluginScopeRoot(roots, filesystemPluginScopeWorkspace), "setta-basedpyright")
	copyBackendCodegenFixtureDir(t, sourceRoot, targetRoot)
	if err := os.WriteFile(filepath.Join(targetRoot, "content", "config", "schema.json"), []byte("{bad-json"), 0o644); err != nil {
		t.Fatalf("write invalid plugin schema: %v", err)
	}

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	status, err := service.Status()
	if err != nil {
		t.Fatalf("load plugin status: %v", err)
	}
	entry := mustFindStatusEntry(t, status.Plugins, "setta-basedpyright", PluginRuntimeStateInvalid)
	if len(entry.Errors) != 1 || entry.Errors[0].Code != string(ServiceErrorCodeConfigSchemaInvalid) {
		t.Fatalf("expected config schema invalid status error, got %#v", entry.Errors)
	}

	specs, err := service.LanguageServerSpecs(context.Background(), map[string]*string{
		"python": testStringPointer("setta-basedpyright"),
	})
	if err != nil {
		t.Fatalf("load basedpyright specs with invalid schema: %v", err)
	}
	if len(specs) != 0 {
		t.Fatalf("expected invalid schema plugin to contribute no specs, got %#v", specs)
	}
}

func assertEquivalentLanguageServerCommandPath(t *testing.T, actual string, expected string) {
	t.Helper()

	resolvedActual, err := filepath.EvalSymlinks(actual)
	if err == nil {
		actual = resolvedActual
	}
	resolvedExpected, err := filepath.EvalSymlinks(expected)
	if err == nil {
		expected = resolvedExpected
	}
	if actual != expected {
		t.Fatalf("expected plugin to resolve current interpreter %q, got %q", expected, actual)
	}
}

func TestServiceLanguageServerSpecsRejectsUnresolvablePluginConfigSchema(t *testing.T) {
	preparePluginLanguageServerFixture(t)

	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerLanguageServer"}
		payload["configSchemaPath"] = "content/config/schema.json"
	})
	writeJSONFile(t, filepath.Join(pluginRoot, "content", "config", "schema.json"), map[string]any{
		"$schema": "https://json-schema.org/draft/2020-12/schema",
		"type":    "object",
		"$ref":    "#/$defs/missing",
	})

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	status, err := service.Status()
	if err != nil {
		t.Fatalf("load plugin status: %v", err)
	}
	entry := mustFindStatusEntry(t, status.Plugins, "setta-fixture-backend", PluginRuntimeStateInvalid)
	if len(entry.Errors) != 1 || entry.Errors[0].Code != string(ServiceErrorCodeConfigSchemaInvalid) {
		t.Fatalf("expected config schema invalid status error, got %#v", entry.Errors)
	}

	specs, err := service.LanguageServerSpecs(context.Background(), map[string]*string{
		"fixturedsl": testStringPointer("setta-fixture-backend"),
	})
	if err != nil {
		t.Fatalf("load plugin language server specs: %v", err)
	}
	if len(specs) != 0 {
		t.Fatalf("expected unresolvable schema plugin to contribute no specs, got %#v", specs)
	}
}

func testStringPointer(value string) *string {
	return &value
}
