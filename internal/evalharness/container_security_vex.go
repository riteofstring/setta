package evalharness

import (
	"bytes"
	"errors"
	"fmt"
	"path/filepath"
	"strings"
	"time"

	"setta/internal/jsonio"
)

const (
	containerSecurityVEXRelativePath = "evals/sandbox/container-security-scanner.openvex.json"
	containerSecurityVEXMaximumBytes = 64 * 1024
	containerSecurityVEXContext      = "https://openvex.dev/ns/v0.2.0"
	containerSecurityVEXAuthor       = "Setta maintainers"
)

type containerSecurityVEXDocument struct {
	Context    string                          `json:"@context"`
	ID         string                          `json:"@id"`
	Author     string                          `json:"author"`
	Timestamp  time.Time                       `json:"timestamp"`
	Version    int                             `json:"version"`
	Statements []containerSecurityVEXStatement `json:"statements"`
}

type containerSecurityVEXStatement struct {
	Vulnerability struct {
		Name string `json:"name"`
	} `json:"vulnerability"`
	Products []struct {
		ID string `json:"@id"`
	} `json:"products"`
	Status          string `json:"status"`
	Justification   string `json:"justification"`
	ImpactStatement string `json:"impact_statement"`
}

type containerSecurityVEXAssessment struct {
	VulnerabilityID string
	PackagePURL     string
	Justification   string
	ImpactStatement string
}

type containerSecurityVEX struct {
	payload     []byte
	assessments map[string]containerSecurityVEXAssessment
}

func loadContainerSecurityVEX(
	repoRoot string,
	scanner containerSecurityScanner,
) (containerSecurityVEX, error) {
	path := filepath.Join(repoRoot, filepath.FromSlash(containerSecurityVEXRelativePath))
	digest, err := hashContainerSecurityFile(path, containerSecurityVEXMaximumBytes)
	if err != nil {
		return containerSecurityVEX{}, err
	}
	if digest != scanner.Runtime.VEXSHA256 {
		return containerSecurityVEX{}, fmt.Errorf(
			"scanner OpenVEX SHA-256 is %s, want %s",
			digest,
			scanner.Runtime.VEXSHA256,
		)
	}
	payload, err := readContainerSecurityFile(path, containerSecurityVEXMaximumBytes)
	if err != nil {
		return containerSecurityVEX{}, err
	}
	var document containerSecurityVEXDocument
	if err := jsonio.DecodeSingle(bytes.NewReader(payload), &document); err != nil {
		return containerSecurityVEX{}, fmt.Errorf("decode scanner OpenVEX document: %w", err)
	}
	assessments, err := validateContainerSecurityVEX(document, scanner.Version, time.Now().UTC())
	if err != nil {
		return containerSecurityVEX{}, fmt.Errorf("validate scanner OpenVEX document: %w", err)
	}
	return containerSecurityVEX{
		payload:     append([]byte{}, payload...),
		assessments: assessments,
	}, nil
}

func validateContainerSecurityVEX(
	document containerSecurityVEXDocument,
	scannerVersion string,
	now time.Time,
) (map[string]containerSecurityVEXAssessment, error) {
	wantIDPrefix := "https://setta.invalid/security/vex/trivy-" + scannerVersion + "/"
	if document.Context != containerSecurityVEXContext ||
		document.Author != containerSecurityVEXAuthor ||
		!strings.HasPrefix(document.ID, wantIDPrefix) ||
		document.Version < 1 || document.Timestamp.IsZero() ||
		document.Timestamp.After(now.Add(5*time.Minute)) {
		return nil, errors.New("document identity is invalid")
	}
	if len(document.Statements) < 1 || len(document.Statements) > 32 {
		return nil, fmt.Errorf("document has %d statements, want 1-32", len(document.Statements))
	}
	assessments := make(map[string]containerSecurityVEXAssessment, len(document.Statements))
	for _, statement := range document.Statements {
		if !validContainerSecurityVulnerabilityID(statement.Vulnerability.Name) {
			return nil, fmt.Errorf(
				"statement vulnerability %q is invalid",
				statement.Vulnerability.Name,
			)
		}
		if len(statement.Products) != 1 || !validContainerSecurityGoPURL(statement.Products[0].ID) {
			return nil, fmt.Errorf(
				"statement %s must identify one exact Go package PURL",
				statement.Vulnerability.Name,
			)
		}
		if statement.Status != "not_affected" ||
			!validContainerSecurityVEXJustification(statement.Justification) ||
			len(statement.ImpactStatement) < 20 || len(statement.ImpactStatement) > 1024 ||
			strings.TrimSpace(statement.ImpactStatement) != statement.ImpactStatement {
			return nil, fmt.Errorf(
				"statement %s has an invalid assessment",
				statement.Vulnerability.Name,
			)
		}
		assessment := containerSecurityVEXAssessment{
			VulnerabilityID: statement.Vulnerability.Name,
			PackagePURL:     statement.Products[0].ID,
			Justification:   statement.Justification,
			ImpactStatement: statement.ImpactStatement,
		}
		key := containerSecurityVEXKey(assessment.VulnerabilityID, assessment.PackagePURL)
		if _, exists := assessments[key]; exists {
			return nil, fmt.Errorf("document repeats assessment %s", key)
		}
		assessments[key] = assessment
	}
	return assessments, nil
}

func validContainerSecurityVulnerabilityID(value string) bool {
	if len(value) < 8 || len(value) > 64 || strings.TrimSpace(value) != value {
		return false
	}
	prefix := "CVE-"
	if strings.HasPrefix(value, "GHSA-") {
		prefix = "GHSA-"
	} else if !strings.HasPrefix(value, prefix) {
		return false
	}
	for _, character := range strings.TrimPrefix(value, prefix) {
		if character >= 'A' && character <= 'Z' ||
			character >= 'a' && character <= 'z' ||
			character >= '0' && character <= '9' || character == '-' {
			continue
		}
		return false
	}
	return true
}

func validContainerSecurityGoPURL(value string) bool {
	if len(value) < len("pkg:golang/a@v1") || len(value) > 512 ||
		!strings.HasPrefix(value, "pkg:golang/") || strings.ContainsAny(value, "?# \t\r\n") {
		return false
	}
	packageAndVersion := strings.TrimPrefix(value, "pkg:golang/")
	separator := strings.LastIndex(packageAndVersion, "@")
	return separator > 0 && separator < len(packageAndVersion)-1 &&
		!strings.Contains(packageAndVersion[:separator], "@")
}

func validContainerSecurityVEXJustification(value string) bool {
	return value == "vulnerable_code_not_in_execute_path" ||
		value == "vulnerable_code_cannot_be_controlled_by_adversary"
}

func containerSecurityVEXKey(vulnerabilityID string, packagePURL string) string {
	return vulnerabilityID + "\x00" + packagePURL
}

func assessContainerSecurityVEX(
	observed []ContainerSecurityFinding,
	enforced []ContainerSecurityFinding,
	assessments map[string]containerSecurityVEXAssessment,
) ([]ContainerSecurityFinding, []ContainerSecurityAcceptedFinding, error) {
	remaining := make(map[string]int, len(enforced))
	for _, finding := range enforced {
		remaining[containerSecurityFindingIdentity(finding)]++
	}
	accepted := make([]ContainerSecurityAcceptedFinding, 0)
	for _, finding := range observed {
		identity := containerSecurityFindingIdentity(finding)
		if remaining[identity] > 0 {
			remaining[identity]--
			continue
		}
		if finding.Kind != "vulnerability" || finding.PackagePURL == "" {
			return nil, nil, fmt.Errorf(
				"OpenVEX unexpectedly suppressed non-vulnerability finding %s/%s",
				finding.Kind,
				finding.ID,
			)
		}
		assessment, exists := assessments[containerSecurityVEXKey(finding.ID, finding.PackagePURL)]
		if !exists {
			return nil, nil, fmt.Errorf(
				"OpenVEX suppressed unassessed finding %s in %s",
				finding.ID,
				finding.PackagePURL,
			)
		}
		accepted = append(accepted, ContainerSecurityAcceptedFinding{
			Finding:         finding,
			Justification:   assessment.Justification,
			ImpactStatement: assessment.ImpactStatement,
		})
	}
	for identity, count := range remaining {
		if count != 0 {
			return nil, nil, fmt.Errorf(
				"OpenVEX enforcement introduced or changed finding %q",
				identity,
			)
		}
	}
	blocking := append([]ContainerSecurityFinding{}, enforced...)
	sortContainerSecurityFindings(blocking)
	sortContainerSecurityAcceptedFindings(accepted)
	return blocking, accepted, nil
}

func containerSecurityFindingIdentity(finding ContainerSecurityFinding) string {
	return strings.Join([]string{
		finding.Image,
		finding.Kind,
		finding.ID,
		finding.Severity,
		finding.Target,
		finding.Package,
		finding.PackagePURL,
		finding.InstalledVersion,
		finding.FixedVersion,
		finding.Status,
		finding.Title,
	}, "\x00")
}
