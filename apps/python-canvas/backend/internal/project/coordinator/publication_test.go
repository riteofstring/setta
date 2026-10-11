package coordinator

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/project/aggregate"
)

func TestSnapshotSubscriptionPushesCurrentAndLatestIndependentPublications(t *testing.T) {
	projectPath := filepath.Join(t.TempDir(), "project.json")
	coordinator, err := Open(context.Background(), Options{
		ProjectPath:  projectPath,
		Create:       true,
		IDGenerator:  sequenceIDs("project-publication"),
		Materializer: newMaterialization(t, projectPath),
		Provider:     readyProvider(),
	})
	if err != nil {
		t.Fatalf("open coordinator: %v", err)
	}
	defer func() {
		if err := coordinator.Close(); err != nil {
			t.Fatalf("close coordinator: %v", err)
		}
	}()

	stream, unsubscribe := coordinator.SubscribeSnapshots()
	initial := <-stream
	if initial.State.Project.Revision != 1 {
		t.Fatalf("initial revision = %d, want 1", initial.State.Project.Revision)
	}
	initial.State.Project.Name = "mutated subscriber copy"
	if coordinator.Snapshot().State.Project.Name == initial.State.Project.Name {
		t.Fatal("subscriber mutated the coordinator snapshot")
	}

	renamed := renamePublishedProject(t, coordinator, "Second")
	if pushed := <-stream; pushed.State.Project.Revision != renamed.State.Project.Revision {
		t.Fatalf("pushed revision = %d, want %d", pushed.State.Project.Revision, renamed.State.Project.Revision)
	}

	renamePublishedProject(t, coordinator, "Third")
	latest := renamePublishedProject(t, coordinator, "Fourth")
	if pushed := <-stream; pushed.State.Project.Revision != latest.State.Project.Revision || pushed.State.Project.Name != "Fourth" {
		t.Fatalf("coalesced publication = %#v, want latest revision %d", pushed.State.Project, latest.State.Project.Revision)
	}

	unsubscribe()
	if _, open := <-stream; open {
		t.Fatal("subscription remained open after unsubscribe")
	}
}

func TestSnapshotSubscriptionPushesStructuralAndSettledDiagnosticPublications(t *testing.T) {
	provider := newHeldDiagnosticsProvider()
	coordinator, _ := newStructuralDiagnosticsCoordinator(t, provider, "project-push", "callable-push")
	stream, unsubscribe := coordinator.SubscribeSnapshots()
	defer unsubscribe()
	<-stream
	provider.setHeld(true)

	before := coordinator.Snapshot()
	created := awaitStructuralMutation(t, func() (Snapshot, error) {
		return coordinator.CreateCallable(context.Background(), aggregate.CreateCallableCommand{
			ProjectID: before.State.Project.ID, ExpectedRevision: before.State.Project.Revision, Name: "Pushed callable",
		})
	})
	pending := awaitPushedSnapshot(t, stream)
	if pending.State.Project.Revision != created.State.Project.Revision || pending.DiagnosticsRevision >= pending.State.Project.Revision {
		t.Fatalf("pending publication = revision %d diagnostics %d", pending.State.Project.Revision, pending.DiagnosticsRevision)
	}

	provider.awaitStarted(t)
	provider.releaseSuccess("Pushed diagnostics.")
	settled := awaitPushedSnapshot(t, stream)
	if settled.DiagnosticsRevision != settled.State.Project.Revision || len(settled.Diagnostics) != 1 || settled.Diagnostics[0].Message != "Pushed diagnostics." {
		t.Fatalf("settled publication = %#v", settled)
	}
}

func awaitPushedSnapshot(t *testing.T, stream <-chan Snapshot) Snapshot {
	t.Helper()
	select {
	case snapshot, open := <-stream:
		if !open {
			t.Fatal("snapshot stream closed before publication")
		}
		return snapshot
	case <-time.After(testWaitTimeout):
		t.Fatal("snapshot publication timed out")
		return Snapshot{}
	}
}

func renamePublishedProject(t *testing.T, coordinator *Coordinator, name string) Snapshot {
	t.Helper()
	current := coordinator.Snapshot()
	next, err := coordinator.RenameProject(context.Background(), aggregate.RenameProjectCommand{
		ProjectID:        current.State.Project.ID,
		ExpectedRevision: current.State.Project.Revision,
		Name:             name,
	})
	if err != nil {
		t.Fatalf("rename project to %q: %v", name, err)
	}
	return next
}
