package contracts

import (
	"os"
	"path/filepath"
	"testing"
)

func TestBenchCandidateBundleRejectsIncompatibleIdentityAndDeepLink(t *testing.T) {
	interpreter, err := filepath.Abs(os.Args[0])
	if err != nil {
		t.Fatalf("resolve test executable: %v", err)
	}
	bundle := BenchCandidateBundleV1{
		Version: BenchCandidateBundleVersionV1,
		Source: BenchCandidateSourceV1{
			Application: "python-canvas", ProjectID: "project:source", ProjectRevision: 2,
			CallableID: "callable:source", DeepLink: "https://example.test/canvas",
		},
		Candidate: BenchCandidateV1{
			ID: "python-canvas-candidate", Name: "Candidate",
			Command: BenchCandidateCommandV1{Argv: []string{interpreter, "candidate.py"}, WorkingDirectory: "."},
		},
	}
	if err := bundle.Validate(); err != nil {
		t.Fatalf("valid bundle: %v", err)
	}
	bundle.Source.ProjectID = "project source"
	if err := bundle.Validate(); err == nil {
		t.Fatal("bundle with incompatible source identity validated")
	}
	bundle.Source.ProjectID = "project:source"
	bundle.Source.DeepLink = "javascript:alert(1)"
	if err := bundle.Validate(); err == nil {
		t.Fatal("bundle with unsafe deep link validated")
	}
}
