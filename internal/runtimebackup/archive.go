package runtimebackup

import (
	"archive/tar"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"io"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"time"
)

var (
	// ErrSourceChanged identifies a prepared snapshot mutated during export.
	ErrSourceChanged = errors.New("runtime backup source changed during export")
	// ErrDestinationExists prevents export from replacing an existing artifact.
	ErrDestinationExists = errors.New("runtime backup destination exists")
	// ErrCommitDurabilityUncertain means an exclusive publication succeeded but
	// syncing its parent directory failed. The path named by CommittedError must
	// be inspected before retrying.
	ErrCommitDurabilityUncertain = errors.New("runtime backup commit durability uncertain")
	// ErrPartialCleanup identifies a failed attempt to remove an incomplete
	// inactive restore.
	ErrPartialCleanup = errors.New("runtime backup partial cleanup failed")
)

// CommittedError reports a published path whose directory durability could not
// be confirmed. It prevents callers from treating a retry as harmless.
type CommittedError struct {
	Path string
	Err  error
}

func (failure *CommittedError) Error() string {
	return fmt.Sprintf("%v for %q: %v", ErrCommitDurabilityUncertain, failure.Path, failure.Err)
}

func (failure *CommittedError) Unwrap() error { return ErrCommitDurabilityUncertain }

// PartialCleanupError reports an incomplete restore path that may remain.
type PartialCleanupError struct {
	Path string
	Err  error
}

func (failure *PartialCleanupError) Error() string {
	return fmt.Sprintf("%v for %q: %v", ErrPartialCleanup, failure.Path, failure.Err)
}

func (failure *PartialCleanupError) Unwrap() []error {
	return []error{ErrPartialCleanup, failure.Err}
}

// Progress contains no paths or user content.
type Progress struct {
	CompletedEntries int
	TotalEntries     int
	CompletedBytes   uint64
	TotalBytes       uint64
}

// ProgressFunc receives content-free export or restore progress.
type ProgressFunc func(Progress)

// ExportRequest describes one immutable prepared-snapshot export.
type ExportRequest struct {
	SourceDirectory  string
	DestinationPath  string
	Key              Key
	OwnerBinding     string
	RuntimeID        string
	SourceGeneration uint64
	CreatedAt        time.Time
	Progress         ProgressFunc
}

// Export writes an encrypted artifact atomically. SourceDirectory must be an
// immutable, content-selected, quiesced prepared snapshot with no
// workload-controlled mounts. DestinationPath's parent must be a private,
// non-workload-writable directory. Selecting portable content and excluding
// runtime/provider authority is the snapshot producer's responsibility;
// AuthorityReprovisioning is an activation requirement, not a claim that this
// package inspected user files for secrets.
func Export(ctx context.Context, request ExportRequest) (Manifest, error) {
	if err := validateExportRequest(ctx, request); err != nil {
		return Manifest{}, err
	}
	if err := requireAbsentDestination(request.DestinationPath); err != nil {
		return Manifest{}, err
	}
	root, err := openPreparedSnapshot(request.SourceDirectory)
	if err != nil {
		return Manifest{}, err
	}
	defer root.Close()
	entries, totalBytes, err := scanSnapshot(ctx, root)
	if err != nil {
		return Manifest{}, err
	}
	manifest, err := buildManifest(request, entries)
	if err != nil {
		return Manifest{}, err
	}
	artifact, err := newExportArtifact(request.DestinationPath, manifest.ExportID)
	if err != nil {
		return Manifest{}, err
	}
	defer artifact.close()
	if err := artifact.file.Chmod(0o600); err != nil {
		return Manifest{}, err
	}
	if err := writeExportArtifact(ctx, artifact, root, manifest, entries, totalBytes, request); err != nil {
		return Manifest{}, err
	}
	if err := artifact.publish(); err != nil {
		return Manifest{}, err
	}
	return manifest, nil
}

func writeExportArtifact(
	ctx context.Context,
	artifact *exportArtifact,
	root *os.Root,
	manifest Manifest,
	entries []ManifestEntry,
	totalBytes uint64,
	request ExportRequest,
) error {
	encrypted, err := NewEncryptWriter(artifact.file, request.Key)
	if err != nil {
		return err
	}
	tarWriter := tar.NewWriter(encrypted)
	if err := writeArchive(ctx, tarWriter, root, manifest, totalBytes, request.Progress); err != nil {
		return err
	}
	if err := verifySnapshotUnchanged(ctx, root, entries, totalBytes); err != nil {
		return err
	}
	return artifact.seal(tarWriter, encrypted)
}

type exportArtifact struct {
	root            *os.Root
	file            *os.File
	info            fs.FileInfo
	temporaryName   string
	destinationName string
	destinationPath string
	published       bool
}

func validateExportRequest(ctx context.Context, request ExportRequest) error {
	if ctx == nil || !filepath.IsAbs(request.SourceDirectory) || !filepath.IsAbs(request.DestinationPath) {
		return fmt.Errorf("%w: incomplete export request", ErrInvalidManifest)
	}
	if request.Key == (Key{}) || request.OwnerBinding == "" || request.RuntimeID == "" {
		return fmt.Errorf("%w: incomplete export request", ErrInvalidManifest)
	}
	if request.SourceGeneration == 0 || request.CreatedAt.IsZero() {
		return fmt.Errorf("%w: incomplete export request", ErrInvalidManifest)
	}
	return ctx.Err()
}

func requireAbsentDestination(name string) error {
	_, err := os.Lstat(name)
	if err == nil {
		return ErrDestinationExists
	}
	if errors.Is(err, fs.ErrNotExist) {
		return nil
	}
	return err
}

func openPreparedSnapshot(name string) (*os.Root, error) {
	info, err := os.Lstat(name)
	if err != nil {
		return nil, err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 || info.Mode().Perm()&0o022 != 0 {
		return nil, fmt.Errorf("%w: source is not a directory", ErrInvalidManifest)
	}
	root, err := os.OpenRoot(name)
	if err != nil {
		return nil, err
	}
	openedInfo, err := root.Stat(".")
	if err == nil && os.SameFile(info, openedInfo) {
		return root, nil
	}
	_ = root.Close()
	if err != nil {
		return nil, err
	}
	return nil, ErrSourceChanged
}

func buildManifest(request ExportRequest, entries []ManifestEntry) (Manifest, error) {
	exportID, err := newExportID()
	if err != nil {
		return Manifest{}, err
	}
	manifest := Manifest{
		Version:                    manifestVersion,
		ExportID:                   exportID,
		CreatedAt:                  request.CreatedAt,
		OwnerBinding:               request.OwnerBinding,
		RuntimeID:                  request.RuntimeID,
		SourceGeneration:           request.SourceGeneration,
		RequiresCredentialRotation: true,
		AuthorityReprovisioning:    append([]string(nil), requiredAuthorityReprovisioning...),
		Entries:                    entries,
	}
	if err := validateManifest(manifest); err != nil {
		return Manifest{}, err
	}
	return manifest, nil
}

func newExportArtifact(destinationPath string, exportID string) (*exportArtifact, error) {
	root, _, err := openStableRoot(filepath.Dir(destinationPath))
	if err != nil {
		return nil, err
	}
	temporaryName := ".setta-export-" + exportID + ".tmp"
	file, err := root.OpenFile(temporaryName, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0o600)
	if err != nil {
		_ = root.Close()
		return nil, err
	}
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		_ = root.Remove(temporaryName)
		_ = root.Close()
		return nil, err
	}
	return &exportArtifact{
		root: root, file: file, info: info, temporaryName: temporaryName,
		destinationName: filepath.Base(destinationPath), destinationPath: destinationPath,
	}, nil
}

func (artifact *exportArtifact) close() {
	_ = artifact.file.Close()
	if artifact.published {
		_ = artifact.root.RemoveAll(artifact.temporaryName)
	} else {
		_ = cleanupRootEntry(artifact.root, artifact.temporaryName, artifact.info)
	}
	_ = artifact.root.Close()
}

func verifySnapshotUnchanged(
	ctx context.Context,
	root *os.Root,
	expected []ManifestEntry,
	expectedBytes uint64,
) error {
	entries, totalBytes, err := scanSnapshot(ctx, root)
	if err != nil {
		return err
	}
	if totalBytes != expectedBytes || !equalEntries(entries, expected) {
		return ErrSourceChanged
	}
	return nil
}

func (artifact *exportArtifact) seal(writer *tar.Writer, encrypted io.WriteCloser) error {
	if err := writer.Close(); err != nil {
		return err
	}
	if err := encrypted.Close(); err != nil {
		return err
	}
	if err := artifact.file.Sync(); err != nil {
		return err
	}
	if err := artifact.file.Close(); err != nil {
		return err
	}
	namedInfo, err := artifact.root.Lstat(artifact.temporaryName)
	if err != nil || !os.SameFile(artifact.info, namedInfo) {
		return ErrSourceChanged
	}
	return nil
}

func (artifact *exportArtifact) publish() error {
	if err := artifact.root.Link(artifact.temporaryName, artifact.destinationName); err != nil {
		if errors.Is(err, fs.ErrExist) {
			return ErrDestinationExists
		}
		return err
	}
	artifact.published = true
	publishedInfo, err := artifact.root.Lstat(artifact.destinationName)
	if err != nil || !os.SameFile(artifact.info, publishedInfo) {
		return &CommittedError{Path: artifact.destinationPath, Err: ErrSourceChanged}
	}
	if err := syncRootDirectory(artifact.root); err != nil {
		return &CommittedError{Path: artifact.destinationPath, Err: err}
	}
	if err := artifact.root.Remove(artifact.temporaryName); err != nil {
		return &CommittedError{Path: artifact.destinationPath, Err: err}
	}
	if err := syncRootDirectory(artifact.root); err != nil {
		return &CommittedError{Path: artifact.destinationPath, Err: err}
	}
	return nil
}

func scanSnapshot(ctx context.Context, root *os.Root) ([]ManifestEntry, uint64, error) {
	entries := make([]ManifestEntry, 0)
	var total uint64
	err := fs.WalkDir(root.FS(), ".", func(name string, directoryEntry fs.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		if err := ctx.Err(); err != nil {
			return err
		}
		if name == "." {
			return nil
		}
		archivePath := name
		if err := validateArchivePath(archivePath); err != nil {
			return err
		}
		info, err := root.Lstat(archivePath)
		if err != nil {
			return err
		}
		entry, err := inspectEntry(ctx, root, archivePath, info)
		if err != nil {
			return err
		}
		if len(entries) == maximumEntryCount {
			return ErrInvalidManifest
		}
		if total > maximumTotalBytes-entry.Size {
			return ErrInvalidManifest
		}
		total += entry.Size
		entries = append(entries, entry)
		return nil
	})
	if err != nil {
		return nil, 0, err
	}
	sort.Slice(entries, func(first int, second int) bool {
		firstRank := entryTypeRank(entries[first].Type)
		secondRank := entryTypeRank(entries[second].Type)
		if firstRank != secondRank {
			return firstRank < secondRank
		}
		return entries[first].Path < entries[second].Path
	})
	return entries, total, nil
}

func inspectEntry(ctx context.Context, root *os.Root, archivePath string, info fs.FileInfo) (ManifestEntry, error) {
	entry := ManifestEntry{Path: archivePath}
	switch {
	case info.IsDir():
		entry.Type = EntryDirectory
	case info.Mode().IsRegular():
		if info.Size() < 0 || uint64(info.Size()) > maximumFileBytes {
			return ManifestEntry{}, ErrInvalidManifest
		}
		entry.Type = EntryFile
		entry.Size = uint64(info.Size())
		digest, err := hashFile(ctx, root, archivePath, info)
		if err != nil {
			return ManifestEntry{}, err
		}
		entry.SHA256 = digest
	case info.Mode()&os.ModeSymlink != 0:
		entry.Type = EntrySymlink
		target, err := root.Readlink(archivePath)
		if err != nil {
			return ManifestEntry{}, err
		}
		entry.LinkTarget = filepath.ToSlash(target)
		if err := validateSymlinkTarget(archivePath, entry.LinkTarget); err != nil {
			return ManifestEntry{}, err
		}
		if _, err := root.Stat(archivePath); err != nil {
			return ManifestEntry{}, fmt.Errorf("%w: unresolved link %q", ErrUnsafePath, archivePath)
		}
	default:
		return ManifestEntry{}, fmt.Errorf("%w: unsupported file type %q", ErrInvalidManifest, archivePath)
	}
	entry.Mode = normalizedMode(info, entry.Type)
	return entry, nil
}

func writeArchive(
	ctx context.Context,
	writer *tar.Writer,
	root *os.Root,
	manifest Manifest,
	totalBytes uint64,
	progress ProgressFunc,
) error {
	encodedManifest, err := json.Marshal(manifest)
	if err != nil {
		return err
	}
	if len(encodedManifest) > maximumManifestBytes {
		return ErrInvalidManifest
	}
	if err := writer.WriteHeader(&tar.Header{
		Name: manifestArchivePath, Mode: 0o600, Size: int64(len(encodedManifest)),
		Typeflag: tar.TypeReg, Format: tar.FormatPAX,
	}); err != nil {
		return err
	}
	if _, err := writer.Write(encodedManifest); err != nil {
		return err
	}
	state := Progress{TotalEntries: len(manifest.Entries), TotalBytes: totalBytes}
	for _, entry := range manifest.Entries {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := writeArchiveEntry(ctx, writer, root, entry); err != nil {
			return err
		}
		state.CompletedEntries++
		state.CompletedBytes += entry.Size
		if progress != nil {
			progress(state)
		}
	}
	return nil
}

func writeArchiveEntry(ctx context.Context, writer *tar.Writer, root *os.Root, expected ManifestEntry) error {
	info, err := verifyArchiveEntry(ctx, root, expected)
	if err != nil {
		return err
	}
	if err := writer.WriteHeader(archiveHeader(expected)); err != nil {
		return err
	}
	if expected.Type != EntryFile {
		return nil
	}
	return writeArchiveFile(ctx, writer, root, expected, info)
}

func verifyArchiveEntry(ctx context.Context, root *os.Root, expected ManifestEntry) (fs.FileInfo, error) {
	info, err := root.Lstat(expected.Path)
	if err != nil {
		return nil, err
	}
	actual, err := inspectEntry(ctx, root, expected.Path, info)
	if err != nil {
		return nil, err
	}
	if actual != expected {
		return nil, fmt.Errorf("%w: metadata for %q", ErrSourceChanged, expected.Path)
	}
	return info, nil
}

func archiveHeader(expected ManifestEntry) *tar.Header {
	header := &tar.Header{
		Name: expected.Path, Mode: int64(expected.Mode), Typeflag: tar.TypeReg,
		Format: tar.FormatPAX,
	}
	switch expected.Type {
	case EntryDirectory:
		header.Typeflag = tar.TypeDir
	case EntrySymlink:
		header.Typeflag = tar.TypeSymlink
		header.Linkname = expected.LinkTarget
	case EntryFile:
		header.Size = int64(expected.Size)
	}
	return header
}

func writeArchiveFile(
	ctx context.Context,
	writer *tar.Writer,
	root *os.Root,
	expected ManifestEntry,
	info fs.FileInfo,
) error {
	file, err := root.Open(expected.Path)
	if err != nil {
		return err
	}
	defer file.Close()
	openedInfo, err := file.Stat()
	if err != nil || !openedInfo.Mode().IsRegular() || !os.SameFile(info, openedInfo) {
		return fmt.Errorf("%w: opened file for %q", ErrSourceChanged, expected.Path)
	}
	digest := sha256.New()
	written, err := copyExactly(ctx, io.MultiWriter(writer, digest), file, expected.Size)
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return ctxErr
		}
		return fmt.Errorf("%w: content for %q", ErrSourceChanged, expected.Path)
	}
	if written != expected.Size {
		return fmt.Errorf("%w: content for %q", ErrSourceChanged, expected.Path)
	}
	return verifyArchivedFileEOF(file, digest, expected)
}

func verifyArchivedFileEOF(file *os.File, digest hash.Hash, expected ManifestEntry) error {
	var extra [1]byte
	count, readErr := file.Read(extra[:])
	if count != 0 || !errors.Is(readErr, io.EOF) || hex.EncodeToString(digest.Sum(nil)) != expected.SHA256 {
		return fmt.Errorf("%w: content for %q", ErrSourceChanged, expected.Path)
	}
	return nil
}

func hashFile(ctx context.Context, root *os.Root, name string, expected fs.FileInfo) (string, error) {
	file, err := root.Open(name)
	if err != nil {
		return "", err
	}
	defer file.Close()
	openedInfo, err := file.Stat()
	if err != nil || !openedInfo.Mode().IsRegular() || !os.SameFile(expected, openedInfo) {
		return "", ErrSourceChanged
	}
	digest := sha256.New()
	if _, err := copyExactly(ctx, digest, file, uint64(expected.Size())); err != nil {
		return "", err
	}
	var extra [1]byte
	if count, readErr := file.Read(extra[:]); count != 0 || !errors.Is(readErr, io.EOF) {
		return "", ErrSourceChanged
	}
	return hex.EncodeToString(digest.Sum(nil)), nil
}

func copyExactly(ctx context.Context, destination io.Writer, source io.Reader, size uint64) (uint64, error) {
	buffer := make([]byte, 64*1024)
	var written uint64
	for written < size {
		if err := ctx.Err(); err != nil {
			return written, err
		}
		count := min(uint64(len(buffer)), size-written)
		readCount, err := io.ReadFull(source, buffer[:count])
		if err != nil {
			return written, err
		}
		if _, err := destination.Write(buffer[:readCount]); err != nil {
			return written, err
		}
		written += uint64(readCount)
	}
	return written, nil
}

func equalEntries(first []ManifestEntry, second []ManifestEntry) bool {
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

func entryTypeRank(entryType EntryType) int {
	switch entryType {
	case EntryDirectory:
		return 0
	case EntryFile:
		return 1
	case EntrySymlink:
		return 2
	default:
		return 3
	}
}

func openStableRoot(name string) (*os.Root, fs.FileInfo, error) {
	info, err := os.Lstat(name)
	if err != nil {
		return nil, nil, err
	}
	if !info.IsDir() || info.Mode()&os.ModeSymlink != 0 || info.Mode().Perm()&0o022 != 0 {
		return nil, nil, fmt.Errorf("%w: root is not a private directory", ErrInvalidManifest)
	}
	root, err := os.OpenRoot(name)
	if err != nil {
		return nil, nil, err
	}
	openedInfo, err := root.Stat(".")
	if err != nil || !os.SameFile(info, openedInfo) {
		_ = root.Close()
		if err != nil {
			return nil, nil, err
		}
		return nil, nil, ErrSourceChanged
	}
	return root, info, nil
}

func syncRootDirectory(root *os.Root) error {
	directory, err := root.Open(".")
	if err != nil {
		return err
	}
	defer directory.Close()
	return directory.Sync()
}

func cleanupRootEntry(root *os.Root, name string, expected fs.FileInfo) error {
	errorsFound := make([]error, 0)
	if err := root.RemoveAll(name); err != nil && !errors.Is(err, fs.ErrNotExist) {
		errorsFound = append(errorsFound, err)
	}
	if expected == nil {
		return errors.Join(errorsFound...)
	}
	entries, err := fs.ReadDir(root.FS(), ".")
	if err != nil {
		errorsFound = append(errorsFound, err)
		return errors.Join(errorsFound...)
	}
	for _, entry := range entries {
		info, err := root.Lstat(entry.Name())
		if err != nil {
			errorsFound = append(errorsFound, err)
			continue
		}
		if !os.SameFile(expected, info) {
			continue
		}
		if err := root.RemoveAll(entry.Name()); err != nil && !errors.Is(err, fs.ErrNotExist) {
			errorsFound = append(errorsFound, err)
		}
	}
	return errors.Join(errorsFound...)
}
