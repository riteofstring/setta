package hostedmeasurement

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	"setta/internal/runtimeinstall"
)

const (
	RuntimeReleaseManifestSchemaVersion = 1
	maximumRuntimeReleaseManifestBytes  = 32 * 1024
	maximumRuntimeReleaseVerifierBytes  = 64 * 1024 * 1024
)

type RuntimeReleaseManifest struct {
	SchemaVersion  int    `json:"schema_version"`
	Version        string `json:"version"`
	OS             string `json:"os"`
	Arch           string `json:"arch"`
	Archive        string `json:"archive"`
	Checksums      string `json:"checksums"`
	Signature      string `json:"signature"`
	PublicKey      string `json:"public_key"`
	Verifier       string `json:"verifier"`
	VerifierSHA256 string `json:"verifier_sha256"`
}

type RuntimeReleaseInputs struct {
	Artifact           runtimeinstall.ReleaseArtifact
	LocalVerifierPath  string
	RemoteVerifierPath string
	VerifierSHA256     string
}

func LoadRuntimeReleaseManifest(manifestPath string) (RuntimeReleaseInputs, error) {
	if manifestPath == "" || !filepath.IsAbs(manifestPath) {
		return RuntimeReleaseInputs{}, errors.New("runtime release manifest path must be absolute")
	}
	directory := filepath.Dir(manifestPath)
	if err := validatePrivateDirectory(directory); err != nil {
		return RuntimeReleaseInputs{}, err
	}
	data, err := readPrivateRegularFile(manifestPath, maximumRuntimeReleaseManifestBytes, "runtime release manifest")
	if err != nil {
		return RuntimeReleaseInputs{}, err
	}
	manifest, err := decodeRuntimeReleaseManifest(data)
	if err != nil {
		return RuntimeReleaseInputs{}, err
	}
	return validateRuntimeReleaseManifest(directory, manifest)
}

func decodeRuntimeReleaseManifest(data []byte) (RuntimeReleaseManifest, error) {
	if err := rejectDuplicateJSONFields(data); err != nil {
		return RuntimeReleaseManifest{}, fmt.Errorf("validate runtime release manifest JSON: %w", err)
	}
	decoder := json.NewDecoder(bytes.NewReader(data))
	decoder.DisallowUnknownFields()
	var manifest RuntimeReleaseManifest
	if err := decoder.Decode(&manifest); err != nil {
		return RuntimeReleaseManifest{}, fmt.Errorf("decode runtime release manifest: %w", err)
	}
	if err := requireJSONEOF(decoder); err != nil {
		return RuntimeReleaseManifest{}, errors.New("runtime release manifest must contain one JSON value")
	}
	return manifest, nil
}

func validateRuntimeReleaseManifest(directory string, manifest RuntimeReleaseManifest) (RuntimeReleaseInputs, error) {
	if manifest.SchemaVersion != RuntimeReleaseManifestSchemaVersion {
		return RuntimeReleaseInputs{}, fmt.Errorf("runtime release manifest schema_version must be %d", RuntimeReleaseManifestSchemaVersion)
	}
	if manifest.OS != "linux" || manifest.Arch != "amd64" {
		return RuntimeReleaseInputs{}, errors.New("hosted Sprite runtime release must target linux/amd64")
	}
	for label, name := range map[string]string{
		"archive": manifest.Archive, "checksums": manifest.Checksums,
		"signature": manifest.Signature, "verifier": manifest.Verifier,
	} {
		if err := validateReleaseInputName(label, name); err != nil {
			return RuntimeReleaseInputs{}, err
		}
	}
	artifact := runtimeinstall.ReleaseArtifact{
		Version: manifest.Version, OS: manifest.OS, Arch: manifest.Arch,
		ArchivePath: filepath.Join(directory, manifest.Archive), ChecksumsPath: filepath.Join(directory, manifest.Checksums),
		SignaturePath: filepath.Join(directory, manifest.Signature), PublicKey: manifest.PublicKey,
	}
	if err := requirePrivateRuntimeReleaseFiles(artifact); err != nil {
		return RuntimeReleaseInputs{}, err
	}
	if err := runtimeinstall.ValidateReleaseArtifact(artifact); err != nil {
		return RuntimeReleaseInputs{}, err
	}
	localVerifierPath := filepath.Join(directory, manifest.Verifier)
	digest, err := privateRegularFileSHA256(localVerifierPath, maximumRuntimeReleaseVerifierBytes, "runtime release verifier")
	if err != nil {
		return RuntimeReleaseInputs{}, err
	}
	if !isLowerSHA256(manifest.VerifierSHA256) || digest != manifest.VerifierSHA256 {
		return RuntimeReleaseInputs{}, errors.New("runtime release verifier SHA-256 does not match the manifest")
	}
	return RuntimeReleaseInputs{
		Artifact: artifact, LocalVerifierPath: localVerifierPath,
		RemoteVerifierPath: runtimeinstall.DefaultLayout().ReleaseRoot + "/setta-release-verify",
		VerifierSHA256:     digest,
	}, nil
}

func isLowerSHA256(value string) bool {
	decoded, err := hex.DecodeString(value)
	return err == nil && len(decoded) == sha256.Size && value == strings.ToLower(value)
}

func validateReleaseInputName(label string, name string) error {
	if name == "" || name != filepath.Base(name) || filepath.Clean(name) != name || strings.ContainsAny(name, `/\\`) {
		return fmt.Errorf("runtime release %s must be a same-directory file name", label)
	}
	return nil
}

func requirePrivateRuntimeReleaseFiles(artifact runtimeinstall.ReleaseArtifact) error {
	for label, path := range map[string]string{
		"archive": artifact.ArchivePath, "checksums": artifact.ChecksumsPath, "signature": artifact.SignaturePath,
	} {
		if _, err := privateRegularFileSHA256(path, maximumRuntimeReleaseFileBytes(label), "runtime release "+label); err != nil {
			return err
		}
	}
	return nil
}

func maximumRuntimeReleaseFileBytes(label string) int64 {
	if label == "archive" {
		return 256 * 1024 * 1024
	}
	return 1024 * 1024
}

func privateRegularFileSHA256(path string, maximumBytes int64, label string) (string, error) {
	pathInfo, err := os.Lstat(path)
	if err != nil {
		return "", fmt.Errorf("inspect %s: %w", label, err)
	}
	if !pathInfo.Mode().IsRegular() || pathInfo.Mode().Perm()&0o077 != 0 {
		return "", fmt.Errorf("%s must be a private regular file", label)
	}
	file, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("open %s: %w", label, err)
	}
	defer file.Close()
	info, err := file.Stat()
	if err != nil {
		return "", fmt.Errorf("inspect opened %s: %w", label, err)
	}
	if !info.Mode().IsRegular() || info.Mode().Perm()&0o077 != 0 || !os.SameFile(pathInfo, info) {
		return "", fmt.Errorf("%s changed or is not a private regular file", label)
	}
	hash := sha256.New()
	size, err := io.Copy(hash, io.LimitReader(file, maximumBytes+1))
	if err != nil {
		return "", fmt.Errorf("hash %s: %w", label, err)
	}
	if size > maximumBytes {
		return "", fmt.Errorf("%s exceeds %d bytes", label, maximumBytes)
	}
	return hex.EncodeToString(hash.Sum(nil)), nil
}
