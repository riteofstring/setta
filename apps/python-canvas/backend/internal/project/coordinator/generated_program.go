package coordinator

import (
	"context"
	"fmt"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
)

// GeneratedProgram is one immutable capture of the currently published
// rendered Python. It stays private to the application boundary: transport
// clients receive only the result of executing it in the terminal.
type GeneratedProgram struct {
	ProjectID string
	Revision  int
	Code      string
}

// CaptureGeneratedProgram takes the project identity, expected revision, and
// complete rendered code under the coordinator's publication lock. It is
// read-only: it does not schedule diagnostics, touch materialization, or
// advance the authored project revision.
func (coordinator *Coordinator) CaptureGeneratedProgram(
	ctx context.Context,
	projectID string,
	expectedRevision int,
) (GeneratedProgram, error) {
	if coordinator == nil {
		return GeneratedProgram{}, ErrCoordinatorClosed
	}
	if ctx == nil {
		ctx = context.Background()
	}
	if err := ctx.Err(); err != nil {
		return GeneratedProgram{}, err
	}
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	if err := coordinator.requireOpen(ctx); err != nil {
		return GeneratedProgram{}, err
	}
	snapshot := coordinator.snapshot
	if snapshot.State.Project.ID != projectID {
		return GeneratedProgram{}, fmt.Errorf("%w: %q", aggregate.ErrProjectNotFound, projectID)
	}
	if snapshot.State.Project.Revision != expectedRevision {
		return GeneratedProgram{}, fmt.Errorf("%w: expected %d, current %d", aggregate.ErrRevisionConflict, expectedRevision, snapshot.State.Project.Revision)
	}
	return GeneratedProgram{
		ProjectID: snapshot.State.Project.ID,
		Revision:  snapshot.State.Project.Revision,
		Code:      snapshot.Rendered.Code,
	}, nil
}
