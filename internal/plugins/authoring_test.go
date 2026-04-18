package plugins

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/config"
)

// Init should scaffold a publish-ready full plugin template, including a Go backend, that validates immediately.
func TestServiceInitTemplateGeneratesPublishReadyScaffold(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	pluginRoot, err := service.InitTemplate(InitTemplateOptions{
		PluginID: "setta-init-fixture",
		Template: "full",
		OutDir:   roots.workspaceRoot,
	})
	if err != nil {
		t.Fatalf("init template: %v", err)
	}

	for _, relativePath := range []string{
		"setta.plugin.json",
		"pyproject.toml",
		"README.md",
		filepath.Join(".github", "workflows", "release.yml"),
		filepath.Join("backend", "go.mod"),
		filepath.Join("backend", "main.go"),
		filepath.Join("frontend", "dist", "index.js"),
		filepath.Join("content", "blueprints", "starter-blueprint.json"),
	} {
		if _, err := os.Stat(filepath.Join(pluginRoot, relativePath)); err != nil {
			t.Fatalf("expected scaffold file %s: %v", relativePath, err)
		}
	}

	workflowPayload, err := os.ReadFile(filepath.Join(pluginRoot, ".github", "workflows", "release.yml"))
	if err != nil {
		t.Fatalf("read workflow: %v", err)
	}
	if !strings.Contains(string(workflowPayload), "python -m pip install --upgrade build twine setta") {
		t.Fatalf("expected publish workflow prerequisites, got %q", string(workflowPayload))
	}
	if !strings.Contains(string(workflowPayload), "(cd backend && go build ./...)") {
		t.Fatalf("expected backend go build step, got %q", string(workflowPayload))
	}
	if !strings.Contains(string(workflowPayload), "setta plugins validate .") {
		t.Fatalf("expected workflow validate step, got %q", string(workflowPayload))
	}
	pyprojectPayload, err := os.ReadFile(filepath.Join(pluginRoot, "pyproject.toml"))
	if err != nil {
		t.Fatalf("read scaffold pyproject: %v", err)
	}
	if !strings.Contains(string(pyprojectPayload), "\"setta-init-fixture\" = [\"setta.plugin.json\", \"README.md\"]") {
		t.Fatalf("expected scaffold pyproject to package plugin manifest under a plugin-specific root, got %q", string(pyprojectPayload))
	}
	if !strings.Contains(string(pyprojectPayload), "\"setta-init-fixture/backend\" = [\"backend/*\"]") {
		t.Fatalf("expected scaffold pyproject to package backend assets under a plugin-specific root, got %q", string(pyprojectPayload))
	}

	manifest, err := loadAuthoringManifest(filepath.Join(pluginRoot, pluginManifestFileName))
	if err != nil {
		t.Fatalf("load scaffold manifest: %v", err)
	}
	if manifest.Backend == nil {
		t.Fatalf("expected full scaffold to include backend manifest, got %#v", manifest)
	}
	if manifest.Backend.Entrypoint != "backend/main.go" {
		t.Fatalf("expected Go backend entrypoint, got %#v", manifest.Backend)
	}
	if manifest.Frontend == nil || manifest.Content == nil {
		t.Fatalf("expected full scaffold to include frontend and content, got %#v", manifest)
	}

	if _, err := service.ValidateFolder(ValidateFolderOptions{PluginRoot: pluginRoot}); err != nil {
		t.Fatalf("validate scaffolded plugin: %v", err)
	}
}

// Init should default an empty template to the full publish-ready scaffold.
func TestServiceInitTemplateDefaultsBlankTemplateToFullScaffold(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	pluginRoot, err := service.InitTemplate(InitTemplateOptions{
		PluginID: "setta-default-template-fixture",
		Template: "   ",
		OutDir:   roots.workspaceRoot,
	})
	if err != nil {
		t.Fatalf("init default full template: %v", err)
	}

	manifest, err := loadAuthoringManifest(filepath.Join(pluginRoot, pluginManifestFileName))
	if err != nil {
		t.Fatalf("load default scaffold manifest: %v", err)
	}
	if manifest.Backend == nil || manifest.Frontend == nil || manifest.Content == nil {
		t.Fatalf("expected blank template to scaffold full manifest, got %#v", manifest)
	}
	if _, err := service.ValidateFolder(ValidateFolderOptions{PluginRoot: pluginRoot}); err != nil {
		t.Fatalf("validate default full scaffold: %v", err)
	}
}

// Init should reject invalid plugin ids and existing target roots before writing files.
func TestServiceInitTemplateRejectsInvalidIDsAndExistingTarget(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	_, err := service.InitTemplate(InitTemplateOptions{
		PluginID: "bad/id",
		Template: "frontend",
		OutDir:   roots.workspaceRoot,
	})
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeInitInvalidID)

	existingRoot := filepath.Join(roots.workspaceRoot, "setta-existing-plugin")
	if err := os.MkdirAll(existingRoot, 0o755); err != nil {
		t.Fatalf("mkdir existing root: %v", err)
	}
	_, err = service.InitTemplate(InitTemplateOptions{
		PluginID: "setta-existing-plugin",
		Template: "frontend",
		OutDir:   roots.workspaceRoot,
	})
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeInitTargetExists)
}

// Init should reject empty and malformed plugin ids without writing any files.
func TestServiceInitTemplateRejectsEmptyAndMalformedIDsWithoutWrites(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	for _, pluginID := range []string{
		"   ",
		"../escape",
		"bad/id",
		`bad\id`,
		"-starts-with-dash",
		"has spaces",
	} {
		beforeEntries, err := os.ReadDir(roots.workspaceRoot)
		if err != nil {
			t.Fatalf("read workspace entries before init: %v", err)
		}
		beforeNames := map[string]struct{}{}
		for _, entry := range beforeEntries {
			beforeNames[entry.Name()] = struct{}{}
		}

		_, err = service.InitTemplate(InitTemplateOptions{
			PluginID: pluginID,
			Template: "frontend",
			OutDir:   roots.workspaceRoot,
		})
		assertPluginServiceErrorCode(t, err, ServiceErrorCodeInitInvalidID)

		afterEntries, err := os.ReadDir(roots.workspaceRoot)
		if err != nil {
			t.Fatalf("read workspace entries after init: %v", err)
		}
		if len(beforeEntries) != len(afterEntries) {
			t.Fatalf("expected no new entries after invalid init for %q", pluginID)
		}
		for _, entry := range afterEntries {
			if _, ok := beforeNames[entry.Name()]; !ok {
				t.Fatalf("unexpected workspace entry %q after invalid init for %q", entry.Name(), pluginID)
			}
		}
	}
}

// Init should scaffold a Go-backed backend template instead of pointing new authoring at Python.
func TestServiceInitTemplateGeneratesGoBackendScaffold(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	pluginRoot, err := service.InitTemplate(InitTemplateOptions{
		PluginID: "setta-backend-fixture",
		Template: "backend",
		OutDir:   roots.workspaceRoot,
	})
	if err != nil {
		t.Fatalf("init backend template: %v", err)
	}
	manifest, err := loadAuthoringManifest(filepath.Join(pluginRoot, pluginManifestFileName))
	if err != nil {
		t.Fatalf("load backend scaffold manifest: %v", err)
	}
	if manifest.Backend == nil || manifest.Backend.Entrypoint != "backend/main.go" {
		t.Fatalf("expected Go backend scaffold manifest, got %#v", manifest.Backend)
	}
	if manifest.Frontend != nil || manifest.Content != nil {
		t.Fatalf("expected backend-only scaffold, got %#v", manifest)
	}
	for _, relativePath := range []string{
		filepath.Join("backend", "go.mod"),
		filepath.Join("backend", "main.go"),
	} {
		if _, err := os.Stat(filepath.Join(pluginRoot, relativePath)); err != nil {
			t.Fatalf("expected backend scaffold file %s: %v", relativePath, err)
		}
	}
	if _, err := service.ValidateFolder(ValidateFolderOptions{PluginRoot: pluginRoot}); err != nil {
		t.Fatalf("validate backend scaffolded plugin: %v", err)
	}
}

// Init should scaffold a frontend-only template without backend or content payloads.
func TestServiceInitTemplateGeneratesFrontendOnlyScaffold(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	pluginRoot, err := service.InitTemplate(InitTemplateOptions{
		PluginID: "setta-frontend-fixture",
		Template: "frontend",
		OutDir:   roots.workspaceRoot,
	})
	if err != nil {
		t.Fatalf("init frontend template: %v", err)
	}
	manifest, err := loadAuthoringManifest(filepath.Join(pluginRoot, pluginManifestFileName))
	if err != nil {
		t.Fatalf("load frontend scaffold manifest: %v", err)
	}
	if manifest.Frontend == nil || manifest.Frontend.Entrypoint != "frontend/dist/index.js" || manifest.Frontend.Style != "frontend/dist/index.css" {
		t.Fatalf("expected frontend scaffold manifest, got %#v", manifest.Frontend)
	}
	if manifest.Backend != nil || manifest.Content != nil {
		t.Fatalf("expected frontend-only scaffold, got %#v", manifest)
	}
	for _, relativePath := range []string{
		filepath.Join("frontend", "dist", "index.js"),
		filepath.Join("frontend", "dist", "index.css"),
	} {
		if _, err := os.Stat(filepath.Join(pluginRoot, relativePath)); err != nil {
			t.Fatalf("expected frontend scaffold file %s: %v", relativePath, err)
		}
	}
	for _, relativePath := range []string{
		"backend",
		"content",
	} {
		if _, err := os.Stat(filepath.Join(pluginRoot, relativePath)); !os.IsNotExist(err) {
			t.Fatalf("expected %s to be omitted from frontend scaffold, got err=%v", relativePath, err)
		}
	}
	if _, err := service.ValidateFolder(ValidateFolderOptions{PluginRoot: pluginRoot}); err != nil {
		t.Fatalf("validate frontend scaffolded plugin: %v", err)
	}
}

// Init should scaffold a content-only template without backend or frontend payloads.
func TestServiceInitTemplateGeneratesContentOnlyScaffold(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	pluginRoot, err := service.InitTemplate(InitTemplateOptions{
		PluginID: "setta-content-fixture",
		Template: "content",
		OutDir:   roots.workspaceRoot,
	})
	if err != nil {
		t.Fatalf("init content template: %v", err)
	}
	manifest, err := loadAuthoringManifest(filepath.Join(pluginRoot, pluginManifestFileName))
	if err != nil {
		t.Fatalf("load content scaffold manifest: %v", err)
	}
	if manifest.Content == nil {
		t.Fatalf("expected content scaffold manifest, got %#v", manifest)
	}
	if manifest.Content.BlueprintsDir != "content/blueprints" ||
		manifest.Content.ProjectTemplatesDir != "content/project_templates" ||
		manifest.Content.PromptsDir != "content/prompts" {
		t.Fatalf("expected content manifest directories, got %#v", manifest.Content)
	}
	if manifest.Backend != nil || manifest.Frontend != nil {
		t.Fatalf("expected content-only scaffold, got %#v", manifest)
	}
	for _, relativePath := range []string{
		filepath.Join("content", "blueprints", "starter-blueprint.json"),
		filepath.Join("content", "project_templates", "starter-template.json"),
		filepath.Join("content", "prompts", "starter-prompt.md"),
	} {
		if _, err := os.Stat(filepath.Join(pluginRoot, relativePath)); err != nil {
			t.Fatalf("expected content scaffold file %s: %v", relativePath, err)
		}
	}
	for _, relativePath := range []string{
		"backend",
		"frontend",
	} {
		if _, err := os.Stat(filepath.Join(pluginRoot, relativePath)); !os.IsNotExist(err) {
			t.Fatalf("expected %s to be omitted from content scaffold, got err=%v", relativePath, err)
		}
	}
	if _, err := service.ValidateFolder(ValidateFolderOptions{PluginRoot: pluginRoot}); err != nil {
		t.Fatalf("validate content scaffolded plugin: %v", err)
	}
}

// Validate should reject unsupported capability values, schema versions, metadata mismatches, and invalid host versions.
func TestServiceValidateFolderRejectsAuthoringFailures(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	invalidCapabilityRoot := mustInitAuthoringTestPlugin(t, service, roots.workspaceRoot, "setta-invalid-capability", "frontend")
	rewritePluginManifest(t, invalidCapabilityRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerPane", "notARealCapability"}
	})
	_, err := service.ValidateFolder(ValidateFolderOptions{PluginRoot: invalidCapabilityRoot})
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeManifestInvalidCap)

	unsupportedSchemaRoot := mustInitAuthoringTestPlugin(t, service, roots.workspaceRoot, "setta-unsupported-schema", "frontend")
	rewritePluginManifest(t, unsupportedSchemaRoot, func(payload map[string]any) {
		payload["schemaVersion"] = 999
	})
	_, err = service.ValidateFolder(ValidateFolderOptions{PluginRoot: unsupportedSchemaRoot})
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeManifestUnsupported)

	metadataMismatchRoot := mustInitAuthoringTestPlugin(t, service, roots.workspaceRoot, "setta-metadata-mismatch", "frontend")
	if err := os.WriteFile(filepath.Join(metadataMismatchRoot, "pyproject.toml"), []byte("[project]\nname = \"other-plugin\"\nversion = \"0.1.0\"\n"), 0o644); err != nil {
		t.Fatalf("write mismatched pyproject: %v", err)
	}
	_, err = service.ValidateFolder(ValidateFolderOptions{PluginRoot: metadataMismatchRoot})
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeSourceIdentityMismatch)

	invalidRangeRoot := mustInitAuthoringTestPlugin(t, service, roots.workspaceRoot, "setta-invalid-range", "frontend")
	rewritePluginManifest(t, invalidRangeRoot, func(payload map[string]any) {
		payload["settaVersionRange"] = "~=1"
	})
	_, err = service.ValidateFolder(ValidateFolderOptions{PluginRoot: invalidRangeRoot})
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeManifestInvalid)

	invalidHostVersionService, err := NewService(ServiceOptions{
		WorkspaceRoot:  roots.workspaceRoot,
		SettaFilesRoot: roots.settaFilesRoot,
		SettaHome:      roots.settaHome,
		ServerMode:     config.ModeIDE,
		SettaVersion:   "not-a-version",
	})
	if err != nil {
		t.Fatalf("new service with invalid host version: %v", err)
	}
	validRoot := mustInitAuthoringTestPlugin(t, service, roots.workspaceRoot, "setta-invalid-host-version", "frontend")
	_, err = invalidHostVersionService.ValidateFolder(ValidateFolderOptions{
		PluginRoot: validRoot,
	})
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeHostVersionInvalid)
}

func TestReadPackageMetadataOptionalReadsDistInfoMetadata(t *testing.T) {
	pluginRoot := t.TempDir()
	distInfoRoot := filepath.Join(pluginRoot, "build", "setta_fixture-1.2.3.dist-info")
	if err := os.MkdirAll(distInfoRoot, 0o755); err != nil {
		t.Fatalf("mkdir dist-info root: %v", err)
	}
	if err := os.WriteFile(
		filepath.Join(distInfoRoot, "METADATA"),
		[]byte("Metadata-Version: 2.4\nName: setta-fixture\nVersion: 1.2.3\n"),
		0o644,
	); err != nil {
		t.Fatalf("write metadata: %v", err)
	}

	name, version := readPackageMetadataOptional(pluginRoot)
	if name != "setta-fixture" || version != "1.2.3" {
		t.Fatalf("expected package metadata from dist-info, got name=%q version=%q", name, version)
	}
}

// Validate should fail closed on missing manifests, invalid JSON, missing paths,
// invalid config schemas, incompatible Setta versions, and invalid host version strings.
func TestServiceValidateFolderRejectsManifestSchemaPathsAndVersions(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	t.Run("missing manifest", func(t *testing.T) {
		pluginRoot := filepath.Join(roots.workspaceRoot, "missing-manifest")
		if err := os.MkdirAll(pluginRoot, 0o755); err != nil {
			t.Fatalf("mkdir plugin root: %v", err)
		}
		_, err := service.ValidateFolder(ValidateFolderOptions{PluginRoot: pluginRoot})
		assertPluginServiceErrorCode(t, err, ServiceErrorCodeSourceManifestNotFound)
	})

	t.Run("invalid manifest json", func(t *testing.T) {
		pluginRoot := filepath.Join(roots.workspaceRoot, "invalid-manifest")
		if err := os.MkdirAll(pluginRoot, 0o755); err != nil {
			t.Fatalf("mkdir plugin root: %v", err)
		}
		if err := os.WriteFile(filepath.Join(pluginRoot, pluginManifestFileName), []byte("{bad-json"), 0o644); err != nil {
			t.Fatalf("write invalid manifest: %v", err)
		}
		_, err := service.ValidateFolder(ValidateFolderOptions{PluginRoot: pluginRoot})
		assertPluginServiceErrorCode(t, err, ServiceErrorCodeManifestInvalid)
	})

	t.Run("missing manifest paths", func(t *testing.T) {
		pluginRoot := mustInitAuthoringTestPlugin(t, service, roots.workspaceRoot, "setta-missing-path-plugin", "frontend")
		manifest, err := loadAuthoringManifest(filepath.Join(pluginRoot, pluginManifestFileName))
		if err != nil {
			t.Fatalf("load manifest: %v", err)
		}
		if manifest.Frontend == nil {
			t.Fatalf("expected frontend manifest in scaffold")
		}
		if err := os.Remove(filepath.Join(pluginRoot, filepath.FromSlash(manifest.Frontend.Entrypoint))); err != nil {
			t.Fatalf("remove frontend entrypoint: %v", err)
		}
		_, err = service.ValidateFolder(ValidateFolderOptions{PluginRoot: pluginRoot})
		assertPluginServiceErrorCode(t, err, ServiceErrorCodeManifestPathNotFound)
	})

	t.Run("invalid config schema json", func(t *testing.T) {
		pluginRoot := mustCopyAuthoringFixturePlugin(t, roots.workspaceRoot, "full")
		manifest, err := loadAuthoringManifest(filepath.Join(pluginRoot, pluginManifestFileName))
		if err != nil {
			t.Fatalf("load manifest: %v", err)
		}
		if strings.TrimSpace(manifest.ConfigSchemaPath) == "" {
			t.Fatalf("expected config schema path in full scaffold")
		}
		if err := os.WriteFile(filepath.Join(pluginRoot, filepath.FromSlash(manifest.ConfigSchemaPath)), []byte("{not-json"), 0o644); err != nil {
			t.Fatalf("write invalid config schema: %v", err)
		}
		_, err = service.ValidateFolder(ValidateFolderOptions{PluginRoot: pluginRoot})
		assertPluginServiceErrorCode(t, err, ServiceErrorCodeConfigSchemaInvalid)
	})

	t.Run("incompatible setta version", func(t *testing.T) {
		pluginRoot := mustInitAuthoringTestPlugin(t, service, roots.workspaceRoot, "setta-incompatible-version-plugin", "frontend")
		rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
			payload["settaVersionRange"] = ">=999.0.0"
		})
		_, err := service.ValidateFolder(ValidateFolderOptions{PluginRoot: pluginRoot})
		assertPluginServiceErrorCode(t, err, ServiceErrorCodeManifestVersionMismatch)
	})

	t.Run("invalid host version", func(t *testing.T) {
		invalidHostVersionService, err := NewService(ServiceOptions{
			WorkspaceRoot:  roots.workspaceRoot,
			SettaFilesRoot: roots.settaFilesRoot,
			SettaHome:      roots.settaHome,
			ServerMode:     config.ModeIDE,
			SettaVersion:   "not-a-version",
		})
		if err != nil {
			t.Fatalf("new service with invalid host version: %v", err)
		}
		pluginRoot := mustInitAuthoringTestPlugin(t, service, roots.workspaceRoot, "setta-invalid-host-version-branch", "frontend")
		_, err = invalidHostVersionService.ValidateFolder(ValidateFolderOptions{PluginRoot: pluginRoot})
		assertPluginServiceErrorCode(t, err, ServiceErrorCodeHostVersionInvalid)
	})
}

// Validate should accept backend capability names that the Go plugin runtime supports today.
func TestServiceValidateFolderAcceptsKnownBackendCapabilities(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	pluginRoot := mustInitAuthoringTestPlugin(t, service, roots.workspaceRoot, "setta-backend-capability-fixture", "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{
			"registerCodegenTarget",
			"registerLanguageServer",
			"registerMcpTools",
			"registerRouter",
			"registerStaticDir",
		}
	})

	if _, err := service.ValidateFolder(ValidateFolderOptions{PluginRoot: pluginRoot}); err != nil {
		t.Fatalf("validate backend-capability scaffold: %v", err)
	}
}

// Validate should fail fast when route/static/listener-capable backends do not implement the probe contract.
func TestServiceValidateFolderRejectsMissingBackendProbeForRegisteredRoutes(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	pluginRoot := mustInitAuthoringTestPlugin(t, service, roots.workspaceRoot, "setta-backend-route-probe-missing", "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{"registerRouter"}
	})
	if err := os.WriteFile(
		filepath.Join(pluginRoot, "backend", "main.go"),
		[]byte("package main\n\nfunc main() {}\n"),
		0o644,
	); err != nil {
		t.Fatalf("write backend scaffold without probe support: %v", err)
	}

	_, err := service.ValidateFolder(ValidateFolderOptions{PluginRoot: pluginRoot})
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeBackendRuntimeInvalid)
}

// Validate should require backend plugins to be real Go commands, not just manifest-valid file paths.
func TestServiceValidateFolderRejectsInvalidGoBackendAuthoring(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	nonMainPackageRoot := mustInitAuthoringTestPlugin(t, service, roots.workspaceRoot, "setta-invalid-backend-package", "backend")
	if err := os.WriteFile(
		filepath.Join(nonMainPackageRoot, "backend", "main.go"),
		[]byte("package pluginbackend\n\nfunc main() {}\n"),
		0o644,
	); err != nil {
		t.Fatalf("write invalid backend package: %v", err)
	}
	_, err := service.ValidateFolder(ValidateFolderOptions{PluginRoot: nonMainPackageRoot})
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeBackendBuildFailed)

	missingMainRoot := mustInitAuthoringTestPlugin(t, service, roots.workspaceRoot, "setta-missing-main-func", "backend")
	if err := os.WriteFile(
		filepath.Join(missingMainRoot, "backend", "main.go"),
		[]byte("package main\n\nfunc helper() {}\n"),
		0o644,
	); err != nil {
		t.Fatalf("write missing main backend: %v", err)
	}
	_, err = service.ValidateFolder(ValidateFolderOptions{PluginRoot: missingMainRoot})
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeBackendBuildFailed)

	buildFailureRoot := mustInitAuthoringTestPlugin(t, service, roots.workspaceRoot, "setta-backend-build-failure", "backend")
	if err := os.WriteFile(
		filepath.Join(buildFailureRoot, "backend", "main.go"),
		[]byte("package main\n\nfunc main() { missingSymbol() }\n"),
		0o644,
	); err != nil {
		t.Fatalf("write backend build failure: %v", err)
	}
	_, err = service.ValidateFolder(ValidateFolderOptions{PluginRoot: buildFailureRoot})
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeBackendBuildFailed)
}

// Link should create a symlinked install with local metadata ownership and active runtime state.
func TestServiceLinkCreatesSymlinkedInstallMetadata(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	sourceRoot := mustInitAuthoringTestPlugin(t, service, roots.workspaceRoot, "setta-local-frontend-plugin", "frontend")

	result, err := service.Link(LinkOptions{
		LocalPluginRoot: sourceRoot,
		Enable:          true,
		Force:           false,
	})
	if err != nil {
		t.Fatalf("link local plugin: %v", err)
	}
	if result.PluginID != "setta-local-frontend-plugin" || result.State != PluginRuntimeStateActive || result.RestartRequired {
		t.Fatalf("unexpected link result %#v", result)
	}
	if result.SourceScopeLabel != "workspace" {
		t.Fatalf("expected workspace source scope label, got %#v", result.SourceScopeLabel)
	}
	if result.TrustStatus != PluginSourceTrustStatusUnverified {
		t.Fatalf("expected unverified trust status, got %#v", result.TrustStatus)
	}
	if result.TrustWarning != unverifiedSourceWarning {
		t.Fatalf("expected trust warning %q, got %#v", unverifiedSourceWarning, result.TrustWarning)
	}

	targetRoot := filepath.Join(roots.workspaceRoot, ".setta_plugins", "setta-local-frontend-plugin")
	info, err := os.Lstat(targetRoot)
	if err != nil {
		t.Fatalf("stat linked target: %v", err)
	}
	if info.Mode()&os.ModeSymlink == 0 {
		t.Fatalf("expected symlink target, got mode %#o", info.Mode())
	}
	linkDestination, err := os.Readlink(targetRoot)
	if err != nil {
		t.Fatalf("read linked target: %v", err)
	}
	if linkDestination != sourceRoot {
		t.Fatalf("expected symlink destination %q, got %q", sourceRoot, linkDestination)
	}

	metadata, ok, err := service.store.GetInstallMetadata("setta-local-frontend-plugin", PluginScopeWorkspace)
	if err != nil {
		t.Fatalf("read install metadata: %v", err)
	}
	if !ok {
		t.Fatalf("expected install metadata entry")
	}
	if metadata.SourceSpec != "local:"+sourceRoot || metadata.CanonicalSourceKey != "local:"+sourceRoot {
		t.Fatalf("unexpected local metadata %#v", metadata)
	}
}

// Link should surface malformed persisted global enablement state before mutating global installs.
func TestServiceLinkRejectsInvalidGlobalStateFile(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	sourceRoot := mustCopyAuthoringFixturePlugin(t, roots.workspaceRoot, "frontend")

	if err := os.WriteFile(service.store.PluginsGlobalStatePath(), []byte("{invalid-json"), 0o644); err != nil {
		t.Fatalf("seed invalid global state: %v", err)
	}

	_, err := service.Link(LinkOptions{
		LocalPluginRoot: sourceRoot,
		Scope:           scopePointer(PluginScopeGlobal),
		Enable:          true,
		Force:           false,
	})
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeGlobalStateInvalid)
}

// Link should preserve restart-required behavior when replacing a backend plugin with a frontend-only source.
func TestServiceLinkBackendReplacementRequiresRestart(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	backendRoot := mustCopyAuthoringFixturePlugin(t, roots.workspaceRoot, "backend")
	initial, err := service.Link(LinkOptions{
		LocalPluginRoot: backendRoot,
		Enable:          true,
		Force:           false,
	})
	if err != nil {
		t.Fatalf("link backend plugin: %v", err)
	}
	if !initial.RestartRequired || initial.State != PluginRuntimeStatePendingRestart {
		t.Fatalf("expected backend link to require restart, got %#v", initial)
	}

	replacementRoot := mustInitAuthoringTestPlugin(t, service, roots.workspaceRoot, "setta-frontend-replacement", "frontend")
	rewritePluginManifest(t, replacementRoot, func(payload map[string]any) {
		payload["id"] = "setta-fixture-backend"
		payload["name"] = "setta-fixture-backend"
	})

	replaced, err := service.Link(LinkOptions{
		LocalPluginRoot: replacementRoot,
		Enable:          true,
		Force:           true,
	})
	if err != nil {
		t.Fatalf("replace backend plugin with frontend source: %v", err)
	}
	if !replaced.RestartRequired || replaced.State != PluginRuntimeStatePendingRestart {
		t.Fatalf("expected replacement link to keep restart requirement, got %#v", replaced)
	}
}

// Link should ignore Python package dependency metadata for Go-backed backend plugins.
func TestServiceLinkIgnoresPythonDependencySpecForGoBackendPlugin(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	sourceRoot := mustCopyAuthoringFixturePlugin(t, roots.workspaceRoot, "backend")

	if err := os.WriteFile(
		filepath.Join(sourceRoot, "pyproject.toml"),
		[]byte("[build-system]\nrequires = [\"setuptools==80.9.0\", \"wheel==0.45.1\"]\nbuild-backend = \"setuptools.build_meta\"\n\n[project]\nname = \"setta-fixture-backend\"\nversion = \"0.1.0\"\ndescription = \"Backend fixture plugin for Setta tests\"\nrequires-python = \">=3.12\"\ndependencies = [\"not a valid requirement @@@\"]\n"),
		0o644,
	); err != nil {
		t.Fatalf("write invalid python dependency spec: %v", err)
	}

	linkResult, err := service.Link(LinkOptions{
		LocalPluginRoot: sourceRoot,
		Scope:           scopePointer(PluginScopeWorkspace),
		Enable:          true,
		Force:           false,
	})
	if err != nil {
		t.Fatalf("link backend plugin with invalid python dependency spec: %v", err)
	}
	if linkResult.PluginID != "setta-fixture-backend" {
		t.Fatalf("expected backend fixture plugin id, got %#v", linkResult.PluginID)
	}
	if !linkResult.RestartRequired || linkResult.State != PluginRuntimeStatePendingRestart {
		t.Fatalf("expected backend link to stay restart-gated, got %#v", linkResult)
	}
}

// Link should fail fast when the requested local source root does not exist.
func TestServiceLinkRejectsMissingSourceRoot(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	_, err := service.Link(LinkOptions{
		LocalPluginRoot: filepath.Join(roots.workspaceRoot, "missing-plugin-root"),
		Enable:          true,
		Force:           false,
	})
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeSourceNotFound)

	metadata, err := service.store.LoadInstallMetadata()
	if err != nil {
		t.Fatalf("load install metadata after missing-source link: %v", err)
	}
	if len(metadata.Entries) != 0 {
		t.Fatalf("expected no install metadata after missing-source link, got %#v", metadata.Entries)
	}
}

// Link should fail before mutation when the local source does not satisfy host-version checks.
func TestServiceLinkRejectsIncompatibleSettaVersionBeforeMutation(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	sourceRoot := mustInitAuthoringTestPlugin(t, service, roots.workspaceRoot, "setta-incompatible-link-plugin", "frontend")
	rewritePluginManifest(t, sourceRoot, func(payload map[string]any) {
		payload["settaVersionRange"] = ">=999.0.0"
	})

	_, err := service.Link(LinkOptions{
		LocalPluginRoot: sourceRoot,
		Enable:          true,
		Force:           false,
	})
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeManifestVersionMismatch)

	targetRoot := filepath.Join(roots.workspaceRoot, ".setta_plugins", "setta-incompatible-link-plugin")
	if _, statErr := os.Stat(targetRoot); !os.IsNotExist(statErr) {
		t.Fatalf("expected no target plugin after failed link, got err=%v", statErr)
	}

	metadata, err := service.store.LoadInstallMetadata()
	if err != nil {
		t.Fatalf("load install metadata after failed link: %v", err)
	}
	if len(metadata.Entries) != 0 {
		t.Fatalf("expected no install metadata after failed link, got %#v", metadata.Entries)
	}
}

// Link should fail before mutation when config schema JSON is invalid.
func TestServiceLinkRejectsInvalidConfigSchemaBeforeMutation(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	sourceRoot := mustCopyAuthoringFixturePlugin(t, roots.workspaceRoot, "full")
	manifest, err := loadAuthoringManifest(filepath.Join(sourceRoot, pluginManifestFileName))
	if err != nil {
		t.Fatalf("load full fixture manifest: %v", err)
	}
	schemaPath, err := resolveAuthoringPath(sourceRoot, manifest.ConfigSchemaPath, "Invalid configSchemaPath")
	if err != nil {
		t.Fatalf("resolve config schema path: %v", err)
	}
	if err := os.WriteFile(schemaPath, []byte("{bad-json"), 0o644); err != nil {
		t.Fatalf("write invalid config schema: %v", err)
	}

	_, err = service.Link(LinkOptions{
		LocalPluginRoot: sourceRoot,
		Enable:          true,
		Force:           false,
	})
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeConfigSchemaInvalid)

	targetRoot := filepath.Join(roots.workspaceRoot, ".setta_plugins", "setta-fixture-full")
	if _, statErr := os.Stat(targetRoot); !os.IsNotExist(statErr) {
		t.Fatalf("expected no target plugin after invalid-schema link, got err=%v", statErr)
	}

	metadata, err := service.store.LoadInstallMetadata()
	if err != nil {
		t.Fatalf("load install metadata after invalid-schema link: %v", err)
	}
	if len(metadata.Entries) != 0 {
		t.Fatalf("expected no install metadata after invalid-schema link, got %#v", metadata.Entries)
	}
}

// Link should reject an existing target unless force is requested.
func TestServiceLinkRejectsExistingTargetWithoutForce(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	sourceRoot := mustInitAuthoringTestPlugin(t, service, roots.workspaceRoot, "setta-existing-link-plugin", "frontend")
	if _, err := service.Link(LinkOptions{
		LocalPluginRoot: sourceRoot,
		Enable:          true,
		Force:           false,
	}); err != nil {
		t.Fatalf("link plugin first time: %v", err)
	}

	_, err := service.Link(LinkOptions{
		LocalPluginRoot: sourceRoot,
		Enable:          true,
		Force:           false,
	})
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeTargetExists)

	targetRoot := filepath.Join(roots.workspaceRoot, ".setta_plugins", "setta-existing-link-plugin")
	linkDestination, readErr := os.Readlink(targetRoot)
	if readErr != nil {
		t.Fatalf("read existing linked target: %v", readErr)
	}
	if linkDestination != sourceRoot {
		t.Fatalf("expected existing symlink destination %q, got %q", sourceRoot, linkDestination)
	}

	metadata, ok, err := service.store.GetInstallMetadata("setta-existing-link-plugin", PluginScopeWorkspace)
	if err != nil {
		t.Fatalf("read install metadata after target-exists link: %v", err)
	}
	if !ok {
		t.Fatal("expected install metadata for existing linked plugin")
	}
	if metadata.SourceSpec != "local:"+sourceRoot {
		t.Fatalf("unexpected existing install metadata %#v", metadata)
	}
}

func assertPluginServiceErrorCode(t *testing.T, err error, expected ServiceErrorCode) {
	t.Helper()

	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) {
		t.Fatalf("expected service error %q, got %v", expected, err)
	}
	if serviceErr.Code != expected {
		t.Fatalf("expected service error code %q, got %q", expected, serviceErr.Code)
	}
}

func mustInitAuthoringTestPlugin(t *testing.T, service *Service, outDir string, pluginID string, template string) string {
	t.Helper()

	pluginRoot, err := service.InitTemplate(InitTemplateOptions{
		PluginID: pluginID,
		Template: template,
		OutDir:   outDir,
	})
	if err != nil {
		t.Fatalf("init authoring test plugin %s: %v", pluginID, err)
	}
	return pluginRoot
}

func mustCopyAuthoringFixturePlugin(t *testing.T, outDir string, fixtureName string) string {
	t.Helper()

	repoRoot := workerRPCTestRepoRoot(t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", fixtureName)
	targetRoot := filepath.Join(outDir, fixtureName)
	copyBackendCodegenFixtureDir(t, sourceRoot, targetRoot)
	return targetRoot
}
