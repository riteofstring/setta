package coordinator

import (
	"context"
	"fmt"

	"github.com/setta/python-canvas/backend/internal/project/aggregate"
	"github.com/setta/python-canvas/backend/internal/project/renderer"
)

// diagnosticsWork holds one immutable, durable structural revision until its
// exact provider result settles or a newer revision makes that result stale.
type diagnosticsWork struct {
	state    aggregate.State
	rendered renderer.Result
	revision int
}

// scheduleDiagnosticsLocked coalesces queued structural revisions while the
// current provider request, if any, remains serialized. The caller has already
// published the durable snapshot and holds coordinator.mu.
func (coordinator *Coordinator) scheduleDiagnosticsLocked(state aggregate.State, rendered renderer.Result) {
	coordinator.pendingAnalysis = &diagnosticsWork{
		state:    state.Clone(),
		rendered: cloneRendered(rendered),
		revision: state.Project.Revision,
	}
	select {
	case coordinator.analysisWake <- struct{}{}:
	default:
	}
}

func (coordinator *Coordinator) runDiagnostics(ctx context.Context) {
	defer close(coordinator.analysisDone)
	for {
		select {
		case <-ctx.Done():
			return
		case <-coordinator.analysisWake:
		}

		for {
			work := coordinator.takePendingDiagnostics()
			if work == nil {
				break
			}
			if ctx.Err() != nil {
				return
			}
			diagnostics, status, synchronized, err := coordinator.synchronizeDiagnostics(ctx, work)
			if ctx.Err() != nil {
				return
			}
			if !synchronized {
				continue
			}
			coordinator.publishDiagnostics(work, diagnostics, status, err)
		}
	}
}

func (coordinator *Coordinator) takePendingDiagnostics() *diagnosticsWork {
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	if coordinator.closed {
		return nil
	}
	work := coordinator.pendingAnalysis
	coordinator.pendingAnalysis = nil
	return work
}

func (coordinator *Coordinator) synchronizeDiagnostics(ctx context.Context, work *diagnosticsWork) ([]Diagnostic, ProviderStatus, bool, error) {
	result, synchronized, err := coordinator.synchronizeScheduledGeneratedDocument(ctx, work.revision, work.rendered)
	if !synchronized {
		return nil, ProviderStatus{}, false, nil
	}
	if err != nil {
		return nil, ProviderStatus{}, true, fmt.Errorf("synchronize generated document: %w", err)
	}
	if err := result.ProviderStatus.Validate(); err != nil {
		return nil, ProviderStatus{}, true, fmt.Errorf("validate provider status: %w", err)
	}
	if !providerIsReady(result.ProviderStatus) {
		return nil, ProviderStatus{}, true, ErrProviderUnavailable
	}
	diagnostics, err := mapDiagnostics(work.state, work.rendered, result.Diagnostics)
	if err != nil {
		return nil, ProviderStatus{}, true, fmt.Errorf("map generated diagnostics: %w", err)
	}
	return mergeDiagnostics(compilerDiagnostics(work.rendered), diagnostics), result.ProviderStatus, true, nil
}

func (coordinator *Coordinator) publishDiagnostics(work *diagnosticsWork, diagnostics []Diagnostic, status ProviderStatus, analysisErr error) {
	coordinator.mu.Lock()
	defer coordinator.mu.Unlock()
	if coordinator.closed || coordinator.snapshot.State.Project.Revision != work.revision {
		return
	}
	if analysisErr != nil {
		coordinator.snapshot.Diagnostics = compilerDiagnostics(work.rendered)
		coordinator.snapshot.DiagnosticsRevision = work.revision
		coordinator.snapshot.ProviderStatus = unavailableProviderStatus(ProviderLifecycleFailed)
		return
	}
	coordinator.snapshot.Diagnostics = cloneDiagnostics(diagnostics)
	coordinator.snapshot.DiagnosticsRevision = work.revision
	coordinator.snapshot.ProviderStatus = status
}
