package runtime

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"
)

func TestCreateRuntimeIdentityUsesHostnameDisplayName(t *testing.T) {
	appDataDir := t.TempDir()
	expectedName, err := defaultRuntimeDisplayName()
	if err != nil {
		t.Fatalf("read default runtime display name: %v", err)
	}

	identity, err := loadRuntimeIdentity(appDataDir)
	if err != nil {
		t.Fatalf("load runtime identity: %v", err)
	}

	if identity.DisplayName != expectedName {
		t.Fatalf("display name = %q, want %q", identity.DisplayName, expectedName)
	}
}

func TestLoadRuntimeIdentityReplacesLegacyGenericDisplayName(t *testing.T) {
	appDataDir := t.TempDir()
	runtimeDir := filepath.Join(appDataDir, "runtime")
	if err := os.MkdirAll(runtimeDir, 0o755); err != nil {
		t.Fatalf("create runtime dir: %v", err)
	}
	identityPath := filepath.Join(runtimeDir, "identity.json")
	legacyIdentity := runtimeIdentity{
		RuntimeID:   "0123456789abcdef0123456789abcdef",
		DisplayName: legacyGenericRuntimeDisplayName,
	}
	if err := writeRuntimeIdentity(identityPath, legacyIdentity); err != nil {
		t.Fatalf("write legacy identity: %v", err)
	}
	expectedName, err := defaultRuntimeDisplayName()
	if err != nil {
		t.Fatalf("read default runtime display name: %v", err)
	}

	identity, err := loadRuntimeIdentity(appDataDir)
	if err != nil {
		t.Fatalf("load runtime identity: %v", err)
	}

	if identity.DisplayName != expectedName {
		t.Fatalf("display name = %q, want %q", identity.DisplayName, expectedName)
	}
	persisted := readRuntimeIdentityFixture(t, identityPath)
	if persisted.DisplayName != expectedName {
		t.Fatalf("persisted display name = %q, want %q", persisted.DisplayName, expectedName)
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
