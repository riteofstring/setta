package coordinator

import (
	"fmt"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
	"github.com/setta/python-canvas/backend/internal/project/renderer"
)

func (coordinator *Coordinator) prepareCandidate(candidate aggregate.Candidate) (aggregate.Candidate, error) {
	if !candidate.Changed {
		return candidate, nil
	}
	oldPaths, err := renderer.TargetPaths(coordinator.snapshot.State)
	if err != nil {
		return aggregate.Candidate{}, fmt.Errorf("allocate current target paths: %w", err)
	}
	newPaths, err := renderer.TargetPaths(candidate.State)
	if err != nil {
		return aggregate.Candidate{}, fmt.Errorf("allocate candidate target paths: %w", err)
	}
	rewritten, err := renderer.RewriteStateReferences(candidate.State, oldPaths, newPaths)
	if err != nil {
		return aggregate.Candidate{}, err
	}
	if err := rewritten.Validate(); err != nil {
		return aggregate.Candidate{}, fmt.Errorf("validate rewritten candidate: %w", err)
	}
	candidate.State = rewritten
	return candidate, nil
}
