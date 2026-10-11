package coordinator

import (
	"context"
	"fmt"

	"github.com/riteofstring/setta/apps/python-canvas/backend/internal/project/aggregate"
)

type GeneratedProgram struct {
	ProjectID string
	Revision  int
	Code      string
}

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
