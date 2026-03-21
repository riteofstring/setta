package plugins

import (
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"setta/internal/config"
)

// Lockfile write should preserve install metadata for Setta-managed plugins while excluding shadowed and package-manager entries.
func TestServiceWriteLockfileIncludesMetadataAndExcludesShadowedAndPackageManagerEntries(t *testing.T) {
	t.Parallel()

	roots := newFilesystemResolverTestRoots(t)
	sitePackages, _ := installPackageManagerFixture(t, "content", "setta-fixture-content", "0.1.0", nil)
	service := mustNewPluginMutationServiceWithPackageManager(t, roots, nil, config.ModeIDE, []string{sitePackages})

	frontendFixtureRoot := filepath.Join(t.TempDir(), "local-frontend-source")
	writeLockfileFrontendFixture(t, frontendFixtureRoot, "setta-fixture-frontend", "0.1.0")
	workspaceFrontendRoot := filepath.Join(roots.workspaceRoot, ".setta_plugins", "setta-fixture-frontend")
	globalFrontendRoot := filepath.Join(roots.settaHome, "plugins", "setta-fixture-frontend")
	writeLockfileFrontendFixture(t, workspaceFrontendRoot, "setta-fixture-frontend", "0.1.0")
	writeLockfileFrontendFixture(t, globalFrontendRoot, "setta-fixture-frontend", "0.1.0")
	backendRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeSettaFiles, "backend")
	frontendDigest, err := computeDirectoryDigest(workspaceFrontendRoot)
	if err != nil {
		t.Fatalf("compute frontend digest: %v", err)
	}
	if err := service.store.SetInstallMetadata(PluginInstallMetadataEntry{
		PluginID:           "setta-fixture-frontend",
		Scope:              PluginScopeWorkspace,
		SourceSpec:         "local:" + frontendFixtureRoot,
		CanonicalSourceKey: "local:" + frontendFixtureRoot,
		SourceDigestSHA256: stringPtr(frontendDigest),
		Version:            "0.1.0",
	}); err != nil {
		t.Fatalf("persist frontend install metadata: %v", err)
	}
	backendDigest, err := computeDirectoryDigest(backendRoot)
	if err != nil {
		t.Fatalf("compute backend digest: %v", err)
	}
	installer := PluginInstallerBackendPip
	if err := service.store.SetInstallMetadata(PluginInstallMetadataEntry{
		PluginID:           "setta-fixture-backend",
		Scope:              PluginScopeSettaFiles,
		SourceSpec:         "pypi:setta-fixture-backend==0.1.0",
		InstallerBackend:   &installer,
		CanonicalSourceKey: "pypi:setta-fixture-backend",
		SourceDigestSHA256: stringPtr(backendDigest),
		Version:            "0.1.0",
	}); err != nil {
		t.Fatalf("persist backend install metadata: %v", err)
	}

	result, err := service.WriteLockfile()
	if err != nil {
		t.Fatalf("write lockfile: %v", err)
	}
	if result.LockfilePath != filepath.Join(roots.workspaceRoot, ".setta_plugins", "plugins.lock.json") {
		t.Fatalf("unexpected lockfile path %q", result.LockfilePath)
	}
	if result.PluginCount != 2 {
		t.Fatalf("expected 2 lockfile entries, got %d", result.PluginCount)
	}

	content, err := os.ReadFile(result.LockfilePath)
	if err != nil {
		t.Fatalf("read lockfile: %v", err)
	}
	var lockfile PluginsLockFile
	if err := json.Unmarshal(content, &lockfile); err != nil {
		t.Fatalf("decode lockfile: %v", err)
	}
	if lockfile.SchemaVersion != pluginLockSchemaVersion {
		t.Fatalf("unexpected schema version %d", lockfile.SchemaVersion)
	}
	if len(lockfile.Plugins) != 2 {
		t.Fatalf("expected 2 lockfile entries, got %d", len(lockfile.Plugins))
	}

	backendEntry := lockfile.Plugins[0]
	if backendEntry.PluginID != "setta-fixture-backend" || backendEntry.Scope != PluginScopeSettaFiles {
		t.Fatalf("unexpected backend lock entry %#v", backendEntry)
	}
	if backendEntry.SourceSpec == nil || *backendEntry.SourceSpec != "pypi:setta-fixture-backend==0.1.0" {
		t.Fatalf("unexpected backend source spec %#v", backendEntry.SourceSpec)
	}
	if backendEntry.InstallerBackend == nil || *backendEntry.InstallerBackend != PluginInstallerBackendPip {
		t.Fatalf("unexpected backend installer %#v", backendEntry.InstallerBackend)
	}
	if backendEntry.SourceDigestSHA256 == nil || *backendEntry.SourceDigestSHA256 != backendDigest {
		t.Fatalf("unexpected backend digest %#v", backendEntry.SourceDigestSHA256)
	}

	frontendEntry := lockfile.Plugins[1]
	if frontendEntry.PluginID != "setta-fixture-frontend" || frontendEntry.Scope != PluginScopeWorkspace {
		t.Fatalf("unexpected frontend lock entry %#v", frontendEntry)
	}
	if frontendEntry.SourceSpec == nil || *frontendEntry.SourceSpec != "local:"+frontendFixtureRoot {
		t.Fatalf("unexpected frontend source spec %#v", frontendEntry.SourceSpec)
	}
	if frontendEntry.InstallerBackend != nil {
		t.Fatalf("expected nil frontend installer backend, got %#v", frontendEntry.InstallerBackend)
	}
}

// Lockfile apply should reject duplicate scope/plugin entries deterministically.
func TestServiceApplyLockfileRejectsDuplicateScopeEntries(t *testing.T) {
	t.Parallel()

	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	lockfilePath := filepath.Join(roots.workspaceRoot, ".setta_plugins", "plugins.lock.json")
	writeJSONFile(t, lockfilePath, map[string]any{
		"plugins": []map[string]any{
			{
				"pluginId":           "setta-fixture-frontend",
				"version":            "0.1.0",
				"canonicalSourceKey": "pypi:setta-fixture-frontend",
				"scope":              "workspace",
			},
			{
				"pluginId":           "setta-fixture-frontend",
				"version":            "0.1.0",
				"canonicalSourceKey": "pypi:setta-fixture-frontend",
				"scope":              "workspace",
			},
		},
	})

	_, err := service.ApplyLockfile(context.Background(), false)
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeLockfileInvalid)
}

// Lockfile apply must fail deterministically when the expected lockfile is absent.
func TestServiceApplyLockfileFailsWhenLockfileMissing(t *testing.T) {
	t.Parallel()

	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)

	_, err := service.ApplyLockfile(context.Background(), false)
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeLockfileNotFound)
}

// Lockfile apply must reject malformed JSON before any convergence work begins.
func TestServiceApplyLockfileFailsOnInvalidJSON(t *testing.T) {
	t.Parallel()

	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	lockfilePath := filepath.Join(roots.workspaceRoot, ".setta_plugins", "plugins.lock.json")
	if err := os.MkdirAll(filepath.Dir(lockfilePath), 0o755); err != nil {
		t.Fatalf("create lockfile directory: %v", err)
	}
	if err := os.WriteFile(lockfilePath, []byte("{not-valid-json"), 0o644); err != nil {
		t.Fatalf("write invalid lockfile: %v", err)
	}

	_, err := service.ApplyLockfile(context.Background(), false)
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeLockfileInvalid)
}

// Lockfile apply should reject entries that need installation but omit sourceSpec.
func TestServiceApplyLockfileRequiresSourceSpecForMissingPlugin(t *testing.T) {
	t.Parallel()

	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	lockfilePath := filepath.Join(roots.workspaceRoot, ".setta_plugins", "plugins.lock.json")
	writeJSONFile(t, lockfilePath, map[string]any{
		"plugins": []map[string]any{
			{
				"pluginId":           "setta-fixture-frontend",
				"version":            "0.1.0",
				"canonicalSourceKey": "pypi:setta-fixture-frontend",
				"scope":              "workspace",
			},
		},
	})

	checkResult, err := service.ApplyLockfile(context.Background(), true)
	if err != nil {
		t.Fatalf("check lockfile: %v", err)
	}
	if len(checkResult.PlannedChanges) != 1 || checkResult.PlannedChanges[0] != "install setta-fixture-frontend in workspace" {
		t.Fatalf("unexpected planned changes %#v", checkResult.PlannedChanges)
	}

	_, err = service.ApplyLockfile(context.Background(), false)
	assertPluginServiceErrorCode(t, err, ServiceErrorCodeLockfileEntryMissing)
}

// Lockfile convergence should ignore package-manager managed entries in current runtime.
func TestServiceApplyLockfileSkipsPackageManagerDrift(t *testing.T) {
	t.Parallel()

	roots := newFilesystemResolverTestRoots(t)
	sitePackages, _ := installPackageManagerFixture(t, "content", "setta-fixture-content", "0.1.0", nil)
	service := mustNewPluginMutationServiceWithPackageManager(t, roots, nil, config.ModeIDE, []string{sitePackages})
	lockfilePath := filepath.Join(roots.workspaceRoot, ".setta_plugins", "plugins.lock.json")
	writeJSONFile(t, lockfilePath, map[string]any{
		"plugins": []map[string]any{},
	})

	checkResult, err := service.ApplyLockfile(context.Background(), true)
	if err != nil {
		t.Fatalf("check lockfile: %v", err)
	}
	if len(checkResult.PlannedChanges) != 0 {
		t.Fatalf("expected no planned changes, got %#v", checkResult.PlannedChanges)
	}

	applyResult, err := service.ApplyLockfile(context.Background(), false)
	if err != nil {
		t.Fatalf("apply lockfile: %v", err)
	}
	if !applyResult.Applied || len(applyResult.PlannedChanges) != 0 {
		t.Fatalf("unexpected apply result %#v", applyResult)
	}
}

// Externally managed setta_files lock entries without a source spec should be
// treated as observational state, not as install work.
func TestServiceApplyLockfileSkipsExternallyManagedEntriesWithoutSourceSpec(t *testing.T) {
	t.Parallel()

	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	lockfilePath := filepath.Join(roots.workspaceRoot, ".setta_plugins", "plugins.lock.json")
	writeJSONFile(t, lockfilePath, map[string]any{
		"plugins": []map[string]any{
			{
				"pluginId":           "setta-fixture-frontend",
				"version":            "0.1.0",
				"canonicalSourceKey": "pypi:setta-fixture-frontend",
				"scope":              "setta_files",
				"sourceSpec":         nil,
				"installerBackend":   nil,
			},
		},
	})

	checkResult, err := service.ApplyLockfile(context.Background(), true)
	if err != nil {
		t.Fatalf("check lockfile: %v", err)
	}
	if len(checkResult.PlannedChanges) != 0 {
		t.Fatalf("expected no planned changes for external-managed lock entry, got %#v", checkResult.PlannedChanges)
	}

	applyResult, err := service.ApplyLockfile(context.Background(), false)
	if err != nil {
		t.Fatalf("apply lockfile: %v", err)
	}
	if !applyResult.Applied || len(applyResult.PlannedChanges) != 0 {
		t.Fatalf("unexpected apply result %#v", applyResult)
	}
}

// Lockfile apply should uninstall extra Setta-managed plugins that are absent from the lockfile.
func TestServiceApplyLockfileUninstallsPluginsMissingFromLockfile(t *testing.T) {
	t.Parallel()

	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	pluginRoot := filepath.Join(roots.workspaceRoot, ".setta_plugins", "setta-fixture-frontend")
	writeLockfileFrontendFixture(t, pluginRoot, "setta-fixture-frontend", "0.1.0")
	lockfilePath := filepath.Join(roots.workspaceRoot, ".setta_plugins", "plugins.lock.json")
	writeJSONFile(t, lockfilePath, map[string]any{
		"plugins": []map[string]any{},
	})

	checkResult, err := service.ApplyLockfile(context.Background(), true)
	if err != nil {
		t.Fatalf("check lockfile: %v", err)
	}
	if len(checkResult.PlannedChanges) != 1 || checkResult.PlannedChanges[0] != "uninstall setta-fixture-frontend from workspace" {
		t.Fatalf("unexpected planned changes %#v", checkResult.PlannedChanges)
	}

	applyResult, err := service.ApplyLockfile(context.Background(), false)
	if err != nil {
		t.Fatalf("apply lockfile: %v", err)
	}
	if !applyResult.Applied {
		t.Fatalf("expected apply result to be applied")
	}
	if _, err := os.Stat(pluginRoot); !os.IsNotExist(err) {
		t.Fatalf("expected plugin root to be removed, got err=%v", err)
	}
}

// Lockfile apply should also uninstall invalid filesystem plugin roots that discovery surfaced.
func TestServiceApplyLockfileUninstallsInvalidFilesystemPlugins(t *testing.T) {
	t.Parallel()

	roots := newFilesystemResolverTestRoots(t)
	service := mustNewPluginMutationService(t, roots, nil, config.ModeIDE)
	invalidPluginRoot := filepath.Join(roots.workspaceRoot, ".setta_plugins", "setta-invalid-missing-manifest")
	if err := os.MkdirAll(invalidPluginRoot, 0o755); err != nil {
		t.Fatalf("create invalid plugin root: %v", err)
	}
	if err := os.WriteFile(filepath.Join(invalidPluginRoot, "README.txt"), []byte("missing manifest\n"), 0o644); err != nil {
		t.Fatalf("write invalid plugin marker: %v", err)
	}
	if _, err := service.Rescan(); err != nil {
		t.Fatalf("rescan invalid plugin root: %v", err)
	}

	lockfilePath := filepath.Join(roots.workspaceRoot, ".setta_plugins", "plugins.lock.json")
	writeJSONFile(t, lockfilePath, map[string]any{
		"plugins": []map[string]any{},
	})

	checkResult, err := service.ApplyLockfile(context.Background(), true)
	if err != nil {
		t.Fatalf("check lockfile: %v", err)
	}
	if len(checkResult.PlannedChanges) != 1 || checkResult.PlannedChanges[0] != "uninstall setta-invalid-missing-manifest from workspace" {
		t.Fatalf("unexpected planned changes %#v", checkResult.PlannedChanges)
	}

	applyResult, err := service.ApplyLockfile(context.Background(), false)
	if err != nil {
		t.Fatalf("apply lockfile: %v", err)
	}
	if !applyResult.Applied {
		t.Fatalf("expected apply result to be applied")
	}
	if _, err := os.Stat(invalidPluginRoot); !os.IsNotExist(err) {
		t.Fatalf("expected invalid plugin root to be removed, got err=%v", err)
	}
}

// Lockfile apply should reinstall a PyPI-managed plugin from the stored source spec and installer backend.
func TestServiceApplyLockfileReinstallsPluginFromPyPISource(t *testing.T) {
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
	service, err := NewService(ServiceOptions{
		WorkspaceRoot:     roots.workspaceRoot,
		SettaFilesRoot:    roots.settaFilesRoot,
		SettaHome:         roots.settaHome,
		ServerMode:        config.ModeIDE,
		CandidateProvider: provider,
	})
	if err != nil {
		t.Fatalf("new plugin service: %v", err)
	}

	installResult, err := service.Install(context.Background(), InstallOptions{
		SourceSpec: "pypi:setta-fixture-frontend==0.1.0",
		Scope:      scopePointer(PluginScopeWorkspace),
		Installer:  installerPointer(PluginInstallerBackendPip),
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install plugin: %v", err)
	}
	if installResult.State != PluginRuntimeStateActive {
		t.Fatalf("expected active install state, got %q", installResult.State)
	}

	lockWrite, err := service.WriteLockfile()
	if err != nil {
		t.Fatalf("write lockfile: %v", err)
	}
	if lockWrite.PluginCount != 1 {
		t.Fatalf("expected one lockfile entry, got %d", lockWrite.PluginCount)
	}

	content, err := os.ReadFile(lockWrite.LockfilePath)
	if err != nil {
		t.Fatalf("read lockfile: %v", err)
	}
	var lockfile PluginsLockFile
	if err := json.Unmarshal(content, &lockfile); err != nil {
		t.Fatalf("decode lockfile: %v", err)
	}
	if len(lockfile.Plugins) != 1 {
		t.Fatalf("expected one lockfile plugin entry, got %#v", lockfile.Plugins)
	}
	if lockfile.Plugins[0].InstallerBackend == nil || *lockfile.Plugins[0].InstallerBackend != PluginInstallerBackendPip {
		t.Fatalf("expected pip installer backend in lockfile, got %#v", lockfile.Plugins[0].InstallerBackend)
	}

	uninstallResult, err := service.Uninstall(context.Background(), UninstallOptions{
		PluginID: "setta-fixture-frontend",
		Scope:    scopePointer(PluginScopeWorkspace),
	})
	if err != nil {
		t.Fatalf("uninstall plugin: %v", err)
	}
	if uninstallResult.RemovedFromScope != PluginScopeWorkspace {
		t.Fatalf("unexpected uninstall result %#v", uninstallResult)
	}

	checkResult, err := service.ApplyLockfile(context.Background(), true)
	if err != nil {
		t.Fatalf("check lockfile: %v", err)
	}
	if len(checkResult.PlannedChanges) != 1 || checkResult.PlannedChanges[0] != "install setta-fixture-frontend in workspace" {
		t.Fatalf("unexpected planned changes %#v", checkResult.PlannedChanges)
	}

	applyResult, err := service.ApplyLockfile(context.Background(), false)
	if err != nil {
		t.Fatalf("apply lockfile: %v", err)
	}
	if !applyResult.Applied {
		t.Fatalf("expected lockfile apply to complete")
	}

	status, err := service.Status()
	if err != nil {
		t.Fatalf("load plugin status: %v", err)
	}
	entries := make([]StatusEntry, 0)
	for _, entry := range status.Plugins {
		if entry.PluginID == "setta-fixture-frontend" && entry.SourceScope == PluginScopeWorkspace && entry.ShadowedBySourcePath == nil {
			entries = append(entries, entry)
		}
	}
	if len(entries) != 1 {
		t.Fatalf("expected one primary plugin entry, got %#v", entries)
	}
	if entries[0].State != PluginRuntimeStateActive {
		t.Fatalf("expected active state after reinstall, got %q", entries[0].State)
	}
}

// Lockfile apply should preserve disabled state when reconciling a plugin source.
func TestServiceApplyLockfilePreservesDisabledStateWhenReconcilingSource(t *testing.T) {
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
	service, err := NewService(ServiceOptions{
		WorkspaceRoot:     roots.workspaceRoot,
		SettaFilesRoot:    roots.settaFilesRoot,
		SettaHome:         roots.settaHome,
		ServerMode:        config.ModeIDE,
		CandidateProvider: provider,
	})
	if err != nil {
		t.Fatalf("new plugin service: %v", err)
	}

	installResult, err := service.Install(context.Background(), InstallOptions{
		SourceSpec: "pypi:setta-fixture-frontend==0.1.0",
		Scope:      scopePointer(PluginScopeWorkspace),
		Installer:  installerPointer(PluginInstallerBackendPip),
		Enable:     true,
	})
	if err != nil {
		t.Fatalf("install plugin: %v", err)
	}
	if installResult.State != PluginRuntimeStateActive {
		t.Fatalf("expected active install state, got %q", installResult.State)
	}
	if _, err := service.Disable(context.Background(), EnableDisableOptions{PluginID: "setta-fixture-frontend"}); err != nil {
		t.Fatalf("disable plugin: %v", err)
	}

	lockfilePath := filepath.Join(roots.workspaceRoot, ".setta_plugins", "plugins.lock.json")
	writeJSONFile(t, lockfilePath, map[string]any{
		"plugins": []map[string]any{
			{
				"pluginId":           "setta-fixture-frontend",
				"version":            "0.1.0",
				"canonicalSourceKey": "pypi:setta_fixture_frontend",
				"scope":              "workspace",
				"sourceSpec":         "pypi:setta_fixture_frontend==0.1.0",
			},
		},
	})

	checkResult, err := service.ApplyLockfile(context.Background(), true)
	if err != nil {
		t.Fatalf("check lockfile: %v", err)
	}
	if len(checkResult.PlannedChanges) != 1 || !strings.Contains(checkResult.PlannedChanges[0], "reconcile source for setta-fixture-frontend in workspace") {
		t.Fatalf("unexpected planned changes %#v", checkResult.PlannedChanges)
	}

	applyResult, err := service.ApplyLockfile(context.Background(), false)
	if err != nil {
		t.Fatalf("apply lockfile: %v", err)
	}
	if !applyResult.Applied {
		t.Fatalf("expected lockfile apply to complete")
	}

	status, err := service.Status()
	if err != nil {
		t.Fatalf("load plugin status: %v", err)
	}
	entries := make([]StatusEntry, 0)
	for _, entry := range status.Plugins {
		if entry.PluginID == "setta-fixture-frontend" && entry.SourceScope == PluginScopeWorkspace && entry.ShadowedBySourcePath == nil {
			entries = append(entries, entry)
		}
	}
	if len(entries) != 1 {
		t.Fatalf("expected one primary plugin entry, got %#v", entries)
	}
	if entries[0].State != PluginRuntimeStateDisabled {
		t.Fatalf("expected disabled state after reconcile, got %q", entries[0].State)
	}
	if entries[0].CanonicalSourceKey != "pypi:setta_fixture_frontend" {
		t.Fatalf("unexpected canonical source key %q", entries[0].CanonicalSourceKey)
	}

	metadataEntry, ok, err := service.store.GetInstallMetadata("setta-fixture-frontend", PluginScopeWorkspace)
	if err != nil {
		t.Fatalf("load install metadata: %v", err)
	}
	if !ok {
		t.Fatal("expected install metadata for reconciled plugin")
	}
	if metadataEntry.SourceSpec != "pypi:setta_fixture_frontend==0.1.0" {
		t.Fatalf("unexpected stored source spec %q", metadataEntry.SourceSpec)
	}
}

func writeLockfileFrontendFixture(t *testing.T, root string, pluginID string, version string) {
	t.Helper()

	if err := os.MkdirAll(filepath.Join(root, "frontend", "dist"), 0o755); err != nil {
		t.Fatalf("mkdir frontend dist: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "frontend", "dist", "index.js"), []byte("console.log('plugin')\n"), 0o644); err != nil {
		t.Fatalf("write frontend entrypoint: %v", err)
	}
	if err := os.WriteFile(filepath.Join(root, "frontend", "dist", "index.css"), []byte("body {}\n"), 0o644); err != nil {
		t.Fatalf("write frontend style: %v", err)
	}
	writeJSONFile(t, filepath.Join(root, "setta.plugin.json"), map[string]any{
		"schemaVersion":     1,
		"id":                pluginID,
		"name":              "Setta Fixture Frontend",
		"version":           version,
		"settaVersionRange": ">=0.0.0",
		"enabledByDefault":  true,
		"frontend": map[string]any{
			"entrypoint": "frontend/dist/index.js",
			"style":      "frontend/dist/index.css",
		},
		"capabilities": []string{
			"registerSectionKinds",
			"registerPane",
		},
	})
}

func installerPointer(installer PluginInstallerBackend) *PluginInstallerBackend {
	resolvedInstaller := installer
	return &resolvedInstaller
}
