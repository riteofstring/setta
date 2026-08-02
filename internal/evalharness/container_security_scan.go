package evalharness

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"slices"
	"strings"
)

const containerSecurityScanArtifactSchemaVersion = 2

type trivyImageReport struct {
	SchemaVersion int `json:"SchemaVersion"`
	Trivy         struct {
		Version string `json:"Version"`
	} `json:"Trivy"`
	ArtifactType string `json:"ArtifactType"`
	Metadata     struct {
		ImageID string `json:"ImageID"`
		OS      *struct {
			Family string `json:"Family"`
			Name   string `json:"Name"`
			EOSL   bool   `json:"EOSL"`
		} `json:"OS"`
	} `json:"Metadata"`
	Results []trivyScanResult `json:"Results"`
}

type trivyScanResult struct {
	Target            string                  `json:"Target"`
	Class             string                  `json:"Class"`
	Type              string                  `json:"Type"`
	Vulnerabilities   []trivyVulnerability    `json:"Vulnerabilities"`
	Secrets           []trivySecret           `json:"Secrets"`
	Misconfigurations []trivyMisconfiguration `json:"Misconfigurations"`
}

type trivyVulnerability struct {
	VulnerabilityID string `json:"VulnerabilityID"`
	PkgName         string `json:"PkgName"`
	PkgIdentifier   struct {
		PURL string `json:"PURL"`
	} `json:"PkgIdentifier"`
	InstalledVersion string `json:"InstalledVersion"`
	FixedVersion     string `json:"FixedVersion"`
	Status           string `json:"Status"`
	Title            string `json:"Title"`
	Severity         string `json:"Severity"`
}

type trivySecret struct {
	RuleID    string `json:"RuleID"`
	Category  string `json:"Category"`
	Severity  string `json:"Severity"`
	Title     string `json:"Title"`
	StartLine int    `json:"StartLine"`
	EndLine   int    `json:"EndLine"`
}

type trivyMisconfiguration struct {
	ID         string `json:"ID"`
	Title      string `json:"Title"`
	Message    string `json:"Message"`
	Resolution string `json:"Resolution"`
	Severity   string `json:"Severity"`
	Status     string `json:"Status"`
}

type containerSecurityScanArtifact struct {
	SchemaVersion      int                       `json:"schemaVersion"`
	ScannerVersion     string                    `json:"scannerVersion"`
	Image              string                    `json:"image"`
	ImageID            string                    `json:"imageId"`
	TrivySchemaVersion int                       `json:"trivySchemaVersion"`
	Results            []containerSecurityResult `json:"results"`
}

type containerSecurityResult struct {
	Target            string                              `json:"target"`
	Class             string                              `json:"class"`
	Type              string                              `json:"type"`
	Vulnerabilities   []containerSecurityVulnerability    `json:"vulnerabilities"`
	Secrets           []containerSecuritySecret           `json:"secrets"`
	Misconfigurations []containerSecurityMisconfiguration `json:"misconfigurations"`
}

type containerSecurityVulnerability struct {
	ID               string `json:"id"`
	Package          string `json:"package"`
	PackagePURL      string `json:"packagePurl,omitempty"`
	InstalledVersion string `json:"installedVersion"`
	FixedVersion     string `json:"fixedVersion,omitempty"`
	Status           string `json:"status,omitempty"`
	Title            string `json:"title,omitempty"`
	Severity         string `json:"severity"`
}

type containerSecuritySecret struct {
	ID        string `json:"id"`
	Category  string `json:"category,omitempty"`
	Severity  string `json:"severity"`
	Title     string `json:"title,omitempty"`
	StartLine int    `json:"startLine,omitempty"`
	EndLine   int    `json:"endLine,omitempty"`
}

type containerSecurityMisconfiguration struct {
	ID         string `json:"id"`
	Title      string `json:"title,omitempty"`
	Message    string `json:"message,omitempty"`
	Resolution string `json:"resolution,omitempty"`
	Severity   string `json:"severity"`
	Status     string `json:"status,omitempty"`
}

type parsedContainerSecurityScan struct {
	artifact []byte
	findings []ContainerSecurityFinding
}

func parseContainerSecurityScan(
	image string,
	imageID string,
	scannerVersion string,
	payload []byte,
) (parsedContainerSecurityScan, error) {
	var report trivyImageReport
	if err := json.Unmarshal(payload, &report); err != nil {
		return parsedContainerSecurityScan{}, fmt.Errorf("decode Trivy report for %s: %w", image, err)
	}
	if report.SchemaVersion < 1 {
		return parsedContainerSecurityScan{}, fmt.Errorf("Trivy report for %s omitted schemaVersion", image)
	}
	if report.Trivy.Version != scannerVersion || report.ArtifactType != "container_image" {
		return parsedContainerSecurityScan{}, fmt.Errorf(
			"Trivy report for %s has scanner/artifact %q/%q, want %q/container_image",
			image,
			report.Trivy.Version,
			report.ArtifactType,
			scannerVersion,
		)
	}
	if !validPhase1ImageID(imageID) || report.Metadata.ImageID != imageID {
		return parsedContainerSecurityScan{}, fmt.Errorf(
			"Trivy report for %s identified image %q, want %q",
			image,
			report.Metadata.ImageID,
			imageID,
		)
	}
	artifact := containerSecurityScanArtifact{
		SchemaVersion:      containerSecurityScanArtifactSchemaVersion,
		ScannerVersion:     scannerVersion,
		Image:              image,
		ImageID:            imageID,
		TrivySchemaVersion: report.SchemaVersion,
		Results:            make([]containerSecurityResult, 0, len(report.Results)),
	}
	findings := make([]ContainerSecurityFinding, 0)
	for _, result := range report.Results {
		sanitized, resultFindings, err := sanitizeContainerSecurityResult(image, result)
		if err != nil {
			return parsedContainerSecurityScan{}, err
		}
		artifact.Results = append(artifact.Results, sanitized)
		findings = append(findings, resultFindings...)
	}
	if report.Metadata.OS != nil && report.Metadata.OS.EOSL {
		family := boundedContainerSecurityText(report.Metadata.OS.Family)
		version := boundedContainerSecurityText(report.Metadata.OS.Name)
		findings = append(findings, ContainerSecurityFinding{
			Image:    image,
			Kind:     "end_of_life",
			ID:       "end-of-life:" + family + ":" + version,
			Severity: "HIGH",
			Target:   family + " " + version,
			Title:    "Container operating system has reached end of life",
		})
	}
	sortContainerSecurityFindings(findings)
	encoded, err := json.MarshalIndent(artifact, "", "  ")
	if err != nil {
		return parsedContainerSecurityScan{}, fmt.Errorf("encode sanitized Trivy report for %s: %w", image, err)
	}
	return parsedContainerSecurityScan{
		artifact: append(encoded, '\n'),
		findings: findings,
	}, nil
}

func sanitizeContainerSecurityResult(
	image string,
	result trivyScanResult,
) (containerSecurityResult, []ContainerSecurityFinding, error) {
	target := boundedContainerSecurityText(result.Target)
	if target == "" {
		target = image
	}
	sanitized := containerSecurityResult{
		Target:            target,
		Class:             boundedContainerSecurityText(result.Class),
		Type:              boundedContainerSecurityText(result.Type),
		Vulnerabilities:   make([]containerSecurityVulnerability, 0, len(result.Vulnerabilities)),
		Secrets:           make([]containerSecuritySecret, 0, len(result.Secrets)),
		Misconfigurations: make([]containerSecurityMisconfiguration, 0, len(result.Misconfigurations)),
	}
	findings := make([]ContainerSecurityFinding, 0)
	for _, vulnerability := range result.Vulnerabilities {
		severity, err := validateContainerSecuritySeverity(vulnerability.Severity)
		if err != nil {
			return containerSecurityResult{}, nil, err
		}
		item := containerSecurityVulnerability{
			ID:               boundedContainerSecurityText(vulnerability.VulnerabilityID),
			Package:          boundedContainerSecurityText(vulnerability.PkgName),
			PackagePURL:      boundedContainerSecurityText(vulnerability.PkgIdentifier.PURL),
			InstalledVersion: boundedContainerSecurityText(vulnerability.InstalledVersion),
			FixedVersion:     boundedContainerSecurityText(vulnerability.FixedVersion),
			Status:           boundedContainerSecurityText(vulnerability.Status),
			Title:            boundedContainerSecurityText(vulnerability.Title),
			Severity:         severity,
		}
		if item.ID == "" || item.Package == "" || item.InstalledVersion == "" {
			return containerSecurityResult{}, nil, errors.New("Trivy vulnerability omitted required identity")
		}
		sanitized.Vulnerabilities = append(sanitized.Vulnerabilities, item)
		findings = append(findings, ContainerSecurityFinding{
			Image:            image,
			Kind:             "vulnerability",
			ID:               item.ID,
			Severity:         item.Severity,
			Target:           target,
			Package:          item.Package,
			PackagePURL:      item.PackagePURL,
			InstalledVersion: item.InstalledVersion,
			FixedVersion:     item.FixedVersion,
			Status:           item.Status,
			Title:            item.Title,
		})
	}
	for _, secret := range result.Secrets {
		severity, err := validateContainerSecuritySeverity(secret.Severity)
		if err != nil {
			return containerSecurityResult{}, nil, err
		}
		item := containerSecuritySecret{
			ID:        boundedContainerSecurityText(secret.RuleID),
			Category:  boundedContainerSecurityText(secret.Category),
			Severity:  severity,
			Title:     boundedContainerSecurityText(secret.Title),
			StartLine: secret.StartLine,
			EndLine:   secret.EndLine,
		}
		if item.ID == "" || item.StartLine < 0 || item.EndLine < item.StartLine {
			return containerSecurityResult{}, nil, errors.New("Trivy secret finding omitted required identity")
		}
		sanitized.Secrets = append(sanitized.Secrets, item)
		findings = append(findings, ContainerSecurityFinding{
			Image:    image,
			Kind:     "secret",
			ID:       item.ID,
			Severity: item.Severity,
			Target:   target,
			Title:    item.Title,
		})
	}
	for _, misconfiguration := range result.Misconfigurations {
		severity, err := validateContainerSecuritySeverity(misconfiguration.Severity)
		if err != nil {
			return containerSecurityResult{}, nil, err
		}
		item := containerSecurityMisconfiguration{
			ID:         boundedContainerSecurityText(misconfiguration.ID),
			Title:      boundedContainerSecurityText(misconfiguration.Title),
			Message:    boundedContainerSecurityText(misconfiguration.Message),
			Resolution: boundedContainerSecurityText(misconfiguration.Resolution),
			Severity:   severity,
			Status:     boundedContainerSecurityText(misconfiguration.Status),
		}
		if item.ID == "" {
			return containerSecurityResult{}, nil, errors.New("Trivy misconfiguration omitted required identity")
		}
		sanitized.Misconfigurations = append(sanitized.Misconfigurations, item)
		if !strings.EqualFold(item.Status, "PASS") {
			findings = append(findings, ContainerSecurityFinding{
				Image:    image,
				Kind:     "misconfiguration",
				ID:       item.ID,
				Severity: item.Severity,
				Target:   target,
				Status:   item.Status,
				Title:    item.Title,
			})
		}
	}
	return sanitized, findings, nil
}

func validateContainerSecuritySeverity(value string) (string, error) {
	severity := strings.ToUpper(strings.TrimSpace(value))
	if !slices.Contains(containerSecurityFailSeverities, severity) {
		return "", fmt.Errorf("Trivy returned out-of-policy severity %q", value)
	}
	return severity, nil
}

func boundedContainerSecurityText(value string) string {
	value = strings.TrimSpace(value)
	if len(value) <= phase0MaxDiagnosticBytes {
		return value
	}
	return value[:phase0MaxDiagnosticBytes] + "…"
}

func sortContainerSecurityFindings(findings []ContainerSecurityFinding) {
	slices.SortFunc(findings, func(left ContainerSecurityFinding, right ContainerSecurityFinding) int {
		leftKey := containerSecurityFindingIdentity(left)
		rightKey := containerSecurityFindingIdentity(right)
		return strings.Compare(leftKey, rightKey)
	})
}

func sortContainerSecurityAcceptedFindings(findings []ContainerSecurityAcceptedFinding) {
	slices.SortFunc(findings, func(
		left ContainerSecurityAcceptedFinding,
		right ContainerSecurityAcceptedFinding,
	) int {
		return strings.Compare(
			containerSecurityFindingIdentity(left.Finding),
			containerSecurityFindingIdentity(right.Finding),
		)
	})
}

func validateContainerSecuritySBOM(payload []byte) error {
	var document struct {
		BOMFormat   string          `json:"bomFormat"`
		SpecVersion string          `json:"specVersion"`
		Version     int             `json:"version"`
		Components  json.RawMessage `json:"components"`
	}
	if err := json.Unmarshal(payload, &document); err != nil {
		return fmt.Errorf("decode CycloneDX SBOM: %w", err)
	}
	if document.BOMFormat != "CycloneDX" || document.SpecVersion == "" ||
		document.Version < 1 || len(document.Components) == 0 {
		return errors.New("Trivy returned an incomplete CycloneDX SBOM")
	}
	return nil
}

func readContainerSecurityFile(path string, maximumBytes int64) ([]byte, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return nil, fmt.Errorf("inspect container security artifact %s: %w", filepath.Base(path), err)
	}
	if !info.Mode().IsRegular() || info.Size() < 1 || info.Size() > maximumBytes {
		return nil, fmt.Errorf(
			"container security artifact %s must be a non-empty regular file no larger than %d bytes",
			filepath.Base(path),
			maximumBytes,
		)
	}
	payload, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("read container security artifact %s: %w", filepath.Base(path), err)
	}
	return payload, nil
}

func hashContainerSecurityFile(path string, maximumBytes int64) (string, error) {
	info, err := os.Lstat(path)
	if err != nil {
		return "", fmt.Errorf("inspect container security file %s: %w", filepath.Base(path), err)
	}
	if !info.Mode().IsRegular() || info.Size() < 1 || info.Size() > maximumBytes {
		return "", fmt.Errorf(
			"container security file %s must be a non-empty regular file no larger than %d bytes",
			filepath.Base(path),
			maximumBytes,
		)
	}
	file, err := os.Open(path)
	if err != nil {
		return "", fmt.Errorf("open container security file %s: %w", filepath.Base(path), err)
	}
	defer file.Close()
	digest := sha256.New()
	written, err := io.Copy(digest, io.LimitReader(file, maximumBytes+1))
	if err != nil {
		return "", fmt.Errorf("hash container security file %s: %w", filepath.Base(path), err)
	}
	if written != info.Size() {
		return "", fmt.Errorf("container security file %s changed while hashing", filepath.Base(path))
	}
	return hex.EncodeToString(digest.Sum(nil)), nil
}
