package main

import (
	"bytes"
	"context"
	"encoding/json"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/setta/review/backend/internal/contracts"
)

type fakeCommandCoordinator struct {
	snapshot       contracts.ReviewSnapshot
	mutation       *contracts.ReviewMutation
	mutationResult contracts.MutationResult
	exportResult   contracts.ExportResult
	closed         int
}

func (coordinator *fakeCommandCoordinator) Snapshot() (contracts.ReviewSnapshot, error) {
	return coordinator.snapshot, nil
}

func (coordinator *fakeCommandCoordinator) Apply(mutation contracts.ReviewMutation) (contracts.MutationResult, error) {
	coordinator.mutation = &mutation
	return coordinator.mutationResult, nil
}

func (coordinator *fakeCommandCoordinator) Export(bool) (contracts.ExportResult, error) {
	return coordinator.exportResult, nil
}

func (coordinator *fakeCommandCoordinator) Subscribe(context.Context) (<-chan contracts.ReviewSnapshot, error) {
	stream := make(chan contracts.ReviewSnapshot)
	close(stream)
	return stream, nil
}

func (coordinator *fakeCommandCoordinator) OpenArtifact(string, string) (*os.File, contracts.ArtifactEvidenceReference, error) {
	return nil, contracts.ArtifactEvidenceReference{}, os.ErrNotExist
}

func (coordinator *fakeCommandCoordinator) Close() error {
	coordinator.closed++
	return nil
}

func TestExecuteSchemaExposesAllPublicContracts(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	if code := execute([]string{"schema"}, strings.NewReader(""), &stdout, &stderr); code != 0 {
		t.Fatalf("execute() = %d, stderr = %q", code, stderr.String())
	}
	var document schemaDocument
	if err := json.Unmarshal(stdout.Bytes(), &document); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if document.SchemaVersion != "setta-review-schema/v1" || len(document.Schemas) != 11 || document.Schemas["reviewRequest"] == nil {
		t.Fatalf("schema document = %#v", document)
	}
}

func TestExecuteSnapshotAndApplyUseTheSameCoordinatorBoundary(t *testing.T) {
	fake := &fakeCommandCoordinator{
		snapshot:       contracts.ReviewSnapshot{Version: 1, Revision: 4},
		mutationResult: contracts.MutationResult{Version: 1, Snapshot: contracts.ReviewSnapshot{Version: 1, Revision: 5}},
	}
	opener := func(string) (reviewCoordinator, error) { return fake, nil }
	var snapshotOutput bytes.Buffer
	var stderr bytes.Buffer
	if code := executeWith([]string{"snapshot", "--project-root", "/project"}, strings.NewReader(""), &snapshotOutput, &stderr, opener); code != 0 {
		t.Fatalf("snapshot code = %d, stderr = %s", code, stderr.String())
	}
	if !strings.Contains(snapshotOutput.String(), `"revision":4`) {
		t.Fatalf("snapshot output = %s", snapshotOutput.String())
	}
	mutation := `{"projectId":"project","expectedRevision":4,"operations":[{"op":"deleteResponse","requestId":"request"}]}`
	var applyOutput bytes.Buffer
	stderr.Reset()
	if code := executeWith([]string{"apply", "--project-root", "/project", "--file", "-"}, strings.NewReader(mutation), &applyOutput, &stderr, opener); code != 0 {
		t.Fatalf("apply code = %d, stderr = %s", code, stderr.String())
	}
	if fake.mutation == nil || fake.mutation.ExpectedRevision != 4 || !strings.Contains(applyOutput.String(), `"revision":5`) {
		t.Fatalf("mutation = %#v, output = %s", fake.mutation, applyOutput.String())
	}
	if fake.closed != 2 {
		t.Fatalf("close count = %d", fake.closed)
	}
}

func TestExecuteExportWritesSeparateResponseAndContinuationFiles(t *testing.T) {
	response := contracts.ReviewResponse{Version: 1, ID: "response", RequestID: "request"}
	packet := contracts.ContinuationPacket{Version: 1, ProjectID: "project", Response: response}
	fake := &fakeCommandCoordinator{exportResult: contracts.ExportResult{
		Version: 1,
		Export: contracts.ExportDocument{
			Version: 1, ProjectID: "project", Revision: 2,
			Responses: []contracts.ReviewResponse{response}, Continuations: []contracts.ContinuationPacket{packet},
		},
	}}
	outputDirectory := filepath.Join(t.TempDir(), "exports")
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	code := executeWith(
		[]string{"export", "--project-root", "/project", "--output-dir", outputDirectory, "--continuations"},
		strings.NewReader(""), &stdout, &stderr,
		func(string) (reviewCoordinator, error) { return fake, nil },
	)
	if code != 0 {
		t.Fatalf("export code = %d, stderr = %s", code, stderr.String())
	}
	for _, name := range []string{"review-response.json", "continuation-packet.json"} {
		path := filepath.Join(outputDirectory, "request", name)
		if info, err := os.Stat(path); err != nil || !info.Mode().IsRegular() {
			t.Fatalf("export %s = %#v, %v", name, info, err)
		}
	}
}

func TestExecuteReturnsStructuredUsageErrors(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	if code := execute([]string{"unknown"}, strings.NewReader(""), &stdout, &stderr); code != 2 {
		t.Fatalf("execute() = %d", code)
	}
	var failure contracts.StructuredError
	if err := json.Unmarshal(stderr.Bytes(), &failure); err != nil {
		t.Fatalf("Unmarshal() error = %v", err)
	}
	if failure.Code != "invalid_input" || !strings.Contains(failure.Message, "unknown Review command") || stdout.Len() != 0 {
		t.Fatalf("failure = %#v, stdout = %q", failure, stdout.String())
	}
}

func TestExecuteServePublishesReadinessAndStopsAtStdinEOF(t *testing.T) {
	root := t.TempDir()
	web := filepath.Join(root, "web")
	if err := os.Mkdir(web, 0o755); err != nil {
		t.Fatalf("Mkdir() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(web, "index.html"), []byte("review"), 0o644); err != nil {
		t.Fatalf("WriteFile() error = %v", err)
	}
	fake := &fakeCommandCoordinator{}
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	code := executeWith(
		[]string{"serve", "--project-root", root, "--web-root", web, "--session-nonce", "nonce", "--supervised-stdin=true", "--port", "0"},
		strings.NewReader(""), &stdout, &stderr,
		func(string) (reviewCoordinator, error) { return fake, nil },
	)
	if code != 0 {
		t.Fatalf("serve code = %d, stderr = %s", code, stderr.String())
	}
	var readiness readinessDocument
	if err := json.Unmarshal(stdout.Bytes(), &readiness); err != nil {
		t.Fatalf("readiness decode error = %v", err)
	}
	if readiness.App != "review" || readiness.Nonce != "nonce" || !strings.HasPrefix(readiness.URL, "http://127.0.0.1:") {
		t.Fatalf("readiness = %#v", readiness)
	}
	if fake.closed != 1 {
		t.Fatalf("close count = %d", fake.closed)
	}
}

var _ reviewCoordinator = (*fakeCommandCoordinator)(nil)
