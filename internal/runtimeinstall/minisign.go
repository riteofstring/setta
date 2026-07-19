package runtimeinstall

import (
	"context"
	"crypto/ed25519"
	"encoding/base64"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"

	"setta/internal/runtimeprovider"
)

const (
	minisignAlgorithmSize = 2
	minisignKeyIDSize     = 8
	minisignPublicKeySize = minisignAlgorithmSize + minisignKeyIDSize + ed25519.PublicKeySize
	minisignSignatureSize = minisignAlgorithmSize + minisignKeyIDSize + ed25519.SignatureSize

	minisignUntrustedCommentPrefix = "untrusted comment: "
	minisignTrustedCommentPrefix   = "trusted comment: "
)

var minisignLegacyAlgorithm = [minisignAlgorithmSize]byte{'E', 'd'}

// MinisignVerifier verifies a signed SHA256SUMS manifest with the local
// minisign command. The install loop verifies this before any provider call.
type MinisignVerifier struct {
	Command string
}

func (verifier MinisignVerifier) VerifyReleaseSignature(
	ctx context.Context,
	request SignatureVerificationRequest,
) error {
	command := verifier.Command
	if command == "" {
		command = "minisign"
	}
	cmd := exec.CommandContext(
		ctx,
		command,
		"-Vm",
		request.ChecksumsPath,
		"-P",
		request.PublicKey,
		"-x",
		request.SignaturePath,
	)
	output, err := cmd.CombinedOutput()
	if err != nil {
		message := strings.TrimSpace(string(output))
		if message == "" {
			message = err.Error()
		}
		return fmt.Errorf("%w: minisign verification failed: %s", ErrSignatureRejected, message)
	}
	return nil
}

var _ SignatureVerifier = MinisignVerifier{}

// VerifySignedChecksumManifest verifies a legacy Minisign Ed25519 signature
// and then parses the signed SHA256SUMS file with the release installer's
// strict checksum and archive-path validation. It is dependency-free so the
// read-only setta-release-verify command can run on a clean runtime image.
// Prehashed Minisign signatures are rejected because BLAKE2b is not provided
// by the Go standard library; callers generating signatures for this verifier
// must select Minisign's legacy format explicitly.
func VerifySignedChecksumManifest(request SignatureVerificationRequest) error {
	_, err := verifySignedChecksumManifest(request)
	return err
}

// VerifySignedReleaseFile verifies the signed checksum manifest and requires
// the named release file's SHA256 to match its entry in that manifest.
func VerifySignedReleaseFile(request SignatureVerificationRequest, releasePath string) error {
	checksums, err := verifySignedChecksumManifest(request)
	if err != nil {
		return err
	}
	releaseName := filepath.Base(releasePath)
	want, ok := checksums[releaseName]
	if !ok {
		return fmt.Errorf("%w: SHA256SUMS does not include %s", ErrInvalidRelease, releaseName)
	}
	got, _, err := fileSHA256(releasePath)
	if err != nil {
		return err
	}
	if got != want {
		return fmt.Errorf("%w: checksum mismatch for %s", ErrInvalidRelease, releaseName)
	}
	return nil
}

func verifySignedChecksumManifest(request SignatureVerificationRequest) (map[string]string, error) {
	message, err := os.ReadFile(request.ChecksumsPath)
	if err != nil {
		return nil, fmt.Errorf("%w: read SHA256SUMS %s: %v", ErrInvalidRelease, request.ChecksumsPath, err)
	}
	publicKey, keyID, err := decodeMinisignPublicKey(request.PublicKey)
	if err != nil {
		return nil, err
	}
	signature, trustedComment, globalSignature, err := readMinisignSignature(request.SignaturePath, keyID)
	if err != nil {
		return nil, err
	}
	if !ed25519.Verify(publicKey, message, signature) {
		return nil, fmt.Errorf("%w: Minisign message signature verification failed", ErrSignatureRejected)
	}
	globalMessage := make([]byte, 0, len(signature)+len(trustedComment))
	globalMessage = append(globalMessage, signature...)
	globalMessage = append(globalMessage, trustedComment...)
	if !ed25519.Verify(publicKey, globalMessage, globalSignature) {
		return nil, fmt.Errorf("%w: Minisign trusted comment signature verification failed", ErrSignatureRejected)
	}
	checksums, err := readChecksumManifest(request.ChecksumsPath)
	if err != nil {
		return nil, err
	}
	return checksums, nil
}

func decodeMinisignPublicKey(encoded string) (ed25519.PublicKey, []byte, error) {
	if strings.TrimSpace(encoded) != encoded || encoded == "" {
		return nil, nil, fmt.Errorf("%w: malformed Minisign public key", ErrSignatureRejected)
	}
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(decoded) != minisignPublicKeySize {
		return nil, nil, fmt.Errorf("%w: malformed Minisign public key", ErrSignatureRejected)
	}
	if !matchesMinisignLegacyAlgorithm(decoded[:minisignAlgorithmSize]) {
		return nil, nil, fmt.Errorf("%w: unsupported Minisign public key algorithm", ErrSignatureRejected)
	}
	keyIDStart := minisignAlgorithmSize
	keyStart := keyIDStart + minisignKeyIDSize
	return ed25519.PublicKey(decoded[keyStart:]), decoded[keyIDStart:keyStart], nil
}

func readMinisignSignature(path string, wantKeyID []byte) ([]byte, []byte, []byte, error) {
	contents, err := os.ReadFile(path)
	if err != nil {
		return nil, nil, nil, fmt.Errorf("%w: read Minisign signature %s: %v", ErrSignatureRejected, path, err)
	}
	lines, err := minisignSignatureLines(contents)
	if err != nil {
		return nil, nil, nil, err
	}
	signatureRecord, err := decodeMinisignLine(lines[1], minisignSignatureSize, "signature")
	if err != nil {
		return nil, nil, nil, err
	}
	if !matchesMinisignLegacyAlgorithm(signatureRecord[:minisignAlgorithmSize]) {
		return nil, nil, nil, fmt.Errorf(
			"%w: prehashed Minisign signatures are unsupported; sign with minisign -l",
			ErrSignatureRejected,
		)
	}
	keyIDStart := minisignAlgorithmSize
	keyIDEnd := keyIDStart + minisignKeyIDSize
	if string(signatureRecord[keyIDStart:keyIDEnd]) != string(wantKeyID) {
		return nil, nil, nil, fmt.Errorf("%w: Minisign signature key ID does not match public key", ErrSignatureRejected)
	}
	globalSignature, err := decodeMinisignLine(lines[3], ed25519.SignatureSize, "trusted comment signature")
	if err != nil {
		return nil, nil, nil, err
	}
	return signatureRecord[keyIDEnd:], []byte(strings.TrimPrefix(lines[2], minisignTrustedCommentPrefix)), globalSignature, nil
}

func minisignSignatureLines(contents []byte) ([]string, error) {
	normalized := strings.ReplaceAll(string(contents), "\r\n", "\n")
	if strings.ContainsRune(normalized, '\r') {
		return nil, fmt.Errorf("%w: malformed Minisign signature line endings", ErrSignatureRejected)
	}
	lines := strings.Split(strings.TrimSuffix(normalized, "\n"), "\n")
	if len(lines) != 4 || !strings.HasPrefix(lines[0], minisignUntrustedCommentPrefix) ||
		!strings.HasPrefix(lines[2], minisignTrustedCommentPrefix) ||
		strings.TrimPrefix(lines[2], minisignTrustedCommentPrefix) == "" {
		return nil, fmt.Errorf("%w: malformed Minisign signature file", ErrSignatureRejected)
	}
	return lines, nil
}

func decodeMinisignLine(encoded string, wantSize int, label string) ([]byte, error) {
	decoded, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil || len(decoded) != wantSize {
		return nil, fmt.Errorf("%w: malformed Minisign %s", ErrSignatureRejected, label)
	}
	return decoded, nil
}

func matchesMinisignLegacyAlgorithm(value []byte) bool {
	return len(value) == len(minisignLegacyAlgorithm) &&
		value[0] == minisignLegacyAlgorithm[0] && value[1] == minisignLegacyAlgorithm[1]
}

func validateRemoteVerifierPath(verifierPath string, layout Layout) error {
	if err := validateRemotePath("remote verifier path", verifierPath); err != nil {
		return err
	}
	if verifierPath == defaultRemoteVerifierPath {
		return nil
	}
	for _, character := range verifierPath {
		if !isPortableRemoteVerifierPathCharacter(character) {
			return fmt.Errorf(
				"%w: remote verifier path contains unsupported character %q",
				runtimeprovider.ErrInvalidContract,
				character,
			)
		}
	}
	allowedRoots := []string{
		layout.ReleaseRoot,
		layout.RuntimeStateDir,
	}
	for _, root := range allowedRoots {
		if verifierPath != root && strings.HasPrefix(verifierPath, root+"/") {
			return nil
		}
	}
	return fmt.Errorf(
		"%w: remote verifier path must be below a protected runtime install layout path",
		runtimeprovider.ErrInvalidContract,
	)
}

func isPortableRemoteVerifierPathCharacter(character rune) bool {
	return character == '/' || character == '-' || character == '_' || character == '.' ||
		character >= 'a' && character <= 'z' ||
		character >= 'A' && character <= 'Z' ||
		character >= '0' && character <= '9'
}
