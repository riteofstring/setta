package evalharness

import (
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
	"time"
)

const (
	containerSecurityReportSchemaVersion = 1
	containerSecurityStatusPass          = "pass"
	containerSecurityStatusFail          = "fail"
)

var containerSecurityImageNames = []string{
	"agent",
	"backend",
	"phase0",
	"scanner",
	"toolchain",
	"verifier",
}

var containerSecurityFindingKinds = []string{
	"end_of_life",
	"misconfiguration",
	"secret",
	"vulnerability",
}

type ContainerSecurityReport struct {
	SchemaVersion int                               `json:"schemaVersion"`
	Status        string                            `json:"status"`
	SettaCommit   string                            `json:"settaCommit"`
	StartedAt     time.Time                         `json:"startedAt"`
	FinishedAt    time.Time                         `json:"finishedAt"`
	Scanner       ContainerSecurityScannerEvidence  `json:"scanner"`
	Database      ContainerSecurityDatabaseEvidence `json:"database"`
	Images        []ContainerSecurityImageResult    `json:"images"`
	Findings      []ContainerSecurityFinding        `json:"findings"`
}

type ContainerSecurityScannerEvidence struct {
	Name                          string    `json:"name"`
	Version                       string    `json:"version"`
	Image                         string    `json:"image"`
	ImageID                       string    `json:"imageId"`
	Platform                      string    `json:"platform"`
	PlatformManifestDigest        string    `json:"platformManifestDigest"`
	AttestationManifestDigest     string    `json:"attestationManifestDigest"`
	SBOMAttestationDigest         string    `json:"sbomAttestationDigest"`
	ProvenanceAttestationDigest   string    `json:"provenanceAttestationDigest"`
	ReleasePublishedAt            time.Time `json:"releasePublishedAt"`
	ReleaseURL                    string    `json:"releaseUrl"`
	ReleaseSBOMURL                string    `json:"releaseSbomUrl"`
	ReleaseSBOMSHA256             string    `json:"releaseSbomSha256"`
	ChecksumsSigstoreBundleURL    string    `json:"checksumsSigstoreBundleUrl"`
	ChecksumsSigstoreBundleSHA256 string    `json:"checksumsSigstoreBundleSha256"`
}

type ContainerSecurityDatabaseEvidence struct {
	Repository     string    `json:"repository"`
	SchemaVersion  int       `json:"schemaVersion"`
	UpdatedAt      time.Time `json:"updatedAt"`
	DownloadedAt   time.Time `json:"downloadedAt"`
	NextUpdate     time.Time `json:"nextUpdate"`
	DatabaseSHA256 string    `json:"databaseSha256"`
	MetadataSHA256 string    `json:"metadataSha256"`
}

type ContainerSecurityImageResult struct {
	Name                      string `json:"name"`
	Reference                 string `json:"reference"`
	ImageID                   string `json:"imageId"`
	ArchiveSHA256             string `json:"archiveSha256"`
	VulnerabilityReport       string `json:"vulnerabilityReport"`
	VulnerabilityReportSHA256 string `json:"vulnerabilityReportSha256"`
	SBOM                      string `json:"sbom"`
	SBOMSHA256                string `json:"sbomSha256"`
	FindingCount              int    `json:"findingCount"`
}

type ContainerSecurityFinding struct {
	Image            string `json:"image"`
	Kind             string `json:"kind"`
	ID               string `json:"id"`
	Severity         string `json:"severity"`
	Target           string `json:"target"`
	Package          string `json:"package,omitempty"`
	InstalledVersion string `json:"installedVersion,omitempty"`
	FixedVersion     string `json:"fixedVersion,omitempty"`
	Status           string `json:"status,omitempty"`
	Title            string `json:"title,omitempty"`
}

type ContainerSecurityArtifactPaths struct {
	Directory      string
	ReportJSON     string
	ReportMarkdown string
}

type containerSecurityArtifactSet struct {
	report ContainerSecurityReport
	raw    map[string][]byte
}

func (report ContainerSecurityReport) Passed() bool {
	return report.Status == containerSecurityStatusPass
}

func (report ContainerSecurityReport) Validate() error {
	if report.SchemaVersion != containerSecurityReportSchemaVersion {
		return fmt.Errorf("container security report schemaVersion is %d", report.SchemaVersion)
	}
	wantStatus := containerSecurityStatusPass
	if len(report.Findings) > 0 {
		wantStatus = containerSecurityStatusFail
	}
	if report.Status != wantStatus {
		return fmt.Errorf("container security report status is %q, want %q", report.Status, wantStatus)
	}
	if len(report.SettaCommit) != 40 || !validLowerHex(report.SettaCommit, 40) {
		return errors.New("container security report has an invalid Setta commit")
	}
	if report.StartedAt.IsZero() || report.FinishedAt.Before(report.StartedAt) {
		return errors.New("container security report has an invalid time range")
	}
	if err := report.Scanner.validate(); err != nil {
		return err
	}
	if err := report.Database.validate(); err != nil {
		return err
	}
	if err := validateContainerSecurityImages(report.Images); err != nil {
		return err
	}
	if err := validateContainerSecurityFindings(report.Findings); err != nil {
		return err
	}
	return validateContainerSecurityFindingCounts(report.Images, report.Findings)
}

func (scanner ContainerSecurityScannerEvidence) validate() error {
	if scanner.Name != containerSecurityTrivyName || !validPhase1ToolVersion(scanner.Version) {
		return errors.New("container security report scanner identity is invalid")
	}
	if scanner.Platform != phase1ImagePlatform || !validPhase1ImageID(scanner.ImageID) {
		return errors.New("container security report scanner platform or image id is invalid")
	}
	if !strings.HasPrefix(scanner.Image, containerSecurityTrivyImagePrefix) ||
		!validPhase1SHA256(strings.TrimPrefix(scanner.Image, containerSecurityTrivyImagePrefix)) {
		return errors.New("container security report scanner image is not an exact Trivy digest")
	}
	for _, digest := range []string{
		scanner.PlatformManifestDigest,
		scanner.AttestationManifestDigest,
		scanner.SBOMAttestationDigest,
		scanner.ProvenanceAttestationDigest,
	} {
		if !validPhase1ImageID(digest) {
			return errors.New("container security report scanner provenance digest is invalid")
		}
	}
	release := containerSecurityRelease{
		PublishedAt:                   scanner.ReleasePublishedAt,
		URL:                           scanner.ReleaseURL,
		SBOMURL:                       scanner.ReleaseSBOMURL,
		SBOMSHA256:                    scanner.ReleaseSBOMSHA256,
		ChecksumsSigstoreBundleURL:    scanner.ChecksumsSigstoreBundleURL,
		ChecksumsSigstoreBundleSHA256: scanner.ChecksumsSigstoreBundleSHA256,
	}
	if err := release.validate(scanner.Version); err != nil {
		return fmt.Errorf("container security report scanner release evidence: %w", err)
	}
	return nil
}

func (database ContainerSecurityDatabaseEvidence) validate() error {
	wantRepository := fmt.Sprintf("ghcr.io/aquasecurity/trivy-db:%d", database.SchemaVersion)
	if database.SchemaVersion < 1 || database.Repository != wantRepository ||
		database.UpdatedAt.IsZero() || database.DownloadedAt.IsZero() || database.NextUpdate.IsZero() {
		return errors.New("container security report database evidence is incomplete")
	}
	if !validPhase1SHA256(database.DatabaseSHA256) ||
		!validPhase1SHA256(database.MetadataSHA256) {
		return errors.New("container security report database digest is invalid")
	}
	return nil
}

func validateContainerSecurityImages(images []ContainerSecurityImageResult) error {
	if len(images) != len(containerSecurityImageNames) {
		return fmt.Errorf("container security report has %d image results", len(images))
	}
	names := make([]string, 0, len(images))
	for _, image := range images {
		names = append(names, image.Name)
		if image.Reference == "" || !validPhase1ImageID(image.ImageID) ||
			!validPhase1SHA256(image.ArchiveSHA256) || image.FindingCount < 0 {
			return fmt.Errorf("container security image %q has invalid identity", image.Name)
		}
		if image.VulnerabilityReport != image.Name+".trivy.json" ||
			image.SBOM != image.Name+".cdx.json" ||
			!validContainerSecurityArtifactName(image.VulnerabilityReport, ".trivy.json") ||
			!validContainerSecurityArtifactName(image.SBOM, ".cdx.json") ||
			!validPhase1SHA256(image.VulnerabilityReportSHA256) ||
			!validPhase1SHA256(image.SBOMSHA256) {
			return fmt.Errorf("container security image %q has invalid artifacts", image.Name)
		}
	}
	slices.Sort(names)
	if !slices.Equal(names, containerSecurityImageNames) {
		return fmt.Errorf("container security report image names are %v", names)
	}
	return nil
}

func validateContainerSecurityFindingCounts(
	images []ContainerSecurityImageResult,
	findings []ContainerSecurityFinding,
) error {
	counts := make(map[string]int, len(containerSecurityImageNames))
	for _, finding := range findings {
		counts[finding.Image]++
	}
	for _, image := range images {
		if image.FindingCount != counts[image.Name] {
			return fmt.Errorf(
				"container security image %q finding count is %d, want %d",
				image.Name,
				image.FindingCount,
				counts[image.Name],
			)
		}
	}
	return nil
}

func validateContainerSecurityFindings(findings []ContainerSecurityFinding) error {
	for _, finding := range findings {
		if !slices.Contains(containerSecurityImageNames, finding.Image) ||
			!slices.Contains(containerSecurityFindingKinds, finding.Kind) ||
			finding.ID == "" || finding.Target == "" ||
			!slices.Contains(containerSecurityFailSeverities, finding.Severity) {
			return fmt.Errorf("container security finding is invalid: %+v", finding)
		}
	}
	return nil
}

func validContainerSecurityArtifactName(value string, suffix string) bool {
	return strings.HasSuffix(value, suffix) && filepath.Base(value) == value &&
		!strings.Contains(value, "..")
}

func writeContainerSecurityArtifacts(
	recordingsRoot string,
	artifacts containerSecurityArtifactSet,
) (ContainerSecurityArtifactPaths, error) {
	if err := artifacts.validate(); err != nil {
		return ContainerSecurityArtifactPaths{}, err
	}
	finalDirectory, pendingDirectory, err := prepareResultArtifactDirectories(
		recordingsRoot,
		artifacts.report.StartedAt,
	)
	if err != nil {
		return ContainerSecurityArtifactPaths{}, err
	}
	published := false
	defer func() {
		if !published {
			_ = os.RemoveAll(pendingDirectory)
		}
	}()
	if err := writeContainerSecurityPendingArtifacts(pendingDirectory, artifacts); err != nil {
		return ContainerSecurityArtifactPaths{}, err
	}
	if err := os.Rename(pendingDirectory, finalDirectory); err != nil {
		return ContainerSecurityArtifactPaths{}, fmt.Errorf("publish container security artifacts: %w", err)
	}
	published = true
	return ContainerSecurityArtifactPaths{
		Directory:      finalDirectory,
		ReportJSON:     filepath.Join(finalDirectory, "report.json"),
		ReportMarkdown: filepath.Join(finalDirectory, "report.md"),
	}, nil
}

func (artifacts containerSecurityArtifactSet) validate() error {
	if err := artifacts.report.Validate(); err != nil {
		return err
	}
	expected := make(map[string]string, len(artifacts.report.Images)*2)
	for _, image := range artifacts.report.Images {
		expected[image.VulnerabilityReport] = image.VulnerabilityReportSHA256
		expected[image.SBOM] = image.SBOMSHA256
	}
	if len(expected) != len(artifacts.report.Images)*2 || len(artifacts.raw) != len(expected) {
		return errors.New("container security raw artifact set is incomplete")
	}
	for name, wantSHA256 := range expected {
		content, exists := artifacts.raw[name]
		if !exists || len(content) == 0 || containerSecurityBytesSHA256(content) != wantSHA256 {
			return fmt.Errorf("container security raw artifact %q does not match its report", name)
		}
	}
	return nil
}

func writeContainerSecurityPendingArtifacts(
	directory string,
	artifacts containerSecurityArtifactSet,
) error {
	if err := writeResultJSONFile(filepath.Join(directory, "report.json"), artifacts.report); err != nil {
		return err
	}
	report, err := renderContainerSecurityReport(artifacts.report)
	if err != nil {
		return err
	}
	if err := writeResultFile(filepath.Join(directory, "report.md"), func(writer io.Writer) error {
		_, err := io.WriteString(writer, report)
		return err
	}); err != nil {
		return err
	}
	for name, content := range artifacts.raw {
		if !validContainerSecurityArtifactName(name, ".json") {
			return fmt.Errorf("container security raw artifact name is invalid: %q", name)
		}
		if err := writeResultFile(filepath.Join(directory, name), func(writer io.Writer) error {
			_, err := writer.Write(content)
			return err
		}); err != nil {
			return err
		}
	}
	return nil
}

func renderContainerSecurityReport(report ContainerSecurityReport) (string, error) {
	if err := report.Validate(); err != nil {
		return "", err
	}
	var output strings.Builder
	output.WriteString("# Setta Eval Container Security\n\n")
	fmt.Fprintf(&output, "Status: **%s**  \n", strings.ToUpper(report.Status))
	fmt.Fprintf(&output, "Setta commit: `%s`  \n", report.SettaCommit)
	fmt.Fprintf(&output, "Scanner: `Trivy %s` (`%s`)  \n", report.Scanner.Version, report.Scanner.ImageID)
	fmt.Fprintf(&output, "Database updated: `%s`  \n", report.Database.UpdatedAt.Format(time.RFC3339))
	fmt.Fprintf(&output, "Database SHA-256: `%s`\n\n", report.Database.DatabaseSHA256)
	output.WriteString("| Image | Image ID | Findings | SBOM |\n")
	output.WriteString("| --- | --- | ---: | --- |\n")
	for _, image := range report.Images {
		fmt.Fprintf(
			&output,
			"| `%s` | `%s` | %d | `%s` |\n",
			image.Name,
			image.ImageID,
			image.FindingCount,
			image.SBOM,
		)
	}
	output.WriteString("\n## Blocking findings\n\n")
	if len(report.Findings) == 0 {
		output.WriteString("None.\n")
		return output.String(), nil
	}
	for _, finding := range report.Findings {
		fixed := "no fixed version reported"
		if finding.FixedVersion != "" {
			fixed = "fix " + finding.FixedVersion
		}
		fmt.Fprintf(
			&output,
			"- **%s** `%s` in `%s` / `%s` (%s)\n",
			finding.Severity,
			escapeMarkdownInline(finding.ID),
			escapeMarkdownInline(finding.Image),
			escapeMarkdownInline(finding.Target),
			escapeMarkdownInline(fixed),
		)
	}
	return output.String(), nil
}
