package runtimebackup

import (
	"archive/tar"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"

	"setta/internal/jsonio"
)

const maximumManifestBytes = 16 << 20

// RestoreRequest verifies an encrypted artifact into a new inactive runtime
// generation. Activation and source fencing are intentionally outside this
// package.
type RestoreRequest struct {
	ArchivePath              string
	StagingParent            string
	Key                      Key
	ExpectedOwnerBinding     string
	ExpectedRuntimeID        string
	ExpectedSourceGeneration uint64
	TargetGeneration         uint64
	Progress                 ProgressFunc
}

// RestoreReceipt proves local artifact verification only. Active is always
// false; a future durable control plane must fence the source, rotate credential
// authority, attest the target, and atomically switch the active binding.
type RestoreReceipt struct {
	ExportID                   string
	RuntimeID                  string
	SourceGeneration           uint64
	TargetGeneration           uint64
	Active                     bool
	RequiresActivationFence    bool
	RequiresCredentialRotation bool
	StagedDirectory            string
}

// Restore decrypts and validates into a package-named directory below a
// private, non-workload-writable StagingParent. That directory is retained only
// after complete validation and is never an active assignment or a
// caller-selected publication target. Future activation must use the returned
// receipt and re-attest its content; it must not discover staging directories
// by scanning names.
func Restore(ctx context.Context, request RestoreRequest) (receipt RestoreReceipt, resultErr error) {
	if err := validateRestoreRequest(ctx, request); err != nil {
		return RestoreReceipt{}, err
	}
	parentRoot, parentInfo, err := openStableRoot(request.StagingParent)
	if err != nil {
		return RestoreReceipt{}, err
	}
	defer parentRoot.Close()
	archive, err := os.Open(request.ArchivePath)
	if err != nil {
		return RestoreReceipt{}, err
	}
	defer archive.Close()
	decrypted, err := NewDecryptReader(archive, request.Key)
	if err != nil {
		return RestoreReceipt{}, err
	}
	tarReader := tar.NewReader(decrypted)
	manifest, err := readManifest(tarReader)
	if err != nil {
		return RestoreReceipt{}, err
	}
	if !matchesRestoreIdentity(manifest, request) {
		return RestoreReceipt{}, fmt.Errorf("%w: restore identity mismatch", ErrInvalidManifest)
	}
	session, err := startRestoreSession(parentRoot, parentInfo, request, manifest)
	if err != nil {
		return RestoreReceipt{}, err
	}
	defer func() {
		if cleanupErr := session.cleanup(); cleanupErr != nil {
			resultErr = errors.Join(resultErr, cleanupErr)
		}
	}()
	if err := restoreAndValidateContents(ctx, session.root, tarReader, decrypted, manifest, request.Progress); err != nil {
		return RestoreReceipt{}, err
	}
	if err := session.publish(); err != nil {
		return RestoreReceipt{}, err
	}
	return RestoreReceipt{
		ExportID:                   manifest.ExportID,
		RuntimeID:                  manifest.RuntimeID,
		SourceGeneration:           manifest.SourceGeneration,
		TargetGeneration:           request.TargetGeneration,
		Active:                     false,
		RequiresActivationFence:    true,
		RequiresCredentialRotation: true,
		StagedDirectory:            session.stagingPath,
	}, nil
}

func restoreAndValidateContents(
	ctx context.Context,
	root *os.Root,
	tarReader *tar.Reader,
	decrypted io.Reader,
	manifest Manifest,
	progress ProgressFunc,
) error {
	symlinks, err := restoreManifestEntries(ctx, root, tarReader, manifest, progress)
	if err != nil {
		return err
	}
	if err := validateArchiveEnd(ctx, tarReader, decrypted); err != nil {
		return err
	}
	return finalizeRestoredContent(root, manifest, symlinks)
}

type restoreSession struct {
	parentRoot    *os.Root
	parentInfo    fs.FileInfo
	root          *os.Root
	stagingInfo   fs.FileInfo
	stagingName   string
	stagingPath   string
	stagingParent string
	rootClosed    bool
	published     bool
}

func validateRestoreRequest(ctx context.Context, request RestoreRequest) error {
	if ctx == nil || !filepath.IsAbs(request.ArchivePath) || !filepath.IsAbs(request.StagingParent) {
		return fmt.Errorf("%w: incomplete restore request", ErrInvalidManifest)
	}
	if request.Key == (Key{}) || request.ExpectedOwnerBinding == "" || request.ExpectedRuntimeID == "" {
		return fmt.Errorf("%w: incomplete restore request", ErrInvalidManifest)
	}
	if request.ExpectedSourceGeneration == 0 || request.TargetGeneration <= request.ExpectedSourceGeneration {
		return fmt.Errorf("%w: incomplete restore request", ErrInvalidManifest)
	}
	return ctx.Err()
}

func matchesRestoreIdentity(manifest Manifest, request RestoreRequest) bool {
	return manifest.OwnerBinding == request.ExpectedOwnerBinding &&
		manifest.RuntimeID == request.ExpectedRuntimeID &&
		manifest.SourceGeneration == request.ExpectedSourceGeneration
}

func startRestoreSession(
	parentRoot *os.Root,
	parentInfo fs.FileInfo,
	request RestoreRequest,
	manifest Manifest,
) (*restoreSession, error) {
	stagingName := fmt.Sprintf(".setta-inactive-%s-g%d", manifest.ExportID, request.TargetGeneration)
	if err := parentRoot.Mkdir(stagingName, 0o700); err != nil {
		if errors.Is(err, fs.ErrExist) {
			return nil, ErrDestinationExists
		}
		return nil, err
	}
	session := &restoreSession{
		parentRoot: parentRoot, parentInfo: parentInfo, stagingName: stagingName,
		stagingPath:   filepath.Join(request.StagingParent, stagingName),
		stagingParent: request.StagingParent,
	}
	root, err := parentRoot.OpenRoot(stagingName)
	if err != nil {
		return nil, session.abort(err)
	}
	session.root = root
	session.stagingInfo, err = root.Stat(".")
	if err != nil {
		return nil, session.abort(err)
	}
	return session, nil
}

func (session *restoreSession) abort(cause error) error {
	cleanupErr := session.cleanup()
	if cleanupErr == nil {
		return cause
	}
	return errors.Join(cause, cleanupErr)
}

func (session *restoreSession) cleanup() error {
	if session.published {
		return nil
	}
	if session.root != nil && !session.rootClosed {
		_ = session.root.Close()
		session.rootClosed = true
	}
	err := cleanupRootEntry(session.parentRoot, session.stagingName, session.stagingInfo)
	if err == nil {
		return nil
	}
	return &PartialCleanupError{Path: session.stagingPath, Err: err}
}

func restoreManifestEntries(
	ctx context.Context,
	root *os.Root,
	reader *tar.Reader,
	manifest Manifest,
	progressFunc ProgressFunc,
) ([]ManifestEntry, error) {
	progress := Progress{TotalEntries: len(manifest.Entries), TotalBytes: manifestTotalBytes(manifest)}
	symlinks := make([]ManifestEntry, 0)
	for _, expected := range manifest.Entries {
		if err := ctx.Err(); err != nil {
			return nil, err
		}
		header, err := reader.Next()
		if err != nil {
			return nil, fmt.Errorf("%w: missing archive entry: %v", ErrInvalidManifest, err)
		}
		if err := validateTarHeader(header, expected); err != nil {
			return nil, err
		}
		if err := restoreEntry(ctx, root, reader, expected, &symlinks); err != nil {
			return nil, err
		}
		progress.CompletedEntries++
		progress.CompletedBytes += expected.Size
		if progressFunc != nil {
			progressFunc(progress)
		}
	}
	return symlinks, nil
}

func restoreEntry(
	ctx context.Context,
	root *os.Root,
	reader io.Reader,
	expected ManifestEntry,
	symlinks *[]ManifestEntry,
) error {
	switch expected.Type {
	case EntryDirectory:
		return root.Mkdir(expected.Path, fs.FileMode(expected.Mode))
	case EntryFile:
		return restoreFile(ctx, root, reader, expected)
	case EntrySymlink:
		*symlinks = append(*symlinks, expected)
		return nil
	default:
		return ErrInvalidManifest
	}
}

func validateArchiveEnd(ctx context.Context, tarReader *tar.Reader, decrypted io.Reader) error {
	header, err := tarReader.Next()
	if err == nil || header != nil || !errors.Is(err, io.EOF) {
		return fmt.Errorf("%w: unexpected archive entry", ErrInvalidManifest)
	}
	return requireAuthenticatedEOF(ctx, decrypted)
}

func finalizeRestoredContent(root *os.Root, manifest Manifest, symlinks []ManifestEntry) error {
	for _, symlink := range symlinks {
		if err := root.Symlink(symlink.LinkTarget, symlink.Path); err != nil {
			return err
		}
	}
	return syncRestoredDirectories(root, manifest)
}

func (session *restoreSession) publish() error {
	if err := session.root.Close(); err != nil {
		return err
	}
	session.rootClosed = true
	currentParent, err := os.Lstat(session.stagingParent)
	if err != nil || !os.SameFile(session.parentInfo, currentParent) {
		return ErrSourceChanged
	}
	if err := syncRootDirectory(session.parentRoot); err != nil {
		return err
	}
	namedInfo, err := session.parentRoot.Lstat(session.stagingName)
	if err != nil || !os.SameFile(session.stagingInfo, namedInfo) {
		return ErrSourceChanged
	}
	session.published = true
	return nil
}

func requireAuthenticatedEOF(ctx context.Context, reader io.Reader) error {
	var trailing [1]byte
	for {
		if err := ctx.Err(); err != nil {
			return err
		}
		count, err := reader.Read(trailing[:])
		if count != 0 {
			return fmt.Errorf("%w: plaintext after archive footer", ErrInvalidManifest)
		}
		if errors.Is(err, io.EOF) {
			return nil
		}
		if err != nil {
			return err
		}
	}
}

func syncRestoredDirectories(root *os.Root, manifest Manifest) error {
	directories := []string{"."}
	for _, entry := range manifest.Entries {
		if entry.Type == EntryDirectory {
			directories = append(directories, entry.Path)
		}
	}
	sort.Slice(directories, func(first int, second int) bool {
		return len(directories[first]) > len(directories[second])
	})
	for _, name := range directories {
		directory, err := root.Open(name)
		if err != nil {
			return err
		}
		if err := directory.Sync(); err != nil {
			_ = directory.Close()
			return err
		}
		if err := directory.Close(); err != nil {
			return err
		}
	}
	return nil
}

func readManifest(reader *tar.Reader) (Manifest, error) {
	header, err := reader.Next()
	if err != nil {
		return Manifest{}, fmt.Errorf("%w: manifest: %w", ErrInvalidManifest, err)
	}
	if header.Name != manifestArchivePath || header.Typeflag != tar.TypeReg || header.Size < 0 ||
		header.Size > maximumManifestBytes || header.Linkname != "" {
		return Manifest{}, ErrInvalidManifest
	}
	var manifest Manifest
	if err := jsonio.DecodeSingle(io.LimitReader(reader, header.Size), &manifest); err != nil {
		return Manifest{}, fmt.Errorf("%w: decode: %w", ErrInvalidManifest, err)
	}
	if err := validateManifest(manifest); err != nil {
		return Manifest{}, err
	}
	return manifest, nil
}

func validateTarHeader(header *tar.Header, expected ManifestEntry) error {
	if !matchesPortableTarMetadata(header, expected) {
		return fmt.Errorf("%w: archive metadata for %q", ErrInvalidManifest, expected.Path)
	}
	typeflag, linkname, ok := expectedTarType(expected)
	if !ok || header.Typeflag != typeflag || header.Linkname != linkname {
		return ErrInvalidManifest
	}
	return nil
}

func matchesPortableTarMetadata(header *tar.Header, expected ManifestEntry) bool {
	return header.Name == expected.Path &&
		header.Mode == int64(expected.Mode) &&
		header.Size == int64(expected.Size) &&
		header.Uid == 0 && header.Gid == 0 &&
		header.Uname == "" && header.Gname == "" && len(header.Xattrs) == 0
}

func expectedTarType(expected ManifestEntry) (byte, string, bool) {
	switch expected.Type {
	case EntryDirectory:
		return tar.TypeDir, "", true
	case EntryFile:
		return tar.TypeReg, "", true
	case EntrySymlink:
		return tar.TypeSymlink, expected.LinkTarget, true
	default:
		return 0, "", false
	}
}

func restoreFile(ctx context.Context, root *os.Root, reader io.Reader, expected ManifestEntry) error {
	file, err := root.OpenFile(expected.Path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, fs.FileMode(expected.Mode))
	if err != nil {
		return err
	}
	defer file.Close()
	digest := sha256.New()
	remaining := expected.Size
	buffer := make([]byte, 64*1024)
	for remaining > 0 {
		if err := ctx.Err(); err != nil {
			return err
		}
		count := min(uint64(len(buffer)), remaining)
		readCount, err := io.ReadFull(reader, buffer[:count])
		if err != nil {
			return fmt.Errorf("%w: file content: %v", ErrInvalidManifest, err)
		}
		if _, err := file.Write(buffer[:readCount]); err != nil {
			return err
		}
		if _, err := digest.Write(buffer[:readCount]); err != nil {
			return err
		}
		remaining -= uint64(readCount)
	}
	if hex.EncodeToString(digest.Sum(nil)) != expected.SHA256 {
		return fmt.Errorf("%w: digest for %q", ErrInvalidManifest, expected.Path)
	}
	if err := file.Sync(); err != nil {
		return err
	}
	return file.Close()
}

func manifestTotalBytes(manifest Manifest) uint64 {
	var total uint64
	for _, entry := range manifest.Entries {
		total += entry.Size
	}
	return total
}
