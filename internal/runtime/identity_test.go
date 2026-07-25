package runtime

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestCreateRuntimeIdentityUsesGeneratedDisplayName(t *testing.T) {
	appDataDir := t.TempDir()

	manager, err := newRuntimeIdentityManager(appDataDir, "")
	if err != nil {
		t.Fatalf("load runtime identity: %v", err)
	}
	identity := manager.identitySnapshot()
	expectedName, err := defaultRuntimeDisplayName(identity.RuntimeID)
	if err != nil {
		t.Fatalf("read default runtime display name: %v", err)
	}

	if identity.DisplayName != expectedName {
		t.Fatalf("display name = %q, want %q", identity.DisplayName, expectedName)
	}
}

func TestDefaultRuntimeDisplayNameCanGenerateCopperLantern(t *testing.T) {
	displayName, err := defaultRuntimeDisplayName("00000000000000000000000000000000")
	if err != nil {
		t.Fatalf("default runtime display name: %v", err)
	}
	if displayName != "setta-copper-lantern" {
		t.Fatalf("display name = %q, want setta-copper-lantern", displayName)
	}
}

func TestRuntimeIdentityManagerPersistsOverrideAndRename(t *testing.T) {
	appDataDir := t.TempDir()
	manager, err := newRuntimeIdentityManager(appDataDir, "setta-copper-lantern")
	if err != nil {
		t.Fatalf("create identity manager: %v", err)
	}
	identity := manager.identitySnapshot()
	if identity.DisplayName != "setta-copper-lantern" {
		t.Fatalf("display name = %q, want override", identity.DisplayName)
	}

	updated, err := manager.updateDisplayName("  setta-quiet-harbor  ")
	if err != nil {
		t.Fatalf("update display name: %v", err)
	}
	if updated.DisplayName != "setta-quiet-harbor" {
		t.Fatalf("updated display name = %q, want trimmed rename", updated.DisplayName)
	}

	persisted := readRuntimeIdentityFixture(t, filepath.Join(appDataDir, "runtime", "identity.json"))
	if persisted.RuntimeID != identity.RuntimeID || persisted.DisplayName != "setta-quiet-harbor" {
		t.Fatalf("persisted identity = %+v, want runtime id %s and renamed display name", persisted, identity.RuntimeID)
	}
}

func readRuntimeIdentityFixture(t *testing.T, path string) runtimeIdentity {
	t.Helper()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read runtime identity fixture: %v", err)
	}
	var identity runtimeIdentity
	if err := json.Unmarshal(data, &identity); err != nil {
		t.Fatalf("decode runtime identity fixture: %v", err)
	}
	return identity
}
