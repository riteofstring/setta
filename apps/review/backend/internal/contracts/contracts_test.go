package contracts

import (
	"encoding/json"
	"strings"
	"testing"
)

const fixtureRequestSHA = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"

func TestDecodeStrictRejectsUnknownAndRepeatedFields(t *testing.T) {
	unknown := []byte(`{"version":1,"id":"project","name":"Review","requests":["requests/one.json"],"extra":true}`)
	var manifest ProjectManifest
	if err := DecodeStrict(unknown, &manifest); err == nil || !strings.Contains(err.Error(), "unknown field") {
		t.Fatalf("DecodeStrict(unknown) error = %v", err)
	}
	repeated := []byte(`{"version":1,"id":"project","id":"other","name":"Review","requests":["requests/one.json"]}`)
	if err := DecodeStrict(repeated, &manifest); err == nil || !strings.Contains(err.Error(), "repeats field") {
		t.Fatalf("DecodeStrict(repeated) error = %v", err)
	}
}

func TestProjectManifestRequiresUniqueNormalizedRequestPaths(t *testing.T) {
	manifest := fixtureManifest()
	if err := manifest.Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
	manifest.Requests = []string{"../outside.json"}
	if err := manifest.Validate(); err == nil || !strings.Contains(err.Error(), "normalized relative path") {
		t.Fatalf("Validate(parent path) error = %v", err)
	}
	manifest.Requests = []string{"requests/one.json", "requests/one.json"}
	if err := manifest.Validate(); err == nil || !strings.Contains(err.Error(), "repeated") {
		t.Fatalf("Validate(repeated path) error = %v", err)
	}
}

func TestCompletionRequestValidatesExactEvidenceRelations(t *testing.T) {
	request := fixtureCompletionRequest()
	if err := request.Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
	request.Relations[0].SubjectID = "missing"
	if err := request.Validate(); err == nil || !strings.Contains(err.Error(), "missing subject") {
		t.Fatalf("Validate(missing subject) error = %v", err)
	}
	request = fixtureCompletionRequest()
	request.Relations[0].Citations[0].Kind = "jsonPointer"
	pointer := "/result"
	request.Relations[0].Citations[0].Pointer = &pointer
	request.Relations[0].Citations[0].StartLine = nil
	request.Relations[0].Citations[0].EndLine = nil
	if err := request.Validate(); err == nil || !strings.Contains(err.Error(), "citation body is invalid") {
		t.Fatalf("Validate(citation kind) error = %v", err)
	}
	request = fixtureCompletionRequest()
	request.Evidence[0].Text.SourceSHA256 = "changed"
	if err := request.Validate(); err == nil || !strings.Contains(err.Error(), "source SHA-256") {
		t.Fatalf("Validate(source identity) error = %v", err)
	}
}

func TestCodeEvidenceAcceptsWorkspaceLanguages(t *testing.T) {
	for _, language := range []string{"python", "javascript", "typescript", "plaintext"} {
		reference := EvidenceReference{
			ID: "source", Kind: "code", Code: &CodeEvidenceReference{Path: "source/example", Language: language, SourceSHA256: fixtureRequestSHA},
		}
		if err := reference.Validate(); err != nil {
			t.Fatalf("Validate(%s) error = %v", language, err)
		}
	}
	reference := EvidenceReference{
		ID: "source", Kind: "code", Code: &CodeEvidenceReference{Path: "source/example.rb", Language: "ruby", SourceSHA256: fixtureRequestSHA},
	}
	if err := reference.Validate(); err == nil || !strings.Contains(err.Error(), "language is unsupported") {
		t.Fatalf("Validate(unsupported language) error = %v", err)
	}
}

func TestChoiceRequestValidatesCompleteMatrixAndArtifactCandidates(t *testing.T) {
	matrix := fixtureChoiceRequest("matrix")
	if err := matrix.Validate(); err != nil {
		t.Fatalf("Validate(matrix) error = %v", err)
	}
	matrix.Choice.Tradeoffs = matrix.Choice.Tradeoffs[:1]
	if err := matrix.Validate(); err == nil || !strings.Contains(err.Error(), "every option and factor") {
		t.Fatalf("Validate(incomplete matrix) error = %v", err)
	}
	artifacts := fixtureChoiceRequest("artifacts")
	if err := artifacts.Validate(); err != nil {
		t.Fatalf("Validate(artifacts) error = %v", err)
	}
	artifacts.Choice.Options[0].ArtifactEvidenceID = nil
	if err := artifacts.Validate(); err == nil || !strings.Contains(err.Error(), "has no artifact") {
		t.Fatalf("Validate(missing candidate artifact) error = %v", err)
	}
	matrix = fixtureChoiceRequest("matrix")
	matrix.Choice.ExpectedResponse = "ranking"
	if err := matrix.Validate(); err == nil || !strings.Contains(err.Error(), "expected response is unsupported") {
		t.Fatalf("Validate(ranking) error = %v", err)
	}
	response := fixtureChoiceResponse(matrix.ID)
	response.Choice.Outcome = "ranked"
	if err := response.Validate(); err == nil || !strings.Contains(err.Error(), "outcome is unsupported") {
		t.Fatalf("Validate(ranked outcome) error = %v", err)
	}
}

func TestExternalAssessmentRequiresModelHarnessAndQualifiedCaveat(t *testing.T) {
	assessment := fixtureAssessment()
	if err := assessment.Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
	assessment.Producer.Harness = ""
	if err := assessment.Validate(); err == nil || !strings.Contains(err.Error(), "harness") {
		t.Fatalf("Validate(missing harness) error = %v", err)
	}
	assessment = fixtureAssessment()
	assessment.Caveat = nil
	if err := assessment.Validate(); err == nil || !strings.Contains(err.Error(), "requires a caveat") {
		t.Fatalf("Validate(missing caveat) error = %v", err)
	}
}

func TestSnapshotAcceptsNoAssessmentsAndRetainsResolutionFailures(t *testing.T) {
	snapshot := fixtureSnapshot()
	snapshot.Requests[0].Assessments = []ExternalAssessment{}
	failure := StructuredError{Code: "evidence_missing", Message: "Evidence file is missing."}
	snapshot.Requests[0].Evidence[0] = ResolvedEvidence{EvidenceID: "test-log", Status: "failed", Error: &failure}
	if err := snapshot.Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
}

func TestResponseBindsAnnotationsToAdmittedArtifactIdentity(t *testing.T) {
	request := fixtureChoiceRequest("artifacts")
	snapshot := fixtureSnapshotForRequest(request)
	response := fixtureChoiceResponse(request.ID)
	snapshot.Requests[0].Response = &response
	if err := snapshot.Validate(); err != nil {
		t.Fatalf("Validate() error = %v", err)
	}
	snapshot.Requests[0].Response.Annotations[0].ArtifactSHA256 = strings.Repeat("b", 64)
	if err := snapshot.Validate(); err == nil || !strings.Contains(err.Error(), "does not match an admitted artifact") {
		t.Fatalf("Validate(mismatched annotation) error = %v", err)
	}
}

func TestNormalizedAnnotationRejectsOutOfBoundsPoint(t *testing.T) {
	response := fixtureChoiceResponse("choice-request")
	response.Annotations[0].Paths[0].Points[1].X = 1.01
	if err := response.Validate(); err == nil || !strings.Contains(err.Error(), "outside the artifact") {
		t.Fatalf("Validate() error = %v", err)
	}
}

func TestApplyMutationIsRevisionBoundAndDoesNotMutateInput(t *testing.T) {
	snapshot := fixtureSnapshot()
	assessment := fixtureAssessment()
	mutation := ReviewMutation{
		ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Revision,
		Operations: []json.RawMessage{rawOperation(t, ImportAssessmentOperation{Operation: "importAssessment", Assessment: assessment})},
	}
	updated, err := ApplyMutation(snapshot, mutation)
	if err != nil {
		t.Fatalf("ApplyMutation() error = %v", err)
	}
	if updated.Revision != snapshot.Revision+1 || len(updated.Requests[0].Assessments) != 1 {
		t.Fatalf("updated snapshot = %#v", updated)
	}
	if len(snapshot.Requests[0].Assessments) != 0 {
		t.Fatal("ApplyMutation() changed its input")
	}
	if _, err := ApplyMutation(updated, mutation); err == nil || !strings.Contains(err.Error(), "revision conflict") {
		t.Fatalf("ApplyMutation(stale) error = %v", err)
	}
}

func TestApplyMutationRejectsDuplicateImmutableAssessmentAtomically(t *testing.T) {
	snapshot := fixtureSnapshot()
	assessment := fixtureAssessment()
	operation := rawOperation(t, ImportAssessmentOperation{Operation: "importAssessment", Assessment: assessment})
	mutation := ReviewMutation{ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Revision, Operations: []json.RawMessage{operation, operation}}
	if _, err := ApplyMutation(snapshot, mutation); err == nil || !strings.Contains(err.Error(), "already exists") {
		t.Fatalf("ApplyMutation() error = %v", err)
	}
	if snapshot.Revision != 4 || len(snapshot.Requests[0].Assessments) != 0 {
		t.Fatalf("input snapshot changed = %#v", snapshot)
	}
}

func TestApplyMutationSetsAndDeletesResponse(t *testing.T) {
	snapshot := fixtureSnapshot()
	response := fixtureCompletionResponse(snapshot.Requests[0].Request.ID)
	setMutation := ReviewMutation{
		ProjectID: snapshot.Project.ID, ExpectedRevision: snapshot.Revision,
		Operations: []json.RawMessage{rawOperation(t, SetResponseOperation{Operation: "setResponse", Response: response})},
	}
	updated, err := ApplyMutation(snapshot, setMutation)
	if err != nil {
		t.Fatalf("ApplyMutation(set) error = %v", err)
	}
	if updated.Requests[0].Response == nil || updated.Requests[0].Response.ID != response.ID {
		t.Fatalf("response = %#v", updated.Requests[0].Response)
	}
	deleteMutation := ReviewMutation{
		ProjectID: updated.Project.ID, ExpectedRevision: updated.Revision,
		Operations: []json.RawMessage{rawOperation(t, DeleteResponseOperation{Operation: "deleteResponse", RequestID: response.RequestID})},
	}
	deleted, err := ApplyMutation(updated, deleteMutation)
	if err != nil {
		t.Fatalf("ApplyMutation(delete) error = %v", err)
	}
	if deleted.Requests[0].Response != nil {
		t.Fatalf("response = %#v", deleted.Requests[0].Response)
	}
}

func TestPublicSchemasExposeEveryContractDocument(t *testing.T) {
	want := []string{
		"projectManifest", "reviewRequest", "externalAssessment", "reviewMutation", "reviewSnapshot", "reviewResponse",
		"continuationPacket", "exportDocument", "mutationResult", "exportResult", "structuredError",
	}
	schemas := PublicSchemas()
	for _, name := range want {
		schema, exists := schemas[name]
		if !exists || schema["$ref"] == nil || schema["$defs"] == nil {
			t.Fatalf("schema %q = %#v", name, schema)
		}
	}
}

func TestContinuationAndExportValidatePortableResponse(t *testing.T) {
	request := fixtureCompletionRequest()
	response := fixtureCompletionResponse(request.ID)
	packet := ContinuationPacket{
		Version: ContractVersion, ProjectID: "review-project", Request: request, RequestSHA256: fixtureRequestSHA,
		Response: response, Evidence: []ResolvedEvidence{fixtureResolvedText()},
	}
	if err := packet.Validate(); err != nil {
		t.Fatalf("ContinuationPacket.Validate() error = %v", err)
	}
	document := ExportDocument{
		Version: ContractVersion, ProjectID: "review-project", Revision: 4,
		Responses: []ReviewResponse{response}, Continuations: []ContinuationPacket{packet},
	}
	if err := document.Validate(); err != nil {
		t.Fatalf("ExportDocument.Validate() error = %v", err)
	}
}

func fixtureManifest() ProjectManifest {
	return ProjectManifest{Version: ContractVersion, ID: "review-project", Name: "Review project", Requests: []string{"requests/completion.json"}}
}

func fixtureProvenance() Provenance {
	return Provenance{Producer: ProducerIdentity{Kind: "script", Name: "fixture"}, CreatedAt: "2026-09-19T12:00:00Z"}
}

func fixtureCompletionRequest() ReviewRequest {
	startLine := 3
	endLine := 4
	return ReviewRequest{
		Version: ContractVersion, ID: "completion-request", Type: "completion", Title: "Make checkout retries idempotent",
		RequestedDecision: "Confirm the completion claims.", Provenance: fixtureProvenance(),
		Evidence: []EvidenceReference{{
			ID: "test-log", Kind: "text", Text: &TextEvidenceReference{Path: "evidence/test.log", MediaType: "text/plain", StartLine: 1, EndLine: 8, SourceSHA256: fixtureRequestSHA},
		}},
		Relations: []EvidenceRelation{{
			ID: "claim-tests", SubjectKind: "claim", SubjectID: "parallel-converges", EvidenceID: "test-log", Role: "supports",
			Citations: []EvidenceCitation{{Kind: "lineRange", StartLine: &startLine, EndLine: &endLine}},
		}},
		Completion: &CompletionRequest{Claims: []CompletionClaim{{ID: "parallel-converges", Text: "Parallel requests converge."}}},
	}
}

func fixtureChoiceRequest(presentation string) ReviewRequest {
	artifactA := "poster-a"
	artifactB := "poster-b"
	request := ReviewRequest{
		Version: ContractVersion, ID: "choice-request", Type: "choice", Title: "Which candidate should ship?",
		RequestedDecision: "Choose the strongest candidate.", Provenance: fixtureProvenance(), Relations: []EvidenceRelation{},
		Evidence: []EvidenceReference{
			{ID: artifactA, Kind: "artifact", Artifact: &ArtifactEvidenceReference{Path: "artifacts/a.png", MediaType: "image/png", ByteLength: 10, SHA256: fixtureRequestSHA}},
			{ID: artifactB, Kind: "artifact", Artifact: &ArtifactEvidenceReference{Path: "artifacts/b.png", MediaType: "image/png", ByteLength: 12, SHA256: strings.Repeat("b", 64)}},
		},
		Choice: &ChoiceRequest{
			Presentation: presentation, ExpectedResponse: "selection",
			Options: []ChoiceOption{
				{ID: "a", Label: "Orbital", Description: "Cool study", ArtifactEvidenceID: &artifactA},
				{ID: "b", Label: "Signal", Description: "Warm study", ArtifactEvidenceID: &artifactB},
			},
			Factors: []ChoiceFactor{}, Tradeoffs: []ChoiceTradeoff{}, Recommendation: nil,
		},
	}
	if presentation == "matrix" {
		request.Choice.Factors = []ChoiceFactor{{ID: "risk", Label: "Risk", Description: "Deployment risk"}}
		request.Choice.Tradeoffs = []ChoiceTradeoff{
			{OptionID: "a", FactorID: "risk", Value: "Higher", Tone: "risk"},
			{OptionID: "b", FactorID: "risk", Value: "Lower", Tone: "support"},
		}
	}
	return request
}

func fixtureAssessment() ExternalAssessment {
	caveat := "Existing databases need a backfill."
	return ExternalAssessment{
		Version: ContractVersion, ID: "assessment-one", RequestID: "completion-request", ClaimID: "parallel-converges",
		Assessment: "qualified", Rationale: "The test covers fresh databases.", Caveat: &caveat,
		Producer: AssessmentProducer{Model: "Claude Opus 4.1", Harness: "Claude Code"}, CreatedAt: "2026-09-19T12:05:00Z",
	}
}

func fixtureResolvedText() ResolvedEvidence {
	text := "PASS parallel requests converge\n"
	startLine := 1
	endLine := 1
	truncated := false
	return ResolvedEvidence{
		EvidenceID: "test-log", Status: "resolved",
		Content: &ResolvedEvidenceContent{Kind: "text", Text: &text, StartLine: &startLine, EndLine: &endLine, Truncated: &truncated},
	}
}

func fixtureSnapshot() ReviewSnapshot {
	return fixtureSnapshotForRequest(fixtureCompletionRequest())
}

func fixtureSnapshotForRequest(request ReviewRequest) ReviewSnapshot {
	manifest := fixtureManifest()
	manifest.Requests = []string{"requests/request.json"}
	evidence := make([]ResolvedEvidence, 0, len(request.Evidence))
	for _, reference := range request.Evidence {
		switch reference.Kind {
		case "text":
			evidence = append(evidence, fixtureResolvedText())
		case "artifact":
			route := "/api/evidence/" + reference.ID
			mediaType := reference.Artifact.MediaType
			byteLength := reference.Artifact.ByteLength
			sha256 := reference.Artifact.SHA256
			evidence = append(evidence, ResolvedEvidence{
				EvidenceID: reference.ID, Status: "resolved",
				Content: &ResolvedEvidenceContent{Kind: "artifact", Route: &route, MediaType: &mediaType, ByteLength: &byteLength, SHA256: &sha256},
			})
		}
	}
	return ReviewSnapshot{
		Version: ContractVersion, Project: manifest, Revision: 4,
		Requests: []RequestSnapshot{{Path: "requests/request.json", SHA256: fixtureRequestSHA, Request: request, Assessments: []ExternalAssessment{}, Evidence: evidence}},
	}
}

func fixtureCompletionResponse(requestID string) ReviewResponse {
	return ReviewResponse{
		Version: ContractVersion, ID: "response-one", RequestID: requestID, RequestSHA256: fixtureRequestSHA,
		Type: "completion", Status: "draft", Rationale: "The bounded claims are sufficiently established.",
		Unresolved: []UnresolvedItem{}, Annotations: []ArtifactAnnotation{}, Provenance: fixtureProvenance(),
		Completion: &CompletionResponse{Decisions: []CompletionDecision{{ClaimID: "parallel-converges", Decision: "accepted", Rationale: "The concurrent test passes."}}},
	}
}

func fixtureChoiceResponse(requestID string) ReviewResponse {
	return ReviewResponse{
		Version: ContractVersion, ID: "choice-response", RequestID: requestID, RequestSHA256: fixtureRequestSHA,
		Type: "choice", Status: "draft", Rationale: "Signal has the clearest hierarchy.", Unresolved: []UnresolvedItem{}, Provenance: fixtureProvenance(),
		Annotations: []ArtifactAnnotation{{
			ID: "annotation-one", ArtifactEvidenceID: "poster-a", ArtifactSHA256: fixtureRequestSHA,
			Paths: []NormalizedPath{{Color: "#fb7185", Width: 0.01, Points: []NormalizedPoint{{X: 0.2, Y: 0.3}, {X: 0.7, Y: 0.8}}}},
		}},
		Choice: &ChoiceResponse{Outcome: "selected", OptionIDs: []string{"a"}, Conditions: []string{}, SelectedArtifactEvidenceIDs: []string{"poster-a"}},
	}
}

func rawOperation(t *testing.T, value any) json.RawMessage {
	t.Helper()
	encoded, err := json.Marshal(value)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	return encoded
}
