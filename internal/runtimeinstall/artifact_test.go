package runtimeinstall

import (
	"archive/tar"
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

func TestBinarySHA256FromArchiveAcceptsSafeDirectoryEntry(t *testing.T) {
	binaryName := "setta_v1_linux_amd64/setta"
	binary := []byte("setta binary\n")
	archivePath := writeArtifactTestArchive(t, []artifactTestEntry{
		{header: tar.Header{Name: "setta_v1_linux_amd64/", Typeflag: tar.TypeDir, Mode: 0o755}},
		{header: tar.Header{Name: binaryName, Typeflag: tar.TypeReg, Mode: 0o755}, payload: binary},
	})

	got, err := binarySHA256FromArchive(archivePath, binaryName)
	if err != nil {
		t.Fatalf("binarySHA256FromArchive: %v", err)
	}
	want := fmt.Sprintf("%x", sha256.Sum256(binary))
	if got != want {
		t.Fatalf("binary SHA256 = %s, want %s", got, want)
	}
}

func TestBinarySHA256FromArchiveStillRejectsUnsafeFileEntries(t *testing.T) {
	testCases := map[string]string{
		"parent":   "../setta",
		"absolute": "/setta",
		"unclean":  "setta_v1_linux_amd64//setta",
		"dot path": "setta_v1_linux_amd64/./setta",
	}
	for name, unsafeName := range testCases {
		t.Run(name, func(t *testing.T) {
			archivePath := writeArtifactTestArchive(t, []artifactTestEntry{
				{header: tar.Header{Name: unsafeName, Typeflag: tar.TypeReg, Mode: 0o755}, payload: []byte("unsafe")},
			})

			_, err := binarySHA256FromArchive(archivePath, "setta_v1_linux_amd64/setta")
			if !errors.Is(err, ErrInvalidRelease) {
				t.Fatalf("binarySHA256FromArchive error = %v, want ErrInvalidRelease", err)
			}
		})
	}
}

func TestBinarySHA256FromArchiveRejectsLinkAfterBinary(t *testing.T) {
	binaryName := "setta_v1_linux_amd64/setta"
	archivePath := writeArtifactTestArchive(t, []artifactTestEntry{
		{header: tar.Header{Name: binaryName, Typeflag: tar.TypeReg, Mode: 0o755}, payload: []byte("setta binary")},
		{header: tar.Header{
			Name:     "setta_v1_linux_amd64/escape",
			Typeflag: tar.TypeSymlink,
			Linkname: "../../etc/passwd",
			Mode:     0o777,
		}},
	})

	_, err := binarySHA256FromArchive(archivePath, binaryName)
	if !errors.Is(err, ErrInvalidRelease) {
		t.Fatalf("binarySHA256FromArchive error = %v, want ErrInvalidRelease", err)
	}
}

type artifactTestEntry struct {
	header  tar.Header
	payload []byte
}

func writeArtifactTestArchive(t *testing.T, entries []artifactTestEntry) string {
	t.Helper()
	var archive bytes.Buffer
	gzipWriter := gzip.NewWriter(&archive)
	tarWriter := tar.NewWriter(gzipWriter)
	for _, entry := range entries {
		header := entry.header
		header.Size = int64(len(entry.payload))
		if err := tarWriter.WriteHeader(&header); err != nil {
			t.Fatalf("write tar header %s: %v", header.Name, err)
		}
		if len(entry.payload) > 0 {
			if _, err := tarWriter.Write(entry.payload); err != nil {
				t.Fatalf("write tar payload %s: %v", header.Name, err)
			}
		}
	}
	if err := tarWriter.Close(); err != nil {
		t.Fatalf("close tar: %v", err)
	}
	if err := gzipWriter.Close(); err != nil {
		t.Fatalf("close gzip: %v", err)
	}
	archivePath := filepath.Join(t.TempDir(), "release.tar.gz")
	if err := os.WriteFile(archivePath, archive.Bytes(), 0o644); err != nil {
		t.Fatalf("write archive: %v", err)
	}
	return archivePath
}
