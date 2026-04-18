package plugins

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"runtime"
	"slices"
	"strings"
	"testing"
	"time"

	"setta/internal/config"
)

// Source spec parsing should reject malformed github/pypi references.
func TestParseSourceSpecRejectsInvalidFormats(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name string
		spec string
		code ServiceErrorCode
		want string
	}{
		{
			name: "blank source spec",
			spec: "   ",
			code: ServiceErrorCodeSourceInvalid,
			want: pluginSourceSpecRequiredMessage,
		},
		{
			name: "missing scheme separator",
			spec: "github-acme/plugin",
			code: ServiceErrorCodeSourceSchemeUnsupported,
			want: unsupportedPluginSourceSpecMessagePrefix + "github-acme/plugin",
		},
		{
			name: "missing github repo",
			spec: "github:acme",
			code: ServiceErrorCodeSourceInvalid,
			want: gitHubPluginSourceUsageMessage,
		},
		{
			name: "invalid pypi package",
			spec: "pypi:bad@@name",
			code: ServiceErrorCodeSourceInvalid,
			want: `Invalid package name: "bad@@name"`,
		},
	}
	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			_, err := ParseSourceSpec(testCase.spec)
			var serviceErr *ServiceError
			if !errors.As(err, &serviceErr) {
				t.Fatalf("expected service error, got %v", err)
			}
			if serviceErr.Code != testCase.code {
				t.Fatalf("expected code %q, got %q", testCase.code, serviceErr.Code)
			}
			if serviceErr.Message != testCase.want {
				t.Fatalf("expected message %q, got %q", testCase.want, serviceErr.Message)
			}
		})
	}
}

// Source spec parsing should support both github:#ref and github:@ref forms.
func TestParseSourceSpecAcceptsGitHubHashAndAtRefs(t *testing.T) {
	t.Parallel()

	withHashRef, err := ParseSourceSpec("github:acme/plugin#release-1")
	if err != nil {
		t.Fatalf("parse github hash ref: %v", err)
	}
	if withHashRef.Scheme != PluginSourceSchemeGitHub || withHashRef.Owner != "acme" || withHashRef.Repo != "plugin" || withHashRef.Ref != "release-1" {
		t.Fatalf("unexpected github hash ref parse: %#v", withHashRef)
	}

	withAtRef, err := ParseSourceSpec("github:acme/plugin@release-2")
	if err != nil {
		t.Fatalf("parse github at ref: %v", err)
	}
	if withAtRef.Scheme != PluginSourceSchemeGitHub || withAtRef.Owner != "acme" || withAtRef.Repo != "plugin" || withAtRef.Ref != "release-2" {
		t.Fatalf("unexpected github at ref parse: %#v", withAtRef)
	}
}

// Source retargeting should preserve scheme semantics for github/pypi updates.
func TestRetargetSourceSpecRewritesGitHubAndPyPITargets(t *testing.T) {
	t.Parallel()

	if RetargetSourceSpec("github:acme/plugin#main", "v2") != "github:acme/plugin#v2" {
		t.Fatalf("expected github retarget to preserve repo")
	}
	if RetargetSourceSpec("github:acme/plugin@main", "v2") != "github:acme/plugin#v2" {
		t.Fatalf("expected github @ref retarget to preserve repo")
	}
	if RetargetSourceSpec("pypi:setta-fixture-frontend==0.1.0", "0.2.0") != "pypi:setta-fixture-frontend==0.2.0" {
		t.Fatalf("expected pypi retarget to preserve package name")
	}
	if RetargetSourceSpec("pypi:setta-fixture-frontend==0.1.0", "setta-fixture-frontend==0.3.0") != "pypi:setta-fixture-frontend==0.3.0" {
		t.Fatalf("expected pypi retarget to accept explicit package+version")
	}
	if RetargetSourceSpec("github:acme/plugin#main", "github:other/repo#tag") != "github:other/repo#tag" {
		t.Fatalf("expected explicit target source spec to win")
	}
	if RetargetSourceSpec("github:acme/plugin#main", "   ") != "github:acme/plugin#main" {
		t.Fatalf("expected blank retarget to keep source spec")
	}
}

// The mutation service should install GitHub plugin sources end to end and preserve digests across reinstall.
func TestServiceInstallGitHubPluginStripsGitMetadataAndPreservesDigestAcrossReinstall(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	baseURL, ref := buildLocalGitHubBareRepoFromFixture(t, t.TempDir(), "frontend", "acme", "setta-fixture-frontend")
	service, err := NewService(ServiceOptions{
		WorkspaceRoot:  roots.workspaceRoot,
		SettaFilesRoot: roots.settaFilesRoot,
		SettaHome:      roots.settaHome,
		ServerMode:     config.ModeIDE,
		CandidateProvider: NewProductionCandidateProvider(ProductionCandidateProviderOptions{
			SettaFilesRoot: roots.settaFilesRoot,
			SettaVersion:   "0.1.0",
			GitHubBaseURL:  baseURL,
		}),
	})
	if err != nil {
		t.Fatalf("new plugin service: %v", err)
	}

	sourceSpec := fmt.Sprintf("github:acme/setta-fixture-frontend#%s", ref)
	firstInstall, err := service.Install(context.Background(), InstallOptions{
		SourceSpec: sourceSpec,
		Scope:      scopePointer(PluginScopeWorkspace),
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install GitHub plugin: %v", err)
	}
	if firstInstall.PluginID != "setta-fixture-frontend" || firstInstall.State != PluginRuntimeStateActive {
		t.Fatalf("unexpected first install result %#v", firstInstall)
	}
	if firstInstall.CanonicalSourceKey != "github:acme/setta-fixture-frontend" {
		t.Fatalf("unexpected canonical source key %q", firstInstall.CanonicalSourceKey)
	}
	if firstInstall.SourceDigestSHA256 == nil || strings.TrimSpace(*firstInstall.SourceDigestSHA256) == "" {
		t.Fatalf("expected first install source digest to be populated")
	}

	installedRoot := filepath.Join(roots.workspaceRoot, ".setta_plugins", "setta-fixture-frontend")
	if _, err := os.Stat(filepath.Join(installedRoot, ".git")); !os.IsNotExist(err) {
		t.Fatalf("expected installed plugin root to exclude git metadata, got err=%v", err)
	}

	if _, err := service.Uninstall(context.Background(), UninstallOptions{
		PluginID: "setta-fixture-frontend",
		Scope:    scopePointer(PluginScopeWorkspace),
	}); err != nil {
		t.Fatalf("uninstall GitHub plugin: %v", err)
	}

	secondInstall, err := service.Install(context.Background(), InstallOptions{
		SourceSpec: sourceSpec,
		Scope:      scopePointer(PluginScopeWorkspace),
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("reinstall GitHub plugin: %v", err)
	}
	if secondInstall.SourceDigestSHA256 == nil || *secondInstall.SourceDigestSHA256 != *firstInstall.SourceDigestSHA256 {
		t.Fatalf("expected stable GitHub source digest across reinstall, got first=%#v second=%#v", firstInstall.SourceDigestSHA256, secondInstall.SourceDigestSHA256)
	}
}

// The mutation service should install a PyPI plugin from a real local wheel artifact and surface the live status entry.
func TestServiceInstallPyPIPluginFromLocalWheel(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	artifactDir := t.TempDir()
	buildLocalPyPIWheelFromFixture(t, artifactDir, "frontend", "setta-fixture-frontend", "0.1.0")

	t.Setenv("PIP_NO_INDEX", "1")
	t.Setenv("PIP_FIND_LINKS", artifactDir)

	provider := NewProductionCandidateProvider(ProductionCandidateProviderOptions{
		PackageManagerRuntime: mustNewPythonRuntime(t),
		SettaFilesRoot:        roots.settaFilesRoot,
		SettaVersion:          "0.1.0",
	})
	service := mustNewPluginMutationService(t, roots, provider, config.ModeIDE)

	installResult, err := service.Install(context.Background(), InstallOptions{
		SourceSpec: "pypi:setta-fixture-frontend==0.1.0",
		Scope:      scopePointer(PluginScopeWorkspace),
		Installer:  installerPointer(PluginInstallerBackendPip),
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install local wheel plugin: %v", err)
	}

	if installResult.PluginID != "setta-fixture-frontend" || installResult.Version != "0.1.0" {
		t.Fatalf("unexpected install result %#v", installResult)
	}
	if installResult.State != PluginRuntimeStateActive {
		t.Fatalf("expected active install result, got %#v", installResult.State)
	}
	if installResult.SourceScope != PluginScopeWorkspace || installResult.SourceScopeLabel != "workspace" {
		t.Fatalf("expected workspace install scope, got scope=%q label=%q", installResult.SourceScope, installResult.SourceScopeLabel)
	}
	if installResult.SourceDigestSHA256 == nil || strings.TrimSpace(*installResult.SourceDigestSHA256) == "" {
		t.Fatalf("expected source digest to be populated")
	}

	expectedCapabilities := []string{
		"registerSectionKinds",
		"registerPane",
		"registerCommand",
		"readProjectState",
		"subscribeProjectState",
		"emitListenerEvents",
	}
	if !slices.Equal(installResult.RequestedCapabilities, expectedCapabilities) {
		t.Fatalf("unexpected requested capabilities %#v", installResult.RequestedCapabilities)
	}
	if installResult.TrustStatus != PluginSourceTrustStatusUnverified {
		t.Fatalf("expected unverified trust status, got %#v", installResult.TrustStatus)
	}
	if !strings.Contains(installResult.TrustWarning, "Source is unverified.") {
		t.Fatalf("expected unverified trust warning, got %#v", installResult.TrustWarning)
	}

	status, err := service.Status()
	if err != nil {
		t.Fatalf("status after local wheel install: %v", err)
	}
	entry := mustFindStatusEntry(t, status.Plugins, "setta-fixture-frontend", PluginRuntimeStateActive)
	if entry.SourceScope != PluginScopeWorkspace || entry.ShadowedBySourcePath != nil {
		t.Fatalf("expected active workspace status entry without shadowing, got %#v", entry)
	}
}

// A scaffolded full plugin should survive the current Go authoring -> wheel install -> runtime refresh path.
func TestServiceInitTemplateGoldenPathWheelInstallAndRuntimeRefresh(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	initService := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	pluginID := "setta-golden-path-plugin"
	pluginRoot, err := initService.InitTemplate(InitTemplateOptions{
		PluginID: pluginID,
		Template: "full",
		OutDir:   roots.workspaceRoot,
	})
	if err != nil {
		t.Fatalf("init full template: %v", err)
	}
	if _, err := initService.ValidateFolder(ValidateFolderOptions{PluginRoot: pluginRoot}); err != nil {
		t.Fatalf("validate scaffolded full plugin: %v", err)
	}

	artifactDir := t.TempDir()
	buildLocalPyPIWheelFromRoot(t, artifactDir, pluginRoot, pluginID, "0.1.0")

	t.Setenv("PIP_NO_INDEX", "1")
	t.Setenv("PIP_FIND_LINKS", artifactDir)

	provider := NewProductionCandidateProvider(ProductionCandidateProviderOptions{
		PackageManagerRuntime: mustNewPythonRuntime(t),
		SettaFilesRoot:        roots.settaFilesRoot,
		SettaVersion:          "0.1.0",
	})
	service := mustNewPluginMutationService(t, roots, provider, config.ModeIDE)

	installResult, err := service.Install(context.Background(), InstallOptions{
		SourceSpec: fmt.Sprintf("pypi:%s==0.1.0", pluginID),
		Scope:      scopePointer(PluginScopeWorkspace),
		Installer:  installerPointer(PluginInstallerBackendPip),
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install scaffolded full plugin wheel: %v", err)
	}
	if installResult.PluginID != pluginID || installResult.Version != "0.1.0" {
		t.Fatalf("unexpected install result %#v", installResult)
	}
	if installResult.State != PluginRuntimeStatePendingRestart || !installResult.RestartRequired {
		t.Fatalf("expected backend-capable full plugin install to require restart, got %#v", installResult)
	}
	if installResult.SourceDigestSHA256 == nil || strings.TrimSpace(*installResult.SourceDigestSHA256) == "" {
		t.Fatalf("expected scaffolded full install source digest to be populated")
	}

	runtimeResponse, err := service.Runtime(RuntimeOptions{
		AssetURLBuilder: testRuntimeAssetURLBuilder,
	})
	if err != nil {
		t.Fatalf("runtime after scaffolded full install: %v", err)
	}
	listEntry := mustFindRuntimeListEntry(t, runtimeResponse.List.Plugins, pluginID)
	if listEntry.SourceScope != PluginScopeWorkspace {
		t.Fatalf("expected workspace scope runtime entry, got %#v", listEntry.SourceScope)
	}
	if listEntry.Frontend.EntrypointURL == nil || !strings.Contains(*listEntry.Frontend.EntrypointURL, "/plugins/"+pluginID+"/frontend/dist/index.js?v=") {
		t.Fatalf("expected runtime entrypoint url for scaffolded full plugin, got %#v", listEntry.Frontend.EntrypointURL)
	}
	if !listEntry.Content.HasBlueprints || !listEntry.Content.HasProjectTemplates || !listEntry.Content.HasPrompts {
		t.Fatalf("expected full scaffold content descriptor, got %#v", listEntry.Content)
	}

	if _, err := service.CommitBackendRuntimeRefresh(); err != nil {
		t.Fatalf("commit backend runtime refresh for scaffolded full plugin: %v", err)
	}
	status, err := service.Status()
	if err != nil {
		t.Fatalf("status after scaffolded full plugin runtime refresh: %v", err)
	}
	statusEntry := mustFindStatusEntry(t, status.Plugins, pluginID, PluginRuntimeStateActive)
	if statusEntry.RestartRequired {
		t.Fatalf("expected active scaffolded full plugin after refresh, got %#v", statusEntry)
	}
	if statusEntry.SourceScope != PluginScopeWorkspace || statusEntry.ShadowedBySourcePath != nil {
		t.Fatalf("expected active workspace status entry after refresh, got %#v", statusEntry)
	}
}

// The mutation service should support an install/update/rollback/uninstall lifecycle over real plugin fixtures.
func TestServiceInstallUpdateRollbackAndUninstallLifecycle(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, newFixtureCandidateProvider(t, map[string]fixtureCandidateSpec{
		"pypi:setta-fixture-frontend==0.1.0": {
			FixtureName: "frontend",
			Version:     "0.1.0",
		},
		"pypi:setta-fixture-frontend==0.2.0": {
			FixtureName: "frontend",
			Version:     "0.2.0",
		},
	}), config.ModeIDE)

	installResult, err := service.Install(context.Background(), InstallOptions{
		SourceSpec: "pypi:setta-fixture-frontend==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install plugin: %v", err)
	}
	if installResult.PluginID != "setta-fixture-frontend" || installResult.Version != "0.1.0" {
		t.Fatalf("unexpected install result: %#v", installResult)
	}
	if installResult.SourceScopeLabel != "workspace" {
		t.Fatalf("expected workspace source scope label, got %#v", installResult.SourceScopeLabel)
	}
	if installResult.TrustStatus != PluginSourceTrustStatusUnverified {
		t.Fatalf("expected unverified trust status, got %#v", installResult.TrustStatus)
	}
	if installResult.TrustWarning != unverifiedSourceWarning {
		t.Fatalf("expected trust warning %q, got %#v", unverifiedSourceWarning, installResult.TrustWarning)
	}
	if installResult.RestartRequired {
		t.Fatalf("expected frontend install not to require restart")
	}

	updateResult, err := service.Update(context.Background(), UpdateOptions{
		PluginID: "setta-fixture-frontend",
		To:       "0.2.0",
	})
	if err != nil {
		t.Fatalf("update plugin: %v", err)
	}
	if updateResult.FromVersion != "0.1.0" || updateResult.ToVersion != "0.2.0" {
		t.Fatalf("unexpected update result: %#v", updateResult)
	}
	if updateResult.RestartRequired {
		t.Fatalf("expected frontend update not to require restart")
	}

	metadata, ok, err := service.store.GetInstallMetadata("setta-fixture-frontend", PluginScopeWorkspace)
	if err != nil {
		t.Fatalf("get updated metadata: %v", err)
	}
	if !ok {
		t.Fatalf("expected updated metadata to exist")
	}
	if metadata.SourceSpec != "pypi:setta-fixture-frontend==0.2.0" || metadata.Version != "0.2.0" {
		t.Fatalf("unexpected updated metadata: %#v", metadata)
	}
	if len(metadata.History) != 1 || metadata.History[0].Version != "0.1.0" {
		t.Fatalf("expected rollback history for prior version, got %#v", metadata.History)
	}

	rollbackResult, err := service.Rollback(context.Background(), RollbackOptions{
		PluginID: "setta-fixture-frontend",
	})
	if err != nil {
		t.Fatalf("rollback plugin: %v", err)
	}
	if rollbackResult.RestoredVersion != "0.1.0" || rollbackResult.RestartRequired {
		t.Fatalf("unexpected rollback result: %#v", rollbackResult)
	}

	metadata, ok, err = service.store.GetInstallMetadata("setta-fixture-frontend", PluginScopeWorkspace)
	if err != nil {
		t.Fatalf("get rolled back metadata: %v", err)
	}
	if !ok {
		t.Fatalf("expected rolled back metadata to exist")
	}
	if metadata.Version != "0.1.0" || len(metadata.History) != 0 {
		t.Fatalf("unexpected rolled back metadata: %#v", metadata)
	}

	uninstallResult, err := service.Uninstall(context.Background(), UninstallOptions{
		PluginID: "setta-fixture-frontend",
	})
	if err != nil {
		t.Fatalf("uninstall plugin: %v", err)
	}
	if uninstallResult.RemovedFromScope != PluginScopeWorkspace || uninstallResult.RestartRequired {
		t.Fatalf("unexpected uninstall result: %#v", uninstallResult)
	}

	snapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("rescan after uninstall: %v", err)
	}
	if len(snapshot.Plugins) != 0 {
		t.Fatalf("expected no plugins after uninstall, got %#v", snapshot.Plugins)
	}
}

// Scoped lifecycle mutations should still target the requested shadowed entry without disturbing the active higher-precedence copy.
func TestServiceScopedLinkAndUninstallWorkForShadowedEntries(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	sourceRoot := mustCopyAuthoringFixturePlugin(t, roots.workspaceRoot, "frontend")

	if _, err := service.Link(LinkOptions{
		LocalPluginRoot: sourceRoot,
		Scope:           scopePointer(PluginScopeWorkspace),
		Enable:          true,
		Force:           true,
	}); err != nil {
		t.Fatalf("link workspace plugin: %v", err)
	}

	shadowedResult, err := service.Link(LinkOptions{
		LocalPluginRoot: sourceRoot,
		Scope:           scopePointer(PluginScopeSettaFiles),
		Enable:          true,
		Force:           true,
	})
	if err != nil {
		t.Fatalf("link setta_files plugin: %v", err)
	}
	if shadowedResult.SourceScope != PluginScopeSettaFiles || shadowedResult.State != PluginRuntimeStateShadowed {
		t.Fatalf("expected setta_files link result to be shadowed, got %#v", shadowedResult)
	}

	uninstallResult, err := service.Uninstall(context.Background(), UninstallOptions{
		PluginID: "setta-fixture-frontend",
		Scope:    scopePointer(PluginScopeSettaFiles),
	})
	if err != nil {
		t.Fatalf("uninstall shadowed setta_files plugin: %v", err)
	}
	if uninstallResult.PluginID != "setta-fixture-frontend" || uninstallResult.RemovedFromScope != PluginScopeSettaFiles {
		t.Fatalf("unexpected uninstall result %#v", uninstallResult)
	}

	status, err := service.Status()
	if err != nil {
		t.Fatalf("load status after shadowed uninstall: %v", err)
	}
	entry := mustFindStatusEntry(t, status.Plugins, "setta-fixture-frontend", PluginRuntimeStateActive)
	if entry.SourceScope != PluginScopeWorkspace || entry.ShadowedBySourcePath != nil {
		t.Fatalf("expected workspace entry to remain active and unshadowed, got %#v", entry)
	}
}

// Existing-target installs should fail closed before metadata is written.
func TestServiceInstallRejectsExistingTargetWithoutForce(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, newFixtureCandidateProvider(t, map[string]fixtureCandidateSpec{
		"pypi:setta-fixture-backend==0.1.0": {
			FixtureName: "backend",
			Version:     "0.1.0",
		},
	}), config.ModeIDE)

	targetRoot := filepath.Join(roots.workspaceRoot, ".setta_plugins", "setta-fixture-backend")
	if err := os.MkdirAll(targetRoot, 0o755); err != nil {
		t.Fatalf("create existing target root: %v", err)
	}

	_, err := service.Install(context.Background(), InstallOptions{
		SourceSpec: "pypi:setta-fixture-backend==0.1.0",
		Enable:     true,
	})
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) {
		t.Fatalf("expected service error, got %v", err)
	}
	if serviceErr.Code != ServiceErrorCodeTargetExists {
		t.Fatalf("expected target exists error, got %q", serviceErr.Code)
	}

	metadata, err := service.store.LoadInstallMetadata()
	if err != nil {
		t.Fatalf("load install metadata after failed install: %v", err)
	}
	if len(metadata.Entries) != 0 {
		t.Fatalf("expected no install metadata after failed install, got %#v", metadata.Entries)
	}
}

// Update should persist explicit retargeted source metadata, not just the new version number.
func TestServiceUpdateWithExplicitTargetPersistsSourceMetadata(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, newFixtureCandidateProvider(t, map[string]fixtureCandidateSpec{
		"pypi:setta-fixture-frontend==0.1.0": {
			FixtureName: "frontend",
			Version:     "0.1.0",
		},
		"pypi:setta_fixture_frontend==0.1.0": {
			FixtureName: "frontend",
			Version:     "0.1.0",
		},
	}), config.ModeIDE)

	if _, err := service.Install(context.Background(), InstallOptions{
		SourceSpec: "pypi:setta-fixture-frontend==0.1.0",
		Enable:     true,
	}); err != nil {
		t.Fatalf("install plugin: %v", err)
	}

	updateResult, err := service.Update(context.Background(), UpdateOptions{
		PluginID: "setta-fixture-frontend",
		To:       "pypi:setta_fixture_frontend==0.1.0",
	})
	if err != nil {
		t.Fatalf("update plugin with explicit target: %v", err)
	}
	if updateResult.PluginID != "setta-fixture-frontend" || updateResult.FromVersion != "0.1.0" || updateResult.ToVersion != "0.1.0" {
		t.Fatalf("unexpected update result %#v", updateResult)
	}

	status, err := service.Status()
	if err != nil {
		t.Fatalf("load plugin status: %v", err)
	}
	entry := mustFindStatusEntry(t, status.Plugins, "setta-fixture-frontend", PluginRuntimeStateActive)
	if entry.SourceScope != PluginScopeWorkspace {
		t.Fatalf("expected workspace-scoped updated plugin, got %#v", entry.SourceScope)
	}
	if entry.CanonicalSourceKey != "pypi:setta_fixture_frontend" {
		t.Fatalf("unexpected canonical source key %q", entry.CanonicalSourceKey)
	}

	metadataEntry, ok, err := service.store.GetInstallMetadata("setta-fixture-frontend", PluginScopeWorkspace)
	if err != nil {
		t.Fatalf("load install metadata: %v", err)
	}
	if !ok {
		t.Fatal("expected install metadata for updated plugin")
	}
	if metadataEntry.SourceSpec != "pypi:setta_fixture_frontend==0.1.0" {
		t.Fatalf("unexpected stored source spec %q", metadataEntry.SourceSpec)
	}
	if metadataEntry.CanonicalSourceKey != "pypi:setta_fixture_frontend" {
		t.Fatalf("unexpected stored canonical source key %q", metadataEntry.CanonicalSourceKey)
	}
}

// Updating a disabled plugin should keep it disabled rather than opportunistically re-enabling it.
func TestServiceUpdatePreservesDisabledState(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, newFixtureCandidateProvider(t, map[string]fixtureCandidateSpec{
		"pypi:setta-fixture-frontend==0.1.0": {
			FixtureName: "frontend",
			Version:     "0.1.0",
		},
		"pypi:setta-fixture-frontend==0.2.0": {
			FixtureName: "frontend",
			Version:     "0.2.0",
		},
	}), config.ModeIDE)

	if _, err := service.Install(context.Background(), InstallOptions{
		SourceSpec: "pypi:setta-fixture-frontend==0.1.0",
		Enable:     true,
	}); err != nil {
		t.Fatalf("install plugin: %v", err)
	}
	if _, err := service.Disable(context.Background(), EnableDisableOptions{
		PluginID: "setta-fixture-frontend",
	}); err != nil {
		t.Fatalf("disable plugin: %v", err)
	}

	updateResult, err := service.Update(context.Background(), UpdateOptions{
		PluginID: "setta-fixture-frontend",
		To:       "0.2.0",
	})
	if err != nil {
		t.Fatalf("update disabled plugin: %v", err)
	}
	if updateResult.FromVersion != "0.1.0" || updateResult.ToVersion != "0.2.0" || updateResult.RestartRequired {
		t.Fatalf("unexpected update result %#v", updateResult)
	}

	status, err := service.Status()
	if err != nil {
		t.Fatalf("load status after update: %v", err)
	}
	entry := mustFindStatusEntry(t, status.Plugins, "setta-fixture-frontend", PluginRuntimeStateDisabled)
	if entry.Version != "0.2.0" || entry.SourceScope != PluginScopeWorkspace {
		t.Fatalf("expected disabled workspace entry at 0.2.0, got %#v", entry)
	}

	metadataEntry, ok, err := service.store.GetInstallMetadata("setta-fixture-frontend", PluginScopeWorkspace)
	if err != nil {
		t.Fatalf("load install metadata after update: %v", err)
	}
	if !ok {
		t.Fatal("expected updated install metadata")
	}
	if metadataEntry.Version != "0.2.0" {
		t.Fatalf("expected metadata version 0.2.0, got %#v", metadataEntry)
	}
}

func TestServiceUpdateMarksPendingRestartForBackendOnly(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, newFixtureCandidateProvider(t, map[string]fixtureCandidateSpec{
		"pypi:setta-fixture-backend==0.1.0": {
			FixtureName: "backend",
			Version:     "0.1.0",
		},
		"pypi:setta-fixture-frontend==0.1.0": {
			FixtureName: "frontend",
			Version:     "0.1.0",
		},
	}), config.ModeIDE)

	backendInstall, err := service.Install(context.Background(), InstallOptions{
		SourceSpec: "pypi:setta-fixture-backend==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install backend plugin: %v", err)
	}
	if !backendInstall.RestartRequired || backendInstall.State != PluginRuntimeStatePendingRestart {
		t.Fatalf("expected backend install to require restart, got %#v", backendInstall)
	}

	if _, err := service.CommitBackendRuntimeRefresh(); err != nil {
		t.Fatalf("commit backend runtime refresh after backend install: %v", err)
	}

	frontendInstall, err := service.Install(context.Background(), InstallOptions{
		SourceSpec: "pypi:setta-fixture-frontend==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install frontend plugin: %v", err)
	}
	if frontendInstall.RestartRequired {
		t.Fatalf("expected frontend install not to require restart, got %#v", frontendInstall)
	}

	backendUpdate, err := service.Update(context.Background(), UpdateOptions{
		PluginID: "setta-fixture-backend",
	})
	if err != nil {
		t.Fatalf("update backend plugin: %v", err)
	}
	if !backendUpdate.RestartRequired {
		t.Fatalf("expected backend update to require restart")
	}

	frontendUpdate, err := service.Update(context.Background(), UpdateOptions{
		PluginID: "setta-fixture-frontend",
	})
	if err != nil {
		t.Fatalf("update frontend plugin: %v", err)
	}
	if frontendUpdate.RestartRequired {
		t.Fatalf("expected frontend update not to require restart, got %#v", frontendUpdate)
	}

	snapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("rescan after updates: %v", err)
	}
	backendEntry := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-fixture-backend", PluginScopeWorkspace)
	if backendEntry.State != PluginRuntimeStatePendingRestart || !backendEntry.RestartRequired {
		t.Fatalf("expected backend entry pending restart after update, got %#v", backendEntry)
	}
	frontendEntry := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-fixture-frontend", PluginScopeWorkspace)
	if frontendEntry.State != PluginRuntimeStateActive || frontendEntry.RestartRequired {
		t.Fatalf("expected frontend entry active without restart after update, got %#v", frontendEntry)
	}
}

// Re-enabling an already-active backend plugin should stay a no-op after runtime refresh clears pending_restart.
func TestServiceBackendEnableNoopWhenAlreadyActive(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, newFixtureCandidateProvider(t, map[string]fixtureCandidateSpec{
		"pypi:setta-fixture-backend==0.1.0": {
			FixtureName: "backend",
			Version:     "0.1.0",
		},
	}), config.ModeIDE)

	installResult, err := service.Install(context.Background(), InstallOptions{
		SourceSpec: "pypi:setta-fixture-backend==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install backend plugin: %v", err)
	}
	if !installResult.RestartRequired || installResult.State != PluginRuntimeStatePendingRestart {
		t.Fatalf("expected backend install to require restart, got %#v", installResult)
	}

	committedSnapshot, err := service.CommitBackendRuntimeRefresh()
	if err != nil {
		t.Fatalf("commit backend runtime refresh: %v", err)
	}
	activeEntry := mustFindDiscoveredPlugin(t, committedSnapshot.Plugins, "setta-fixture-backend", PluginScopeWorkspace)
	if activeEntry.State != PluginRuntimeStateActive || activeEntry.RestartRequired {
		t.Fatalf("expected backend plugin to become active after commit, got %#v", activeEntry)
	}

	enabledResult, err := service.Enable(context.Background(), EnableDisableOptions{
		PluginID: "setta-fixture-backend",
	})
	if err != nil {
		t.Fatalf("enable already-active backend plugin: %v", err)
	}
	if enabledResult.State != PluginRuntimeStateActive || enabledResult.RestartRequired {
		t.Fatalf("expected active backend enable to stay a no-op, got %#v", enabledResult)
	}

	state, err := service.store.LoadPluginsState()
	if err != nil {
		t.Fatalf("load plugins state after backend enable noop: %v", err)
	}
	if len(state.PendingRestartBackendPluginIDs) != 0 {
		t.Fatalf("expected no pending restart ids after backend enable noop, got %#v", state.PendingRestartBackendPluginIDs)
	}
}

// Re-disabling an already-disabled backend plugin should stay a no-op once the prior restart-gated disable is committed.
func TestServiceBackendDisableNoopWhenAlreadyDisabled(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, newFixtureCandidateProvider(t, map[string]fixtureCandidateSpec{
		"pypi:setta-fixture-backend==0.1.0": {
			FixtureName: "backend",
			Version:     "0.1.0",
		},
	}), config.ModeIDE)

	installResult, err := service.Install(context.Background(), InstallOptions{
		SourceSpec: "pypi:setta-fixture-backend==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install backend plugin: %v", err)
	}
	if !installResult.RestartRequired || installResult.State != PluginRuntimeStatePendingRestart {
		t.Fatalf("expected backend install to require restart, got %#v", installResult)
	}

	disableResult, err := service.Disable(context.Background(), EnableDisableOptions{
		PluginID: "setta-fixture-backend",
	})
	if err != nil {
		t.Fatalf("disable backend plugin: %v", err)
	}
	if disableResult.State != PluginRuntimeStatePendingRestart || !disableResult.RestartRequired {
		t.Fatalf("expected first backend disable to remain pending restart, got %#v", disableResult)
	}

	committedSnapshot, err := service.CommitBackendRuntimeRefresh()
	if err != nil {
		t.Fatalf("commit backend runtime refresh after disable: %v", err)
	}
	disabledEntry := mustFindDiscoveredPlugin(t, committedSnapshot.Plugins, "setta-fixture-backend", PluginScopeWorkspace)
	if disabledEntry.State != PluginRuntimeStateDisabled || disabledEntry.RestartRequired {
		t.Fatalf("expected backend plugin to become disabled after commit, got %#v", disabledEntry)
	}

	disabledResult, err := service.Disable(context.Background(), EnableDisableOptions{
		PluginID: "setta-fixture-backend",
	})
	if err != nil {
		t.Fatalf("disable already-disabled backend plugin: %v", err)
	}
	if disabledResult.State != PluginRuntimeStateDisabled || disabledResult.RestartRequired {
		t.Fatalf("expected disabled backend to remain a no-op, got %#v", disabledResult)
	}

	state, err := service.store.LoadPluginsState()
	if err != nil {
		t.Fatalf("load plugins state after backend disable noop: %v", err)
	}
	if len(state.PendingRestartBackendPluginIDs) != 0 {
		t.Fatalf("expected no pending restart ids after backend disable noop, got %#v", state.PendingRestartBackendPluginIDs)
	}
}

// Backend uninstall should remain visible as pending_restart until the runtime clears the tombstone.
func TestServiceBackendUninstallSurfacesPendingRestartTombstone(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, newFixtureCandidateProvider(t, map[string]fixtureCandidateSpec{
		"pypi:setta-fixture-backend==0.1.0": {
			FixtureName: "backend",
			Version:     "0.1.0",
		},
	}), config.ModeIDE)

	installResult, err := service.Install(context.Background(), InstallOptions{
		SourceSpec: "pypi:setta-fixture-backend==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install backend plugin: %v", err)
	}
	if !installResult.RestartRequired || installResult.State != PluginRuntimeStatePendingRestart {
		t.Fatalf("expected backend install to require restart, got %#v", installResult)
	}

	uninstallResult, err := service.Uninstall(context.Background(), UninstallOptions{
		PluginID: "setta-fixture-backend",
	})
	if err != nil {
		t.Fatalf("uninstall backend plugin: %v", err)
	}
	if !uninstallResult.RestartRequired {
		t.Fatalf("expected backend uninstall to require restart")
	}

	snapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("rescan after backend uninstall: %v", err)
	}
	entry := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-fixture-backend", PluginScopeWorkspace)
	if entry.State != PluginRuntimeStatePendingRestart || !entry.RestartRequired {
		t.Fatalf("expected backend uninstall tombstone to stay pending_restart, got %#v", entry)
	}
}

// Pending restart ids should survive a fresh service instance, then clear once the runtime refresh is committed.
func TestServicePendingRestartPersistsAcrossReloadAndClearsOnCommit(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	initialService := mustNewPluginMutationService(t, roots, newFixtureCandidateProvider(t, map[string]fixtureCandidateSpec{
		"pypi:setta-fixture-backend==0.1.0": {
			FixtureName: "backend",
			Version:     "0.1.0",
		},
	}), config.ModeIDE)

	installResult, err := initialService.Install(context.Background(), InstallOptions{
		SourceSpec: "pypi:setta-fixture-backend==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install backend plugin: %v", err)
	}
	if !installResult.RestartRequired || installResult.State != PluginRuntimeStatePendingRestart {
		t.Fatalf("expected backend install to require restart, got %#v", installResult)
	}

	reloadedService := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	reloadedSnapshot, err := reloadedService.Rescan()
	if err != nil {
		t.Fatalf("rescan with reloaded service: %v", err)
	}
	pendingEntry := mustFindDiscoveredPlugin(t, reloadedSnapshot.Plugins, "setta-fixture-backend", PluginScopeWorkspace)
	if pendingEntry.State != PluginRuntimeStatePendingRestart || !pendingEntry.RestartRequired {
		t.Fatalf("expected reloaded service to preserve pending restart state, got %#v", pendingEntry)
	}

	committedSnapshot, err := reloadedService.CommitBackendRuntimeRefresh()
	if err != nil {
		t.Fatalf("commit backend runtime refresh after reload: %v", err)
	}
	activeEntry := mustFindDiscoveredPlugin(t, committedSnapshot.Plugins, "setta-fixture-backend", PluginScopeWorkspace)
	if activeEntry.State != PluginRuntimeStateActive || activeEntry.RestartRequired {
		t.Fatalf("expected backend plugin to become active after reload commit, got %#v", activeEntry)
	}

	state, err := reloadedService.store.LoadPluginsState()
	if err != nil {
		t.Fatalf("load plugins state after reload commit: %v", err)
	}
	if len(state.PendingRestartBackendPluginIDs) != 0 {
		t.Fatalf("expected pending restart ids to clear after reload commit, got %#v", state.PendingRestartBackendPluginIDs)
	}
}

// Missing enable/disable operations should fail before plugins_state persistence is created.
func TestServiceMissingEnableDisableDoesNotWritePluginsState(t *testing.T) {
	for _, testCase := range []struct {
		name string
		run  func(*Service) error
	}{
		{
			name: "enable",
			run: func(service *Service) error {
				_, err := service.Enable(context.Background(), EnableDisableOptions{PluginID: "missing-plugin"})
				return err
			},
		},
		{
			name: "disable",
			run: func(service *Service) error {
				_, err := service.Disable(context.Background(), EnableDisableOptions{PluginID: "missing-plugin"})
				return err
			},
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			roots := newFilesystemResolverTestRoots(t)
			service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
			pluginsStatePath := service.store.PluginsStatePath()

			if _, err := os.Stat(pluginsStatePath); !os.IsNotExist(err) {
				t.Fatalf("expected plugins state to start absent, got err=%v", err)
			}

			err := testCase.run(service)
			var serviceErr *ServiceError
			if !errors.As(err, &serviceErr) {
				t.Fatalf("expected service error, got %v", err)
			}
			if serviceErr.Code != ServiceErrorCodeNotFound {
				t.Fatalf("expected not found error code, got %q", serviceErr.Code)
			}

			if _, err := os.Stat(pluginsStatePath); !os.IsNotExist(err) {
				t.Fatalf("expected plugins state to remain absent, got err=%v", err)
			}
		})
	}
}

// Enable and disable mutations should share the same service lock so state updates cannot interleave.
func TestServiceEnableDisableMutationsAreSerialized(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, newFixtureCandidateProvider(t, map[string]fixtureCandidateSpec{
		"pypi:setta-fixture-frontend==0.1.0": {
			FixtureName: "frontend",
			Version:     "0.1.0",
		},
	}), config.ModeIDE)

	if _, err := service.Install(context.Background(), InstallOptions{
		SourceSpec: "pypi:setta-fixture-frontend==0.1.0",
		Enable:     true,
	}); err != nil {
		t.Fatalf("install plugin: %v", err)
	}

	assertServiceCallWaitsForLock(t, service, func() error {
		_, err := service.Disable(context.Background(), EnableDisableOptions{PluginID: "setta-fixture-frontend"})
		return err
	})
	disabledStatus, err := service.Status()
	if err != nil {
		t.Fatalf("status after disable: %v", err)
	}
	disabledEntry := mustFindStatusEntry(t, disabledStatus.Plugins, "setta-fixture-frontend", PluginRuntimeStateDisabled)
	if disabledEntry.EnablementSource == nil || *disabledEntry.EnablementSource != PluginEnablementSourceWorkspaceDisabled {
		t.Fatalf("expected workspace-disabled enablement source after disable, got %#v", disabledEntry.EnablementSource)
	}

	assertServiceCallWaitsForLock(t, service, func() error {
		_, err := service.Enable(context.Background(), EnableDisableOptions{PluginID: "setta-fixture-frontend"})
		return err
	})
	enabledStatus, err := service.Status()
	if err != nil {
		t.Fatalf("status after enable: %v", err)
	}
	enabledEntry := mustFindStatusEntry(t, enabledStatus.Plugins, "setta-fixture-frontend", PluginRuntimeStateActive)
	if enabledEntry.EnablementSource == nil || *enabledEntry.EnablementSource != PluginEnablementSourceWorkspaceEnabled {
		t.Fatalf("expected workspace-enabled enablement source after enable, got %#v", enabledEntry.EnablementSource)
	}
}

// Disable should surface malformed persisted plugins_state.json payloads as typed service errors.
func TestServiceDisableRejectsInvalidPluginsStateFile(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "frontend")
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	if err := os.WriteFile(service.store.PluginsStatePath(), []byte("{invalid-json"), 0o644); err != nil {
		t.Fatalf("seed invalid plugins state: %v", err)
	}

	_, err := service.Disable(context.Background(), EnableDisableOptions{PluginID: "setta-fixture-frontend"})
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeStateInvalid)
}

// Install should resolve external candidates before taking the shared service lock so status reads stay responsive.
func TestServiceInstallCandidateResolutionKeepsStatusUnlocked(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	provider := &blockingCandidateProvider{
		started: make(chan struct{}, 1),
		release: make(chan struct{}),
		inner: newFixtureCandidateProvider(t, map[string]fixtureCandidateSpec{
			"pypi:setta-fixture-frontend==0.1.0": {
				FixtureName: "frontend",
				Version:     "0.1.0",
			},
		}),
	}
	service := mustNewPluginMutationService(t, roots, provider, config.ModeIDE)

	installResult := make(chan error, 1)
	go func() {
		_, err := service.Install(context.Background(), InstallOptions{
			SourceSpec: "pypi:setta-fixture-frontend==0.1.0",
			Enable:     true,
		})
		installResult <- err
	}()

	select {
	case <-provider.started:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for candidate resolution to start")
	}

	statusResult := make(chan error, 1)
	go func() {
		_, err := service.Status()
		statusResult <- err
	}()

	select {
	case err := <-statusResult:
		if err != nil {
			t.Fatalf("status during candidate resolution: %v", err)
		}
	case <-time.After(200 * time.Millisecond):
		t.Fatal("status blocked while install candidate resolution was in progress")
	}

	close(provider.release)
	select {
	case err := <-installResult:
		if err != nil {
			t.Fatalf("install plugin after candidate resolution: %v", err)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for install to finish")
	}
}

// Committing a live backend runtime refresh should clear persisted pending
// restart markers once the app has already rebuilt the runtime.
func TestServiceCommitBackendRuntimeRefreshClearsPendingState(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, newFixtureCandidateProvider(t, map[string]fixtureCandidateSpec{
		"pypi:setta-fixture-backend==0.1.0": {
			FixtureName: "backend",
			Version:     "0.1.0",
		},
	}), config.ModeIDE)

	installResult, err := service.Install(context.Background(), InstallOptions{
		SourceSpec: "pypi:setta-fixture-backend==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install backend plugin: %v", err)
	}
	if !installResult.RestartRequired || installResult.State != PluginRuntimeStatePendingRestart {
		t.Fatalf("expected backend install to require restart before commit, got %#v", installResult)
	}

	committedSnapshot, err := service.CommitBackendRuntimeRefresh()
	if err != nil {
		t.Fatalf("commit backend runtime refresh after install: %v", err)
	}
	installedEntry := mustFindDiscoveredPlugin(t, committedSnapshot.Plugins, "setta-fixture-backend", PluginScopeWorkspace)
	if installedEntry.State != PluginRuntimeStateActive || installedEntry.RestartRequired {
		t.Fatalf("expected backend plugin to become active after commit, got %#v", installedEntry)
	}

	uninstallResult, err := service.Uninstall(context.Background(), UninstallOptions{
		PluginID: "setta-fixture-backend",
	})
	if err != nil {
		t.Fatalf("uninstall backend plugin: %v", err)
	}
	if !uninstallResult.RestartRequired {
		t.Fatalf("expected backend uninstall to require restart before commit")
	}

	committedSnapshot, err = service.CommitBackendRuntimeRefresh()
	if err != nil {
		t.Fatalf("commit backend runtime refresh after uninstall: %v", err)
	}
	if len(committedSnapshot.Plugins) != 0 {
		t.Fatalf("expected backend uninstall tombstone to clear after commit, got %#v", committedSnapshot.Plugins)
	}
}

func TestServiceCommitBackendRuntimeRefreshKeepsPendingStateWhenSaveFails(t *testing.T) {
	if runtime.GOOS == "windows" {
		t.Skip("directory permissions do not reliably block AtomicWriteFile temp creation on windows")
	}

	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, newFixtureCandidateProvider(t, map[string]fixtureCandidateSpec{
		"pypi:setta-fixture-backend==0.1.0": {
			FixtureName: "backend",
			Version:     "0.1.0",
		},
	}), config.ModeIDE)

	installResult, err := service.Install(context.Background(), InstallOptions{
		SourceSpec: "pypi:setta-fixture-backend==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install backend plugin: %v", err)
	}
	if !installResult.RestartRequired || installResult.State != PluginRuntimeStatePendingRestart {
		t.Fatalf("expected backend install to require restart before commit, got %#v", installResult)
	}

	if err := os.Chmod(roots.settaFilesRoot, 0o555); err != nil {
		t.Fatalf("chmod setta_files root read-only: %v", err)
	}
	t.Cleanup(func() {
		if err := os.Chmod(roots.settaFilesRoot, 0o755); err != nil {
			t.Fatalf("restore setta_files root permissions: %v", err)
		}
	})

	if _, err := service.CommitBackendRuntimeRefresh(); err == nil {
		t.Fatal("expected commit backend runtime refresh to fail when plugins state cannot be saved")
	}

	if err := os.Chmod(roots.settaFilesRoot, 0o755); err != nil {
		t.Fatalf("restore setta_files root permissions before verification: %v", err)
	}

	liveSnapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("rescan after failed commit: %v", err)
	}
	liveEntry := mustFindDiscoveredPlugin(t, liveSnapshot.Plugins, "setta-fixture-backend", PluginScopeWorkspace)
	if liveEntry.State != PluginRuntimeStatePendingRestart || !liveEntry.RestartRequired {
		t.Fatalf("expected persisted state to remain pending_restart after failed commit, got %#v", liveEntry)
	}

	previewSnapshot, err := service.PreviewBackendRuntimeRefresh()
	if err != nil {
		t.Fatalf("preview after failed commit: %v", err)
	}
	previewEntry := mustFindDiscoveredPlugin(t, previewSnapshot.Plugins, "setta-fixture-backend", PluginScopeWorkspace)
	if previewEntry.State != PluginRuntimeStateActive || previewEntry.RestartRequired {
		t.Fatalf("expected preview snapshot to stay active after failed commit, got %#v", previewEntry)
	}
}

// Previewing a live backend runtime refresh should expose the post-refresh
// runtime view without clearing persisted pending restart markers until commit.
func TestServicePreviewBackendRuntimeRefreshOmitsPendingRestartState(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, newFixtureCandidateProvider(t, map[string]fixtureCandidateSpec{
		"pypi:setta-fixture-backend==0.1.0": {
			FixtureName: "backend",
			Version:     "0.1.0",
		},
	}), config.ModeIDE)

	installResult, err := service.Install(context.Background(), InstallOptions{
		SourceSpec: "pypi:setta-fixture-backend==0.1.0",
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install backend plugin: %v", err)
	}
	if !installResult.RestartRequired || installResult.State != PluginRuntimeStatePendingRestart {
		t.Fatalf("expected backend install to require restart before preview, got %#v", installResult)
	}

	previewSnapshot, err := service.PreviewBackendRuntimeRefresh()
	if err != nil {
		t.Fatalf("preview backend runtime refresh after install: %v", err)
	}
	previewEntry := mustFindDiscoveredPlugin(t, previewSnapshot.Plugins, "setta-fixture-backend", PluginScopeWorkspace)
	if previewEntry.State != PluginRuntimeStateActive || previewEntry.RestartRequired {
		t.Fatalf("expected preview snapshot to show active backend plugin, got %#v", previewEntry)
	}

	liveSnapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("rescan after preview install: %v", err)
	}
	liveEntry := mustFindDiscoveredPlugin(t, liveSnapshot.Plugins, "setta-fixture-backend", PluginScopeWorkspace)
	if liveEntry.State != PluginRuntimeStatePendingRestart || !liveEntry.RestartRequired {
		t.Fatalf("expected persisted state to stay pending_restart before commit, got %#v", liveEntry)
	}

	uninstallResult, err := service.Uninstall(context.Background(), UninstallOptions{
		PluginID: "setta-fixture-backend",
	})
	if err != nil {
		t.Fatalf("uninstall backend plugin: %v", err)
	}
	if !uninstallResult.RestartRequired {
		t.Fatalf("expected backend uninstall to require restart before preview")
	}

	previewSnapshot, err = service.PreviewBackendRuntimeRefresh()
	if err != nil {
		t.Fatalf("preview backend runtime refresh after uninstall: %v", err)
	}
	if len(previewSnapshot.Plugins) != 0 {
		t.Fatalf("expected preview snapshot to omit uninstall tombstone, got %#v", previewSnapshot.Plugins)
	}

	liveSnapshot, err = service.Rescan()
	if err != nil {
		t.Fatalf("rescan after preview uninstall: %v", err)
	}
	liveEntry = mustFindDiscoveredPlugin(t, liveSnapshot.Plugins, "setta-fixture-backend", PluginScopeWorkspace)
	if liveEntry.State != PluginRuntimeStatePendingRestart || !liveEntry.RestartRequired {
		t.Fatalf("expected uninstall tombstone to stay pending_restart before commit, got %#v", liveEntry)
	}
}

func TestServiceRescanLeavesLegacyPluginConfigKeysUnmigrated(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	sitePackages, _ := installPackageManagerFixture(
		t,
		"full",
		"setta-fixture-full",
		"0.1.0",
		func(pluginRoot string) {
			rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
				frontend := payload["frontend"].(map[string]any)
				frontend["entrypoint"] = "frontend/src/index.js"
				frontend["style"] = "frontend/src/index.css"
			})
		},
	)
	localRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeSettaFiles, "full")
	rewritePluginManifest(t, localRoot, func(payload map[string]any) {
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/index.js"
		frontend["style"] = "frontend/src/index.css"
	})

	legacyKey := string(PluginScopeSettaFiles) + ":setta-fixture-full"
	writeJSONFile(t, filepath.Join(roots.settaFilesRoot, "plugins_state.json"), map[string]any{
		"pluginConfigById": map[string]any{
			legacyKey: map[string]any{
				"label": "legacy-config",
			},
		},
	})

	service := mustNewPluginMutationServiceWithPackageManager(t, roots, nil, config.ModeIDE, []string{sitePackages})
	snapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("rescan plugins: %v", err)
	}
	activeEntry := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-fixture-full", PluginScopeSettaFiles)
	if activeEntry.SourceManager != PluginSourceManagerSetta {
		t.Fatalf("expected setta-managed entry to remain the active same-scope plugin, got %#v", activeEntry.SourceManager)
	}

	state, err := service.store.LoadPluginsState()
	if err != nil {
		t.Fatalf("load plugins state: %v", err)
	}
	if _, ok := state.PluginConfigByID[legacyKey]; !ok {
		t.Fatalf("expected legacy config key to remain untouched, got %#v", state.PluginConfigByID)
	}
	if _, ok := state.PluginConfigByID[pluginConfigKey("setta-fixture-full", PluginScopeSettaFiles, PluginSourceManagerSetta)]; ok {
		t.Fatalf("expected setta canonical config key to stay absent, got %#v", state.PluginConfigByID)
	}
	if _, ok := state.PluginConfigByID[pluginConfigKey("setta-fixture-full", PluginScopeSettaFiles, PluginSourceManagerPackageManager)]; ok {
		t.Fatalf("expected package-manager canonical config key to stay absent, got %#v", state.PluginConfigByID)
	}
}

// Update should reject linked local plugin metadata instead of pretending package-manager updates are available.
func TestServiceUpdateRejectsLocalSourceMetadata(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "frontend")

	store, err := NewStore(StoreOptions{
		WorkspaceRoot:  roots.workspaceRoot,
		SettaFilesRoot: roots.settaFilesRoot,
		SettaHome:      roots.settaHome,
	})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	if err := store.SetInstallMetadata(PluginInstallMetadataEntry{
		PluginID:           "setta-fixture-frontend",
		Scope:              PluginScopeWorkspace,
		SourceSpec:         "local:" + pluginRoot,
		CanonicalSourceKey: "local:" + pluginRoot,
		Version:            "0.1.0",
		History:            []PluginInstallHistoryEntry{},
	}); err != nil {
		t.Fatalf("seed local install metadata: %v", err)
	}

	service := mustNewPluginMutationServiceWithStore(t, roots, store, nil, config.ModeIDE)
	_, err = service.Update(context.Background(), UpdateOptions{
		PluginID: "setta-fixture-frontend",
	})
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) {
		t.Fatalf("expected service error, got %v", err)
	}
	if serviceErr.Code != ServiceErrorCodeUpdateUnavailable {
		t.Fatalf("expected update unavailable code, got %q", serviceErr.Code)
	}
}

// Rollback should fail loudly when no rollback history exists for the plugin.
func TestServiceRollbackRequiresHistory(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "frontend")

	store, err := NewStore(StoreOptions{
		WorkspaceRoot:  roots.workspaceRoot,
		SettaFilesRoot: roots.settaFilesRoot,
		SettaHome:      roots.settaHome,
	})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	if err := store.SetInstallMetadata(PluginInstallMetadataEntry{
		PluginID:           "setta-fixture-frontend",
		Scope:              PluginScopeWorkspace,
		SourceSpec:         "pypi:setta-fixture-frontend==0.1.0",
		CanonicalSourceKey: "pypi:setta-fixture-frontend",
		Version:            "0.1.0",
		History:            []PluginInstallHistoryEntry{},
	}); err != nil {
		t.Fatalf("seed install metadata: %v", err)
	}

	service := mustNewPluginMutationServiceWithStore(t, roots, store, nil, config.ModeIDE)
	_, err = service.Rollback(context.Background(), RollbackOptions{
		PluginID: "setta-fixture-frontend",
	})
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) {
		t.Fatalf("expected service error, got %v", err)
	}
	if serviceErr.Code != ServiceErrorCodeRollbackUnavailable {
		t.Fatalf("expected rollback unavailable code, got %q", serviceErr.Code)
	}
}

// Force reinstall should snapshot the previous managed plugin tree and allow rollback to that snapshot.
func TestServiceForceInstallCreatesHistorySnapshotAndSupportsRollback(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, newFixtureCandidateProvider(t, map[string]fixtureCandidateSpec{
		"pypi:setta-fixture-frontend==0.1.0": {
			FixtureName: "frontend",
			Version:     "0.1.0",
		},
	}), config.ModeIDE)

	firstInstall, err := service.Install(context.Background(), InstallOptions{
		SourceSpec: "pypi:setta-fixture-frontend==0.1.0",
		Scope:      scopePointer(PluginScopeWorkspace),
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install plugin: %v", err)
	}
	if firstInstall.PluginID != "setta-fixture-frontend" || firstInstall.Version != "0.1.0" || firstInstall.RestartRequired {
		t.Fatalf("unexpected initial install result: %#v", firstInstall)
	}

	forcedInstall, err := service.Install(context.Background(), InstallOptions{
		SourceSpec: "pypi:setta-fixture-frontend==0.1.0",
		Scope:      scopePointer(PluginScopeWorkspace),
		Enable:     true,
		Force:      true,
	})
	if err != nil {
		t.Fatalf("force install plugin: %v", err)
	}
	if forcedInstall.PluginID != "setta-fixture-frontend" || forcedInstall.Version != "0.1.0" || forcedInstall.RestartRequired {
		t.Fatalf("unexpected forced install result: %#v", forcedInstall)
	}

	metadata, ok, err := service.store.GetInstallMetadata("setta-fixture-frontend", PluginScopeWorkspace)
	if err != nil {
		t.Fatalf("get install metadata after force install: %v", err)
	}
	if !ok {
		t.Fatal("expected install metadata after force install")
	}
	if metadata.Version != "0.1.0" || len(metadata.History) != 1 {
		t.Fatalf("expected one rollback snapshot after force install, got %#v", metadata)
	}
	historyEntry := metadata.History[0]
	if historyEntry.Version != "0.1.0" {
		t.Fatalf("expected rollback snapshot version 0.1.0, got %#v", historyEntry)
	}
	if historyEntry.SourceDigestSHA256 == nil || strings.TrimSpace(*historyEntry.SourceDigestSHA256) == "" {
		t.Fatalf("expected rollback snapshot digest, got %#v", historyEntry.SourceDigestSHA256)
	}
	snapshotManifestPayload, err := os.ReadFile(filepath.Join(historyEntry.SnapshotPath, pluginManifestFileName))
	if err != nil {
		t.Fatalf("read rollback snapshot manifest: %v", err)
	}
	var snapshotManifest map[string]any
	if err := json.Unmarshal(snapshotManifestPayload, &snapshotManifest); err != nil {
		t.Fatalf("decode rollback snapshot manifest: %v", err)
	}
	if got := snapshotManifest["version"]; got != "0.1.0" {
		t.Fatalf("expected rollback snapshot manifest version 0.1.0, got %#v", got)
	}

	rollbackResult, err := service.Rollback(context.Background(), RollbackOptions{
		PluginID: "setta-fixture-frontend",
	})
	if err != nil {
		t.Fatalf("rollback plugin after force install: %v", err)
	}
	if rollbackResult.RestoredVersion != "0.1.0" || rollbackResult.RestartRequired {
		t.Fatalf("unexpected rollback result after force install: %#v", rollbackResult)
	}

	metadata, ok, err = service.store.GetInstallMetadata("setta-fixture-frontend", PluginScopeWorkspace)
	if err != nil {
		t.Fatalf("get install metadata after rollback: %v", err)
	}
	if !ok {
		t.Fatal("expected install metadata after rollback")
	}
	if metadata.Version != "0.1.0" || len(metadata.History) != 0 {
		t.Fatalf("expected rollback history to be consumed, got %#v", metadata)
	}

	snapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("rescan after rollback: %v", err)
	}
	entry := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-fixture-frontend", PluginScopeWorkspace)
	if entry.Version != "0.1.0" || entry.State != PluginRuntimeStateActive || entry.RestartRequired {
		t.Fatalf("expected active frontend plugin after rollback, got %#v", entry)
	}
}

// Linked local plugins should reject rollback with actionable guidance even before any history exists.
func TestServiceRollbackRejectsLinkedLocalPluginWithoutHistory(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "frontend")

	store, err := NewStore(StoreOptions{
		WorkspaceRoot:  roots.workspaceRoot,
		SettaFilesRoot: roots.settaFilesRoot,
		SettaHome:      roots.settaHome,
	})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	if err := store.SetInstallMetadata(PluginInstallMetadataEntry{
		PluginID:           "setta-fixture-frontend",
		Scope:              PluginScopeWorkspace,
		SourceSpec:         "local:" + pluginRoot,
		CanonicalSourceKey: "local:" + pluginRoot,
		Version:            "0.1.0",
		History:            []PluginInstallHistoryEntry{},
	}); err != nil {
		t.Fatalf("seed local install metadata: %v", err)
	}

	service := mustNewPluginMutationServiceWithStore(t, roots, store, nil, config.ModeIDE)
	_, err = service.Rollback(context.Background(), RollbackOptions{
		PluginID: "setta-fixture-frontend",
	})
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) {
		t.Fatalf("expected service error, got %v", err)
	}
	if serviceErr.Code != ServiceErrorCodeRollbackUnavailable {
		t.Fatalf("expected rollback unavailable code, got %q", serviceErr.Code)
	}
	if !strings.Contains(serviceErr.Message, "linked local plugins") {
		t.Fatalf("expected linked local rollback guidance, got %q", serviceErr.Message)
	}
}

// Rollback should fail closed when managed metadata points to a snapshot path that no longer exists.
func TestServiceRollbackRejectsMissingSnapshotPath(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "frontend")

	store, err := NewStore(StoreOptions{
		WorkspaceRoot:  roots.workspaceRoot,
		SettaFilesRoot: roots.settaFilesRoot,
		SettaHome:      roots.settaHome,
	})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	if err := store.SetInstallMetadata(PluginInstallMetadataEntry{
		PluginID:           "setta-fixture-frontend",
		Scope:              PluginScopeWorkspace,
		SourceSpec:         "pypi:setta-fixture-frontend==0.1.0",
		CanonicalSourceKey: "pypi:setta-fixture-frontend",
		Version:            "0.1.0",
		History: []PluginInstallHistoryEntry{
			{
				Version:      "0.0.9",
				SnapshotPath: filepath.Join(roots.settaFilesRoot, "missing-rollback-snapshot"),
				TimestampISO: "2026-01-01T00:00:00Z",
			},
		},
	}); err != nil {
		t.Fatalf("seed install metadata: %v", err)
	}

	service := mustNewPluginMutationServiceWithStore(t, roots, store, nil, config.ModeIDE)
	_, err = service.Rollback(context.Background(), RollbackOptions{
		PluginID: "setta-fixture-frontend",
	})
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) {
		t.Fatalf("expected service error, got %v", err)
	}
	if serviceErr.Code != ServiceErrorCodeRollbackUnavailable {
		t.Fatalf("expected rollback unavailable code, got %q", serviceErr.Code)
	}
	if !strings.Contains(serviceErr.Message, "Rollback snapshot missing") {
		t.Fatalf("expected missing snapshot guidance, got %q", serviceErr.Message)
	}
}

// Restoring a backend plugin snapshot should keep restart-gated runtime state explicit until refresh commits.
func TestServiceRollbackRestoringBackendPluginRequiresRestart(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")

	store, err := NewStore(StoreOptions{
		WorkspaceRoot:  roots.workspaceRoot,
		SettaFilesRoot: roots.settaFilesRoot,
		SettaHome:      roots.settaHome,
	})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	historyEntry, err := store.CreateHistorySnapshot("setta-fixture-backend", PluginScopeWorkspace)
	if err != nil {
		t.Fatalf("create backend rollback snapshot: %v", err)
	}
	rewritePluginManifest(t, historyEntry.SnapshotPath, func(payload map[string]any) {
		payload["version"] = "0.0.9"
	})
	historyEntry.Version = "0.0.9"

	if err := store.SetInstallMetadata(PluginInstallMetadataEntry{
		PluginID:           "setta-fixture-backend",
		Scope:              PluginScopeWorkspace,
		SourceSpec:         "pypi:setta-fixture-backend==0.1.0",
		CanonicalSourceKey: "pypi:setta-fixture-backend",
		Version:            "0.1.0",
		History:            []PluginInstallHistoryEntry{historyEntry},
	}); err != nil {
		t.Fatalf("seed backend install metadata: %v", err)
	}

	service := mustNewPluginMutationServiceWithStore(t, roots, store, nil, config.ModeIDE)
	rollbackResult, err := service.Rollback(context.Background(), RollbackOptions{
		PluginID: "setta-fixture-backend",
	})
	if err != nil {
		t.Fatalf("rollback backend plugin: %v", err)
	}
	if rollbackResult.RestoredVersion != "0.0.9" || !rollbackResult.RestartRequired {
		t.Fatalf("expected backend rollback to require restart, got %#v", rollbackResult)
	}

	snapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("rescan after backend rollback: %v", err)
	}
	entry := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-fixture-backend", PluginScopeWorkspace)
	if entry.Version != "0.0.9" || entry.State != PluginRuntimeStatePendingRestart || !entry.RestartRequired {
		t.Fatalf("expected backend rollback to leave pending restart entry, got %#v", entry)
	}
}

// Enable/disable should follow the highest-precedence discovered entry and keep backend restart requirements explicit.
func TestServiceEnableDisableLifecycleControls(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	frontendRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "frontend")
	rewritePluginManifest(t, frontendRoot, func(payload map[string]any) {
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/index.js"
		frontend["style"] = "frontend/src/index.css"
	})
	copyPluginFixtureToScope(t, roots, filesystemPluginScopeSettaFiles, "backend")

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	disabledFrontend, err := service.Disable(context.Background(), EnableDisableOptions{
		PluginID: "setta-fixture-frontend",
	})
	if err != nil {
		t.Fatalf("disable frontend plugin: %v", err)
	}
	if disabledFrontend.State != PluginRuntimeStateDisabled || disabledFrontend.RestartRequired {
		t.Fatalf("unexpected frontend disable result %#v", disabledFrontend)
	}

	enabledFrontend, err := service.Enable(context.Background(), EnableDisableOptions{
		PluginID: "setta-fixture-frontend",
	})
	if err != nil {
		t.Fatalf("enable frontend plugin: %v", err)
	}
	if enabledFrontend.State != PluginRuntimeStateActive || enabledFrontend.RestartRequired {
		t.Fatalf("unexpected frontend enable result %#v", enabledFrontend)
	}

	disabledBackend, err := service.Disable(context.Background(), EnableDisableOptions{
		PluginID: "setta-fixture-backend",
	})
	if err != nil {
		t.Fatalf("disable backend plugin: %v", err)
	}
	if disabledBackend.State != PluginRuntimeStatePendingRestart || !disabledBackend.RestartRequired {
		t.Fatalf("expected backend disable to require restart, got %#v", disabledBackend)
	}

	enabledMissing, err := service.Enable(context.Background(), EnableDisableOptions{
		PluginID: "missing-plugin",
	})
	if err == nil {
		t.Fatalf("expected missing enable to fail, got %#v", enabledMissing)
	}
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) {
		t.Fatalf("expected service error, got %v", err)
	}
	if serviceErr.Code != ServiceErrorCodeNotFound {
		t.Fatalf("expected not found code, got %q", serviceErr.Code)
	}
}

func TestServiceEnableDisableTracksEnablementSource(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "frontend")

	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	snapshot, err := service.Rescan()
	if err != nil {
		t.Fatalf("initial rescan: %v", err)
	}
	initial := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-fixture-frontend", PluginScopeWorkspace)
	if initial.State != PluginRuntimeStateActive {
		t.Fatalf("expected initial frontend plugin to be active, got %#v", initial)
	}
	if initial.EnablementSource == nil || *initial.EnablementSource != PluginEnablementSourceManifestDefault {
		t.Fatalf("expected manifest-default enablement source, got %#v", initial.EnablementSource)
	}

	if _, err := service.Disable(context.Background(), EnableDisableOptions{
		PluginID: "setta-fixture-frontend",
	}); err != nil {
		t.Fatalf("disable frontend plugin: %v", err)
	}

	snapshot, err = service.Rescan()
	if err != nil {
		t.Fatalf("rescan after disable: %v", err)
	}
	disabled := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-fixture-frontend", PluginScopeWorkspace)
	if disabled.State != PluginRuntimeStateDisabled {
		t.Fatalf("expected disabled frontend plugin, got %#v", disabled)
	}
	if disabled.EnablementSource == nil || *disabled.EnablementSource != PluginEnablementSourceWorkspaceDisabled {
		t.Fatalf("expected workspace-disabled enablement source, got %#v", disabled.EnablementSource)
	}

	if _, err := service.Enable(context.Background(), EnableDisableOptions{
		PluginID: "setta-fixture-frontend",
	}); err != nil {
		t.Fatalf("enable frontend plugin: %v", err)
	}

	snapshot, err = service.Rescan()
	if err != nil {
		t.Fatalf("rescan after enable: %v", err)
	}
	enabled := mustFindDiscoveredPlugin(t, snapshot.Plugins, "setta-fixture-frontend", PluginScopeWorkspace)
	if enabled.State != PluginRuntimeStateActive {
		t.Fatalf("expected re-enabled frontend plugin to be active, got %#v", enabled)
	}
	if enabled.EnablementSource == nil || *enabled.EnablementSource != PluginEnablementSourceWorkspaceEnabled {
		t.Fatalf("expected workspace-enabled enablement source, got %#v", enabled.EnablementSource)
	}
}

// Environment-managed plugins should allow runtime enable/disable while still rejecting uninstall and ambiguous scope writes.
func TestServicePackageManagerLifecycleControls(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	sitePackages, _ := installPackageManagerFixture(
		t,
		"frontend",
		"setta-fixture-frontend",
		"0.1.0",
		func(pluginRoot string) {
			rewritePluginManifest(t, pluginRoot, func(payload map[string]any) {
				frontend := payload["frontend"].(map[string]any)
				frontend["entrypoint"] = "frontend/src/index.js"
				frontend["style"] = "frontend/src/index.css"
			})
		},
	)
	service := mustNewPluginMutationServiceWithPackageManager(t, roots, nil, config.ModeIDE, []string{sitePackages})

	disabled, err := service.Disable(context.Background(), EnableDisableOptions{
		PluginID: "setta-fixture-frontend",
	})
	if err != nil {
		t.Fatalf("disable highest-precedence plugin: %v", err)
	}
	if disabled.State != PluginRuntimeStateDisabled || disabled.RestartRequired {
		t.Fatalf("unexpected package-manager disable result %#v", disabled)
	}

	enabled, err := service.Enable(context.Background(), EnableDisableOptions{
		PluginID: "setta-fixture-frontend",
	})
	if err != nil {
		t.Fatalf("enable highest-precedence plugin: %v", err)
	}
	if enabled.State != PluginRuntimeStateActive || enabled.RestartRequired {
		t.Fatalf("unexpected package-manager enable result %#v", enabled)
	}

	_, err = service.Uninstall(context.Background(), UninstallOptions{
		PluginID: "setta-fixture-frontend",
		Scope:    pluginScopePointer(PluginScopeSettaFiles),
	})
	var serviceErr *ServiceError
	if !errors.As(err, &serviceErr) {
		t.Fatalf("expected service error for package-manager uninstall, got %v", err)
	}
	if serviceErr.Code != ServiceErrorCodeManagedExternally {
		t.Fatalf("expected managed externally code, got %q", serviceErr.Code)
	}

	workspaceRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "frontend")
	rewritePluginManifest(t, workspaceRoot, func(payload map[string]any) {
		frontend := payload["frontend"].(map[string]any)
		frontend["entrypoint"] = "frontend/src/index.js"
		frontend["style"] = "frontend/src/index.css"
	})

	_, err = service.Uninstall(context.Background(), UninstallOptions{
		PluginID: "setta-fixture-frontend",
	})
	if !errors.As(err, &serviceErr) {
		t.Fatalf("expected service error for multi-scope uninstall, got %v", err)
	}
	if serviceErr.Code != ServiceErrorCodeUninstallScopeRequired {
		t.Fatalf("expected uninstall scope required code, got %q", serviceErr.Code)
	}
}

type fixtureCandidateSpec struct {
	FixtureName string
	Version     string
}

type fixtureCandidateProvider struct {
	t        *testing.T
	baseRoot string
	entries  map[string]fixtureCandidateSpec
}

type blockingCandidateProvider struct {
	started chan struct{}
	release chan struct{}
	inner   CandidateProvider
}

func newFixtureCandidateProvider(t *testing.T, entries map[string]fixtureCandidateSpec) *fixtureCandidateProvider {
	t.Helper()

	return &fixtureCandidateProvider{
		t:        t,
		baseRoot: t.TempDir(),
		entries:  entries,
	}
}

func (p *fixtureCandidateProvider) ResolveCandidate(_ context.Context, spec ParsedSourceSpec, _ PluginInstallerBackend) (CandidatePlugin, error) {
	fixtureSpec, ok := p.entries[spec.Raw]
	if !ok {
		return CandidatePlugin{}, fmt.Errorf("candidate fixture not configured: %s", spec.Raw)
	}

	repoRoot := workerRPCTestRepoRoot(p.t)
	sourceRoot := filepath.Join(repoRoot, "tests", "fixtures", "plugins", fixtureSpec.FixtureName)
	manifestPath := filepath.Join(sourceRoot, pluginManifestFileName)
	payload, err := os.ReadFile(manifestPath)
	if err != nil {
		return CandidatePlugin{}, err
	}
	var manifest struct {
		ID string `json:"id"`
	}
	if err := json.Unmarshal(payload, &manifest); err != nil {
		return CandidatePlugin{}, err
	}

	targetParent := filepath.Join(p.baseRoot, fmt.Sprintf("%s-%s", fixtureSpec.FixtureName, strings.NewReplacer("/", "_", "#", "_", ":", "_", "@", "_", "=", "_").Replace(spec.Raw)))
	targetRoot := filepath.Join(targetParent, manifest.ID)
	copyBackendCodegenFixtureDir(p.t, sourceRoot, targetRoot)
	if fixtureSpec.FixtureName == "frontend" {
		rewritePluginManifest(p.t, targetRoot, func(payload map[string]any) {
			frontend := payload["frontend"].(map[string]any)
			frontend["entrypoint"] = "frontend/src/index.js"
			frontend["style"] = "frontend/src/index.css"
		})
	}
	if fixtureSpec.Version != "" {
		rewritePluginManifest(p.t, targetRoot, func(payload map[string]any) {
			payload["version"] = fixtureSpec.Version
		})
	}
	digest, err := computeDirectoryDigest(targetRoot)
	if err != nil {
		return CandidatePlugin{}, err
	}
	manifestValue, err := LoadPluginManifest(targetRoot, manifest.ID)
	if err != nil {
		return CandidatePlugin{}, err
	}
	return CandidatePlugin{
		Root:               targetRoot,
		Manifest:           manifestValue,
		CanonicalSourceKey: spec.CanonicalSourceKey,
		SourceDigestSHA256: stringPtr(digest),
	}, nil
}

func (p *blockingCandidateProvider) ResolveCandidate(ctx context.Context, spec ParsedSourceSpec, installer PluginInstallerBackend) (CandidatePlugin, error) {
	select {
	case p.started <- struct{}{}:
	default:
	}

	select {
	case <-p.release:
	case <-ctx.Done():
		return CandidatePlugin{}, ctx.Err()
	}

	return p.inner.ResolveCandidate(ctx, spec, installer)
}

func mustNewPluginMutationService(t *testing.T, roots filesystemResolverTestRoots, provider CandidateProvider, mode config.Mode) *Service {
	t.Helper()
	return mustNewPluginMutationServiceWithRestartCallback(t, roots, provider, mode, nil)
}

func mustNewPluginMutationServiceWithRestartCallback(t *testing.T, roots filesystemResolverTestRoots, provider CandidateProvider, mode config.Mode, callback RestartCallback) *Service {
	t.Helper()

	service, err := NewService(ServiceOptions{
		WorkspaceRoot:     roots.workspaceRoot,
		SettaFilesRoot:    roots.settaFilesRoot,
		SettaHome:         roots.settaHome,
		ServerMode:        mode,
		RestartCallback:   callback,
		CandidateProvider: provider,
	})
	if err != nil {
		t.Fatalf("new plugin mutation service: %v", err)
	}
	return service
}

func mustNewPluginMutationServiceWithStore(t *testing.T, roots filesystemResolverTestRoots, store *Store, provider CandidateProvider, mode config.Mode) *Service {
	t.Helper()

	service, err := NewService(ServiceOptions{
		Store:             store,
		WorkspaceRoot:     roots.workspaceRoot,
		SettaFilesRoot:    roots.settaFilesRoot,
		SettaHome:         roots.settaHome,
		ServerMode:        mode,
		CandidateProvider: provider,
	})
	if err != nil {
		t.Fatalf("new plugin mutation service: %v", err)
	}
	return service
}

func pluginScopePointer(scope PluginScope) *PluginScope {
	return &scope
}
