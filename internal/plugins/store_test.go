package plugins

import (
	"encoding/json"
	"errors"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"
)

// Persisted plugin state files should round-trip through the Go store with normalized ids and stable ordering.
func TestStorePersistsPluginStateFiles(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	store, err := NewStore(StoreOptions{
		WorkspaceRoot:  roots.workspaceRoot,
		SettaFilesRoot: roots.settaFilesRoot,
		SettaHome:      roots.settaHome,
	})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	if err := store.SavePluginsState(PluginsStateFile{
		EnabledPluginIDs:               []string{"beta", "alpha", "beta"},
		DisabledPluginIDs:              []string{"delta", "delta", "gamma"},
		PendingRestartBackendPluginIDs: []string{"backend-b", "backend-a", "backend-b"},
		PluginConfigByID: map[string]any{
			"workspace:alpha": map[string]any{"enabled": true},
		},
	}); err != nil {
		t.Fatalf("save plugins state: %v", err)
	}
	if err := store.SavePluginsGlobalState(PluginsGlobalStateFile{
		AutoEnabledPluginIDs: []string{"gamma", "alpha", "gamma"},
	}); err != nil {
		t.Fatalf("save global plugins state: %v", err)
	}

	state, err := store.LoadPluginsState()
	if err != nil {
		t.Fatalf("load plugins state: %v", err)
	}
	if len(state.EnabledPluginIDs) != 2 || state.EnabledPluginIDs[0] != "alpha" || state.EnabledPluginIDs[1] != "beta" {
		t.Fatalf("unexpected enabled ids: %#v", state.EnabledPluginIDs)
	}
	if len(state.DisabledPluginIDs) != 2 || state.DisabledPluginIDs[0] != "delta" || state.DisabledPluginIDs[1] != "gamma" {
		t.Fatalf("unexpected disabled ids: %#v", state.DisabledPluginIDs)
	}
	if len(state.PendingRestartBackendPluginIDs) != 2 || state.PendingRestartBackendPluginIDs[0] != "backend-a" || state.PendingRestartBackendPluginIDs[1] != "backend-b" {
		t.Fatalf("unexpected pending restart ids: %#v", state.PendingRestartBackendPluginIDs)
	}

	globalState, err := store.LoadPluginsGlobalState()
	if err != nil {
		t.Fatalf("load global plugins state: %v", err)
	}
	if len(globalState.AutoEnabledPluginIDs) != 2 || globalState.AutoEnabledPluginIDs[0] != "alpha" || globalState.AutoEnabledPluginIDs[1] != "gamma" {
		t.Fatalf("unexpected auto-enabled ids: %#v", globalState.AutoEnabledPluginIDs)
	}
}

// Install metadata writes should preserve prior rollback history unless the caller explicitly replaces it.
func TestStoreSetInstallMetadataPreservesHistory(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	store, err := NewStore(StoreOptions{
		WorkspaceRoot:  roots.workspaceRoot,
		SettaFilesRoot: roots.settaFilesRoot,
		SettaHome:      roots.settaHome,
	})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	installer := PluginInstallerBackendUV
	originalDigest := "digest-1"
	if err := store.SetInstallMetadata(PluginInstallMetadataEntry{
		PluginID:           "setta-fixture-backend",
		Scope:              PluginScopeWorkspace,
		SourceSpec:         "pypi:setta-fixture-backend==0.1.0",
		InstallerBackend:   &installer,
		CanonicalSourceKey: "pypi:setta-fixture-backend",
		SourceDigestSHA256: &originalDigest,
		Version:            "0.1.0",
		History: []PluginInstallHistoryEntry{
			{
				Version:      "0.0.9",
				SnapshotPath: filepath.Join(roots.settaFilesRoot, "plugins_history", "workspace", "setta-fixture-backend", "snapshot"),
				TimestampISO: "2026-03-08T12:00:00Z",
			},
		},
	}); err != nil {
		t.Fatalf("set initial install metadata: %v", err)
	}

	updatedDigest := "digest-2"
	if err := store.SetInstallMetadata(PluginInstallMetadataEntry{
		PluginID:           "setta-fixture-backend",
		Scope:              PluginScopeWorkspace,
		SourceSpec:         "pypi:setta-fixture-backend==0.2.0",
		InstallerBackend:   &installer,
		CanonicalSourceKey: "pypi:setta-fixture-backend",
		SourceDigestSHA256: &updatedDigest,
		Version:            "0.2.0",
	}); err != nil {
		t.Fatalf("update install metadata: %v", err)
	}

	entry, ok, err := store.GetInstallMetadata("setta-fixture-backend", PluginScopeWorkspace)
	if err != nil {
		t.Fatalf("get install metadata: %v", err)
	}
	if !ok {
		t.Fatalf("expected install metadata to exist")
	}
	if entry.Version != "0.2.0" {
		t.Fatalf("expected updated version, got %q", entry.Version)
	}
	if len(entry.History) != 1 || entry.History[0].Version != "0.0.9" {
		t.Fatalf("expected preserved history, got %#v", entry.History)
	}

	if err := store.RemoveInstallMetadata("setta-fixture-backend", PluginScopeWorkspace); err != nil {
		t.Fatalf("remove install metadata: %v", err)
	}
	_, ok, err = store.GetInstallMetadata("setta-fixture-backend", PluginScopeWorkspace)
	if err != nil {
		t.Fatalf("get removed install metadata: %v", err)
	}
	if ok {
		t.Fatalf("expected install metadata to be removed")
	}
}

// Invalid install-metadata payloads should fail loudly instead of being silently dropped during load.
func TestStoreRejectsInvalidInstallMetadataEntries(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	store, err := NewStore(StoreOptions{
		WorkspaceRoot:  roots.workspaceRoot,
		SettaFilesRoot: roots.settaFilesRoot,
		SettaHome:      roots.settaHome,
	})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	writeJSONFile(t, store.InstallMetadataPath(), map[string]any{
		"entries": map[string]any{
			"workspace:broken-plugin": map[string]any{
				"pluginId":           "",
				"scope":              "workspace",
				"sourceSpec":         "pypi:broken-plugin",
				"canonicalSourceKey": "pypi:broken-plugin",
				"version":            "0.1.0",
				"history":            []any{},
			},
		},
	})

	if _, err := store.LoadInstallMetadata(); err == nil {
		t.Fatalf("expected invalid install metadata error")
	}
}

// Malformed persisted plugin JSON should surface the same typed service errors the HTTP routes expose.
func TestStoreLoadPersistedPluginFilesReturnTypedValidationErrors(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	store, err := NewStore(StoreOptions{
		WorkspaceRoot:  roots.workspaceRoot,
		SettaFilesRoot: roots.settaFilesRoot,
		SettaHome:      roots.settaHome,
	})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	for _, testCase := range []struct {
		name         string
		path         string
		content      string
		expectedCode ServiceErrorCode
		load         func() error
	}{
		{
			name:         "plugins state",
			path:         store.PluginsStatePath(),
			content:      `{"enabledPluginIds":`,
			expectedCode: ServiceErrorCodeStateInvalid,
			load: func() error {
				_, err := store.LoadPluginsState()
				return err
			},
		},
		{
			name:         "plugins global state",
			path:         store.PluginsGlobalStatePath(),
			content:      `{"autoEnabledPluginIds":`,
			expectedCode: ServiceErrorCodeGlobalStateInvalid,
			load: func() error {
				_, err := store.LoadPluginsGlobalState()
				return err
			},
		},
		{
			name:         "plugin install metadata",
			path:         store.InstallMetadataPath(),
			content:      `{"entries":{"workspace:broken":{"pluginId":"","scope":"workspace"}}}`,
			expectedCode: ServiceErrorCodeInstallMetadataInvalid,
			load: func() error {
				_, err := store.LoadInstallMetadata()
				return err
			},
		},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			if err := os.WriteFile(testCase.path, []byte(testCase.content), 0o644); err != nil {
				t.Fatalf("seed malformed persisted plugin file: %v", err)
			}

			err := testCase.load()
			if err == nil {
				t.Fatal("expected typed persisted plugin file error")
			}

			var serviceErr *ServiceError
			if !errors.As(err, &serviceErr) {
				t.Fatalf("expected service error, got %T: %v", err, err)
			}
			if serviceErr.Code != testCase.expectedCode {
				t.Fatalf("expected service error code %q, got %q", testCase.expectedCode, serviceErr.Code)
			}
			if serviceErr.Status != http.StatusUnprocessableEntity {
				t.Fatalf("expected service error status 422, got %d", serviceErr.Status)
			}
		})
	}
}

// Directory digests should follow symlinked file contents so source changes invalidate later fingerprints.
func TestComputeDirectoryDigestTracksSymlinkedFileTargetChanges(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	digestRoot := filepath.Join(roots.workspaceRoot, "digest-root")
	if err := os.MkdirAll(digestRoot, 0o755); err != nil {
		t.Fatalf("mkdir digest root: %v", err)
	}
	targetPath := filepath.Join(roots.workspaceRoot, "digest-target.txt")
	if err := os.WriteFile(targetPath, []byte("v1"), 0o644); err != nil {
		t.Fatalf("write digest target: %v", err)
	}
	if err := os.Symlink(targetPath, filepath.Join(digestRoot, "linked.txt")); err != nil {
		t.Fatalf("create digest symlink: %v", err)
	}

	initialDigest, err := computeDirectoryDigest(digestRoot)
	if err != nil {
		t.Fatalf("compute initial digest: %v", err)
	}

	if err := os.WriteFile(targetPath, []byte("v2"), 0o644); err != nil {
		t.Fatalf("rewrite digest target: %v", err)
	}

	updatedDigest, err := computeDirectoryDigest(digestRoot)
	if err != nil {
		t.Fatalf("compute updated digest: %v", err)
	}
	if updatedDigest == initialDigest {
		t.Fatalf("expected digest to change after symlink target update, got %q", updatedDigest)
	}
}

// Public store reads should reflect later on-disk state instead of pinning a private cached snapshot.
func TestStoreLoadPluginsStateObservesOnDiskChanges(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	store, err := NewStore(StoreOptions{
		WorkspaceRoot:  roots.workspaceRoot,
		SettaFilesRoot: roots.settaFilesRoot,
		SettaHome:      roots.settaHome,
	})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	if err := store.SavePluginsState(PluginsStateFile{
		EnabledPluginIDs: []string{"alpha.plugin"},
	}); err != nil {
		t.Fatalf("save initial plugins state: %v", err)
	}

	firstLoad, err := store.LoadPluginsState()
	if err != nil {
		t.Fatalf("load initial plugins state: %v", err)
	}
	if len(firstLoad.EnabledPluginIDs) != 1 || firstLoad.EnabledPluginIDs[0] != "alpha.plugin" {
		t.Fatalf("unexpected initial enabled ids: %#v", firstLoad.EnabledPluginIDs)
	}

	firstLoad.EnabledPluginIDs = append(firstLoad.EnabledPluginIDs, "mutated")

	secondLoad, err := store.LoadPluginsState()
	if err != nil {
		t.Fatalf("reload plugins state after local mutation: %v", err)
	}
	if len(secondLoad.EnabledPluginIDs) != 1 || secondLoad.EnabledPluginIDs[0] != "alpha.plugin" {
		t.Fatalf("expected reload to ignore caller-local mutation, got %#v", secondLoad.EnabledPluginIDs)
	}

	writeJSONFile(t, store.PluginsStatePath(), map[string]any{
		"enabledPluginIds": []string{"beta.plugin"},
	})

	updatedLoad, err := store.LoadPluginsState()
	if err != nil {
		t.Fatalf("reload plugins state after file update: %v", err)
	}
	if len(updatedLoad.EnabledPluginIDs) != 1 || updatedLoad.EnabledPluginIDs[0] != "beta.plugin" {
		t.Fatalf("expected reload to observe updated on-disk state, got %#v", updatedLoad.EnabledPluginIDs)
	}
}

// History snapshots should copy the installed plugin tree into the documented plugins_history root.
func TestStoreCreateHistorySnapshotCopiesInstalledPluginTree(t *testing.T) {
	roots := newFilesystemResolverTestRoots(t)
	pluginRoot := copyPluginFixtureToScope(t, roots, filesystemPluginScopeWorkspace, "backend")

	store, err := NewStore(StoreOptions{
		WorkspaceRoot:  roots.workspaceRoot,
		SettaFilesRoot: roots.settaFilesRoot,
		SettaHome:      roots.settaHome,
	})
	if err != nil {
		t.Fatalf("new store: %v", err)
	}

	var manifest struct {
		ID      string `json:"id"`
		Version string `json:"version"`
	}
	manifestPayload, err := os.ReadFile(filepath.Join(pluginRoot, pluginManifestFileName))
	if err != nil {
		t.Fatalf("read plugin manifest: %v", err)
	}
	if err := json.Unmarshal(manifestPayload, &manifest); err != nil {
		t.Fatalf("decode plugin manifest: %v", err)
	}

	historyEntry, err := store.CreateHistorySnapshot(manifest.ID, PluginScopeWorkspace)
	if err != nil {
		t.Fatalf("create history snapshot: %v", err)
	}
	if historyEntry.Version != manifest.Version {
		t.Fatalf("expected snapshot version %q, got %q", manifest.Version, historyEntry.Version)
	}
	if historyEntry.SourceDigestSHA256 == nil || *historyEntry.SourceDigestSHA256 == "" {
		t.Fatalf("expected snapshot digest, got %#v", historyEntry.SourceDigestSHA256)
	}
	if !strings.HasPrefix(historyEntry.SnapshotPath, filepath.Join(store.HistoryRoot(), "workspace", manifest.ID)) {
		t.Fatalf("expected snapshot path under history root, got %q", historyEntry.SnapshotPath)
	}
	if _, err := os.Stat(filepath.Join(historyEntry.SnapshotPath, pluginManifestFileName)); err != nil {
		t.Fatalf("expected snapshot manifest copy: %v", err)
	}
	if _, err := os.Stat(filepath.Join(historyEntry.SnapshotPath, "backend", "main.go")); err != nil {
		t.Fatalf("expected snapshot backend entrypoint copy: %v", err)
	}
}

// History snapshots should include a random suffix so repeated backups do not collide under the same plugin history root.
func TestStoreCreateHistorySnapshotUsesUniqueSuffixes(t *testing.T) {
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

	firstEntry, err := store.CreateHistorySnapshot("setta-fixture-backend", PluginScopeWorkspace)
	if err != nil {
		t.Fatalf("create first history snapshot: %v", err)
	}
	secondEntry, err := store.CreateHistorySnapshot("setta-fixture-backend", PluginScopeWorkspace)
	if err != nil {
		t.Fatalf("create second history snapshot: %v", err)
	}

	if firstEntry.SnapshotPath == secondEntry.SnapshotPath {
		t.Fatalf("expected distinct snapshot paths, got %q", firstEntry.SnapshotPath)
	}

	historyRoot := filepath.Join(store.HistoryRoot(), "workspace", "setta-fixture-backend")
	pattern := regexp.MustCompile(`^\d{8}T\d{6}\.\d{9}Z-[0-9a-f]{8}$`)
	for _, snapshotPath := range []string{firstEntry.SnapshotPath, secondEntry.SnapshotPath} {
		if !strings.HasPrefix(snapshotPath, historyRoot) {
			t.Fatalf("expected snapshot path under %q, got %q", historyRoot, snapshotPath)
		}
		if !pattern.MatchString(filepath.Base(snapshotPath)) {
			t.Fatalf("expected collision-resistant snapshot suffix in %q", snapshotPath)
		}
	}
}
