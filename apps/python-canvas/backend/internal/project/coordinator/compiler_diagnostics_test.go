package coordinator

import (
	"context"
	"sort"
	"strings"
	"testing"

	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/project/aggregate"
	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/projectfile"
)

func TestCoordinatorMergesStableCompilerCycleDiagnosticsWithProviderDiagnostics(t *testing.T) {
	t.Parallel()

	state := aggregate.State{
		Project:      aggregate.Project{ID: "project-cycle-diagnostics", Name: "Cycle diagnostics", Revision: 1},
		PythonTarget: aggregate.PythonTarget{Suffix: aggregate.DefaultPythonSuffix},
		Callables: []aggregate.Callable{
			{ID: "callable-a", Name: "A", AuthoredExpression: "state.B", Parameters: []aggregate.Parameter{}},
			{ID: "callable-b", Name: "B", AuthoredExpression: "state.A", Parameters: []aggregate.Parameter{}},
		},
		TopLevelSectionIDs: []string{"callable-a", "callable-b"},
	}
	path := t.TempDir() + "/project.json"
	if err := projectfile.NewAdapter().Create(path, state); err != nil {
		t.Fatalf("create project: %v", err)
	}
	provider := readyProvider()
	provider.diagnostics = func(request GeneratedDocumentRequest) []ProviderDiagnostic {
		start := strings.Index(request.Code, "state.A")
		return []ProviderDiagnostic{{
			Start: start, End: start + len("state.A"), Severity: ProviderDiagnosticWarning, Message: "Provider warning", Code: "providerWarning",
		}}
	}
	coordinator, err := Open(context.Background(), Options{
		ProjectPath: path, IDGenerator: sequenceIDs("unused"), Materializer: newMaterialization(t, path), Provider: provider,
	})
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer coordinator.Close()

	snapshot := coordinator.Snapshot()
	if len(snapshot.Diagnostics) != 3 {
		t.Fatalf("diagnostics = %#v", snapshot.Diagnostics)
	}
	cycleTargets := []string{}
	providerCount := 0
	for _, diagnostic := range snapshot.Diagnostics {
		if diagnostic.Code == compilerDependencyCycleCode {
			if diagnostic.TargetID == nil || diagnostic.Message != "State dependency cycle." || !strings.HasPrefix(diagnostic.ID, "compiler:dependency-cycle:") {
				t.Fatalf("compiler diagnostic = %#v", diagnostic)
			}
			cycleTargets = append(cycleTargets, *diagnostic.TargetID)
			continue
		}
		if diagnostic.Code == "providerWarning" {
			providerCount++
		}
	}
	sort.Strings(cycleTargets)
	if strings.Join(cycleTargets, ",") != "callable-a,callable-b" || providerCount != 1 {
		t.Fatalf("merged diagnostics = %#v", snapshot.Diagnostics)
	}
}

func TestStructuralCycleCandidateKeepsDiagnosticsLaggingUntilProviderSettles(t *testing.T) {
	t.Parallel()

	state := aggregate.State{
		Project:      aggregate.Project{ID: "project-structural-cycle", Name: "Structural cycle", Revision: 1},
		PythonTarget: aggregate.PythonTarget{Suffix: aggregate.DefaultPythonSuffix},
		Callables: []aggregate.Callable{
			{ID: "callable-a", Name: "A", AuthoredExpression: "state.B", Parameters: []aggregate.Parameter{}},
			{ID: "callable-b", Name: "B", AuthoredExpression: "state.A", Parameters: []aggregate.Parameter{}},
			{ID: "callable-remove", Name: "Remove", AuthoredExpression: "remove", Parameters: []aggregate.Parameter{}},
		},
		TopLevelSectionIDs: []string{"callable-a", "callable-b", "callable-remove"},
	}
	path := t.TempDir() + "/project.json"
	if err := projectfile.NewAdapter().Create(path, state); err != nil {
		t.Fatalf("create project: %v", err)
	}
	provider := newHeldDiagnosticsProvider()
	coordinator, err := Open(context.Background(), Options{
		ProjectPath: path, IDGenerator: sequenceIDs("unused"), Materializer: newMaterialization(t, path), Provider: provider,
	})
	if err != nil {
		t.Fatalf("Open() error = %v", err)
	}
	defer coordinator.Close()
	provider.setHeld(true)

	before := coordinator.Snapshot()
	updated, err := coordinator.DeleteCallable(context.Background(), aggregate.DeleteCallableCommand{
		ProjectID: before.State.Project.ID, CallableID: "callable-remove", ExpectedRevision: before.State.Project.Revision,
	})
	if err != nil {
		t.Fatalf("DeleteCallable() error = %v", err)
	}
	requirePendingDiagnostics(t, updated)
	provider.awaitStarted(t)
	provider.releaseSuccess("Provider settled")
	settled := awaitDiagnosticsSettled(t, coordinator, updated.State.Project.Revision)
	compilerCount := 0
	for _, diagnostic := range settled.Diagnostics {
		if diagnostic.Code == compilerDependencyCycleCode {
			compilerCount++
		}
	}
	if compilerCount != 2 {
		t.Fatalf("settled compiler diagnostics = %#v", settled.Diagnostics)
	}
}
