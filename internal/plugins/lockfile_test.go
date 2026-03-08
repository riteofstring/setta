package plugins

import (
	"encoding/json"
	"os"
	"path/filepath"
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
