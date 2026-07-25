package runtimebackup

import (
	"archive/tar"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"
)

func TestExportRestoreRoundTripPublishesInactiveNewGeneration(t *testing.T) {
	parent := t.TempDir()
	source, large := createRoundTripSource(t, parent)

	archivePath := filepath.Join(parent, "workspace.setta-export")
	var exportProgress Progress
	manifest, err := Export(context.Background(), ExportRequest{
		SourceDirectory: source, DestinationPath: archivePath, Key: testKey(4),
		OwnerBinding: "owner-hash", RuntimeID: "runtime-one", SourceGeneration: 7,
		CreatedAt: time.Date(2026, time.July, 14, 12, 0, 0, 0, time.UTC),
		Progress:  func(progress Progress) { exportProgress = progress },
	})
	if err != nil {
		t.Fatalf("Export: %v", err)
	}
	assertExportResult(t, manifest, exportProgress)

	var restoreProgress Progress
	receipt, err := Restore(context.Background(), RestoreRequest{
		ArchivePath: archivePath, StagingParent: parent, Key: testKey(4),
		ExpectedOwnerBinding: "owner-hash", ExpectedRuntimeID: "runtime-one",
		ExpectedSourceGeneration: 7, TargetGeneration: 8,
		Progress: func(progress Progress) { restoreProgress = progress },
	})
	if err != nil {
		t.Fatalf("Restore: %v", err)
	}
	assertRoundTripRestore(t, receipt, restoreProgress, len(manifest.Entries), large)
}

func createRoundTripSource(t *testing.T, parent string) (string, []byte) {
	t.Helper()
	source := filepath.Join(parent, "source")
	if err := os.MkdirAll(filepath.Join(source, "repo", "empty"), 0o755); err != nil {
		t.Fatalf("MkdirAll: %v", err)
	}
	files := []struct {
		name    string
		content []byte
		mode    fs.FileMode
	}{
		{name: "repo/file.txt", content: []byte("hello workspace\n"), mode: 0o644},
		{name: "repo/zero", mode: 0o600},
		{name: "repo/script.sh", content: []byte("#!/bin/sh\nexit 0\n"), mode: 0o755},
	}
	for _, file := range files {
		if err := os.WriteFile(filepath.Join(source, file.name), file.content, file.mode); err != nil {
			t.Fatalf("write %s: %v", file.name, err)
		}
	}
	large := make([]byte, envelopeChunkSize*2+137)
	for index := range large {
		large[index] = byte(index)
	}
	if err := os.WriteFile(filepath.Join(source, "large.bin"), large, 0o600); err != nil {
		t.Fatalf("write large: %v", err)
	}
	if err := os.Symlink("file.txt", filepath.Join(source, "repo", "latest")); err != nil {
		t.Fatalf("symlink: %v", err)
	}
	return source, large
}

func assertExportResult(t *testing.T, manifest Manifest, progress Progress) {
	t.Helper()
	if progress.CompletedEntries != len(manifest.Entries) || progress.CompletedBytes != progress.TotalBytes {
		t.Fatalf("export progress = %#v", progress)
	}
	if !slices.Equal(manifest.AuthorityReprovisioning, requiredAuthorityReprovisioning) {
		t.Fatalf("authority reprovisioning = %#v", manifest.AuthorityReprovisioning)
	}
}

func assertRoundTripRestore(
	t *testing.T,
	receipt RestoreReceipt,
	progress Progress,
	expectedEntries int,
	large []byte,
) {
	t.Helper()
	if receipt.Active || !receipt.RequiresActivationFence || !receipt.RequiresCredentialRotation ||
		receipt.SourceGeneration != 7 || receipt.TargetGeneration != 8 || receipt.StagedDirectory == "" {
		t.Fatalf("receipt = %#v", receipt)
	}
	if progress.CompletedEntries != expectedEntries || progress.CompletedBytes != progress.TotalBytes {
		t.Fatalf("restore progress = %#v", progress)
	}
	assertFileContents(t, filepath.Join(receipt.StagedDirectory, "repo", "file.txt"), []byte("hello workspace\n"))
	assertFileContents(t, filepath.Join(receipt.StagedDirectory, "large.bin"), large)
	assertFileContents(t, filepath.Join(receipt.StagedDirectory, "repo", "zero"), nil)
	target, err := os.Readlink(filepath.Join(receipt.StagedDirectory, "repo", "latest"))
	if err != nil || target != "file.txt" {
		t.Fatalf("restored symlink target=%q err=%v", target, err)
	}
	scriptInfo, err := os.Stat(filepath.Join(receipt.StagedDirectory, "repo", "script.sh"))
	if err != nil {
		t.Fatalf("stat script: %v", err)
	}
	if scriptInfo.Mode().Perm() != 0o700 {
		t.Fatalf("script mode = %o, want 700", scriptInfo.Mode().Perm())
	}
}

func TestRestoreRejectsIdentityGenerationAndUnsafeStagingParent(t *testing.T) {
	parent, archivePath := createSimpleExport(t)
	tests := map[string]RestoreRequest{
		"owner mismatch": {
			ExpectedOwnerBinding: "other", ExpectedRuntimeID: "runtime-one",
			ExpectedSourceGeneration: 3, TargetGeneration: 4,
		},
		"runtime mismatch": {
			ExpectedOwnerBinding: "owner", ExpectedRuntimeID: "other",
			ExpectedSourceGeneration: 3, TargetGeneration: 4,
		},
		"generation mismatch": {
			ExpectedOwnerBinding: "owner", ExpectedRuntimeID: "runtime-one",
			ExpectedSourceGeneration: 2, TargetGeneration: 4,
		},
		"non-increasing generation": {
			ExpectedOwnerBinding: "owner", ExpectedRuntimeID: "runtime-one",
			ExpectedSourceGeneration: 3, TargetGeneration: 3,
		},
	}
	for name, request := range tests {
		t.Run(name, func(t *testing.T) {
			request.ArchivePath = archivePath
			request.StagingParent = parent
			request.Key = testKey(5)
			if _, err := Restore(context.Background(), request); !errors.Is(err, ErrInvalidManifest) {
				t.Fatalf("Restore error = %v, want ErrInvalidManifest", err)
			}
			if matches, err := filepath.Glob(filepath.Join(parent, ".setta-inactive-*")); err != nil || len(matches) != 0 {
				t.Fatalf("inactive staging remains: %#v err=%v", matches, err)
			}
		})
	}

	realParent := filepath.Join(parent, "real-parent")
	if err := os.Mkdir(realParent, 0o700); err != nil {
		t.Fatalf("mkdir staging parent: %v", err)
	}
	symlinkParent := filepath.Join(parent, "symlink-parent")
	if err := os.Symlink(realParent, symlinkParent); err != nil {
		t.Fatalf("symlink staging parent: %v", err)
	}
	_, err := Restore(context.Background(), RestoreRequest{
		ArchivePath: archivePath, StagingParent: symlinkParent, Key: testKey(5),
		ExpectedOwnerBinding: "owner", ExpectedRuntimeID: "runtime-one",
		ExpectedSourceGeneration: 3, TargetGeneration: 4,
	})
	if !errors.Is(err, ErrInvalidManifest) {
		t.Fatalf("symlink staging-parent error = %v, want ErrInvalidManifest", err)
	}
}

func TestExportDetectsMutationCancellationAndUnsafeLinkWithoutArtifact(t *testing.T) {
	t.Run("mutation", func(t *testing.T) {
		parent := t.TempDir()
		source := filepath.Join(parent, "source")
		if err := os.Mkdir(source, 0o700); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := os.WriteFile(filepath.Join(source, "a"), []byte("a"), 0o600); err != nil {
			t.Fatalf("write a: %v", err)
		}
		if err := os.WriteFile(filepath.Join(source, "b"), []byte("b"), 0o600); err != nil {
			t.Fatalf("write b: %v", err)
		}
		destination := filepath.Join(parent, "out")
		_, err := Export(context.Background(), ExportRequest{
			SourceDirectory: source, DestinationPath: destination, Key: testKey(6),
			OwnerBinding: "owner", RuntimeID: "runtime", SourceGeneration: 1,
			CreatedAt: time.Date(2026, time.July, 14, 12, 0, 0, 0, time.UTC),
			Progress: func(progress Progress) {
				if progress.CompletedEntries == 1 {
					_ = os.WriteFile(filepath.Join(source, "b"), []byte("changed"), 0o600)
				}
			},
		})
		if !errors.Is(err, ErrSourceChanged) {
			t.Fatalf("Export error = %v, want ErrSourceChanged", err)
		}
		assertAbsentAndNoTemporary(t, parent, destination, ".setta-export-*.tmp")
	})

	t.Run("cancellation", func(t *testing.T) {
		parent := t.TempDir()
		source := filepath.Join(parent, "source")
		if err := os.Mkdir(source, 0o700); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := os.WriteFile(filepath.Join(source, "file"), []byte("value"), 0o600); err != nil {
			t.Fatalf("write: %v", err)
		}
		ctx, cancel := context.WithCancel(context.Background())
		cancel()
		destination := filepath.Join(parent, "out")
		_, err := Export(ctx, ExportRequest{
			SourceDirectory: source, DestinationPath: destination, Key: testKey(6),
			OwnerBinding: "owner", RuntimeID: "runtime", SourceGeneration: 1,
			CreatedAt: time.Date(2026, time.July, 14, 12, 0, 0, 0, time.UTC),
		})
		if !errors.Is(err, context.Canceled) {
			t.Fatalf("Export error = %v, want context.Canceled", err)
		}
		assertAbsentAndNoTemporary(t, parent, destination, ".setta-export-*.tmp")
	})

	t.Run("unsafe link", func(t *testing.T) {
		parent := t.TempDir()
		source := filepath.Join(parent, "source")
		if err := os.Mkdir(source, 0o700); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		if err := os.Symlink("/etc/passwd", filepath.Join(source, "escape")); err != nil {
			t.Fatalf("symlink: %v", err)
		}
		destination := filepath.Join(parent, "out")
		_, err := Export(context.Background(), ExportRequest{
			SourceDirectory: source, DestinationPath: destination, Key: testKey(6),
			OwnerBinding: "owner", RuntimeID: "runtime", SourceGeneration: 1,
			CreatedAt: time.Date(2026, time.July, 14, 12, 0, 0, 0, time.UTC),
		})
		if !errors.Is(err, ErrUnsafePath) {
			t.Fatalf("Export error = %v, want ErrUnsafePath", err)
		}
		assertAbsentAndNoTemporary(t, parent, destination, ".setta-export-*.tmp")
	})

	t.Run("raced file to outside symlink", func(t *testing.T) {
		parent := t.TempDir()
		source := filepath.Join(parent, "source")
		if err := os.Mkdir(source, 0o700); err != nil {
			t.Fatalf("mkdir: %v", err)
		}
		for _, name := range []string{"a", "b"} {
			if err := os.WriteFile(filepath.Join(source, name), []byte(name), 0o600); err != nil {
				t.Fatalf("write %s: %v", name, err)
			}
		}
		outside := filepath.Join(parent, "authority")
		if err := os.WriteFile(outside, []byte("must not be read"), 0o600); err != nil {
			t.Fatalf("write outside: %v", err)
		}
		destination := filepath.Join(parent, "out")
		_, err := Export(context.Background(), ExportRequest{
			SourceDirectory: source, DestinationPath: destination, Key: testKey(6),
			OwnerBinding: "owner", RuntimeID: "runtime", SourceGeneration: 1,
			CreatedAt: time.Date(2026, time.July, 14, 12, 0, 0, 0, time.UTC),
			Progress: func(progress Progress) {
				if progress.CompletedEntries == 1 {
					_ = os.Remove(filepath.Join(source, "b"))
					_ = os.Symlink(outside, filepath.Join(source, "b"))
				}
			},
		})
		if err == nil {
			t.Fatal("Export accepted a raced outside symlink")
		}
		assertAbsentAndNoTemporary(t, parent, destination, ".setta-export-*.tmp")
	})
}

func TestExportDetectsAddedEntryAndConcurrentDestination(t *testing.T) {
	for name, mutate := range map[string]func(string, string){
		"added source entry": func(source string, _ string) {
			_ = os.WriteFile(filepath.Join(source, "added"), []byte("late"), 0o600)
		},
		"concurrent destination": func(_ string, destination string) {
			_ = os.WriteFile(destination, []byte("winner"), 0o600)
		},
	} {
		t.Run(name, func(t *testing.T) {
			parent := t.TempDir()
			source := filepath.Join(parent, "source")
			if err := os.Mkdir(source, 0o700); err != nil {
				t.Fatalf("Mkdir: %v", err)
			}
			if err := os.WriteFile(filepath.Join(source, "file"), []byte("value"), 0o600); err != nil {
				t.Fatalf("WriteFile: %v", err)
			}
			destination := filepath.Join(parent, "archive")
			_, err := Export(context.Background(), ExportRequest{
				SourceDirectory: source, DestinationPath: destination, Key: testKey(9),
				OwnerBinding: "owner", RuntimeID: "runtime", SourceGeneration: 1,
				CreatedAt: time.Date(2026, time.July, 14, 12, 0, 0, 0, time.UTC),
				Progress: func(progress Progress) {
					if progress.CompletedEntries == progress.TotalEntries {
						mutate(source, destination)
					}
				},
			})
			if name == "added source entry" && !errors.Is(err, ErrSourceChanged) {
				t.Fatalf("Export error = %v, want ErrSourceChanged", err)
			}
			if name == "concurrent destination" && !errors.Is(err, ErrDestinationExists) {
				t.Fatalf("Export error = %v, want ErrDestinationExists", err)
			}
			if name == "concurrent destination" {
				assertFileContents(t, destination, []byte("winner"))
			}
		})
	}
}

func TestExportRejectsTemporaryPathSubstitution(t *testing.T) {
	parent := t.TempDir()
	source := filepath.Join(parent, "source")
	if err := os.Mkdir(source, 0o700); err != nil {
		t.Fatalf("Mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(source, "file"), []byte("value"), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	destination := filepath.Join(parent, "archive")
	moved := filepath.Join(parent, "moved-temporary")
	_, err := Export(context.Background(), ExportRequest{
		SourceDirectory: source, DestinationPath: destination, Key: testKey(12),
		OwnerBinding: "owner", RuntimeID: "runtime", SourceGeneration: 1,
		CreatedAt: time.Date(2026, time.July, 14, 12, 0, 0, 0, time.UTC),
		Progress: func(progress Progress) {
			if progress.CompletedEntries != progress.TotalEntries {
				return
			}
			matches, _ := filepath.Glob(filepath.Join(parent, ".setta-export-*.tmp"))
			if len(matches) == 1 {
				_ = os.Rename(matches[0], moved)
				_ = os.WriteFile(matches[0], []byte("replacement"), 0o600)
			}
		},
	})
	if !errors.Is(err, ErrSourceChanged) {
		t.Fatalf("Export error = %v, want ErrSourceChanged", err)
	}
	if _, err := os.Stat(destination); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("destination error = %v, want absent", err)
	}
	if _, err := os.Stat(moved); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("renamed temporary error = %v, want cleaned", err)
	}
}

func TestRestoreRejectsManifestMismatchUnexpectedEntryAndCancellation(t *testing.T) {
	parent := t.TempDir()
	digest := sha256.Sum256([]byte("different"))
	mismatch := validTestManifest([]ManifestEntry{{
		Path: "file", Type: EntryFile, Mode: 0o600, Size: 3, SHA256: hex.EncodeToString(digest[:]),
	}})
	mismatchPath := filepath.Join(parent, "mismatch")
	writeCustomArchive(t, mismatchPath, testKey(7), mismatch, func(writer *tar.Writer) {
		writeTestTarEntry(t, writer, &tar.Header{Name: "file", Typeflag: tar.TypeReg, Mode: 0o600, Size: 3}, []byte("abc"))
	})
	assertRestoreInvalid(t, parent, mismatchPath, "mismatch-destination")

	extra := validTestManifest(nil)
	extraPath := filepath.Join(parent, "extra")
	writeCustomArchive(t, extraPath, testKey(7), extra, func(writer *tar.Writer) {
		writeTestTarEntry(t, writer, &tar.Header{Name: "extra", Typeflag: tar.TypeReg, Mode: 0o600, Size: 1}, []byte("x"))
	})
	assertRestoreInvalid(t, parent, extraPath, "extra-destination")

	_, validArchive := createSimpleExport(t)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err := Restore(ctx, RestoreRequest{
		ArchivePath: validArchive, StagingParent: parent, Key: testKey(5),
		ExpectedOwnerBinding: "owner", ExpectedRuntimeID: "runtime-one",
		ExpectedSourceGeneration: 3, TargetGeneration: 4,
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("Restore cancellation error = %v", err)
	}
	assertNoInactiveStaging(t, parent)
}

func TestRestoreCancellationRemovesPartiallyWrittenGeneration(t *testing.T) {
	parent := t.TempDir()
	source := filepath.Join(parent, "source")
	if err := os.Mkdir(source, 0o700); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	for _, name := range []string{"first", "second"} {
		if err := os.WriteFile(filepath.Join(source, name), []byte(name), 0o600); err != nil {
			t.Fatalf("write %s: %v", name, err)
		}
	}
	archivePath := filepath.Join(parent, "archive")
	_, err := Export(context.Background(), ExportRequest{
		SourceDirectory: source, DestinationPath: archivePath, Key: testKey(8),
		OwnerBinding: "owner", RuntimeID: "runtime", SourceGeneration: 1,
		CreatedAt: time.Date(2026, time.July, 14, 12, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("Export: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	_, err = Restore(ctx, RestoreRequest{
		ArchivePath: archivePath, StagingParent: parent, Key: testKey(8),
		ExpectedOwnerBinding: "owner", ExpectedRuntimeID: "runtime",
		ExpectedSourceGeneration: 1, TargetGeneration: 2,
		Progress: func(progress Progress) {
			if progress.CompletedEntries == 1 {
				cancel()
			}
		},
	})
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("Restore error = %v, want context.Canceled", err)
	}
	assertNoInactiveStaging(t, parent)
}

func TestRestoreRejectsStagingPathSubstitutionAndCleansBothPaths(t *testing.T) {
	parent := t.TempDir()
	source := filepath.Join(parent, "source")
	if err := os.Mkdir(source, 0o700); err != nil {
		t.Fatalf("Mkdir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(source, "file"), []byte("value"), 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	archivePath := filepath.Join(parent, "archive")
	manifest, err := Export(context.Background(), ExportRequest{
		SourceDirectory: source, DestinationPath: archivePath, Key: testKey(13),
		OwnerBinding: "owner", RuntimeID: "runtime", SourceGeneration: 1,
		CreatedAt: time.Date(2026, time.July, 14, 12, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("Export: %v", err)
	}
	staging := filepath.Join(parent, fmt.Sprintf(".setta-inactive-%s-g2", manifest.ExportID))
	moved := filepath.Join(parent, "moved-staging")
	_, err = Restore(context.Background(), RestoreRequest{
		ArchivePath: archivePath, StagingParent: parent, Key: testKey(13),
		ExpectedOwnerBinding: "owner", ExpectedRuntimeID: "runtime",
		ExpectedSourceGeneration: 1, TargetGeneration: 2,
		Progress: func(progress Progress) {
			if progress.CompletedEntries == 1 {
				_ = os.Rename(staging, moved)
				_ = os.Mkdir(staging, 0o700)
			}
		},
	})
	if !errors.Is(err, ErrSourceChanged) {
		t.Fatalf("Restore error = %v, want ErrSourceChanged", err)
	}
	for _, name := range []string{staging, moved} {
		if _, err := os.Stat(name); !errors.Is(err, fs.ErrNotExist) {
			t.Fatalf("substituted path %s error = %v, want cleaned", name, err)
		}
	}
}

func TestRestoreEnvelopeFailuresLeaveNoStaging(t *testing.T) {
	_, validArchive := createSimpleExport(t)
	valid, err := os.ReadFile(validArchive)
	if err != nil {
		t.Fatalf("ReadFile: %v", err)
	}
	for name, artifact := range map[string][]byte{
		"corrupt":   append([]byte(nil), valid...),
		"truncated": append([]byte(nil), valid[:len(valid)-1]...),
	} {
		t.Run(name, func(t *testing.T) {
			parent := t.TempDir()
			if name == "corrupt" {
				artifact[envelopeHeaderSize+frameHeaderSize] ^= 0x80
			}
			archivePath := filepath.Join(parent, "archive")
			if err := os.WriteFile(archivePath, artifact, 0o600); err != nil {
				t.Fatalf("WriteFile: %v", err)
			}
			_, err := Restore(context.Background(), RestoreRequest{
				ArchivePath: archivePath, StagingParent: parent, Key: testKey(5),
				ExpectedOwnerBinding: "owner", ExpectedRuntimeID: "runtime-one",
				ExpectedSourceGeneration: 3, TargetGeneration: 4,
			})
			if !errors.Is(err, ErrInvalidEnvelope) {
				t.Fatalf("Restore error = %v, want ErrInvalidEnvelope", err)
			}
			assertNoInactiveStaging(t, parent)
		})
	}
	parent := t.TempDir()
	archivePath := filepath.Join(parent, "archive")
	if err := os.WriteFile(archivePath, valid, 0o600); err != nil {
		t.Fatalf("WriteFile: %v", err)
	}
	_, err = Restore(context.Background(), RestoreRequest{
		ArchivePath: archivePath, StagingParent: parent, Key: testKey(99),
		ExpectedOwnerBinding: "owner", ExpectedRuntimeID: "runtime-one",
		ExpectedSourceGeneration: 3, TargetGeneration: 4,
	})
	if !errors.Is(err, ErrInvalidEnvelope) {
		t.Fatalf("wrong-key error = %v, want ErrInvalidEnvelope", err)
	}
	assertNoInactiveStaging(t, parent)
}

func TestRestoreRejectsPlaintextAfterTarFooterAndUnsafeSymlink(t *testing.T) {
	parent := t.TempDir()
	manifest := validTestManifest(nil)
	extraPath := filepath.Join(parent, "extra-plaintext")
	file, err := os.OpenFile(extraPath, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		t.Fatalf("OpenFile: %v", err)
	}
	encrypted, err := NewEncryptWriter(file, testKey(7))
	if err != nil {
		t.Fatalf("NewEncryptWriter: %v", err)
	}
	tarWriter := tar.NewWriter(encrypted)
	encoded, _ := json.Marshal(manifest)
	writeTestTarEntry(t, tarWriter, &tar.Header{Name: manifestArchivePath, Typeflag: tar.TypeReg, Mode: 0o600, Size: int64(len(encoded))}, encoded)
	if err := tarWriter.Close(); err != nil {
		t.Fatalf("Close tar: %v", err)
	}
	if _, err := encrypted.Write([]byte("authenticated but unmanifested")); err != nil {
		t.Fatalf("Write trailing plaintext: %v", err)
	}
	if err := encrypted.Close(); err != nil {
		t.Fatalf("Close encryption: %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("Close file: %v", err)
	}
	assertRestoreInvalid(t, parent, extraPath, "unused")

	unsafe := validTestManifest([]ManifestEntry{{
		Path: "link", Type: EntrySymlink, Mode: 0o700, LinkTarget: "../../outside",
	}})
	unsafePath := filepath.Join(parent, "unsafe-link")
	writeCustomArchive(t, unsafePath, testKey(7), unsafe, func(*tar.Writer) {})
	_, err = Restore(context.Background(), RestoreRequest{
		ArchivePath: unsafePath, StagingParent: parent, Key: testKey(7),
		ExpectedOwnerBinding: "owner", ExpectedRuntimeID: "runtime",
		ExpectedSourceGeneration: 1, TargetGeneration: 2,
	})
	if !errors.Is(err, ErrUnsafePath) {
		t.Fatalf("unsafe-symlink error = %v, want ErrUnsafePath", err)
	}
	assertNoInactiveStaging(t, parent)
}

func TestWriteArchiveRejectsOversizedManifestBeforeReadingEntries(t *testing.T) {
	entries := make([]ManifestEntry, maximumEntryCount)
	for index := range entries {
		entries[index] = ManifestEntry{
			Path: fmt.Sprintf("workspace/%06d-%s", index, string(bytes.Repeat([]byte{'x'}, 160))),
			Type: EntryFile, Mode: 0o600,
			SHA256: "0000000000000000000000000000000000000000000000000000000000000000",
		}
	}
	root, err := os.OpenRoot(t.TempDir())
	if err != nil {
		t.Fatalf("OpenRoot: %v", err)
	}
	defer root.Close()
	writer := tar.NewWriter(io.Discard)
	if err := writeArchive(context.Background(), writer, root, validTestManifest(entries), 0, nil); !errors.Is(err, ErrInvalidManifest) {
		t.Fatalf("writeArchive error = %v, want ErrInvalidManifest", err)
	}
}

func TestCopyExactlyHonorsMidFileCancellation(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	reader := &cancelingReader{
		remaining: envelopeChunkSize * 4,
		cancel:    cancel,
	}
	_, err := copyExactly(ctx, io.Discard, reader, uint64(reader.remaining))
	if !errors.Is(err, context.Canceled) {
		t.Fatalf("copyExactly error = %v, want context.Canceled", err)
	}
}

type cancelingReader struct {
	remaining int
	cancel    context.CancelFunc
	read      bool
}

func (reader *cancelingReader) Read(destination []byte) (int, error) {
	if reader.remaining == 0 {
		return 0, io.EOF
	}
	count := min(len(destination), reader.remaining)
	for index := range destination[:count] {
		destination[index] = byte(index)
	}
	reader.remaining -= count
	if !reader.read {
		reader.read = true
		reader.cancel()
	}
	return count, nil
}

func createSimpleExport(t *testing.T) (string, string) {
	t.Helper()
	parent := t.TempDir()
	source := filepath.Join(parent, "source")
	if err := os.Mkdir(source, 0o700); err != nil {
		t.Fatalf("mkdir source: %v", err)
	}
	if err := os.WriteFile(filepath.Join(source, "file"), []byte("value"), 0o600); err != nil {
		t.Fatalf("write source: %v", err)
	}
	archivePath := filepath.Join(parent, "archive")
	_, err := Export(context.Background(), ExportRequest{
		SourceDirectory: source, DestinationPath: archivePath, Key: testKey(5),
		OwnerBinding: "owner", RuntimeID: "runtime-one", SourceGeneration: 3,
		CreatedAt: time.Date(2026, time.July, 14, 12, 0, 0, 0, time.UTC),
	})
	if err != nil {
		t.Fatalf("Export: %v", err)
	}
	return parent, archivePath
}

func validTestManifest(entries []ManifestEntry) Manifest {
	return Manifest{
		Version: manifestVersion, ExportID: "0123456789abcdef0123456789abcdef",
		CreatedAt:    time.Date(2026, time.July, 14, 12, 0, 0, 0, time.UTC),
		OwnerBinding: "owner", RuntimeID: "runtime", SourceGeneration: 1,
		RequiresCredentialRotation: true,
		AuthorityReprovisioning:    append([]string(nil), requiredAuthorityReprovisioning...),
		Entries:                    entries,
	}
}

func writeCustomArchive(
	t *testing.T,
	name string,
	key Key,
	manifest Manifest,
	writeEntries func(*tar.Writer),
) {
	t.Helper()
	file, err := os.OpenFile(name, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		t.Fatalf("create archive: %v", err)
	}
	encrypted, err := NewEncryptWriter(file, key)
	if err != nil {
		t.Fatalf("NewEncryptWriter: %v", err)
	}
	writer := tar.NewWriter(encrypted)
	encoded, err := json.Marshal(manifest)
	if err != nil {
		t.Fatalf("Marshal manifest: %v", err)
	}
	writeTestTarEntry(t, writer, &tar.Header{
		Name: manifestArchivePath, Typeflag: tar.TypeReg, Mode: 0o600, Size: int64(len(encoded)),
	}, encoded)
	writeEntries(writer)
	if err := writer.Close(); err != nil {
		t.Fatalf("close tar: %v", err)
	}
	if err := encrypted.Close(); err != nil {
		t.Fatalf("close encryption: %v", err)
	}
	if err := file.Close(); err != nil {
		t.Fatalf("close archive: %v", err)
	}
}

func writeTestTarEntry(t *testing.T, writer *tar.Writer, header *tar.Header, content []byte) {
	t.Helper()
	header.Format = tar.FormatPAX
	if err := writer.WriteHeader(header); err != nil {
		t.Fatalf("WriteHeader: %v", err)
	}
	if len(content) > 0 {
		if _, err := writer.Write(content); err != nil {
			t.Fatalf("Write: %v", err)
		}
	}
}

func assertRestoreInvalid(t *testing.T, parent string, archivePath string, _ string) {
	t.Helper()
	_, err := Restore(context.Background(), RestoreRequest{
		ArchivePath: archivePath, StagingParent: parent, Key: testKey(7),
		ExpectedOwnerBinding: "owner", ExpectedRuntimeID: "runtime",
		ExpectedSourceGeneration: 1, TargetGeneration: 2,
	})
	if !errors.Is(err, ErrInvalidManifest) {
		t.Fatalf("Restore error = %v, want ErrInvalidManifest", err)
	}
	assertNoInactiveStaging(t, parent)
}

func assertNoInactiveStaging(t *testing.T, parent string) {
	t.Helper()
	matches, err := filepath.Glob(filepath.Join(parent, ".setta-inactive-*"))
	if err != nil {
		t.Fatalf("Glob: %v", err)
	}
	if len(matches) != 0 {
		t.Fatalf("inactive staging remains: %#v", matches)
	}
}

func assertAbsentAndNoTemporary(t *testing.T, parent string, destination string, pattern string) {
	t.Helper()
	if _, err := os.Stat(destination); !errors.Is(err, fs.ErrNotExist) {
		t.Fatalf("destination error = %v, want absent", err)
	}
	matches, err := filepath.Glob(filepath.Join(parent, pattern))
	if err != nil {
		t.Fatalf("Glob: %v", err)
	}
	if len(matches) != 0 {
		t.Fatalf("temporary artifacts remain: %#v", matches)
	}
}

func assertFileContents(t *testing.T, name string, expected []byte) {
	t.Helper()
	actual, err := os.ReadFile(name)
	if err != nil {
		t.Fatalf("ReadFile %s: %v", name, err)
	}
	if !slices.Equal(actual, expected) {
		t.Fatalf("contents %s length=%d, want %d", name, len(actual), len(expected))
	}
}
