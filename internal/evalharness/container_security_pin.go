package evalharness

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"

	"setta/internal/jsonio"
)

const (
	containerSecurityPolicySchemaVersion = 2
	containerSecurityPolicyMaximumBytes  = 32 * 1024
	containerSecurityPolicyRelativePath  = "evals/sandbox/container-security-policy.json"
	containerSecurityTrivyName           = "trivy"
	containerSecurityTrivyImagePrefix    = "docker.io/aquasec/trivy@sha256:"
)

var containerSecurityFailSeverities = []string{"HIGH", "CRITICAL"}

type containerSecurityPolicyPin struct {
	SchemaVersion int                       `json:"schemaVersion"`
	Platform      string                    `json:"platform"`
	Scanner       containerSecurityScanner  `json:"scanner"`
	Database      containerSecurityDatabase `json:"database"`
	Policy        containerSecurityFindings `json:"policy"`
}

type containerSecurityScanner struct {
	Name                        string                          `json:"name"`
	Version                     string                          `json:"version"`
	Image                       string                          `json:"image"`
	ImageID                     string                          `json:"imageId"`
	PlatformManifestDigest      string                          `json:"platformManifestDigest"`
	AttestationManifestDigest   string                          `json:"attestationManifestDigest"`
	SBOMAttestationDigest       string                          `json:"sbomAttestationDigest"`
	ProvenanceAttestationDigest string                          `json:"provenanceAttestationDigest"`
	Release                     containerSecurityRelease        `json:"release"`
	Runtime                     containerSecurityScannerRuntime `json:"runtime"`
}

type containerSecurityScannerRuntime struct {
	BinarySHA256         string `json:"binarySha256"`
	CACertificatesSHA256 string `json:"caCertificatesSha256"`
	VEXSHA256            string `json:"vexSha256"`
}

type containerSecurityRelease struct {
	PublishedAt                   time.Time `json:"publishedAt"`
	URL                           string    `json:"url"`
	SBOMURL                       string    `json:"sbomUrl"`
	SBOMSHA256                    string    `json:"sbomSha256"`
	ChecksumsSigstoreBundleURL    string    `json:"checksumsSigstoreBundleUrl"`
	ChecksumsSigstoreBundleSHA256 string    `json:"checksumsSigstoreBundleSha256"`
}

type containerSecurityDatabase struct {
	Repository      string `json:"repository"`
	SchemaVersion   int    `json:"schemaVersion"`
	MaximumAgeHours int    `json:"maximumAgeHours"`
}

type containerSecurityFindings struct {
	FailSeverities     []string `json:"failSeverities"`
	MaximumImageBytes  int64    `json:"maximumImageBytes"`
	MaximumReportBytes int64    `json:"maximumReportBytes"`
}

func loadContainerSecurityPolicy(repoRoot string) (containerSecurityPolicyPin, error) {
	path := filepath.Join(repoRoot, filepath.FromSlash(containerSecurityPolicyRelativePath))
	info, err := os.Lstat(path)
	if err != nil {
		return containerSecurityPolicyPin{}, fmt.Errorf("inspect container security policy: %w", err)
	}
	if !info.Mode().IsRegular() || info.Size() > containerSecurityPolicyMaximumBytes {
		return containerSecurityPolicyPin{}, errors.New(
			"container security policy must be one bounded regular file",
		)
	}
	file, err := os.Open(path)
	if err != nil {
		return containerSecurityPolicyPin{}, fmt.Errorf("open container security policy: %w", err)
	}
	defer file.Close()
	var pin containerSecurityPolicyPin
	if err := jsonio.DecodeSingle(file, &pin); err != nil {
		return containerSecurityPolicyPin{}, fmt.Errorf("decode container security policy: %w", err)
	}
	if err := pin.validate(); err != nil {
		return containerSecurityPolicyPin{}, fmt.Errorf("validate container security policy: %w", err)
	}
	return pin, nil
}

func (pin containerSecurityPolicyPin) validate() error {
	if pin.SchemaVersion != containerSecurityPolicySchemaVersion {
		return fmt.Errorf(
			"schemaVersion is %d, want %d",
			pin.SchemaVersion,
			containerSecurityPolicySchemaVersion,
		)
	}
	if pin.Platform != phase1ImagePlatform {
		return fmt.Errorf("platform is %q, want %q", pin.Platform, phase1ImagePlatform)
	}
	if err := pin.Scanner.validate(); err != nil {
		return err
	}
	if err := pin.Database.validate(); err != nil {
		return err
	}
	return pin.Policy.validate()
}

func (scanner containerSecurityScanner) validate() error {
	if scanner.Name != containerSecurityTrivyName || !validPhase1ToolVersion(scanner.Version) {
		return errors.New("scanner must be one exact Trivy version")
	}
	if !strings.HasPrefix(scanner.Image, containerSecurityTrivyImagePrefix) ||
		!validPhase1SHA256(strings.TrimPrefix(scanner.Image, containerSecurityTrivyImagePrefix)) {
		return errors.New("scanner image must be the exact official Trivy registry digest")
	}
	if !validPhase1ImageID(scanner.ImageID) {
		return errors.New("scanner imageId must be an exact lowercase image config digest")
	}
	for label, digest := range map[string]string{
		"platformManifestDigest":      scanner.PlatformManifestDigest,
		"attestationManifestDigest":   scanner.AttestationManifestDigest,
		"sbomAttestationDigest":       scanner.SBOMAttestationDigest,
		"provenanceAttestationDigest": scanner.ProvenanceAttestationDigest,
	} {
		if !validPhase1ImageID(digest) {
			return fmt.Errorf("scanner %s must be an exact lowercase digest", label)
		}
	}
	if err := scanner.Release.validate(scanner.Version); err != nil {
		return err
	}
	return scanner.Runtime.validate()
}

func (runtime containerSecurityScannerRuntime) validate() error {
	for label, digest := range map[string]string{
		"binarySha256":         runtime.BinarySHA256,
		"caCertificatesSha256": runtime.CACertificatesSHA256,
		"vexSha256":            runtime.VEXSHA256,
	} {
		if !validPhase1SHA256(digest) {
			return fmt.Errorf("scanner runtime %s must be an exact lowercase SHA-256 digest", label)
		}
	}
	return nil
}

func (release containerSecurityRelease) validate(version string) error {
	if release.PublishedAt.IsZero() || release.PublishedAt.After(time.Now().UTC()) {
		return errors.New("scanner release publishedAt must be a non-future timestamp")
	}
	prefix := "https://github.com/aquasecurity/trivy/releases"
	for label, evidence := range map[string]struct {
		actual string
		want   string
	}{
		"url": {
			actual: release.URL,
			want:   fmt.Sprintf("%s/tag/v%s", prefix, version),
		},
		"sbomUrl": {
			actual: release.SBOMURL,
			want:   fmt.Sprintf("%s/download/v%s/bom.json", prefix, version),
		},
		"checksumsSigstoreBundleUrl": {
			actual: release.ChecksumsSigstoreBundleURL,
			want: fmt.Sprintf(
				"%s/download/v%s/trivy_%s_checksums.txt.sigstore.json",
				prefix,
				version,
				version,
			),
		},
	} {
		if evidence.actual != evidence.want {
			return fmt.Errorf("scanner release %s must name the exact official release asset", label)
		}
	}
	if !validPhase1SHA256(release.SBOMSHA256) ||
		!validPhase1SHA256(release.ChecksumsSigstoreBundleSHA256) {
		return errors.New("scanner release evidence must use exact lowercase SHA-256 digests")
	}
	return nil
}

func (database containerSecurityDatabase) validate() error {
	wantRepository := fmt.Sprintf("ghcr.io/aquasecurity/trivy-db:%d", database.SchemaVersion)
	if database.SchemaVersion < 1 || database.Repository != wantRepository {
		return errors.New("scanner database must use its explicit official schema repository")
	}
	if database.MaximumAgeHours < 1 || database.MaximumAgeHours > 72 {
		return errors.New("scanner database maximumAgeHours must be 1-72")
	}
	return nil
}

func (policy containerSecurityFindings) validate() error {
	if !slices.Equal(policy.FailSeverities, containerSecurityFailSeverities) {
		return errors.New("container policy must fail on HIGH and CRITICAL findings")
	}
	if policy.MaximumImageBytes < 1 || policy.MaximumReportBytes < 1 {
		return errors.New("container security artifact limits must be positive")
	}
	return nil
}
