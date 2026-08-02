package evalharness

import (
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestContainerSecurityPolicyAcceptsPinnedContract(t *testing.T) {
	pin := containerSecurityTestPin()
	if err := pin.validate(); err != nil {
		t.Fatalf("validate container security policy: %v", err)
	}

	pin.Scanner.Image = "docker.io/aquasec/trivy:latest"
	if err := pin.validate(); err == nil {
		t.Fatal("floating scanner image was accepted")
	}
}

func TestParseContainerSecurityScanSanitizesSecretMatches(t *testing.T) {
	imageID := "sha256:" + strings.Repeat("a", 64)
	payload := []byte(`{
  "SchemaVersion": 2,
  "Trivy": {"Version": "0.72.0"},
  "ArtifactType": "container_image",
  "Metadata": {
    "ImageID": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    "OS": {"Family": "debian", "Name": "12", "EOSL": false}
  },
  "Results": [{
    "Target": "fixture",
    "Class": "os-pkgs",
    "Type": "debian",
    "Vulnerabilities": [{
      "VulnerabilityID": "CVE-2026-0001",
      "PkgName": "libfixture",
      "PkgIdentifier": {"PURL": "pkg:deb/debian/libfixture@1.0.0"},
      "InstalledVersion": "1.0.0",
      "FixedVersion": "1.0.1",
      "Status": "fixed",
      "Title": "Fixture vulnerability",
      "Severity": "CRITICAL"
    }],
    "Secrets": [{
      "RuleID": "fixture-secret",
      "Category": "token",
      "Severity": "HIGH",
      "Title": "Fixture token",
      "StartLine": 4,
      "EndLine": 4,
      "Match": "do-not-persist-this-secret"
    }],
    "Misconfigurations": [{
      "ID": "DS-0001",
      "Title": "Fixture configuration",
      "Message": "Fixture runs as root",
      "Resolution": "Use a non-root user",
      "Severity": "HIGH",
      "Status": "FAIL"
    }]
  }]
}`)

	parsed, err := parseContainerSecurityScan("agent", imageID, "0.72.0", payload)
	if err != nil {
		t.Fatalf("parse container scan: %v", err)
	}
	if len(parsed.findings) != 3 {
		t.Fatalf("findings = %d, want 3", len(parsed.findings))
	}
	if strings.Contains(string(parsed.artifact), "do-not-persist-this-secret") {
		t.Fatal("sanitized scan artifact retained the matched secret")
	}
}

func TestAssessContainerSecurityVEXRecordsExactScannerAssessment(t *testing.T) {
	finding := ContainerSecurityFinding{
		Image:            "scanner",
		Kind:             "vulnerability",
		ID:               "CVE-2026-50163",
		Severity:         "HIGH",
		Target:           "usr/local/bin/trivy",
		Package:          "oras.land/oras-go/v2",
		PackagePURL:      "pkg:golang/oras.land/oras-go/v2@v2.6.0",
		InstalledVersion: "v2.6.0",
	}
	assessment := containerSecurityVEXAssessment{
		VulnerabilityID: finding.ID,
		PackagePURL:     finding.PackagePURL,
		Justification:   "vulnerable_code_not_in_execute_path",
		ImpactStatement: "The scanner never invokes the vulnerable artifact extraction path.",
	}
	blocking, accepted, err := assessContainerSecurityVEX(
		[]ContainerSecurityFinding{finding},
		nil,
		map[string]containerSecurityVEXAssessment{
			containerSecurityVEXKey(finding.ID, finding.PackagePURL): assessment,
		},
	)
	if err != nil {
		t.Fatalf("assess scanner OpenVEX: %v", err)
	}
	if len(blocking) != 0 || len(accepted) != 1 || accepted[0].Finding != finding {
		t.Fatalf("assessment = blocking %+v, accepted %+v", blocking, accepted)
	}
}

func TestAssessContainerSecurityVEXRejectsUnassessedSuppression(t *testing.T) {
	finding := ContainerSecurityFinding{
		Image:            "scanner",
		Kind:             "vulnerability",
		ID:               "CVE-2026-99999",
		Severity:         "HIGH",
		Target:           "usr/local/bin/trivy",
		Package:          "example.invalid/module",
		PackagePURL:      "pkg:golang/example.invalid/module@v1.0.0",
		InstalledVersion: "v1.0.0",
	}
	if _, _, err := assessContainerSecurityVEX(
		[]ContainerSecurityFinding{finding},
		nil,
		map[string]containerSecurityVEXAssessment{},
	); err == nil {
		t.Fatal("unassessed scanner suppression was accepted")
	}
}

func TestParseContainerSecurityScanRejectsNonBlockingSeverity(t *testing.T) {
	imageID := "sha256:" + strings.Repeat("a", 64)
	payload := []byte(`{
  "SchemaVersion": 2,
  "Trivy": {"Version": "0.72.0"},
  "ArtifactType": "container_image",
  "Metadata": {
    "ImageID": "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
  },
  "Results": [{
    "Target": "fixture",
    "Vulnerabilities": [{
      "VulnerabilityID": "CVE-2026-0002",
      "PkgName": "libfixture",
      "InstalledVersion": "1.0.0",
      "Severity": "MEDIUM"
    }]
  }]
}`)
	if _, err := parseContainerSecurityScan("agent", imageID, "0.72.0", payload); err == nil {
		t.Fatal("out-of-policy Trivy severity was accepted")
	}
}

func TestContainerSecurityMountRejectsDockerOptionInjection(t *testing.T) {
	_, err := containerSecurityMountArgument(containerSecurityMount{
		source:   "/tmp/fixture,readonly=false",
		target:   "/input/image.tar",
		readOnly: true,
	})
	if err == nil {
		t.Fatal("comma-bearing Docker mount source was accepted")
	}
}

func TestValidateContainerSecurityReleaseURLRejectsUnownedHost(t *testing.T) {
	address, err := url.Parse("https://example.com/release")
	if err != nil {
		t.Fatalf("parse release URL: %v", err)
	}
	if err := validateContainerSecurityReleaseURL(address); err == nil {
		t.Fatal("unowned release host was accepted")
	}
}

func containerSecurityTestPin() containerSecurityPolicyPin {
	digest := "sha256:" + strings.Repeat("a", 64)
	return containerSecurityPolicyPin{
		SchemaVersion: containerSecurityPolicySchemaVersion,
		Platform:      phase1ImagePlatform,
		Scanner: containerSecurityScanner{
			Name:                        containerSecurityTrivyName,
			Version:                     "0.72.0",
			Image:                       containerSecurityTrivyImagePrefix + strings.Repeat("b", 64),
			ImageID:                     digest,
			PlatformManifestDigest:      digest,
			AttestationManifestDigest:   digest,
			SBOMAttestationDigest:       digest,
			ProvenanceAttestationDigest: digest,
			Release: containerSecurityRelease{
				PublishedAt:                   time.Date(2026, time.June, 30, 9, 34, 6, 0, time.UTC),
				URL:                           "https://github.com/aquasecurity/trivy/releases/tag/v0.72.0",
				SBOMURL:                       "https://github.com/aquasecurity/trivy/releases/download/v0.72.0/bom.json",
				SBOMSHA256:                    strings.Repeat("c", 64),
				ChecksumsSigstoreBundleURL:    "https://github.com/aquasecurity/trivy/releases/download/v0.72.0/trivy_0.72.0_checksums.txt.sigstore.json",
				ChecksumsSigstoreBundleSHA256: strings.Repeat("d", 64),
			},
			Runtime: containerSecurityScannerRuntime{
				BinarySHA256:         strings.Repeat("e", 64),
				CACertificatesSHA256: strings.Repeat("f", 64),
				VEXSHA256:            strings.Repeat("0", 64),
			},
		},
		Database: containerSecurityDatabase{
			Repository:      "ghcr.io/aquasecurity/trivy-db:2",
			SchemaVersion:   2,
			MaximumAgeHours: 24,
		},
		Policy: containerSecurityFindings{
			FailSeverities:     append([]string{}, containerSecurityFailSeverities...),
			MaximumImageBytes:  1024,
			MaximumReportBytes: 1024,
		},
	}
}
