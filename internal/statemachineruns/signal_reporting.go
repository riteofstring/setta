package statemachineruns

import (
	"fmt"
	"slices"
	"strings"

	"setta/internal/agentruns"
	"setta/internal/projectstate"
)

func (r *Runtime) GetLatestRun(
	projectConfigID string,
	machineGroupID string,
	shareSessionID *string,
) (*agentruns.Run, error) {
	if r == nil {
		return nil, ErrRuntimeUnavailable
	}
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.getLatestRunLocked(strings.TrimSpace(projectConfigID), strings.TrimSpace(machineGroupID), normalizeOptionalString(shareSessionID))
}

func (r *Runtime) StopRun(
	projectConfigID string,
	machineGroupID string,
	shareSessionID *string,
) (*agentruns.Run, error) {
	if r == nil {
		return nil, ErrRuntimeUnavailable
	}
	r.mu.Lock()
	defer r.mu.Unlock()

	run, err := r.getLatestRunLocked(strings.TrimSpace(projectConfigID), strings.TrimSpace(machineGroupID), normalizeOptionalString(shareSessionID))
	if err != nil {
		return nil, err
	}
	if run == nil || run.Status != agentruns.RunStatusRunning {
		return nil, nil
	}
	stoppedChildRunIDs, err := r.stopRunningChildRuns(run.Clone())
	if err != nil {
		return nil, err
	}
	if len(stoppedChildRunIDs) > 0 {
		r.appendEvent(run, "child_runs_cancelled", map[string]any{
			"childRunIds": stoppedChildRunIDs,
		})
	}
	now := r.timeNow().UTC()
	run.Status = agentruns.RunStatusCancelled
	run.FinishedAt = &now
	r.appendEvent(run, "run_cancelled", map[string]any{})
	if err := r.runs.Save(*run); err != nil {
		return nil, err
	}
	cloned := run.Clone()
	return &cloned, nil
}

func (r *Runtime) ResetMachine(
	projectConfigID string,
	machineGroupID string,
	shareSessionID *string,
) (*agentruns.Run, error) {
	if r == nil {
		return nil, ErrRuntimeUnavailable
	}
	r.mu.Lock()
	defer r.mu.Unlock()

	normalizedProjectID := strings.TrimSpace(projectConfigID)
	normalizedMachineGroupID := strings.TrimSpace(machineGroupID)
	normalizedShareSessionID := normalizeOptionalString(shareSessionID)
	run, err := r.loadLatestRunIncludingCleared(normalizedProjectID, normalizedMachineGroupID, normalizedShareSessionID)
	if err != nil {
		return nil, err
	}
	if run == nil || r.isMachineRunCleared(*run) {
		return nil, nil
	}
	if run.Status == agentruns.RunStatusRunning {
		stoppedChildRunIDs, err := r.stopRunningChildRuns(run.Clone())
		if err != nil {
			return nil, err
		}
		if len(stoppedChildRunIDs) > 0 {
			r.appendEvent(run, "child_runs_cancelled", map[string]any{
				"childRunIds": stoppedChildRunIDs,
			})
		}
		now := r.timeNow().UTC()
		run.Status = agentruns.RunStatusCancelled
		run.FinishedAt = &now
		r.appendEvent(run, "run_cancelled", map[string]any{})
	}
	if err := r.clearOwnedChatBindings(run.Clone(), normalizedProjectID, normalizedShareSessionID); err != nil {
		return nil, err
	}
	r.clearMachineRunState(run)
	r.appendEvent(run, "run_reset", map[string]any{})
	if err := r.runs.Save(*run); err != nil {
		return nil, err
	}
	cloned := run.Clone()
	return &cloned, nil
}

func (r *Runtime) ReportSignal(
	projectConfigID string,
	childRunID *string,
	machineRunID *string,
	sectionID *string,
	signalName string,
	payload map[string]any,
	shareSessionID *string,
) (map[string]any, error) {
	if r == nil {
		return nil, ErrRuntimeUnavailable
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	normalizedProjectID := strings.TrimSpace(projectConfigID)
	normalizedSignalName := strings.TrimSpace(signalName)
	if normalizedProjectID == "" {
		return nil, fmt.Errorf("%w: projectConfigId is required", ErrInvalidStateMachineInput)
	}
	if normalizedSignalName == "" {
		return nil, fmt.Errorf("%w: signalName is required", ErrInvalidStateMachineInput)
	}

	resolved, err := r.resolveSignalReportContext(
		normalizedProjectID,
		normalizeOptionalString(childRunID),
		normalizeOptionalString(machineRunID),
		normalizeOptionalString(sectionID),
		normalizeOptionalString(shareSessionID),
	)
	if err != nil {
		return nil, err
	}
	if resolved.parentRun.Status != agentruns.RunStatusRunning {
		return nil, fmt.Errorf("state machine run %s is not running and cannot accept signals", resolved.parentRun.ID)
	}

	r.ensureRunOutputsInitialized(&resolved.parentRun, resolved.graph)
	signalEvent := map[string]any{
		"signalEventId":         r.nextSignalEventID(),
		"signalName":            normalizedSignalName,
		"payload":               cloneAnyMap(payload),
		"machineRunId":          resolved.parentRun.ID,
		"childRunId":            resolved.childRun.ID,
		"sourceSectionId":       resolved.sourceSectionID,
		"sourceActivationCount": resolved.sourceActivationCount,
		"reportedAt":            r.timeNow().UTC().UnixMilli(),
	}
	appendSignalEvent(&resolved.parentRun, signalEvent)
	r.appendEvent(&resolved.parentRun, "signal_reported", map[string]any{
		"signalEventId":         signalEvent["signalEventId"],
		"signalName":            normalizedSignalName,
		"machineRunId":          resolved.parentRun.ID,
		"childRunId":            resolved.childRun.ID,
		"sourceSectionId":       resolved.sourceSectionID,
		"sourceActivationCount": resolved.sourceActivationCount,
	})

	projectRuntime, err := r.projectRuntime(normalizeOptionalString(shareSessionID))
	if err != nil {
		return nil, err
	}
	matchingEdges := matchingSignalEdges(resolved.graph, resolved.sourceSectionID, signalEvent, resolved.sourceActivationCount)
	if len(matchingEdges) > 0 {
		r.appendEvent(&resolved.parentRun, "signal_edges_activated", map[string]any{
			"signalEventId":   signalEvent["signalEventId"],
			"signalName":      normalizedSignalName,
			"edgeIds":         edgeIDs(matchingEdges),
			"sourceSectionId": resolved.sourceSectionID,
		})
		actionResults, err := r.activateEdges(
			projectRuntime,
			&resolved.parentRun,
			resolved.graph,
			matchingEdges,
			normalizedProjectID,
			normalizeOptionalString(shareSessionID),
		)
		if err != nil {
			return nil, err
		}
		r.appendActivatedEdgeResults(&resolved.parentRun, resolved.graph, actionResults)
	}
	markSignalEventProcessed(&resolved.parentRun, signalEvent)
	r.incrementSourceActivationCount(&resolved.parentRun, resolved.sourceSectionID)
	if err := r.finalizeParentRunUpdate(&resolved.parentRun, resolved.graph); err != nil {
		return nil, err
	}

	return map[string]any{
		"status":                "ok",
		"signalEventId":         signalEvent["signalEventId"],
		"machineRunId":          resolved.parentRun.ID,
		"childRunId":            resolved.childRun.ID,
		"sourceSectionId":       resolved.sourceSectionID,
		"signalName":            normalizedSignalName,
		"sourceActivationCount": resolved.sourceActivationCount,
	}, nil
}

func (r *Runtime) HandleTerminalChildRunUpdate(childRun agentruns.Run) (*agentruns.Run, error) {
	if !shouldHandleTerminalChildRunUpdate(childRun) {
		return nil, nil
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	parentRun, err := r.loadRunningStateMachineParentRun(childRun)
	if err != nil {
		return nil, err
	}
	if parentRun == nil {
		return nil, nil
	}
	if !r.markChildRunProcessed(parentRun, childRun.ID) {
		cloned := parentRun.Clone()
		return &cloned, nil
	}
	context, err := r.prepareTerminalChildRunUpdate(parentRun, childRun)
	if err != nil {
		return nil, err
	}
	r.appendChildRunTerminalEvent(parentRun, childRun, context.sourceSectionID, context.sourceActivationCount)
	matchingEdges := matchingTerminalChildEdges(context.graph, context.sourceSectionID, childRun, context.sourceActivationCount)
	if len(matchingEdges) > 0 {
		r.appendEvent(parentRun, "child_run_edges_activated", map[string]any{
			"childRunId":      childRun.ID,
			"edgeIds":         edgeIDs(matchingEdges),
			"sourceSectionId": context.sourceSectionID,
		})
		actionResults, err := r.activateEdges(
			context.projectRuntime,
			parentRun,
			context.graph,
			matchingEdges,
			context.projectConfigID,
			context.shareSessionID,
		)
		if err != nil {
			r.failRun(parentRun, "child_run_edge_action_failed", fmt.Sprintf("Workflow failed while handling %s.", childRun.ID), map[string]any{
				"childRunId": childRun.ID,
				"error":      err.Error(),
			})
		} else {
			r.appendActivatedEdgeResults(parentRun, context.graph, actionResults)
		}
	}
	r.incrementSourceActivationCount(parentRun, context.sourceSectionID)
	if err := r.finalizeParentRunUpdate(parentRun, context.graph); err != nil {
		return nil, err
	}
	cloned := parentRun.Clone()
	return &cloned, nil
}

func (r *Runtime) getLatestRunLocked(projectConfigID string, machineGroupID string, shareSessionID *string) (*agentruns.Run, error) {
	run, err := r.loadLatestRunIncludingCleared(projectConfigID, machineGroupID, shareSessionID)
	if err != nil {
		return nil, err
	}
	if run == nil || r.isMachineRunCleared(*run) {
		return nil, nil
	}
	cloned := run.Clone()
	return &cloned, nil
}

func (r *Runtime) loadLatestRunIncludingCleared(projectConfigID string, machineGroupID string, shareSessionID *string) (*agentruns.Run, error) {
	runType := RunTypeStateMachine
	projectRuns, err := r.runs.ListByMetadata(agentruns.RunFilter{
		RunType:         &runType,
		ProjectConfigID: stringPointer(projectConfigID),
	})
	if err != nil {
		return nil, err
	}
	matchingRuns := make([]agentruns.Run, 0, len(projectRuns))
	for _, run := range projectRuns {
		if runInputString(run, inputKeyMachineGroupID) != machineGroupID {
			continue
		}
		if !runMatchesShareSessionID(run, shareSessionID) {
			continue
		}
		matchingRuns = append(matchingRuns, run)
	}
	if len(matchingRuns) == 0 {
		return nil, nil
	}
	slices.SortFunc(matchingRuns, func(left, right agentruns.Run) int {
		rightUpdated := runLastUpdated(right)
		leftUpdated := runLastUpdated(left)
		switch {
		case leftUpdated.Before(rightUpdated):
			return 1
		case leftUpdated.After(rightUpdated):
			return -1
		default:
			return strings.Compare(right.ID, left.ID)
		}
	})
	latest := matchingRuns[0].Clone()
	return &latest, nil
}

func (r *Runtime) resolveSignalReportContext(
	projectConfigID string,
	childRunID *string,
	machineRunID *string,
	sectionID *string,
	shareSessionID *string,
) (resolvedSignalReportContext, error) {
	childRun, err := r.loadRequiredSignalChildRun(childRunID)
	if err != nil {
		return resolvedSignalReportContext{}, err
	}
	parentRunID, err := resolveSignalParentRunID(childRun, machineRunID)
	if err != nil {
		return resolvedSignalReportContext{}, err
	}
	parentRun, graph, err := r.loadValidatedSignalParentRun(parentRunID, projectConfigID, shareSessionID)
	if err != nil {
		return resolvedSignalReportContext{}, err
	}
	resolvedSectionID, err := resolveSignalSourceSectionID(childRun, sectionID)
	if err != nil {
		return resolvedSignalReportContext{}, err
	}
	if err := ensureChatSignalSourceSection(graph, resolvedSectionID); err != nil {
		return resolvedSignalReportContext{}, err
	}

	return resolvedSignalReportContext{
		parentRun:             parentRun,
		childRun:              childRun,
		graph:                 graph,
		sourceSectionID:       resolvedSectionID,
		sourceActivationCount: r.sourceActivationCount(parentRun, resolvedSectionID),
	}, nil
}

func (r *Runtime) loadRequiredSignalChildRun(childRunID *string) (agentruns.Run, error) {
	normalizedChildRunID := derefOptionalString(childRunID)
	if normalizedChildRunID == "" {
		return agentruns.Run{}, fmt.Errorf("report_state_machine_signal requires an active child run.")
	}
	return r.runs.Load(normalizedChildRunID)
}

func resolveSignalParentRunID(childRun agentruns.Run, machineRunID *string) (string, error) {
	parentRunID := runInputString(childRun, inputKeyStateMachineRunID)
	if parentRunID == "" {
		return "", fmt.Errorf("report_state_machine_signal requires an active child run.")
	}
	expectedParentRunID := derefOptionalString(machineRunID)
	if expectedParentRunID != "" && expectedParentRunID != parentRunID {
		return "", fmt.Errorf(
			"machineRunId %s does not match child run %s parent %s",
			expectedParentRunID,
			childRun.ID,
			parentRunID,
		)
	}
	return parentRunID, nil
}

func (r *Runtime) loadValidatedSignalParentRun(
	parentRunID string,
	projectConfigID string,
	shareSessionID *string,
) (agentruns.Run, graph, error) {
	parentRun, err := r.runs.Load(parentRunID)
	if err != nil {
		return agentruns.Run{}, graph{}, err
	}
	if !runInputsStringEquals(parentRun, "runType", RunTypeStateMachine) {
		return agentruns.Run{}, graph{}, fmt.Errorf("run %s is not a state machine run", parentRun.ID)
	}
	if !runMatchesShareSessionID(parentRun, shareSessionID) {
		return agentruns.Run{}, graph{}, fmt.Errorf("state machine run %s does not belong to the active share session", parentRun.ID)
	}
	if runInputString(parentRun, inputKeyProjectConfigID) != projectConfigID {
		return agentruns.Run{}, graph{}, fmt.Errorf(
			"state machine run %s does not belong to project config %s",
			parentRun.ID,
			projectConfigID,
		)
	}
	resolvedGraph, err := decodeGraph(parentRun.Inputs[graphSnapshotInputKey])
	if err != nil {
		return agentruns.Run{}, graph{}, err
	}
	return parentRun, resolvedGraph, nil
}

func resolveSignalSourceSectionID(childRun agentruns.Run, sectionID *string) (string, error) {
	resolvedSectionID := runInputString(childRun, inputKeyStateMachineTargetSection)
	normalizedSectionID := derefOptionalString(sectionID)
	if normalizedSectionID != "" {
		if resolvedSectionID != "" && normalizedSectionID != resolvedSectionID {
			return "", fmt.Errorf(
				"sectionId %s does not match child run %s section %s",
				normalizedSectionID,
				childRun.ID,
				resolvedSectionID,
			)
		}
		resolvedSectionID = normalizedSectionID
	}
	if resolvedSectionID == "" {
		return "", fmt.Errorf("report_state_machine_signal requires sectionId when no active chat section is available")
	}
	return resolvedSectionID, nil
}

func ensureChatSignalSourceSection(graph graph, sectionID string) error {
	sourceSection, ok := graph.Sections[sectionID]
	if !ok {
		return fmt.Errorf("sectionId %s was not found in the workflow graph snapshot", sectionID)
	}
	if sourceSection.Kind != graphSectionKindChat {
		return fmt.Errorf("sectionId %s is not a workflow chat section", sectionID)
	}
	return nil
}

func (r *Runtime) resolveGraph(
	projectConfigID string,
	machineGroupID string,
	startSectionID *string,
	shareSessionID *string,
) (graph, *projectstate.Runtime, error) {
	projectRuntime, err := r.projectRuntime(shareSessionID)
	if err != nil {
		return graph{}, nil, err
	}
	snapshot := projectRuntime.Snapshot()
	project, err := snapshot.Document.ProjectByID(projectConfigID)
	if err != nil {
		return graph{}, nil, err
	}

	inventory := buildGraphSectionInventory(project, machineGroupID)
	resolvedStartSectionID, err := resolveGraphStartSectionID(machineGroupID, startSectionID, inventory)
	if err != nil {
		return graph{}, nil, err
	}
	edges, err := buildGraphEdges(project, machineGroupID, inventory.sections)
	if err != nil {
		return graph{}, nil, err
	}
	startSection := inventory.sections[resolvedStartSectionID]
	machineName := strings.TrimSpace(startSection.Label)
	if machineName == "" {
		machineName = machineGroupID
	}
	return graph{
		MachineGroupID: machineGroupID,
		MachineName:    machineName,
		StartSectionID: resolvedStartSectionID,
		Sections:       inventory.sections,
		Edges:          edges,
	}, projectRuntime, nil
}

func (r *Runtime) projectRuntime(shareSessionID *string) (*projectstate.Runtime, error) {
	return r.resolveProjectRuntime(cloneStringPointer(shareSessionID))
}
