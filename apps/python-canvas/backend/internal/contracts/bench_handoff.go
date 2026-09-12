package contracts

import (
	"fmt"
	"path/filepath"
	"strings"
	"unicode/utf8"
)

const BenchCandidateBundleVersionV1 = 1

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
	if err := requireStableID("source.projectId", bundle.Source.ProjectID); err != nil {
		return err
	}
	if bundle.Source.ProjectRevision < 1 {
		return ValidationError{Field: "source.projectRevision", Problem: "must be positive"}
	}
	if err := requireStableID("source.callableId", bundle.Source.CallableID); err != nil {
		return err
	}
	if err := requireBoundedBenchText("source.deepLink", bundle.Source.DeepLink, 4096); err != nil {
		return err
	}
	if err := requireStableID("candidate.id", bundle.Candidate.ID); err != nil {
		return err
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

func requireBoundedBenchText(field string, value string, maximum int) error {
	if !utf8.ValidString(value) || strings.TrimSpace(value) != value || value == "" || strings.ContainsRune(value, '\x00') {
		return ValidationError{Field: field, Problem: "must be non-empty, trimmed valid UTF-8"}
	}
	if len(value) > maximum {
		return ValidationError{Field: field, Problem: fmt.Sprintf("must be no more than %d bytes", maximum)}
	}
	return nil
}
