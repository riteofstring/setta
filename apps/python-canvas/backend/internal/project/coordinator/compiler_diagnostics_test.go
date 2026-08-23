package coordinator

import (
	"context"
	"sort"
	"strings"
	"testing"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
	"github.com/setta/python-canvas/backend/internal/projectfile"
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
