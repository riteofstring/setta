package coordinator

import (
	"context"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/project/aggregate"
	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/project/renderer"
	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/projectfile"
)

func TestRenameCallableAtomicallyRewritesSurvivingStateReferences(t *testing.T) {
	t.Parallel()

	coordinator, path := newReferenceRewriteCoordinator(t, referenceRewriteState())
	defer coordinator.Close()
	before := coordinator.Snapshot()
	updated, err := coordinator.RenameCallable(context.Background(), aggregate.RenameCallableCommand{
		ProjectID: before.State.Project.ID, CallableID: "callable-producer", ExpectedRevision: before.State.Project.Revision, Name: "Renamed producer",
	})
	if err != nil {
		t.Fatalf("RenameCallable() error = %v", err)
	}
	if updated.State.Project.Revision != before.State.Project.Revision+1 {
		t.Fatalf("revision = %d, want %d", updated.State.Project.Revision, before.State.Project.Revision+1)
	}
	if got := updated.State.Callables[0].Parameters[0].AuthoredExpression; got != "state.Renamed_producer" {
		t.Fatalf("rewritten parameter = %q", got)
	}
	if !strings.Contains(updated.Rendered.Body, "state.Consumer__value = state.Renamed_producer") ||
		!strings.Contains(updated.Rendered.Body, "state.Renamed_producer = produce()") {
		t.Fatalf("rendered rename did not retain rewritten dependency:\n%s", updated.Rendered.Body)
	}
	requireDurableAuthoredState(t, path, updated.State)
}

func TestStructuralDeleteRewritesSurvivingCollisionPathAndLeavesDeletedReference(t *testing.T) {
	t.Parallel()

	state := aggregate.State{
		Project:      aggregate.Project{ID: "project-structural-rewrite", Name: "Structural rewrite", Revision: 1},
		PythonTarget: aggregate.PythonTarget{Suffix: aggregate.DefaultPythonSuffix},
		Callables: []aggregate.Callable{
			{
				ID: "callable-consumer", Name: "Consumer", AuthoredExpression: "consume",
				Parameters: []aggregate.Parameter{{
					ID:                 "parameter-consumer-value",
					Name:               "value",
					NameEditable:       true,
					PassingStyle:       aggregate.PassingStylePositionalOrKeyword,
					AuthoredExpression: "state.Producer_2 + state.Deleted",
				}},
			},
			{ID: "callable-deleted", Name: "Producer", AuthoredExpression: "deleted", Parameters: []aggregate.Parameter{}},
			{ID: "callable-surviving", Name: "Producer", AuthoredExpression: "surviving", Parameters: []aggregate.Parameter{}},
		},
		TopLevelSectionIDs: []string{"callable-consumer", "callable-deleted", "callable-surviving"},
	}
	coordinator, path := newReferenceRewriteCoordinator(t, state)
	defer coordinator.Close()
	before := coordinator.Snapshot()
	if got := before.Rendered.TargetPathsByID["callable-surviving"]; got != "Producer_2" {
		t.Fatalf("surviving path before delete = %q, want Producer_2", got)
	}
	updated, err := coordinator.DeleteCallable(context.Background(), aggregate.DeleteCallableCommand{
		ProjectID: before.State.Project.ID, CallableID: "callable-deleted", ExpectedRevision: before.State.Project.Revision,
	})
	if err != nil {
		t.Fatalf("DeleteCallable() error = %v", err)
	}
	if updated.State.Project.Revision != before.State.Project.Revision+1 {
		t.Fatalf("revision = %d, want %d", updated.State.Project.Revision, before.State.Project.Revision+1)
	}
	if got := updated.State.Callables[0].Parameters[0].AuthoredExpression; got != "state.Producer + state.Deleted" {
		t.Fatalf("structurally rewritten parameter = %q", got)
	}
	if got := updated.Rendered.TargetPathsByID["callable-surviving"]; got != "Producer" {
		t.Fatalf("surviving path after delete = %q, want Producer", got)
	}
	if !strings.Contains(updated.Rendered.Body, "state.Consumer__value = state.Producer + state.Deleted") {
		t.Fatalf("rendered structural rewrite missing:\n%s", updated.Rendered.Body)
	}
	requireDurableAuthoredState(t, path, updated.State)
}

func TestCloneRenderedCopiesCompilerDependencyMetadata(t *testing.T) {
	t.Parallel()

	original := renderer.Result{
		TargetPathsByID:          map[string]string{"target": "Path"},
		DependencyCycleTargetIDs: []string{"target"},
	}
	clone := cloneRendered(original)
	clone.TargetPathsByID["target"] = "Changed"
	clone.DependencyCycleTargetIDs[0] = "changed"
	if !reflect.DeepEqual(original.TargetPathsByID, map[string]string{"target": "Path"}) ||
		!reflect.DeepEqual(original.DependencyCycleTargetIDs, []string{"target"}) {
		t.Fatalf("clone mutation leaked to original: %#v", original)
	}
}

func newReferenceRewriteCoordinator(t *testing.T, state aggregate.State) (*Coordinator, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "project.json")
	if err := projectfile.NewAdapter().Create(path, state); err != nil {
		t.Fatalf("create project: %v", err)
	}
	coordinator, err := Open(context.Background(), Options{
		ProjectPath:  path,
		IDGenerator:  sequenceIDs("unused"),
		Materializer: newMaterialization(t, path),
		Provider:     readyProvider(),
	})
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	return coordinator, path
}

func referenceRewriteState() aggregate.State {
	return aggregate.State{
		Project:      aggregate.Project{ID: "project-reference-rewrite", Name: "Reference rewrite", Revision: 1},
		PythonTarget: aggregate.PythonTarget{Suffix: aggregate.DefaultPythonSuffix},
		Callables: []aggregate.Callable{
			{
				ID: "callable-consumer", Name: "Consumer", AuthoredExpression: "consume",
				Parameters: []aggregate.Parameter{{
					ID:                 "parameter-consumer-value",
					Name:               "value",
					NameEditable:       true,
					PassingStyle:       aggregate.PassingStylePositionalOrKeyword,
					AuthoredExpression: "state.Producer",
				}},
			},
			{ID: "callable-producer", Name: "Producer", AuthoredExpression: "produce", Parameters: []aggregate.Parameter{}},
		},
		TopLevelSectionIDs: []string{"callable-consumer", "callable-producer"},
	}
}
