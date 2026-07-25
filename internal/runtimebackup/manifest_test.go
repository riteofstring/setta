package runtimebackup

import (
	"errors"
	"testing"
)

func TestPortablePathValidationRejectsTraversalAndPlatformAmbiguity(t *testing.T) {
	for _, value := range []string{"", ".", "../escape", "a/../escape", "/absolute", `C:\\escape`, `a\\b`, "a:b", manifestArchivePath} {
		if err := validateArchivePath(value); !errors.Is(err, ErrUnsafePath) {
			t.Fatalf("path %q error = %v, want ErrUnsafePath", value, err)
		}
	}
	for _, value := range []string{"repo", "repo/file.txt", ".config/value"} {
		if err := validateArchivePath(value); err != nil {
			t.Fatalf("path %q: %v", value, err)
		}
	}
}

func TestSymlinkValidationContainsTargets(t *testing.T) {
	for _, target := range []string{"", "/etc/passwd", "../../escape", `C:\\escape`, `..\\escape`} {
		if err := validateSymlinkTarget("repo/link", target); !errors.Is(err, ErrUnsafePath) {
			t.Fatalf("target %q error = %v, want ErrUnsafePath", target, err)
		}
	}
	for _, target := range []string{"target", "../shared/file"} {
		if err := validateSymlinkTarget("repo/link", target); err != nil {
			t.Fatalf("target %q: %v", target, err)
		}
	}
}

func TestManifestRejectsDanglingCyclicAndAncestorConflicts(t *testing.T) {
	base := validTestManifest(nil)
	tests := map[string][]ManifestEntry{
		"dangling": {
			{Path: "link", Type: EntrySymlink, Mode: 0o700, LinkTarget: "missing"},
		},
		"cycle": {
			{Path: "first", Type: EntrySymlink, Mode: 0o700, LinkTarget: "second"},
			{Path: "second", Type: EntrySymlink, Mode: 0o700, LinkTarget: "first"},
		},
		"file ancestor": {
			{Path: "parent", Type: EntryFile, Mode: 0o600, SHA256: "0000000000000000000000000000000000000000000000000000000000000000"},
			{Path: "parent/child", Type: EntryFile, Mode: 0o600, SHA256: "0000000000000000000000000000000000000000000000000000000000000000"},
		},
	}
	for name, entries := range tests {
		t.Run(name, func(t *testing.T) {
			manifest := base
			manifest.Entries = entries
			if err := validateManifest(manifest); !errors.Is(err, ErrInvalidManifest) {
				t.Fatalf("validateManifest error = %v, want ErrInvalidManifest", err)
			}
		})
	}
}
