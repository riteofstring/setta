package plugins

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/config"
)

// Source spec parsing should reject malformed github/pypi references.
func TestParseSourceSpecRejectsInvalidFormats(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name string
		spec string
		code ServiceErrorCode
	}{
		{
			name: "missing scheme separator",
			spec: "github-acme/plugin",
			code: ServiceErrorCodeSourceSchemeUnsupported,
		},
		{
			name: "missing github repo",
			spec: "github:acme",
			code: ServiceErrorCodeSourceInvalid,
		},
		{
			name: "invalid pypi package",
			spec: "pypi:bad@@name",
			code: ServiceErrorCodeSourceInvalid,
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
		Store:                       store,
		WorkspaceRoot:               roots.workspaceRoot,
		SettaFilesRoot:              roots.settaFilesRoot,
		SettaHome:                   roots.settaHome,
		ServerMode:                  mode,
		CandidateProvider:           provider,
		BackendRuntimeRegistrations: nil,
	})
	if err != nil {
		t.Fatalf("new plugin mutation service: %v", err)
	}
	return service
}

func mustNewPluginMutationServiceWithCodegenRuntime(
	t *testing.T,
	roots filesystemResolverTestRoots,
	provider CandidateProvider,
	mode config.Mode,
	backendRuntime BackendRegistrationSource,
) *Service {
	t.Helper()

	service, err := NewService(ServiceOptions{
		WorkspaceRoot:               roots.workspaceRoot,
		SettaFilesRoot:              roots.settaFilesRoot,
		SettaHome:                   roots.settaHome,
		ServerMode:                  mode,
		CandidateProvider:           provider,
		BackendRuntimeRegistrations: backendRuntime,
	})
	if err != nil {
		t.Fatalf("new plugin mutation service: %v", err)
	}
	return service
}

func mustNewBackendRegistrationLoader(t *testing.T, mode config.Mode) *BackendRegistrationLoader {
	t.Helper()

	repoRoot := workerRPCTestRepoRoot(t)
	loader, err := NewBackendRegistrationLoader(BackendRegistrationLoaderOptions{
		RuntimeProvider: WorkerRuntimeProviderFunc(func(context.Context) (WorkerRuntime, error) {
			return WorkerRuntime{
				PythonBinary:     workerRPCTestPythonBinary(t, repoRoot),
				Environment:      workerRPCTestEnv(repoRoot),
				WorkingDirectory: repoRoot,
			}, nil
		}),
		ServerMode: mode,
	})
	if err != nil {
		t.Fatalf("new backend registration loader: %v", err)
	}
	return loader
}

func pluginScopePointer(scope PluginScope) *PluginScope {
	return &scope
}
