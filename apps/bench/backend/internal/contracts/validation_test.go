package contracts

import (
	"strings"
	"testing"
)

func TestDecodeStrictRejectsUnknownDuplicateAndTrailingJSON(t *testing.T) {
	t.Parallel()
	for name, document := range map[string]string{
		"unknown":   `{"code":"bad","message":"Bad","extra":true}`,
		"duplicate": `{"code":"bad","code":"again","message":"Bad"}`,
		"trailing":  `{"code":"bad","message":"Bad"} {}`,
	} {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			var value StructuredErrorV1
			if err := DecodeStrict([]byte(document), &value); err == nil {
				t.Fatalf("DecodeStrict(%s) succeeded", document)
			}
		})
	}
}

func TestCandidateOriginRequiresSafeWebDeepLink(t *testing.T) {
	t.Parallel()
	valid := CandidateOriginV1{Application: "python-canvas", ProjectID: "canvas project / α", ProjectRevision: 4, CallableID: "callable id / β", DeepLink: "https://localhost:4173/project?id=one"}
	if err := valid.Validate(); err != nil {
		t.Fatalf("Validate() = %v", err)
	}
	for _, deepLink := range []string{"javascript:alert(1)", "file:///tmp/project", "https://user@example.com/project", "https:///missing-host"} {
		candidate := valid
		candidate.DeepLink = deepLink
		if err := candidate.Validate(); err == nil {
			t.Fatalf("Validate() accepted deep link %q", deepLink)
		}
	}
}

func TestBundleReportsBenchCandidateIDConstraint(t *testing.T) {
	t.Parallel()
	bundle := CandidateBundleV1{
		Version: BundleVersion,
		Source:  CandidateOriginV1{Application: "python-canvas", ProjectID: "canvas project", ProjectRevision: 1, CallableID: "callable", DeepLink: "http://localhost:3000/project"},
		Candidate: CandidateV1{
			ID: "candidate with spaces", Name: "Candidate",
			Command: CommandV1{Argv: []string{"python", "candidate.py"}, WorkingDirectory: "."},
		},
	}
	err := bundle.Validate()
	if err == nil || !strings.Contains(err.Error(), "Bench id characters") {
		t.Fatalf("Validate() error = %v", err)
	}
}
