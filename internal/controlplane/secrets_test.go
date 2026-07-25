package controlplane

import (
	"context"
	"os"
	"path/filepath"
	"testing"
)

func TestFileSecretStoreWritesRotatesAndDeletesPrivateSecrets(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "secrets")
	store, err := OpenFileSecretStore(directory)
	if err != nil {
		t.Fatalf("OpenFileSecretStore: %v", err)
	}
	ctx := context.Background()
	if err := store.WriteSecret(ctx, "runtime_credential", []byte("credential-one")); err != nil {
		t.Fatalf("WriteSecret: %v", err)
	}
	assertSecret(t, store, "runtime_credential", "credential-one")
	if err := store.WriteSecret(ctx, "runtime_credential", []byte("credential-two")); err != nil {
		t.Fatalf("rotate secret: %v", err)
	}
	assertSecret(t, store, "runtime_credential", "credential-two")
	info, err := os.Stat(filepath.Join(directory, "runtime_credential.secret"))
	if err != nil {
		t.Fatalf("stat secret: %v", err)
	}
	if info.Mode().Perm() != 0o600 {
		t.Fatalf("secret permissions = %o, want 600", info.Mode().Perm())
	}
	if err := store.DeleteSecret(ctx, "runtime_credential"); err != nil {
		t.Fatalf("DeleteSecret: %v", err)
	}
	if _, err := store.ReadSecret(ctx, "runtime_credential"); err != ErrNotFound {
		t.Fatalf("ReadSecret after deletion error = %v", err)
	}
}

func TestFileSecretStoreRejectsUnsafeValuesAndPermissions(t *testing.T) {
	directory := filepath.Join(t.TempDir(), "secrets")
	store, err := OpenFileSecretStore(directory)
	if err != nil {
		t.Fatalf("OpenFileSecretStore: %v", err)
	}
	ctx := context.Background()
	for _, reference := range []string{"../secret", "UPPER", "space secret"} {
		if err := store.WriteSecret(ctx, reference, []byte("credential")); err == nil {
			t.Fatalf("WriteSecret accepted reference %q", reference)
		}
	}
	if err := os.WriteFile(filepath.Join(directory, "exposed.secret"), []byte("credential"), 0o644); err != nil {
		t.Fatalf("write exposed secret: %v", err)
	}
	if _, err := store.ReadSecret(ctx, "exposed"); err == nil {
		t.Fatal("ReadSecret accepted group-readable secret")
	}
}

func TestFileSecretStoreRejectsSymlinkBoundaries(t *testing.T) {
	root := t.TempDir()
	realDirectory := filepath.Join(root, "real-secrets")
	store, err := OpenFileSecretStore(realDirectory)
	if err != nil {
		t.Fatalf("OpenFileSecretStore: %v", err)
	}
	outsideSecret := filepath.Join(root, "outside-secret")
	if err := os.WriteFile(outsideSecret, []byte("outside-credential"), 0o600); err != nil {
		t.Fatalf("write outside secret: %v", err)
	}
	if err := os.Symlink(outsideSecret, filepath.Join(realDirectory, "linked.secret")); err != nil {
		t.Fatalf("symlink secret: %v", err)
	}
	if _, err := store.ReadSecret(context.Background(), "linked"); err == nil {
		t.Fatal("ReadSecret followed a symlink outside the secret directory")
	}
	linkedDirectory := filepath.Join(root, "linked-secrets")
	if err := os.Symlink(realDirectory, linkedDirectory); err != nil {
		t.Fatalf("symlink secret directory: %v", err)
	}
	if _, err := OpenFileSecretStore(linkedDirectory); err == nil {
		t.Fatal("OpenFileSecretStore accepted a symlink directory")
	}
}

func assertSecret(t *testing.T, store *FileSecretStore, reference string, want string) {
	t.Helper()
	secret, err := store.ReadSecret(context.Background(), reference)
	if err != nil {
		t.Fatalf("ReadSecret: %v", err)
	}
	if string(secret) != want {
		t.Fatalf("secret = %q, want %q", secret, want)
	}
}
