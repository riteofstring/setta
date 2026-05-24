package statemachineruns

import (
	"errors"
	"fmt"

	"setta/internal/agentruns"
	"setta/internal/projectstate"
)

func shouldHandleTerminalChildRunUpdate(childRun agentruns.Run) bool {
	if childRun.Status != agentruns.RunStatusCompleted &&
		childRun.Status != agentruns.RunStatusFailed &&
		childRun.Status != agentruns.RunStatusCancelled {
		return false
	}
	return runInputsStringEquals(childRun, inputKeyStateMachineParentRunType, RunTypeStateMachine)
}

func (r *Runtime) loadRunningStateMachineParentRun(childRun agentruns.Run) (*agentruns.Run, error) {
	parentRunID := runInputString(childRun, inputKeyStateMachineRunID)
	if parentRunID == "" {
		return nil, nil
	}
	parentRun, err := r.runs.Load(parentRunID)
	if err != nil {
		if errors.Is(err, agentruns.ErrRunNotFound) {
			return nil, nil
		}
		return nil, err
	}
	if parentRun.Status != agentruns.RunStatusRunning {
		return nil, nil
	}
	return &parentRun, nil
}

func (r *Runtime) prepareTerminalChildRunUpdate(parentRun *agentruns.Run, childRun agentruns.Run) (terminalChildRunUpdateContext, error) {
	graph, err := decodeGraph(parentRun.Inputs[graphSnapshotInputKey])
	if err != nil {
		return terminalChildRunUpdateContext{}, err
	}
	r.ensureRunOutputsInitialized(parentRun, graph)
	r.removeActiveChildRunID(parentRun, childRun.ID)

	sourceSectionID := runInputString(childRun, inputKeyStateMachineTargetSection)
	if sourceSectionID == "" {
		return terminalChildRunUpdateContext{}, fmt.Errorf("child run %s is missing %s", childRun.ID, inputKeyStateMachineTargetSection)
	}
	shareSessionID := normalizeOptionalString(stringPointer(runInputString(*parentRun, inputKeyShareSessionID)))
	projectRuntime, err := r.projectRuntime(shareSessionID)
	if err != nil {
		return terminalChildRunUpdateContext{}, err
	}
	return terminalChildRunUpdateContext{
		graph:                 graph,
		sourceSectionID:       sourceSectionID,
		projectConfigID:       runInputString(*parentRun, inputKeyProjectConfigID),
		shareSessionID:        shareSessionID,
		projectRuntime:        projectRuntime,
		sourceActivationCount: r.sourceActivationCount(*parentRun, sourceSectionID),
	}, nil
}

func matchingSignalEdges(
	graph graph,
	sourceSectionID string,
	signalEvent map[string]any,
	sourceActivationCount int,
) []projectstate.StateMachineEdge {
	matchingEdges := make([]projectstate.StateMachineEdge, 0)
	for _, edge := range graph.Edges {
		if edge.SourceSectionID != sourceSectionID {
			continue
		}
		if !edgeMatchesSignalEvent(edge, signalEvent) {
			continue
		}
		if !matchesSourceActivationCountCondition(edge, sourceActivationCount) {
			continue
		}
		matchingEdges = append(matchingEdges, edge.Clone())
	}
	return matchingEdges
}

func matchingTerminalChildEdges(
	graph graph,
	sourceSectionID string,
	childRun agentruns.Run,
	sourceActivationCount int,
) []projectstate.StateMachineEdge {
	matchingEdges := make([]projectstate.StateMachineEdge, 0)
	for _, edge := range graph.Edges {
		if edge.SourceSectionID != sourceSectionID {
			continue
		}
		if !edgeMatchesChildTerminalRun(edge, childRun) {
			continue
		}
		if !matchesSourceActivationCountCondition(edge, sourceActivationCount) {
			continue
		}
		matchingEdges = append(matchingEdges, edge.Clone())
	}
	return matchingEdges
}

func (r *Runtime) appendActivatedEdgeResults(run *agentruns.Run, graph graph, actionResults []map[string]any) {
	if len(actionResults) == 0 {
		return
	}
	existing := outputListOfMaps(*run, outputKeyDispatchedEdgeActions)
	run.Outputs[outputKeyDispatchedEdgeActions] = append(existing, actionResults...)
	r.appendActionEvents(run, graph, actionResults)
}

func (r *Runtime) finalizeParentRunUpdate(run *agentruns.Run, graph graph) error {
	progress := r.computeProgressState(*run, graph)
	r.refreshOutputsWithProgress(run, graph, progress)
	if run.Status == agentruns.RunStatusRunning && len(progress.blockedGateSectionIDs) > 0 {
		if err := r.blockRun(run, graph, progress); err != nil {
			return err
		}
		r.refreshOutputs(run, graph)
	} else if shouldFailAsStalled(*run, progress) {
		r.failRun(run, "run_stalled", "Workflow has no active children, pending signals, or reachable next step.", map[string]any{})
		r.refreshOutputs(run, graph)
	}
	return r.runs.Save(*run)
}
