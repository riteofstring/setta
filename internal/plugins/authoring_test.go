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

// Validate should accept known backend capability names even while the Go runtime still blocks them at execution time.
func TestServiceValidateFolderAcceptsKnownBackendCapabilities(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	pluginRoot := mustInitAuthoringTestPlugin(t, service, roots.workspaceRoot, "setta-backend-capability-fixture", "backend")
	rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
		payload["capabilities"] = []string{
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
