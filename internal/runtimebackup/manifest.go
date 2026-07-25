package runtimebackup

import (
	"crypto/rand"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"path"
	"strings"
	"time"
)

const (
	manifestVersion     = 1
	manifestArchivePath = ".setta-export/manifest.json"
	maximumEntryCount   = 100_000
	maximumTotalBytes   = 100 << 30
	maximumFileBytes    = 100 << 30
)

var (
	// ErrInvalidManifest identifies incomplete or inconsistent export metadata.
	ErrInvalidManifest = errors.New("invalid runtime backup manifest")
	// ErrUnsafePath identifies an archive path or link that is not portable and
	// contained within the prepared snapshot.
	ErrUnsafePath = errors.New("unsafe runtime backup path")
)

// EntryType is the supported portable snapshot file type.
type EntryType string

const (
	EntryDirectory EntryType = "directory"
	EntryFile      EntryType = "file"
	EntrySymlink   EntryType = "symlink"
)

// ManifestEntry describes one authenticated archive entry.
type ManifestEntry struct {
	Path       string    `json:"path"`
	Type       EntryType `json:"type"`
	Mode       uint32    `json:"mode"`
	Size       uint64    `json:"size,omitempty"`
	SHA256     string    `json:"sha256,omitempty"`
	LinkTarget string    `json:"link_target,omitempty"`
}

// Manifest is encrypted inside the export. It contains no credentials or
// provider SDK values.
type Manifest struct {
	Version                    int             `json:"version"`
	ExportID                   string          `json:"export_id"`
	CreatedAt                  time.Time       `json:"created_at"`
	OwnerBinding               string          `json:"owner_binding"`
	RuntimeID                  string          `json:"runtime_id"`
	SourceGeneration           uint64          `json:"source_generation"`
	RequiresCredentialRotation bool            `json:"requires_credential_rotation"`
	AuthorityReprovisioning    []string        `json:"authority_reprovisioning"`
	Entries                    []ManifestEntry `json:"entries"`
}

// requiredAuthorityReprovisioning names authority that a restored generation
// must receive afresh before activation. This is deliberately not represented
// as proof about arbitrary user content inside a prepared snapshot.
var requiredAuthorityReprovisioning = []string{
	"codex_and_model_credentials",
	"diagnostics",
	"provider_credentials",
	"runtime_access_authority",
	"runtime_identity",
	"terminal_environment",
	"web_push_credentials",
}

func newExportID() (string, error) {
	value := make([]byte, 16)
	if _, err := rand.Read(value); err != nil {
		return "", err
	}
	return hex.EncodeToString(value), nil
}

func validateManifest(manifest Manifest) error {
	if err := validateManifestMetadata(manifest); err != nil {
		return err
	}
	if err := validateManifestEntries(manifest.Entries); err != nil {
		return err
	}
	return validateEntryGraph(manifest.Entries)
}

func validateManifestMetadata(manifest Manifest) error {
	if manifest.Version != manifestVersion || len(manifest.ExportID) != 32 {
		return ErrInvalidManifest
	}
	if manifest.CreatedAt.IsZero() || manifest.OwnerBinding == "" || manifest.RuntimeID == "" {
		return ErrInvalidManifest
	}
	if manifest.SourceGeneration == 0 || !manifest.RequiresCredentialRotation {
		return ErrInvalidManifest
	}
	if len(manifest.Entries) > maximumEntryCount ||
		!equalStrings(manifest.AuthorityReprovisioning, requiredAuthorityReprovisioning) {
		return ErrInvalidManifest
	}
	if _, err := hex.DecodeString(manifest.ExportID); err != nil {
		return ErrInvalidManifest
	}
	return nil
}

func validateManifestEntries(entries []ManifestEntry) error {
	seen := make(map[string]struct{}, len(entries))
	var total uint64
	for _, entry := range entries {
		if err := validateEntry(entry); err != nil {
			return err
		}
		if _, duplicate := seen[entry.Path]; duplicate {
			return fmt.Errorf("%w: duplicate %q", ErrInvalidManifest, entry.Path)
		}
		seen[entry.Path] = struct{}{}
		if total > maximumTotalBytes-entry.Size {
			return ErrInvalidManifest
		}
		total += entry.Size
	}
	return nil
}

func validateEntryGraph(entries []ManifestEntry) error {
	byPath := make(map[string]ManifestEntry, len(entries))
	for _, entry := range entries {
		byPath[entry.Path] = entry
	}
	for _, entry := range entries {
		for ancestor := path.Dir(entry.Path); ancestor != "."; ancestor = path.Dir(ancestor) {
			if parent, exists := byPath[ancestor]; exists && parent.Type != EntryDirectory {
				return fmt.Errorf("%w: non-directory ancestor %q", ErrInvalidManifest, ancestor)
			}
		}
		if entry.Type != EntrySymlink {
			continue
		}
		visited := map[string]struct{}{entry.Path: {}}
		current := path.Clean(path.Join(path.Dir(entry.Path), entry.LinkTarget))
		for {
			target, exists := byPath[current]
			if !exists {
				return fmt.Errorf("%w: dangling symlink %q", ErrInvalidManifest, entry.Path)
			}
			if target.Type != EntrySymlink {
				break
			}
			if _, cycle := visited[current]; cycle {
				return fmt.Errorf("%w: cyclic symlink %q", ErrInvalidManifest, entry.Path)
			}
			visited[current] = struct{}{}
			current = path.Clean(path.Join(path.Dir(current), target.LinkTarget))
		}
	}
	return nil
}

func validateEntry(entry ManifestEntry) error {
	if err := validateArchivePath(entry.Path); err != nil {
		return err
	}
	switch entry.Type {
	case EntryDirectory:
		return validateDirectoryEntry(entry)
	case EntryFile:
		return validateFileEntry(entry)
	case EntrySymlink:
		return validateSymlinkEntry(entry)
	default:
		return ErrInvalidManifest
	}
}

func validateDirectoryEntry(entry ManifestEntry) error {
	if entry.Size != 0 || entry.SHA256 != "" || entry.LinkTarget != "" || entry.Mode != 0o700 {
		return ErrInvalidManifest
	}
	return nil
}

func validateFileEntry(entry ManifestEntry) error {
	if entry.Size > maximumFileBytes || len(entry.SHA256) != 64 || entry.LinkTarget != "" {
		return ErrInvalidManifest
	}
	if entry.Mode != 0o600 && entry.Mode != 0o700 {
		return ErrInvalidManifest
	}
	if _, err := hex.DecodeString(entry.SHA256); err != nil {
		return ErrInvalidManifest
	}
	return nil
}

func validateSymlinkEntry(entry ManifestEntry) error {
	if entry.Size != 0 || entry.SHA256 != "" || entry.Mode != 0o700 {
		return ErrInvalidManifest
	}
	return validateSymlinkTarget(entry.Path, entry.LinkTarget)
}

func validateArchivePath(name string) error {
	if name == "" || name == "." || name == manifestArchivePath || strings.HasPrefix(name, ".setta-export/") ||
		strings.ContainsAny(name, "\\:") || !fs.ValidPath(name) {
		return fmt.Errorf("%w: %q", ErrUnsafePath, name)
	}
	return nil
}

func validateSymlinkTarget(entryPath string, target string) error {
	if target == "" || strings.ContainsAny(target, "\\:") || strings.HasPrefix(target, "/") {
		return fmt.Errorf("%w: link target %q", ErrUnsafePath, target)
	}
	resolved := path.Clean(path.Join(path.Dir(entryPath), target))
	if resolved == "." || resolved == ".." || strings.HasPrefix(resolved, "../") || !fs.ValidPath(resolved) {
		return fmt.Errorf("%w: link target %q", ErrUnsafePath, target)
	}
	return nil
}

func normalizedMode(info fs.FileInfo, entryType EntryType) uint32 {
	if entryType == EntryDirectory || entryType == EntrySymlink {
		return 0o700
	}
	return uint32(0o600 | (info.Mode().Perm() & 0o100))
}

func equalStrings(first []string, second []string) bool {
	if len(first) != len(second) {
		return false
	}
	for index := range first {
		if first[index] != second[index] {
			return false
		}
	}
	return true
}
