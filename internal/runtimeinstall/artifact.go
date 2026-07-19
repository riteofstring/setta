package runtimeinstall

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"strings"
	"unicode"
)

var (
	// ErrInvalidRelease identifies a locally supplied release artifact that
	// cannot safely become a trusted runtime install candidate.
	ErrInvalidRelease = errors.New("invalid runtime release")
	// ErrSignatureRejected identifies a release checksum signature that did
	// not validate against the configured release-signing key.
	ErrSignatureRejected = errors.New("runtime release signature rejected")
)

var (
	releaseFieldPattern = regexp.MustCompile(`^[A-Za-z0-9._-]+$`)
	sha256HexPattern    = regexp.MustCompile(`^[a-f0-9]{64}$`)
)

// SignatureVerifier validates the detached signature over a release checksum
// manifest before the install loop uploads or installs any artifact bytes.
type SignatureVerifier interface {
	VerifyReleaseSignature(context.Context, SignatureVerificationRequest) error
}

// SignatureVerificationRequest contains the signed checksum manifest and the
// trusted public key for the local runtime build.
type SignatureVerificationRequest struct {
	ChecksumsPath string
	SignaturePath string
	PublicKey     string
}

// ReleaseArtifact identifies one locally built Setta runtime release archive
// and the signed checksum files that authorize it.
type ReleaseArtifact struct {
	Version       string
	OS            string
	Arch          string
	ArchivePath   string
	ChecksumsPath string
	SignaturePath string
	PublicKey     string
}

// ValidateReleaseArtifact validates the local release identity and file
// boundaries without accepting it as trusted. Install still verifies the
// detached signature and every required checksum before uploading bytes.
func ValidateReleaseArtifact(artifact ReleaseArtifact) error {
	return validateReleaseArtifactFields(artifact)
}

type verifiedArtifact struct {
	ReleaseArtifact
	ArchiveName   string
	ArtifactDir   string
	BinaryName    string
	ArchiveSHA256 string
	BinarySHA256  string
	ArchiveSize   int64
}

func verifyReleaseArtifact(
	ctx context.Context,
	artifact ReleaseArtifact,
	verifier SignatureVerifier,
) (verifiedArtifact, error) {
	if verifier == nil {
		return verifiedArtifact{}, fmt.Errorf("%w: signature verifier is required", ErrInvalidRelease)
	}
	if err := validateReleaseArtifactFields(artifact); err != nil {
		return verifiedArtifact{}, err
	}

	if err := verifier.VerifyReleaseSignature(ctx, SignatureVerificationRequest{
		ChecksumsPath: artifact.ChecksumsPath,
		SignaturePath: artifact.SignaturePath,
		PublicKey:     artifact.PublicKey,
	}); err != nil {
		if errors.Is(err, ErrSignatureRejected) {
			return verifiedArtifact{}, err
		}
		return verifiedArtifact{}, fmt.Errorf("%w: %v", ErrSignatureRejected, err)
	}

	checksums, err := readChecksumManifest(artifact.ChecksumsPath)
	if err != nil {
		return verifiedArtifact{}, err
	}
	archiveName := filepath.Base(artifact.ArchivePath)
	artifactDir := strings.TrimSuffix(archiveName, ".tar.gz")
	binaryName := artifactDir + "/setta"

	wantArchiveSHA, wantBinarySHA, err := requiredArtifactChecksums(checksums, archiveName, binaryName)
	if err != nil {
		return verifiedArtifact{}, err
	}
	archiveSHA, binarySHA, archiveSize, err := verifyArtifactChecksums(artifact.ArchivePath, archiveName, binaryName, wantArchiveSHA, wantBinarySHA)
	if err != nil {
		return verifiedArtifact{}, err
	}

	return verifiedArtifact{
		ReleaseArtifact: artifact,
		ArchiveName:     archiveName,
		ArtifactDir:     artifactDir,
		BinaryName:      binaryName,
		ArchiveSHA256:   archiveSHA,
		BinarySHA256:    binarySHA,
		ArchiveSize:     archiveSize,
	}, nil
}

func requiredArtifactChecksums(checksums map[string]string, archiveName string, binaryName string) (string, string, error) {
	wantArchiveSHA, ok := checksums[archiveName]
	if !ok {
		return "", "", fmt.Errorf("%w: SHA256SUMS does not include %s", ErrInvalidRelease, archiveName)
	}
	wantBinarySHA, ok := checksums[binaryName]
	if !ok {
		return "", "", fmt.Errorf("%w: SHA256SUMS does not include %s", ErrInvalidRelease, binaryName)
	}
	return wantArchiveSHA, wantBinarySHA, nil
}

func verifyArtifactChecksums(archivePath string, archiveName string, binaryName string, wantArchiveSHA string, wantBinarySHA string) (string, string, int64, error) {
	archiveSHA, archiveSize, err := fileSHA256(archivePath)
	if err != nil {
		return "", "", 0, err
	}
	if archiveSHA != wantArchiveSHA {
		return "", "", 0, fmt.Errorf("%w: archive checksum mismatch for %s", ErrInvalidRelease, archiveName)
	}
	binarySHA, err := binarySHA256FromArchive(archivePath, binaryName)
	if err != nil {
		return "", "", 0, err
	}
	if binarySHA != wantBinarySHA {
		return "", "", 0, fmt.Errorf("%w: binary checksum mismatch for %s", ErrInvalidRelease, binaryName)
	}
	return archiveSHA, binarySHA, archiveSize, nil
}

func validateReleaseArtifactFields(artifact ReleaseArtifact) error {
	for label, value := range map[string]string{
		"version": artifact.Version,
		"os":      artifact.OS,
		"arch":    artifact.Arch,
	} {
		if !releaseFieldPattern.MatchString(value) {
			return fmt.Errorf("%w: release %s contains unsupported characters", ErrInvalidRelease, label)
		}
	}
	for label, localPath := range map[string]string{
		"archive path":   artifact.ArchivePath,
		"checksums path": artifact.ChecksumsPath,
		"signature path": artifact.SignaturePath,
	} {
		if !filepath.IsAbs(localPath) {
			return fmt.Errorf("%w: %s must be absolute: %s", ErrInvalidRelease, label, localPath)
		}
		info, err := os.Stat(localPath)
		if err != nil {
			return fmt.Errorf("%w: stat %s %s: %v", ErrInvalidRelease, label, localPath, err)
		}
		if !info.Mode().IsRegular() {
			return fmt.Errorf("%w: %s must be a regular file: %s", ErrInvalidRelease, label, localPath)
		}
	}
	if strings.TrimSpace(artifact.PublicKey) == "" {
		return fmt.Errorf("%w: public key is required", ErrInvalidRelease)
	}

	wantArchiveName := fmt.Sprintf("setta_%s_%s_%s.tar.gz", artifact.Version, artifact.OS, artifact.Arch)
	if filepath.Base(artifact.ArchivePath) != wantArchiveName {
		return fmt.Errorf(
			"%w: archive name %s does not match %s",
			ErrInvalidRelease,
			filepath.Base(artifact.ArchivePath),
			wantArchiveName,
		)
	}
	return nil
}

func readChecksumManifest(checksumsPath string) (map[string]string, error) {
	data, err := os.ReadFile(checksumsPath)
	if err != nil {
		return nil, fmt.Errorf("%w: read SHA256SUMS %s: %v", ErrInvalidRelease, checksumsPath, err)
	}
	checksums := make(map[string]string)
	for lineNumber, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		fields := strings.Fields(line)
		if len(fields) != 2 {
			return nil, fmt.Errorf("%w: malformed SHA256SUMS line %d", ErrInvalidRelease, lineNumber+1)
		}
		checksum := strings.ToLower(fields[0])
		name := fields[1]
		if !sha256HexPattern.MatchString(checksum) {
			return nil, fmt.Errorf("%w: malformed checksum on line %d", ErrInvalidRelease, lineNumber+1)
		}
		if err := validateArchiveEntryName(name); err != nil {
			return nil, fmt.Errorf("%w: malformed checksum path on line %d: %v", ErrInvalidRelease, lineNumber+1, err)
		}
		if _, duplicate := checksums[name]; duplicate {
			return nil, fmt.Errorf("%w: duplicate checksum for %s", ErrInvalidRelease, name)
		}
		checksums[name] = checksum
	}
	if len(checksums) == 0 {
		return nil, fmt.Errorf("%w: SHA256SUMS is empty", ErrInvalidRelease)
	}
	return checksums, nil
}

func fileSHA256(localPath string) (string, int64, error) {
	file, err := os.Open(localPath)
	if err != nil {
		return "", 0, fmt.Errorf("%w: open %s: %v", ErrInvalidRelease, localPath, err)
	}
	defer file.Close()

	hash := sha256.New()
	size, err := io.Copy(hash, file)
	if err != nil {
		return "", 0, fmt.Errorf("%w: hash %s: %v", ErrInvalidRelease, localPath, err)
	}
	return hex.EncodeToString(hash.Sum(nil)), size, nil
}

func binarySHA256FromArchive(archivePath string, binaryName string) (string, error) {
	file, err := os.Open(archivePath)
	if err != nil {
		return "", fmt.Errorf("%w: open archive %s: %v", ErrInvalidRelease, archivePath, err)
	}
	defer file.Close()

	gzipReader, err := gzip.NewReader(file)
	if err != nil {
		return "", fmt.Errorf("%w: open gzip archive %s: %v", ErrInvalidRelease, archivePath, err)
	}
	defer gzipReader.Close()

	return binarySHA256FromTar(tar.NewReader(gzipReader), archivePath, binaryName)
}

func binarySHA256FromTar(tarReader *tar.Reader, archivePath string, binaryName string) (string, error) {
	binarySHA256 := ""
	for {
		header, err := tarReader.Next()
		if errors.Is(err, io.EOF) {
			if binarySHA256 == "" {
				return "", fmt.Errorf("%w: archive does not contain %s", ErrInvalidRelease, binaryName)
			}
			return binarySHA256, nil
		}
		if err != nil {
			return "", fmt.Errorf("%w: read archive %s: %v", ErrInvalidRelease, archivePath, err)
		}
		if err := validateArchiveHeader(header); err != nil {
			return "", fmt.Errorf("%w: unsafe archive entry %s: %v", ErrInvalidRelease, header.Name, err)
		}
		if header.Name != binaryName {
			continue
		}
		if header.Typeflag != tar.TypeReg && header.Typeflag != tar.TypeRegA {
			return "", fmt.Errorf("%w: %s is not a regular file", ErrInvalidRelease, binaryName)
		}
		if binarySHA256 != "" {
			return "", fmt.Errorf("%w: archive contains duplicate %s", ErrInvalidRelease, binaryName)
		}
		hash := sha256.New()
		if _, err := io.Copy(hash, tarReader); err != nil {
			return "", fmt.Errorf("%w: hash %s from archive: %v", ErrInvalidRelease, binaryName, err)
		}
		binarySHA256 = hex.EncodeToString(hash.Sum(nil))
	}
}

func validateArchiveHeader(header *tar.Header) error {
	switch header.Typeflag {
	case tar.TypeReg, tar.TypeRegA:
		return validateArchiveEntryName(header.Name)
	case tar.TypeDir:
		// archive/tar and the production Python release helper conventionally
		// serialize directory names with one trailing slash. Normalize that
		// marker only for directory headers; regular-file names remain exact.
		return validateArchiveEntryName(strings.TrimSuffix(header.Name, "/"))
	case tar.TypeLink, tar.TypeSymlink:
		return errors.New("link entries are unsupported")
	default:
		return fmt.Errorf("entry type %d is unsupported", header.Typeflag)
	}
}

func validateArchiveEntryName(name string) error {
	if name == "" {
		return errors.New("path is empty")
	}
	if name == "." || name == ".." {
		return fmt.Errorf("path must identify an entry: %s", name)
	}
	if path.IsAbs(name) {
		return fmt.Errorf("path must be relative: %s", name)
	}
	if path.Clean(name) != name {
		return fmt.Errorf("path must be relative and clean: %s", name)
	}
	if archiveEntryTraversesParent(name) {
		return fmt.Errorf("path must not traverse parents: %s", name)
	}
	return validateArchiveEntryCharacters(name)
}

func archiveEntryTraversesParent(name string) bool {
	return strings.HasPrefix(name, "../") || strings.Contains(name, "/../")
}

func validateArchiveEntryCharacters(name string) error {
	if strings.Contains(name, `\`) {
		return fmt.Errorf("path must use slash separators: %s", name)
	}
	for _, character := range name {
		if unicode.IsControl(character) || unicode.IsSpace(character) {
			return fmt.Errorf("path contains unsupported character %q", character)
		}
	}
	return nil
}
