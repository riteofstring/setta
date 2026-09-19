package coordinator

import (
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/setta/experiment-lens/backend/internal/artifact"
	"github.com/setta/experiment-lens/backend/internal/contracts"
	"github.com/setta/experiment-lens/backend/internal/testsupport"
)

func TestExportUsesExplicitBasketAndIncludesNoteAnchors(t *testing.T) {
	fixture, err := testsupport.Write(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	application, err := Open(fixture.Root)
	if err != nil {
		t.Fatal(err)
	}
	defer application.Close()
	snapshot, err := application.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	selection := contracts.EmptySelection()
	focus := "run-a"
	selection.FocusedObservationID = &focus
	selection.SelectedObservationIDs = []string{"run-b"}
	if _, err := application.Apply(mutation(snapshot, selection)); err != nil {
		t.Fatal(err)
	}
	exported, err := application.Export()
	if err != nil {
		t.Fatal(err)
	}
	if ids := observationIDs(exported.Packet.Observations); strings.Join(ids, ",") != "run-b" {
		t.Fatalf("focus leaked into export: %v", ids)
	}
	if ids := artifactIDs(exported.Packet.Artifacts); strings.Join(ids, ",") != "thermal-b" {
		t.Fatalf("unexpected basket artifacts: %v", ids)
	}
	selection.Notes = []contracts.SelectionNote{{ID: "note-a", Text: "Inspect this neighboring run.", ObservationID: &focus}}
	next, err := application.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	if _, err := application.Apply(mutation(next, selection)); err != nil {
		t.Fatal(err)
	}
	exported, err = application.Export()
	if err != nil {
		t.Fatal(err)
	}
	if ids := observationIDs(exported.Packet.Observations); strings.Join(ids, ",") != "run-a,run-b" {
		t.Fatalf("note anchor was not exported: %v", ids)
	}
	if ids := artifactIDs(exported.Packet.Artifacts); strings.Join(ids, ",") != "series-a,thermal-b" {
		t.Fatalf("note anchor artifacts were not exported: %v", ids)
	}
}

func TestSnapshotCachesAdmissionButExportReverifiesEvidence(t *testing.T) {
	fixture, err := testsupport.Write(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	application, err := Open(fixture.Root)
	if err != nil {
		t.Fatal(err)
	}
	defer application.Close()
	initial, err := application.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	selection := contracts.EmptySelection()
	selection.SelectedObservationIDs = []string{"run-b"}
	if _, err := application.Apply(mutation(initial, selection)); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(fixture.Root, "artifacts", "thermal.svg"), []byte("changed"), 0o644); err != nil {
		t.Fatal(err)
	}
	cached, err := application.Snapshot()
	if err != nil || cached.Artifacts[1].Status != "resolved" {
		t.Fatalf("snapshot did not reuse admitted resolution: %v %#v", err, cached.Artifacts)
	}
	if _, err := application.Export(); !errors.Is(err, ErrArtifactChanged) {
		t.Fatalf("expected export revalidation failure, got %v", err)
	}
	if file, _, err := application.OpenArtifact("thermal-b"); !errors.Is(err, artifact.ErrArtifactChanged) {
		if file != nil {
			file.Close()
		}
		t.Fatalf("expected artifact open to revalidate, got %v", err)
	}
}

func TestApplyBindsObservationSourceDigest(t *testing.T) {
	fixture, err := testsupport.Write(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	application, err := Open(fixture.Root)
	if err != nil {
		t.Fatal(err)
	}
	defer application.Close()
	snapshot, err := application.Snapshot()
	if err != nil {
		t.Fatal(err)
	}
	request := mutation(snapshot, contracts.EmptySelection())
	request.ObservationSourceSHA256 = strings.Repeat("0", 64)
	if _, err := application.Apply(request); !errors.Is(err, ErrExperimentIdentity) {
		t.Fatalf("expected identity conflict, got %v", err)
	}
}

func mutation(snapshot contracts.LensSnapshot, selection contracts.LensSelection) contracts.LensMutation {
	return contracts.LensMutation{
		ExperimentID: snapshot.Experiment.ID, ManifestSHA256: snapshot.ManifestSHA256,
		ObservationSourceSHA256: snapshot.ObservationSourceSHA256, ExpectedRevision: snapshot.Revision,
		Selection: selection,
	}
}

func observationIDs(values []contracts.Observation) []string {
	ids := make([]string, len(values))
	for index, value := range values {
		ids[index] = value.ID
	}
	return ids
}

func artifactIDs(values []contracts.ArtifactReference) []string {
	ids := make([]string, len(values))
	for index, value := range values {
		ids[index] = value.ID
	}
	return ids
}
