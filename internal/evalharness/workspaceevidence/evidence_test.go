package workspaceevidence

import (
	"os"
	"path/filepath"
	"testing"
)

func TestCaptureTracksSourceContentAndExecutableMode(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	path := filepath.Join(root, "source.ts")
	if err := os.WriteFile(path, []byte("export const port = 3000;\n"), 0o644); err != nil {
		t.Fatalf("write baseline source: %v", err)
	}
	baseline := captureWorkspaceDigest(t, root)

	if err := os.WriteFile(path, []byte("export const port = 4100;\n"), 0o644); err != nil {
		t.Fatalf("mutate source: %v", err)
	}
	mutated := captureWorkspaceDigest(t, root)
	if mutated == baseline {
		t.Fatal("source content mutation did not change the workspace digest")
	}

	if err := os.Chmod(path, 0o755); err != nil {
		t.Fatalf("make source executable: %v", err)
	}
	executable := captureWorkspaceDigest(t, root)
	if executable == mutated {
		t.Fatal("executable-mode mutation did not change the workspace digest")
	}
}

func TestCaptureIgnoresGeneratedWorkspaceDirectories(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	baseline := captureWorkspaceDigest(t, root)
	for _, directory := range []string{".git", "dist", "node_modules"} {
		path := filepath.Join(root, directory, "generated.js")
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("create ignored directory %s: %v", directory, err)
		}
		if err := os.WriteFile(path, []byte(directory), 0o644); err != nil {
			t.Fatalf("write ignored file %s: %v", directory, err)
		}
	}
	if observed := captureWorkspaceDigest(t, root); observed != baseline {
		t.Fatalf("ignored directory changes altered digest: got %s want %s", observed, baseline)
	}
}

func captureWorkspaceDigest(t *testing.T, root string) string {
	t.Helper()
	digest, err := Capture(root)
	if err != nil {
		t.Fatalf("capture workspace digest: %v", err)
	}
	if err := digest.Validate(); err != nil {
		t.Fatalf("validate workspace digest: %v", err)
	}
	return digest.SHA256
}
