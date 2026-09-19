package coordinator

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"os"
	"path/filepath"
	"testing"

	"github.com/setta/review/backend/internal/contracts"
)

func TestCoordinatorAppliesAssessmentAndResponseThenExportsContinuation(t *testing.T) {
	root := t.TempDir()
	request := completionFixture("checkout")
	writeFixtureJSON(t, filepath.Join(root, "review.json"), contracts.ProjectManifest{
		Version: 1, ID: "review-project", Name: "Review project", Requests: []string{"requests/checkout.json"},
	})
	writeFixtureJSON(t, filepath.Join(root, "requests", "checkout.json"), request)
	writeFixture(t, filepath.Join(root, "logs", "checkout.log"), "start\n42 tests passed\ncomplete\n")
	coordinator, err := Open(root)
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer coordinator.Close()
	initial, err := coordinator.Snapshot()
	if err != nil {
		t.Fatalf("Snapshot() error = %v", err)
	}
	if initial.Revision != 0 || len(initial.Requests) != 1 || initial.Requests[0].Evidence[0].Status != "resolved" {
		t.Fatalf("initial snapshot = %#v", initial)
	}
	assessment := contracts.ExternalAssessment{
		Version: 1, ID: "assessment-one", RequestID: "checkout", ClaimID: "tests-pass", Assessment: "supported",
		Rationale: "The cited receipt records a passing run.", Producer: contracts.AssessmentProducer{Model: "GPT-5", Harness: "Codex"}, CreatedAt: "2026-09-19T12:00:00Z",
	}
	afterAssessment, err := coordinator.Apply(contracts.ReviewMutation{
		ProjectID: "review-project", ExpectedRevision: 0,
		Operations: []json.RawMessage{rawFixture(t, contracts.ImportAssessmentOperation{Operation: "importAssessment", Assessment: assessment})},
	})
	if err != nil {
		t.Fatalf("Apply(assessment) error = %v", err)
	}
	if afterAssessment.Snapshot.Revision != 1 || len(afterAssessment.Snapshot.Requests[0].Assessments) != 1 {
		t.Fatalf("assessment result = %#v", afterAssessment)
	}
	response := contracts.ReviewResponse{
		Version: 1, ID: "response-checkout", RequestID: "checkout", RequestSHA256: afterAssessment.Snapshot.Requests[0].SHA256,
		Type: "completion", Status: "final", Rationale: "The completion evidence is sufficient.",
		Unresolved: []contracts.UnresolvedItem{}, Annotations: []contracts.ArtifactAnnotation{},
		Provenance: contracts.Provenance{Producer: contracts.ProducerIdentity{Kind: "human", Name: "Reviewer"}, CreatedAt: "2026-09-19T12:10:00Z"},
		Completion: &contracts.CompletionResponse{Decisions: []contracts.CompletionDecision{{ClaimID: "tests-pass", Decision: "accepted", Rationale: "Receipt verified."}}},
	}
	afterResponse, err := coordinator.Apply(contracts.ReviewMutation{
		ProjectID: "review-project", ExpectedRevision: 1,
		Operations: []json.RawMessage{rawFixture(t, contracts.SetResponseOperation{Operation: "setResponse", Response: response})},
	})
	if err != nil {
		t.Fatalf("Apply(response) error = %v", err)
	}
	if afterResponse.Snapshot.Revision != 2 || afterResponse.Snapshot.Requests[0].Response == nil {
		t.Fatalf("response result = %#v", afterResponse)
	}
	exported, err := coordinator.Export(true)
	if err != nil {
		t.Fatalf("Export() error = %v", err)
	}
	if exported.Export.Revision != 2 || len(exported.Export.Responses) != 1 || len(exported.Export.Continuations) != 1 {
		t.Fatalf("Export() = %#v", exported)
	}
	if len(exported.Export.Continuations[0].Evidence) != 1 || exported.Export.Continuations[0].Evidence[0].EvidenceID != "test-log" {
		t.Fatalf("continuation = %#v", exported.Export.Continuations[0])
	}
}

func TestCoordinatorOpensOnlyAdmittedArtifactBytes(t *testing.T) {
	root := t.TempDir()
	artifact := []byte("candidate image bytes")
	digest := sha256.Sum256(artifact)
	request := completionFixture("artifact-review")
	request.Evidence = []contracts.EvidenceReference{{
		ID: "candidate", Kind: "artifact", Artifact: &contracts.ArtifactEvidenceReference{
			Path: "artifacts/candidate.png", MediaType: "image/png", ByteLength: int64(len(artifact)), SHA256: hex.EncodeToString(digest[:]),
		},
	}}
	request.Relations = []contracts.EvidenceRelation{{ID: "candidate-support", SubjectKind: "claim", SubjectID: "tests-pass", EvidenceID: "candidate", Role: "supports", Citations: []contracts.EvidenceCitation{}}}
	writeFixtureJSON(t, filepath.Join(root, "review.json"), contracts.ProjectManifest{
		Version: 1, ID: "artifact-project", Name: "Artifact project", Requests: []string{"request.json"},
	})
	writeFixtureJSON(t, filepath.Join(root, "request.json"), request)
	writeFixture(t, filepath.Join(root, "artifacts", "candidate.png"), string(artifact))
	coordinator, err := Open(root)
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer coordinator.Close()
	file, metadata, err := coordinator.OpenArtifact("artifact-review", "candidate")
	if err != nil {
		t.Fatalf("OpenArtifact() error = %v", err)
	}
	defer file.Close()
	content, err := io.ReadAll(file)
	if err != nil || string(content) != string(artifact) || metadata.MediaType != "image/png" {
		t.Fatalf("artifact = %q, %#v, %v", content, metadata, err)
	}
	writeFixture(t, filepath.Join(root, "artifacts", "candidate.png"), "changed")
	if _, _, err := coordinator.OpenArtifact("artifact-review", "candidate"); err == nil {
		t.Fatal("OpenArtifact(changed) error = nil")
	}
}

func completionFixture(id string) contracts.ReviewRequest {
	model := "GPT-5"
	harness := "Codex"
	return contracts.ReviewRequest{
		Version: 1, ID: id, Type: "completion", Title: "Verify checkout reliability", RequestedDecision: "Resolve the completion claim.",
		Evidence:   []contracts.EvidenceReference{{ID: "test-log", Kind: "text", Text: &contracts.TextEvidenceReference{Path: "logs/checkout.log", MediaType: "text/plain", StartLine: 2, EndLine: 2}}},
		Relations:  []contracts.EvidenceRelation{{ID: "tests-support", SubjectKind: "claim", SubjectID: "tests-pass", EvidenceID: "test-log", Role: "supports", Citations: []contracts.EvidenceCitation{{Kind: "lineRange", StartLine: intPointer(2), EndLine: intPointer(2)}}}},
		Provenance: contracts.Provenance{Producer: contracts.ProducerIdentity{Kind: "agent", Name: "Implementation agent", Model: &model, Harness: &harness}, CreatedAt: "2026-09-19T11:00:00Z"},
		Completion: &contracts.CompletionRequest{Claims: []contracts.CompletionClaim{{ID: "tests-pass", Text: "The checkout tests pass."}}},
	}
}

func intPointer(value int) *int {
	return &value
}

func rawFixture(t *testing.T, value any) json.RawMessage {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("Marshal() error = %v", err)
	}
	return encoded
}

func writeFixtureJSON(t *testing.T, path string, value any) {
	t.Helper()
	encoded, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatalf("MarshalIndent() error = %v", err)
	}
	writeFixture(t, path, string(append(encoded, '\n')))
}

func writeFixture(t *testing.T, path string, content string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
}
