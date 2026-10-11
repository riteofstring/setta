package lensstate

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/riteofstring/setta/apps/experiment-lens/backend/internal/contracts"
)

func TestStorePersistsRevisionedCompleteSelection(t *testing.T) {
	root := t.TempDir()
	identity := Identity{ExperimentID: "experiment", ManifestSHA256: strings.Repeat("a", 64), ObservationSourceSHA256: strings.Repeat("b", 64)}
	store, err := Open(root, identity)
	if err != nil {
		t.Fatal(err)
	}
	selection := contracts.EmptySelection()
	selected := "run-1"
	selection.FocusedObservationID = &selected
	replaced, err := store.Replace(0, Document{
		Version: 1, ExperimentID: identity.ExperimentID, ManifestSHA256: identity.ManifestSHA256,
		ObservationSourceSHA256: identity.ObservationSourceSHA256, Revision: 1, Selection: selection,
	})
	if err != nil || replaced.Revision != 1 {
		t.Fatalf("replace failed: %v %#v", err, replaced)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	reopened, err := Open(root, identity)
	if err != nil {
		t.Fatal(err)
	}
	defer reopened.Close()
	snapshot, err := reopened.Snapshot()
	if err != nil || snapshot.Revision != 1 || snapshot.Selection.FocusedObservationID == nil || *snapshot.Selection.FocusedObservationID != "run-1" {
		t.Fatalf("unexpected reopened state: %v %#v", err, snapshot)
	}
}

func TestStaleWriterObservesDurableWinner(t *testing.T) {
	root := t.TempDir()
	identity := Identity{ExperimentID: "experiment", ManifestSHA256: strings.Repeat("a", 64), ObservationSourceSHA256: strings.Repeat("b", 64)}
	first, err := Open(root, identity)
	if err != nil {
		t.Fatal(err)
	}
	defer first.Close()
	stale, err := Open(root, identity)
	if err != nil {
		t.Fatal(err)
	}
	defer stale.Close()
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	updates, err := stale.Subscribe(ctx)
	if err != nil {
		t.Fatal(err)
	}
	<-updates
	winner := contracts.EmptySelection()
	winner.SelectedObservationIDs = []string{"run-a"}
	if _, err := first.Replace(0, Document{
		Version: 1, ExperimentID: identity.ExperimentID, ManifestSHA256: identity.ManifestSHA256,
		ObservationSourceSHA256: identity.ObservationSourceSHA256, Revision: 1, Selection: winner,
	}); err != nil {
		t.Fatal(err)
	}
	loser := contracts.EmptySelection()
	loser.SelectedObservationIDs = []string{"run-b"}
	if _, err := stale.Replace(0, Document{
		Version: 1, ExperimentID: identity.ExperimentID, ManifestSHA256: identity.ManifestSHA256,
		ObservationSourceSHA256: identity.ObservationSourceSHA256, Revision: 1, Selection: loser,
	}); !errors.Is(err, ErrRevisionConflict) {
		t.Fatalf("expected stale revision conflict, got %v", err)
	}
	observed, err := stale.Snapshot()
	if err != nil || observed.Revision != 1 || len(observed.Selection.SelectedObservationIDs) != 1 || observed.Selection.SelectedObservationIDs[0] != "run-a" {
		t.Fatalf("stale store did not refresh to winner: %v %#v", err, observed)
	}
	update := <-updates
	if update.Revision != 1 || update.Selection.SelectedObservationIDs[0] != "run-a" {
		t.Fatalf("subscriber did not receive winner: %#v", update)
	}
}

func TestStoreRejectsEitherStaleDigestAndRevision(t *testing.T) {
	root := t.TempDir()
	identity := Identity{ExperimentID: "experiment", ManifestSHA256: strings.Repeat("a", 64), ObservationSourceSHA256: strings.Repeat("b", 64)}
	store, err := Open(root, identity)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := store.Replace(1, Document{
		Version: 1, ExperimentID: identity.ExperimentID, ManifestSHA256: identity.ManifestSHA256,
		ObservationSourceSHA256: identity.ObservationSourceSHA256, Revision: 2, Selection: contracts.EmptySelection(),
	}); !errors.Is(err, ErrRevisionConflict) {
		t.Fatalf("expected revision conflict, got %v", err)
	}
	if err := store.Close(); err != nil {
		t.Fatal(err)
	}
	for name, changed := range map[string]Identity{
		"manifest":     {ExperimentID: identity.ExperimentID, ManifestSHA256: strings.Repeat("c", 64), ObservationSourceSHA256: identity.ObservationSourceSHA256},
		"observations": {ExperimentID: identity.ExperimentID, ManifestSHA256: identity.ManifestSHA256, ObservationSourceSHA256: strings.Repeat("d", 64)},
	} {
		t.Run(name, func(t *testing.T) {
			if reopened, err := Open(root, changed); !errors.Is(err, ErrIdentityConflict) {
				if reopened != nil {
					reopened.Close()
				}
				t.Fatalf("expected identity conflict, got %v", err)
			}
		})
	}
}
