package contracts

import (
	"fmt"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"
	"unicode/utf8"
)

const BenchCandidateBundleVersionV1 = 1

var benchCandidateIDPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$`)

func ValidBenchCandidateID(value string) bool {
	return benchCandidateIDPattern.MatchString(value)
}

type BenchCandidateBundleV1 struct {
	Version   int                    `json:"version"`
	Source    BenchCandidateSourceV1 `json:"source"`
	Candidate BenchCandidateV1       `json:"candidate"`
}

type BenchCandidateSourceV1 struct {
	Application     string `json:"application"`
	ProjectID       string `json:"projectId"`
	ProjectRevision int    `json:"projectRevision"`
	CallableID      string `json:"callableId"`
	DeepLink        string `json:"deepLink"`
}

type BenchCandidateV1 struct {
	ID      string                  `json:"id"`
	Name    string                  `json:"name"`
	Command BenchCandidateCommandV1 `json:"command"`
}

type BenchCandidateCommandV1 struct {
	Argv             []string `json:"argv"`
	WorkingDirectory string   `json:"workingDirectory"`
}

func (bundle BenchCandidateBundleV1) Validate() error {
	if bundle.Version != BenchCandidateBundleVersionV1 {
		return ValidationError{Field: "version", Problem: "must be 1"}
	}
	if bundle.Source.Application != "python-canvas" {
		return ValidationError{Field: "source.application", Problem: "must be python-canvas"}
	}
	if !ValidBenchCandidateID(bundle.Source.ProjectID) {
		return ValidationError{Field: "source.projectId", Problem: "is incompatible with the Bench candidate contract"}
	}
	if bundle.Source.ProjectRevision < 1 {
		return ValidationError{Field: "source.projectRevision", Problem: "must be positive"}
	}
	if !ValidBenchCandidateID(bundle.Source.CallableID) {
		return ValidationError{Field: "source.callableId", Problem: "is incompatible with the Bench candidate contract"}
	}
	if err := requireSafeBenchDeepLink(bundle.Source.DeepLink); err != nil {
		return err
	}
	if !ValidBenchCandidateID(bundle.Candidate.ID) {
		return ValidationError{Field: "candidate.id", Problem: "is incompatible with the Bench candidate contract"}
	}
	if err := requireDisplayName("candidate.name", bundle.Candidate.Name); err != nil {
		return err
	}
	if len(bundle.Candidate.Command.Argv) != 2 {
		return ValidationError{Field: "candidate.command.argv", Problem: "must contain the interpreter and candidate.py"}
	}
	if !filepath.IsAbs(bundle.Candidate.Command.Argv[0]) {
		return ValidationError{Field: "candidate.command.argv[0]", Problem: "must be an absolute interpreter path"}
	}
	if bundle.Candidate.Command.Argv[1] != "candidate.py" {
		return ValidationError{Field: "candidate.command.argv[1]", Problem: "must be candidate.py"}
	}
	if bundle.Candidate.Command.WorkingDirectory != "." {
		return ValidationError{Field: "candidate.command.workingDirectory", Problem: "must be the bundle root"}
	}
	return nil
}

func requireSafeBenchDeepLink(value string) error {
	if err := requireBoundedBenchText("source.deepLink", value, 4096); err != nil {
		return err
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" || parsed.User != nil {
		return ValidationError{Field: "source.deepLink", Problem: "must be an absolute HTTP or HTTPS URL without user information"}
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" {
		return ValidationError{Field: "source.deepLink", Problem: "must be an absolute HTTP or HTTPS URL without user information"}
	}
	return nil
}

func requireBoundedBenchText(field string, value string, maximum int) error {
	if !utf8.ValidString(value) || strings.TrimSpace(value) != value || value == "" || strings.ContainsRune(value, '\x00') {
		return ValidationError{Field: field, Problem: "must be non-empty, trimmed valid UTF-8"}
	}
	if len(value) > maximum {
		return ValidationError{Field: field, Problem: fmt.Sprintf("must be no more than %d bytes", maximum)}
	}
	return nil
}
