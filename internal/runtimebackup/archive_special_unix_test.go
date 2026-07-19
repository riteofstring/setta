//go:build darwin || linux

package runtimebackup

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"syscall"
	"testing"
	"time"
)

func TestExportRejectsSpecialFiles(t *testing.T) {
	parent := t.TempDir()
	source := filepath.Join(parent, "source")
	if err := os.Mkdir(source, 0o700); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	if err := syscall.Mkfifo(filepath.Join(source, "pipe"), 0o600); err != nil {
		t.Fatalf("Mkfifo: %v", err)
	}
	_, err := Export(context.Background(), ExportRequest{
		SourceDirectory: source, DestinationPath: filepath.Join(parent, "archive"), Key: testKey(9),
		OwnerBinding: "owner", RuntimeID: "runtime", SourceGeneration: 1,
		CreatedAt: time.Date(2026, time.July, 14, 12, 0, 0, 0, time.UTC),
	})
	if !errors.Is(err, ErrInvalidManifest) {
		t.Fatalf("Export error = %v, want ErrInvalidManifest", err)
	}
}
