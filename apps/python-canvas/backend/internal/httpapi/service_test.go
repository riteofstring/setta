package httpapi

import (
	"testing"

	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/project/aggregate"
	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/project/coordinator"
	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/project/renderer"
)

func TestSnapshotV2MapsLaggingDiagnosticsRevision(t *testing.T) {
	state, err := aggregate.NewBlank(func() (string, error) {
		return "project:diagnostics", nil
	})
	if err != nil {
		t.Fatalf("NewBlank() error = %v", err)
	}
	candidate, err := state.RenameProject(aggregate.RenameProjectCommand{
		ProjectID: state.Project.ID, ExpectedRevision: state.Project.Revision, Name: "Pending diagnostics",
	})
	if err != nil {
		t.Fatalf("RenameProject() error = %v", err)
	}
	rendered, err := renderer.Render(candidate.State)
	if err != nil {
		t.Fatalf("Render() error = %v", err)
	}

	result, err := snapshotV2(coordinator.Snapshot{
		State:               candidate.State,
		Rendered:            rendered,
		Diagnostics:         []coordinator.Diagnostic{},
		DiagnosticsRevision: state.Project.Revision,
		ProviderStatus: coordinator.ProviderStatus{
			Provider:     "basedpyright",
			Availability: coordinator.ProviderAvailabilityAvailable,
			State:        coordinator.ProviderLifecyclePending,
		},
	})
	if err != nil {
		t.Fatalf("snapshotV2() error = %v", err)
	}
	if result.DiagnosticsRevision != state.Project.Revision || result.Project.Revision != candidate.State.Project.Revision {
		t.Fatalf("mapped freshness = %d for project revision %d, want %d for project revision %d", result.DiagnosticsRevision, result.Project.Revision, state.Project.Revision, candidate.State.Project.Revision)
	}
	if len(result.Diagnostics) != 0 || result.ProviderStatus.State != "pending" {
		t.Fatalf("mapped pending diagnostics snapshot = %#v", result)
	}
	if err := result.Validate(); err != nil {
		t.Fatalf("Validate() mapped lagging snapshot error = %v", err)
	}
}
