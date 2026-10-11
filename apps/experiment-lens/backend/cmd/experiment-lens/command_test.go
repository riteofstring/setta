package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/riteofstring/setta/apps/experiment-lens/backend/internal/contracts"
	"github.com/riteofstring/setta/apps/experiment-lens/backend/internal/testsupport"
)

func TestSchemaPublishesCompleteContractInventory(t *testing.T) {
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	status := execute([]string{"schema"}, bytes.NewReader(nil), &stdout, &stderr)
	if status != 0 || stderr.Len() != 0 {
		t.Fatalf("schema failed: status=%d stderr=%s", status, stderr.String())
	}
	var document schemaDocument
	if err := json.Unmarshal(stdout.Bytes(), &document); err != nil {
		t.Fatal(err)
	}
	if document.SchemaVersion != "setta-experiment-lens-schema/v1" || len(document.Schemas) != 9 {
		t.Fatalf("unexpected schema document %#v", document)
	}
}

func TestSnapshotApplyAndExportRoundTrip(t *testing.T) {
	fixture, err := testsupport.Write(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	var snapshotOutput bytes.Buffer
	var stderr bytes.Buffer
	if status := execute([]string{"snapshot", "--project-root", fixture.Root}, bytes.NewReader(nil), &snapshotOutput, &stderr); status != 0 {
		t.Fatalf("snapshot failed: %d %s", status, stderr.String())
	}
	var snapshot contracts.LensSnapshot
	if err := json.Unmarshal(snapshotOutput.Bytes(), &snapshot); err != nil {
		t.Fatal(err)
	}
	selection := contracts.EmptySelection()
	selection.SelectedObservationIDs = []string{"run-b"}
	mutation := contracts.LensMutation{
		ExperimentID: snapshot.Experiment.ID, ManifestSHA256: snapshot.ManifestSHA256,
		ObservationSourceSHA256: snapshot.ObservationSourceSHA256, ExpectedRevision: snapshot.Revision,
		Selection: selection,
	}
	mutationBytes, err := json.Marshal(mutation)
	if err != nil {
		t.Fatal(err)
	}
	var applyOutput bytes.Buffer
	stderr.Reset()
	if status := execute([]string{"apply", "--project-root", fixture.Root, "--file", "-"}, bytes.NewReader(mutationBytes), &applyOutput, &stderr); status != 0 {
		t.Fatalf("apply failed: %d %s", status, stderr.String())
	}
	var result contracts.MutationResult
	if err := json.Unmarshal(applyOutput.Bytes(), &result); err != nil || result.Snapshot.Revision != 1 {
		t.Fatalf("unexpected apply result: %v %#v", err, result)
	}
	outputPath := filepath.Join(t.TempDir(), "selection.json")
	var exportOutput bytes.Buffer
	stderr.Reset()
	if status := execute([]string{"export", "--project-root", fixture.Root, "--output", outputPath}, bytes.NewReader(nil), &exportOutput, &stderr); status != 0 {
		t.Fatalf("export failed: %d %s", status, stderr.String())
	}
	data, err := os.ReadFile(outputPath)
	if err != nil {
		t.Fatal(err)
	}
	var packet contracts.SelectionPacket
	if err := json.Unmarshal(data, &packet); err != nil || len(packet.Observations) != 1 || packet.Observations[0].ID != "run-b" {
		t.Fatalf("unexpected exported packet: %v %#v", err, packet)
	}
}

func TestInvalidCommandUsesStructuredStderrAndUsageExit(t *testing.T) {
	var stderr bytes.Buffer
	status := execute([]string{"apply", "--project-root", "project"}, bytes.NewReader(nil), &bytes.Buffer{}, &stderr)
	if status != 2 {
		t.Fatalf("unexpected status %d", status)
	}
	var failure contracts.StructuredError
	if err := json.Unmarshal(stderr.Bytes(), &failure); err != nil || failure.Code != "invalid_input" {
		t.Fatalf("unexpected structured failure: %v %#v", err, failure)
	}
}
