package statemachineruns

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"strings"
	"sync"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/externalagents"
	"setta/internal/managedchat"
	"setta/internal/mcpx"
	"setta/internal/projectstate"
	"setta/internal/promptrender"
	"setta/internal/prompttemplates"
)

const (
	RunTypeStateMachine = "state_machine"

	workflowSignalToolBaseName = "report_state_machine_signal"

	graphSnapshotInputKey              = "stateMachineGraphSnapshot"
	inputKeyProjectConfigID            = "projectConfigId"
	inputKeyMachineGroupID             = "machineGroupId"
	inputKeyStartSectionID             = "startSectionId"
	inputKeyMachineName                = "machineName"
	inputKeyShareSessionID             = "shareSessionId"
	inputKeyStateMachineRunID          = "stateMachineRunId"
	inputKeyStateMachineSourceEdgeID   = "stateMachineSourceEdgeId"
	inputKeyStateMachineTargetSection  = "stateMachineTargetSectionId"
	inputKeyStateMachineSourceCount    = "stateMachineSourceActivationCount"
	inputKeyStateMachineParentRunType  = "stateMachineParentRunType"
	outputKeyChildRunIDs               = "childRunIds"
	outputKeyActiveChildRunIDs         = "activeChildRunIds"
	outputKeyActivatedEdgeIDs          = "activatedEdgeIds"
	outputKeyEdgeActivationCounts      = "edgeActivationCountsByEdgeId"
	outputKeySourceActivationCounts    = "sourceActivationCountsBySectionId"
	outputKeyProcessedChildTerminalIDs = "processedChildTerminalRunIds"
	outputKeyDispatchedStartActions    = "dispatchedStartEdgeActions"
	outputKeyDispatchedEdgeActions     = "dispatchedEdgeActions"
	outputKeyOwnedChatBindings         = "ownedChatBindingsBySectionId"
	outputKeyGateIncomingEdgeIDs       = "gateIncomingEdgeIdsBySectionId"
	outputKeyGateInputEdgeIDs          = "gateInputEdgeIdsBySectionId"
	outputKeyGateStatuses              = "gateStatusBySectionId"
	outputKeyReachedEndSectionIDs      = "reachedEndSectionIds"
	outputKeySignalEvents              = "signalEvents"
	outputKeyProcessedSignalEventIDs   = "processedSignalEventIds"
	outputKeyFailureSummary            = "failureSummary"
	outputKeyMachineStateCleared       = "machineStateCleared"
	outputKeyMachineStateClearedAt     = "machineStateClearedAt"
)

var (
	ErrRunStoreRequired            = errors.New("state machine run store is required")
	ErrEngineStoreRequired         = errors.New("state machine engine store is required")
	ErrProfileStoreRequired        = errors.New("state machine agent profile store is required")
	ErrProjectResolverRequired     = errors.New("state machine project runtime resolver is required")
	ErrRuntimeUnavailable          = errors.New("state machine runtime is not available")
	ErrPromptTemplateStoreRequired = errors.New("state machine prompt template store is required")
	ErrInvalidStateMachineInput    = errors.New("invalid state machine run input")
)

type ResolveProjectRuntime func(shareSessionID *string) (*projectstate.Runtime, error)

type ManagedChatStarter interface {
	StartChat(managedchat.StartChatRequest) (managedchat.StartChatResult, error)
}

type ExternalChatStarter interface {
	StartChat(context.Context, externalagents.StartChatRequest) (externalagents.StartChatResult, error)
}

type RunStopper interface {
	StopRun(runID string) (agentruns.Run, error)
}

type RuntimeOptions struct {
	Runs                  *agentruns.RunStore
	Engines               *agentruns.EngineStore
	Profiles              *agentprofiles.Store
	Templates             *prompttemplates.Store
	ResolveProjectRuntime ResolveProjectRuntime
	ManagedChats          ManagedChatStarter
	ManagedRuns           RunStopper
	ExternalChats         ExternalChatStarter
	ExternalRuns          RunStopper
	BaseContext           context.Context
	TimeNow               func() time.Time
}

type Runtime struct {
	runs                  *agentruns.RunStore
	engines               *agentruns.EngineStore
	profiles              *agentprofiles.Store
	templates             *prompttemplates.Store
	resolveProjectRuntime ResolveProjectRuntime
	managedChats          ManagedChatStarter
	managedRuns           RunStopper
	externalChats         ExternalChatStarter
	externalRuns          RunStopper
	baseContext           context.Context
	timeNow               func() time.Time

	mu sync.Mutex

	nextSignalEventOrdinal int
}

type graph struct {
	MachineGroupID string                          `json:"machineGroupId"`
	MachineName    string                          `json:"machineName"`
	StartSectionID string                          `json:"startSectionId"`
	Sections       map[string]graphSection         `json:"sections"`
	Edges          []projectstate.StateMachineEdge `json:"edges"`
}

type chatEdgeDispatchResult struct {
	action         map[string]any
	targetSection  string
	previousChatID *string
	chatID         string
	childRunID     string
}

type graphSectionKind string

const (
	graphSectionKindStart graphSectionKind = "start"
	graphSectionKindGate  graphSectionKind = "gate"
	graphSectionKindEnd   graphSectionKind = "end"
	graphSectionKindChat  graphSectionKind = "chat"
)

type graphSection struct {
	ID             string                             `json:"id"`
	Kind           graphSectionKind                   `json:"kind"`
	Label          string                             `json:"label"`
	GateType       *projectstate.StateMachineGateType `json:"gateType,omitempty"`
	EngineConfigID *string                            `json:"engineConfigId,omitempty"`
	AgentProfileID *string                            `json:"agentProfileId,omitempty"`
	PermissionMode *string                            `json:"permissionMode,omitempty"`
	SearchEnabled  *bool                              `json:"searchEnabled,omitempty"`
}

type resolvedSignalReportContext struct {
	parentRun             agentruns.Run
	childRun              agentruns.Run
	graph                 graph
	sourceSectionID       string
	sourceActivationCount int
}

func NewRuntime(options RuntimeOptions) (*Runtime, error) {
	if options.Runs == nil {
		return nil, ErrRunStoreRequired
	}
	if options.Engines == nil {
		return nil, ErrEngineStoreRequired
	}
	if options.Profiles == nil {
		return nil, ErrProfileStoreRequired
	}
	if options.ResolveProjectRuntime == nil {
		return nil, ErrProjectResolverRequired
	}
	baseContext := options.BaseContext
	if baseContext == nil {
		baseContext = context.Background()
	}
	timeNow := options.TimeNow
	if timeNow == nil {
		timeNow = func() time.Time {
			return time.Now().UTC()
		}
	}
	return &Runtime{
		runs:                  options.Runs,
		engines:               options.Engines,
		profiles:              options.Profiles,
		templates:             options.Templates,
		resolveProjectRuntime: options.ResolveProjectRuntime,
		managedChats:          options.ManagedChats,
		managedRuns:           options.ManagedRuns,
		externalChats:         options.ExternalChats,
		externalRuns:          options.ExternalRuns,
		baseContext:           baseContext,
		timeNow:               timeNow,
	}, nil
}

func (r *Runtime) Disabled() bool {
	return r == nil || (r.managedChats == nil && r.externalChats == nil)
}

func (r *Runtime) StartRun(
	projectConfigID string,
	machineGroupID string,
	startSectionID *string,
	shareSessionID *string,
) (agentruns.Run, error) {
	if r == nil || r.Disabled() {
		return agentruns.Run{}, ErrRuntimeUnavailable
	}

	r.mu.Lock()
	defer r.mu.Unlock()

	normalizedProjectID := strings.TrimSpace(projectConfigID)
	normalizedMachineGroupID := strings.TrimSpace(machineGroupID)
	normalizedStartSectionID := normalizeOptionalString(startSectionID)
	normalizedShareSessionID := normalizeOptionalString(shareSessionID)
	if normalizedProjectID == "" {
		return agentruns.Run{}, fmt.Errorf("%w: projectConfigId is required", ErrInvalidStateMachineInput)
	}
	if normalizedMachineGroupID == "" {
		return agentruns.Run{}, fmt.Errorf("%w: machineGroupId is required", ErrInvalidStateMachineInput)
	}

	existing, err := r.getLatestRunLocked(normalizedProjectID, normalizedMachineGroupID, normalizedShareSessionID)
	if err != nil {
		return agentruns.Run{}, err
	}
	if existing != nil && existing.Status == agentruns.RunStatusRunning {
		return existing.Clone(), nil
	}

	graph, projectRuntime, err := r.resolveGraph(normalizedProjectID, normalizedMachineGroupID, normalizedStartSectionID, normalizedShareSessionID)
	if err != nil {
		return agentruns.Run{}, err
	}
	graphPayload, err := graph.jsonValue()
	if err != nil {
		return agentruns.Run{}, err
	}

	inputs := map[string]any{
		"runType":               RunTypeStateMachine,
		inputKeyProjectConfigID: normalizedProjectID,
		inputKeyMachineGroupID:  normalizedMachineGroupID,
		inputKeyStartSectionID:  graph.StartSectionID,
		inputKeyMachineName:     graph.MachineName,
		graphSnapshotInputKey:   graphPayload,
	}
	if normalizedShareSessionID != nil {
		inputs[inputKeyShareSessionID] = *normalizedShareSessionID
	}
	run := agentruns.NewRun(nil, inputs, r.timeNow())
	r.ensureRunOutputsInitialized(&run, graph)
	if err := r.runs.Save(run); err != nil {
		return agentruns.Run{}, err
	}

	r.appendEvent(&run, "run_started", map[string]any{
		inputKeyProjectConfigID: normalizedProjectID,
		inputKeyMachineGroupID:  normalizedMachineGroupID,
		inputKeyStartSectionID:  graph.StartSectionID,
		inputKeyMachineName:     graph.MachineName,
	})
	r.appendEvent(&run, "graph_resolved", map[string]any{
		"machineEdgeIds":             edgeIDs(graph.Edges),
		outputKeyGateIncomingEdgeIDs: cloneAnyMapMap(r.buildGateIncomingEdgeIDsBySectionID(graph)),
	})
	startEdges := r.outgoingEdges(graph, graph.StartSectionID)
	r.appendEvent(&run, "start_edges_activated", map[string]any{
		"edgeIds":          edgeIDs(startEdges),
		"targetSectionIds": targetSectionIDs(startEdges),
	})
	if err := r.runs.Save(run); err != nil {
		return agentruns.Run{}, err
	}

	actionResults, activationErr := r.activateOutgoingEdges(projectRuntime, &run, graph, graph.StartSectionID, normalizedProjectID, normalizedShareSessionID)
	if activationErr != nil {
		r.failRun(&run, "start_edge_action_failed", fmt.Sprintf("Workflow failed while dispatching the first action: %v", activationErr), map[string]any{
			"error": activationErr.Error(),
		})
		if err := r.runs.Save(run); err != nil {
			return agentruns.Run{}, err
		}
		return run.Clone(), activationErr
	}
	run.Outputs[outputKeyDispatchedStartActions] = actionResults
	r.incrementSourceActivationCount(&run, graph.StartSectionID)
	r.refreshOutputs(&run, graph)
	if len(actionResults) > 0 {
		r.appendEvent(&run, "start_edge_actions_dispatched", map[string]any{
			"actions": actionResults,
		})
	}
	if err := r.runs.Save(run); err != nil {
		return agentruns.Run{}, err
	}
	return run.Clone(), nil
}

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
	stoppedChildRunIDs, err := r.stopRunningChildRuns(run.Clone(), strings.TrimSpace(projectConfigID))
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
		stoppedChildRunIDs, err := r.stopRunningChildRuns(run.Clone(), normalizedProjectID)
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
	matchingEdges := make([]projectstate.StateMachineEdge, 0)
	for _, edge := range r.outgoingEdges(resolved.graph, resolved.sourceSectionID) {
		if !edgeMatchesSignalEvent(edge, signalEvent) {
			continue
		}
		if !matchesSourceActivationCountCondition(edge, resolved.sourceActivationCount) {
			continue
		}
		matchingEdges = append(matchingEdges, edge)
	}
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
		if len(actionResults) > 0 {
			existing := outputListOfMaps(resolved.parentRun, outputKeyDispatchedEdgeActions)
			resolved.parentRun.Outputs[outputKeyDispatchedEdgeActions] = append(existing, actionResults...)
		}
	}
	markSignalEventProcessed(&resolved.parentRun, signalEvent)
	r.incrementSourceActivationCount(&resolved.parentRun, resolved.sourceSectionID)
	r.refreshOutputs(&resolved.parentRun, resolved.graph)
	if err := r.runs.Save(resolved.parentRun); err != nil {
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
	if childRun.Status != agentruns.RunStatusCompleted &&
		childRun.Status != agentruns.RunStatusFailed &&
		childRun.Status != agentruns.RunStatusCancelled {
		return nil, nil
	}
	if !runInputsStringEquals(childRun, inputKeyStateMachineParentRunType, RunTypeStateMachine) {
		return nil, nil
	}
	parentRunID := runInputString(childRun, inputKeyStateMachineRunID)
	if parentRunID == "" {
		return nil, nil
	}

	r.mu.Lock()
	defer r.mu.Unlock()

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
	if !r.markChildRunProcessed(&parentRun, childRun.ID) {
		cloned := parentRun.Clone()
		return &cloned, nil
	}
	graph, err := decodeGraph(parentRun.Inputs[graphSnapshotInputKey])
	if err != nil {
		return nil, err
	}
	r.ensureRunOutputsInitialized(&parentRun, graph)
	r.removeActiveChildRunID(&parentRun, childRun.ID)

	sourceSectionID := runInputString(childRun, inputKeyStateMachineTargetSection)
	if sourceSectionID == "" {
		return nil, fmt.Errorf("child run %s is missing %s", childRun.ID, inputKeyStateMachineTargetSection)
	}
	projectConfigID := runInputString(parentRun, inputKeyProjectConfigID)
	shareSessionID := normalizeOptionalString(stringPointer(runInputString(parentRun, inputKeyShareSessionID)))
	projectRuntime, err := r.projectRuntime(shareSessionID)
	if err != nil {
		return nil, err
	}

	sourceActivationCount := r.sourceActivationCount(parentRun, sourceSectionID)
	matchingEdges := make([]projectstate.StateMachineEdge, 0)
	for _, edge := range r.outgoingEdges(graph, sourceSectionID) {
		if !edgeMatchesChildTerminalRun(edge, childRun) {
			continue
		}
		if !matchesSourceActivationCountCondition(edge, sourceActivationCount) {
			continue
		}
		matchingEdges = append(matchingEdges, edge)
	}
	if len(matchingEdges) > 0 {
		r.appendEvent(&parentRun, "child_run_edges_activated", map[string]any{
			"childRunId":      childRun.ID,
			"edgeIds":         edgeIDs(matchingEdges),
			"sourceSectionId": sourceSectionID,
		})
		actionResults, err := r.activateEdges(projectRuntime, &parentRun, graph, matchingEdges, projectConfigID, shareSessionID)
		if err != nil {
			r.failRun(&parentRun, "child_run_edge_action_failed", fmt.Sprintf("Workflow failed while handling %s.", childRun.ID), map[string]any{
				"childRunId": childRun.ID,
				"error":      err.Error(),
			})
		} else if len(actionResults) > 0 {
			existing := outputListOfMaps(parentRun, outputKeyDispatchedEdgeActions)
			parentRun.Outputs[outputKeyDispatchedEdgeActions] = append(existing, actionResults...)
		}
	} else if childRun.Status == agentruns.RunStatusFailed {
		label := sourceSectionID
		if section, ok := graph.Sections[sourceSectionID]; ok && strings.TrimSpace(section.Label) != "" {
			label = section.Label
		}
		r.failRun(&parentRun, "child_run_failed", fmt.Sprintf("Workflow failed because %s failed.", label), map[string]any{
			"childRunId":      childRun.ID,
			"sourceSectionId": sourceSectionID,
		})
	}
	r.incrementSourceActivationCount(&parentRun, sourceSectionID)
	r.refreshOutputs(&parentRun, graph)
	if err := r.runs.Save(parentRun); err != nil {
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
	normalizedChildRunID := derefOptionalString(childRunID)
	if normalizedChildRunID == "" {
		return resolvedSignalReportContext{}, fmt.Errorf("report_state_machine_signal requires an active child run")
	}
	childRun, err := r.runs.Load(normalizedChildRunID)
	if err != nil {
		return resolvedSignalReportContext{}, err
	}

	parentRunID := runInputString(childRun, inputKeyStateMachineRunID)
	if parentRunID == "" {
		return resolvedSignalReportContext{}, fmt.Errorf("report_state_machine_signal requires an active child run")
	}
	if expectedParentRunID := derefOptionalString(machineRunID); expectedParentRunID != "" && expectedParentRunID != parentRunID {
		return resolvedSignalReportContext{}, fmt.Errorf(
			"machineRunId %s does not match child run %s parent %s",
			expectedParentRunID,
			childRun.ID,
			parentRunID,
		)
	}

	parentRun, err := r.runs.Load(parentRunID)
	if err != nil {
		return resolvedSignalReportContext{}, err
	}
	if !runInputsStringEquals(parentRun, "runType", RunTypeStateMachine) {
		return resolvedSignalReportContext{}, fmt.Errorf("run %s is not a state machine run", parentRun.ID)
	}
	if !runMatchesShareSessionID(parentRun, shareSessionID) {
		return resolvedSignalReportContext{}, fmt.Errorf("state machine run %s does not belong to the active share session", parentRun.ID)
	}
	if runInputString(parentRun, inputKeyProjectConfigID) != projectConfigID {
		return resolvedSignalReportContext{}, fmt.Errorf(
			"state machine run %s does not belong to project config %s",
			parentRun.ID,
			projectConfigID,
		)
	}

	graph, err := decodeGraph(parentRun.Inputs[graphSnapshotInputKey])
	if err != nil {
		return resolvedSignalReportContext{}, err
	}
	resolvedSectionID := runInputString(childRun, inputKeyStateMachineTargetSection)
	if normalizedSectionID := derefOptionalString(sectionID); normalizedSectionID != "" {
		if resolvedSectionID != "" && normalizedSectionID != resolvedSectionID {
			return resolvedSignalReportContext{}, fmt.Errorf(
				"sectionId %s does not match child run %s section %s",
				normalizedSectionID,
				childRun.ID,
				resolvedSectionID,
			)
		}
		resolvedSectionID = normalizedSectionID
	}
	if resolvedSectionID == "" {
		return resolvedSignalReportContext{}, fmt.Errorf(
			"report_state_machine_signal requires sectionId when no active chat section is available",
		)
	}

	sourceSection, ok := graph.Sections[resolvedSectionID]
	if !ok {
		return resolvedSignalReportContext{}, fmt.Errorf(
			"sectionId %s was not found in the workflow graph snapshot",
			resolvedSectionID,
		)
	}
	if sourceSection.Kind != graphSectionKindChat {
		return resolvedSignalReportContext{}, fmt.Errorf("sectionId %s is not a workflow chat section", resolvedSectionID)
	}

	return resolvedSignalReportContext{
		parentRun:             parentRun,
		childRun:              childRun,
		graph:                 graph,
		sourceSectionID:       resolvedSectionID,
		sourceActivationCount: r.sourceActivationCount(parentRun, resolvedSectionID),
	}, nil
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

	sections := map[string]graphSection{}
	startSectionIDs := []string{}
	for sectionID := range project.Sections {
		section, err := buildGraphSection(project, sectionID)
		if err != nil {
			continue
		}
		switch section.Kind {
		case graphSectionKindStart, graphSectionKindGate, graphSectionKindEnd:
			if machineGroupIDForSection(project, sectionID) != machineGroupID {
				continue
			}
			sections[sectionID] = section
			if section.Kind == graphSectionKindStart {
				startSectionIDs = append(startSectionIDs, sectionID)
			}
		}
	}
	if len(startSectionIDs) == 0 {
		return graph{}, nil, fmt.Errorf(
			"%w: state machine group %s does not have a Start section",
			ErrInvalidStateMachineInput,
			machineGroupID,
		)
	}
	if len(startSectionIDs) != 1 {
		return graph{}, nil, fmt.Errorf(
			"%w: state machine group %s must resolve to exactly one Start section",
			ErrInvalidStateMachineInput,
			machineGroupID,
		)
	}
	resolvedStartSectionID := startSectionIDs[0]
	if startSectionID != nil && strings.TrimSpace(*startSectionID) != "" && strings.TrimSpace(*startSectionID) != resolvedStartSectionID {
		return graph{}, nil, fmt.Errorf("%w: state machine start %s not found in group %s", projectstate.ErrSectionNotFound, strings.TrimSpace(*startSectionID), machineGroupID)
	}

	edges := make([]projectstate.StateMachineEdge, 0)
	for _, edge := range project.StateMachineEdges {
		if edge.MachineGroupID != machineGroupID {
			continue
		}
		edges = append(edges, edge.Clone())
		if _, ok := sections[edge.SourceSectionID]; !ok {
			section, err := buildGraphSection(project, edge.SourceSectionID)
			if err != nil {
				return graph{}, nil, err
			}
			sections[edge.SourceSectionID] = section
		}
		if _, ok := sections[edge.TargetSectionID]; !ok {
			section, err := buildGraphSection(project, edge.TargetSectionID)
			if err != nil {
				return graph{}, nil, err
			}
			sections[edge.TargetSectionID] = section
		}
	}
	startSection := sections[resolvedStartSectionID]
	machineName := strings.TrimSpace(startSection.Label)
	if machineName == "" {
		machineName = machineGroupID
	}
	return graph{
		MachineGroupID: machineGroupID,
		MachineName:    machineName,
		StartSectionID: resolvedStartSectionID,
		Sections:       sections,
		Edges:          edges,
	}, projectRuntime, nil
}

func (r *Runtime) projectRuntime(shareSessionID *string) (*projectstate.Runtime, error) {
	return r.resolveProjectRuntime(cloneStringPointer(shareSessionID))
}

func buildGraphSection(project projectstate.Project, sectionID string) (graphSection, error) {
	section, variant, _, err := project.ResolveSection(sectionID)
	if err != nil {
		return graphSection{}, err
	}
	payload, err := project.EffectiveSectionPayload(section.ID, variant.ID)
	if err != nil {
		return graphSection{}, err
	}
	sectionType := strings.TrimSpace(payloadString(payload, "type"))
	switch sectionType {
	case "StateMachineStart":
		return graphSection{
			ID:    section.ID,
			Kind:  graphSectionKindStart,
			Label: payloadString(payload, "label"),
		}, nil
	case "StateMachineGate":
		gateType := projectstate.StateMachineGateType(strings.TrimSpace(payloadString(payload, "gateType")))
		return graphSection{
			ID:       section.ID,
			Kind:     graphSectionKindGate,
			Label:    payloadString(payload, "label"),
			GateType: &gateType,
		}, nil
	case "StateMachineEnd":
		return graphSection{
			ID:    section.ID,
			Kind:  graphSectionKindEnd,
			Label: payloadString(payload, "label"),
		}, nil
	case "Chat":
		engineConfigID := optionalStringPointer(payloadString(payload, "engineConfigId"))
		agentProfileID := optionalStringPointer(payloadString(payload, "agentProfileId"))
		permissionMode := optionalStringPointer(payloadString(payload, "permissionMode"))
		searchEnabled := optionalBoolPointer(payload, "searchEnabled")
		return graphSection{
			ID:             section.ID,
			Kind:           graphSectionKindChat,
			Label:          strings.TrimSpace(section.Name),
			EngineConfigID: engineConfigID,
			AgentProfileID: agentProfileID,
			PermissionMode: permissionMode,
			SearchEnabled:  searchEnabled,
		}, nil
	default:
		return graphSection{}, fmt.Errorf("section %s is not a workflow section", section.ID)
	}
}

func machineGroupIDForSection(project projectstate.Project, sectionID string) string {
	section, variant, _, err := project.ResolveSection(sectionID)
	if err != nil {
		return ""
	}
	payload, err := project.EffectiveSectionPayload(section.ID, variant.ID)
	if err != nil {
		return ""
	}
	return payloadString(payload, "machineGroupId")
}

func (g graph) jsonValue() (map[string]any, error) {
	content, err := json.Marshal(g)
	if err != nil {
		return nil, fmt.Errorf("encode state machine graph snapshot: %w", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		return nil, fmt.Errorf("decode state machine graph snapshot payload: %w", err)
	}
	return payload, nil
}

func decodeGraph(raw any) (graph, error) {
	content, err := json.Marshal(raw)
	if err != nil {
		return graph{}, fmt.Errorf("encode state machine graph snapshot: %w", err)
	}
	var snapshot graph
	if err := json.Unmarshal(content, &snapshot); err != nil {
		return graph{}, fmt.Errorf("decode state machine graph snapshot: %w", err)
	}
	if snapshot.Sections == nil {
		snapshot.Sections = map[string]graphSection{}
	}
	return snapshot, nil
}

func (r *Runtime) outgoingEdges(graph graph, sourceSectionID string) []projectstate.StateMachineEdge {
	edges := make([]projectstate.StateMachineEdge, 0)
	for _, edge := range graph.Edges {
		if edge.SourceSectionID == sourceSectionID {
			edges = append(edges, edge.Clone())
		}
	}
	return edges
}

func (r *Runtime) activateOutgoingEdges(
	projectRuntime *projectstate.Runtime,
	run *agentruns.Run,
	graph graph,
	sourceSectionID string,
	projectConfigID string,
	shareSessionID *string,
) ([]map[string]any, error) {
	sourceActivationCount := r.sourceActivationCount(*run, sourceSectionID)
	edges := make([]projectstate.StateMachineEdge, 0)
	for _, edge := range r.outgoingEdges(graph, sourceSectionID) {
		if !matchesSourceActivationCountCondition(edge, sourceActivationCount) {
			continue
		}
		edges = append(edges, edge)
	}
	return r.activateEdges(projectRuntime, run, graph, edges, projectConfigID, shareSessionID)
}

func (r *Runtime) activateEdges(
	projectRuntime *projectstate.Runtime,
	run *agentruns.Run,
	graph graph,
	edges []projectstate.StateMachineEdge,
	projectConfigID string,
	shareSessionID *string,
) ([]map[string]any, error) {
	edgeGroups := groupEdgesByTargetSection(edges)
	if r.canActivateChatEdgeGroupsInParallel(graph, edgeGroups) {
		return r.activateChatEdgeGroupsInParallel(projectRuntime, run, graph, edgeGroups, projectConfigID, shareSessionID)
	}
	actionResults := make([]map[string]any, 0)
	for _, edge := range edges {
		r.incrementEdgeActivationCount(run, edge.ID)
		r.ensureActivatedEdgeID(run, edge.ID)
		targetSection, ok := graph.Sections[edge.TargetSectionID]
		if !ok {
			return nil, fmt.Errorf("workflow target section %s not found in graph snapshot", edge.TargetSectionID)
		}
		switch targetSection.Kind {
		case graphSectionKindGate:
			r.appendEvent(run, "gate_input_activated", map[string]any{
				"gateSectionId": targetSection.ID,
				"edgeId":        edge.ID,
			})
			nextActions, err := r.activateGateIfReady(projectRuntime, run, graph, targetSection.ID, projectConfigID, shareSessionID)
			if err != nil {
				return nil, err
			}
			actionResults = append(actionResults, nextActions...)
		case graphSectionKindEnd:
			r.reachEnd(run, edge)
		case graphSectionKindChat:
			nextAction, err := r.dispatchChatEdge(projectRuntime, run, graph, edge, targetSection, projectConfigID, shareSessionID)
			if err != nil {
				return nil, err
			}
			if nextAction != nil {
				actionResults = append(actionResults, nextAction)
			}
		default:
			return nil, fmt.Errorf("workflow target section %s cannot be activated", targetSection.ID)
		}
	}
	return actionResults, nil
}

func groupEdgesByTargetSection(edges []projectstate.StateMachineEdge) [][]projectstate.StateMachineEdge {
	orderedTargetSectionIDs := make([]string, 0)
	edgesByTargetSection := make(map[string][]projectstate.StateMachineEdge)
	for _, edge := range edges {
		if _, ok := edgesByTargetSection[edge.TargetSectionID]; !ok {
			orderedTargetSectionIDs = append(orderedTargetSectionIDs, edge.TargetSectionID)
		}
		edgesByTargetSection[edge.TargetSectionID] = append(edgesByTargetSection[edge.TargetSectionID], edge.Clone())
	}
	grouped := make([][]projectstate.StateMachineEdge, 0, len(orderedTargetSectionIDs))
	for _, targetSectionID := range orderedTargetSectionIDs {
		grouped = append(grouped, edgesByTargetSection[targetSectionID])
	}
	return grouped
}

func (r *Runtime) canActivateChatEdgeGroupsInParallel(
	graph graph,
	edgeGroups [][]projectstate.StateMachineEdge,
) bool {
	if len(edgeGroups) < 2 {
		return false
	}
	for _, group := range edgeGroups {
		if len(group) == 0 {
			return false
		}
		targetSection, ok := graph.Sections[group[0].TargetSectionID]
		if !ok || targetSection.Kind != graphSectionKindChat {
			return false
		}
		for _, edge := range group {
			if edge.TargetAction == nil {
				return false
			}
			if edge.TargetAction.Type != projectstate.StateMachineTargetActionTypeSendPrompt {
				return false
			}
			if edge.TargetSectionID != group[0].TargetSectionID {
				return false
			}
		}
	}
	return true
}

func (r *Runtime) activateChatEdgeGroupsInParallel(
	projectRuntime *projectstate.Runtime,
	run *agentruns.Run,
	graph graph,
	edgeGroups [][]projectstate.StateMachineEdge,
	projectConfigID string,
	shareSessionID *string,
) ([]map[string]any, error) {
	type groupResult struct {
		dispatches []chatEdgeDispatchResult
		err        error
	}

	results := make([]groupResult, len(edgeGroups))
	var waitGroup sync.WaitGroup
	waitGroup.Add(len(edgeGroups))
	for index, group := range edgeGroups {
		go func(index int, group []projectstate.StateMachineEdge) {
			defer waitGroup.Done()
			dispatches, err := r.activateChatEdgeGroup(projectRuntime, run, graph, group, projectConfigID, shareSessionID)
			results[index] = groupResult{
				dispatches: dispatches,
				err:        err,
			}
		}(index, group)
	}
	waitGroup.Wait()

	actionResults := make([]map[string]any, 0)
	var firstErr error
	for _, result := range results {
		if result.err != nil && firstErr == nil {
			firstErr = result.err
		}
		for _, dispatch := range result.dispatches {
			if err := r.applyChatEdgeDispatch(projectRuntime, run, projectConfigID, dispatch); err != nil {
				return nil, err
			}
			actionResults = append(actionResults, cloneAnyMap(dispatch.action))
		}
	}
	if firstErr != nil {
		return nil, firstErr
	}
	return actionResults, nil
}

func (r *Runtime) activateChatEdgeGroup(
	projectRuntime *projectstate.Runtime,
	run *agentruns.Run,
	graph graph,
	edges []projectstate.StateMachineEdge,
	projectConfigID string,
	shareSessionID *string,
) ([]chatEdgeDispatchResult, error) {
	if len(edges) == 0 {
		return []chatEdgeDispatchResult{}, nil
	}
	currentChatID, err := projectRuntime.ChatSectionChatID(projectConfigID, edges[0].TargetSectionID)
	if err != nil {
		return nil, err
	}
	dispatches := make([]chatEdgeDispatchResult, 0, len(edges))
	activeChatID := cloneStringPointer(currentChatID)
	for _, edge := range edges {
		targetSection, ok := graph.Sections[edge.TargetSectionID]
		if !ok {
			return nil, fmt.Errorf("workflow target section %s not found in graph snapshot", edge.TargetSectionID)
		}
		dispatch, err := r.dispatchChatEdgeWithCurrentChatID(projectRuntime, run, graph, edge, targetSection, projectConfigID, shareSessionID, activeChatID)
		if err != nil {
			return dispatches, err
		}
		dispatches = append(dispatches, dispatch)
		activeChatID = stringPointer(dispatch.chatID)
	}
	return dispatches, nil
}

func (r *Runtime) activateGateIfReady(
	projectRuntime *projectstate.Runtime,
	run *agentruns.Run,
	graph graph,
	gateSectionID string,
	projectConfigID string,
	shareSessionID *string,
) ([]map[string]any, error) {
	gateSection := graph.Sections[gateSectionID]
	incomingEdges := r.incomingEdges(graph, gateSectionID)
	if len(incomingEdges) == 0 {
		return nil, nil
	}
	activatedEdgeIDs := r.currentGateInputEdgeIDs(*run, graph, gateSectionID)
	satisfied := false
	switch gateType := derefGateType(gateSection.GateType); gateType {
	case projectstate.StateMachineGateTypeAND:
		satisfied = len(activatedEdgeIDs) == len(incomingEdges)
	case projectstate.StateMachineGateTypeOR:
		satisfied = len(activatedEdgeIDs) > 0
	case projectstate.StateMachineGateTypeXOR:
		satisfied = len(activatedEdgeIDs) == 1
	default:
		satisfied = false
	}
	if !satisfied {
		setGateStatus(run, gateSectionID, "waiting")
		return nil, nil
	}
	setGateStatus(run, gateSectionID, "satisfied")
	r.appendEvent(run, "gate_satisfied", map[string]any{
		"gateSectionId": gateSectionID,
		"edgeIds":       activatedEdgeIDs,
	})
	actionResults, err := r.activateOutgoingEdges(projectRuntime, run, graph, gateSectionID, projectConfigID, shareSessionID)
	if err != nil {
		return nil, err
	}
	r.incrementSourceActivationCount(run, gateSectionID)
	return actionResults, nil
}

func (r *Runtime) incomingEdges(graph graph, targetSectionID string) []projectstate.StateMachineEdge {
	edges := make([]projectstate.StateMachineEdge, 0)
	for _, edge := range graph.Edges {
		if edge.TargetSectionID == targetSectionID {
			edges = append(edges, edge.Clone())
		}
	}
	return edges
}

func (r *Runtime) dispatchChatEdge(
	projectRuntime *projectstate.Runtime,
	run *agentruns.Run,
	graph graph,
	edge projectstate.StateMachineEdge,
	targetSection graphSection,
	projectConfigID string,
	shareSessionID *string,
) (map[string]any, error) {
	targetAction := edge.TargetAction
	if targetAction == nil {
		return nil, fmt.Errorf("workflow edge %s target action is required for chat dispatch", edge.ID)
	}
	currentChatID, err := projectRuntime.ChatSectionChatID(projectConfigID, edge.TargetSectionID)
	if err != nil {
		return nil, err
	}
	if targetAction.Type == projectstate.StateMachineTargetActionTypeResetThread {
		if currentChatID != nil && r.stopChatIfRunning(*currentChatID, projectConfigID) != nil {
		}
		if _, err := projectRuntime.SetChatSectionChatID(r.baseContext, projectConfigID, edge.TargetSectionID, nil); err != nil {
			return nil, err
		}
		clearOwnedChatBinding(run, edge.TargetSectionID)
		return map[string]any{
			"edgeId":          edge.ID,
			"actionType":      string(targetAction.Type),
			"targetSectionId": edge.TargetSectionID,
			"threadStrategy":  string(targetAction.ThreadStrategy),
		}, nil
	}
	dispatch, err := r.dispatchChatEdgeWithCurrentChatID(projectRuntime, run, graph, edge, targetSection, projectConfigID, shareSessionID, currentChatID)
	if err != nil {
		return nil, err
	}
	if err := r.applyChatEdgeDispatch(projectRuntime, run, projectConfigID, dispatch); err != nil {
		return nil, err
	}
	return dispatch.action, nil
}

func (r *Runtime) dispatchChatEdgeWithCurrentChatID(
	projectRuntime *projectstate.Runtime,
	run *agentruns.Run,
	graph graph,
	edge projectstate.StateMachineEdge,
	targetSection graphSection,
	projectConfigID string,
	shareSessionID *string,
	currentChatID *string,
) (chatEdgeDispatchResult, error) {
	targetAction := edge.TargetAction
	if targetAction == nil {
		return chatEdgeDispatchResult{}, fmt.Errorf("workflow edge %s target action is required for chat dispatch", edge.ID)
	}
	promptText, err := r.resolvePromptText(projectRuntime, projectConfigID, edge, *targetAction)
	if err != nil {
		return chatEdgeDispatchResult{}, err
	}
	engineConfigID, err := r.resolveEngineConfigID(edge.ID, targetSection, *targetAction)
	if err != nil {
		return chatEdgeDispatchResult{}, err
	}
	engineConfig, err := r.engines.Get(engineConfigID)
	if err != nil {
		return chatEdgeDispatchResult{}, err
	}
	if err := r.ensureSignalDispatchProfileAllowed(graph, targetSection, *targetAction); err != nil {
		return chatEdgeDispatchResult{}, err
	}
	message := userTextMessage(promptText)
	resolvedPermissionMode := resolvePermissionMode(targetSection, *targetAction)
	resolvedSearchEnabled := resolveSearchEnabled(targetSection, *targetAction)
	var nextChatID *string
	if targetAction.ThreadStrategy == projectstate.StateMachineThreadStrategyContinueCurrentThread && currentChatID != nil {
		nextChatID = cloneStringPointer(currentChatID)
	}
	childInputs := map[string]any{
		inputKeyStateMachineRunID:         run.ID,
		inputKeyMachineGroupID:            runInputString(*run, inputKeyMachineGroupID),
		inputKeyStateMachineSourceEdgeID:  edge.ID,
		inputKeyStateMachineTargetSection: edge.TargetSectionID,
		inputKeyStateMachineSourceCount:   r.sourceActivationCount(*run, edge.SourceSectionID),
		inputKeyStateMachineParentRunType: RunTypeStateMachine,
	}
	if shareSessionID != nil {
		childInputs[inputKeyShareSessionID] = *shareSessionID
	}

	switch engineConfig.EngineType {
	case agentruns.EngineTypeSettaLLM:
		if r.managedChats == nil {
			return chatEdgeDispatchResult{}, ErrRuntimeUnavailable
		}
		result, err := r.managedChats.StartChat(managedchat.StartChatRequest{
			ChatID:           nextChatID,
			Message:          message,
			EngineConfigID:   engineConfig.ID,
			AgentProfileID:   chooseOptionalString(targetAction.AgentProfileID, targetSection.AgentProfileID),
			Thinking:         false,
			ProjectConfigID:  projectConfigID,
			SectionID:        stringPointer(edge.TargetSectionID),
			PermissionMode:   managedchat.ChatPermissionMode(resolvedPermissionMode),
			SearchEnabled:    resolvedSearchEnabled,
			AdditionalInputs: childInputs,
		})
		if err != nil {
			return chatEdgeDispatchResult{}, err
		}
		return chatEdgeDispatchResult{
			action: map[string]any{
				"edgeId":                edge.ID,
				"actionType":            string(targetAction.Type),
				"targetSectionId":       edge.TargetSectionID,
				"chatId":                result.ChatID,
				"runId":                 result.Run.ID,
				"threadStrategy":        string(targetAction.ThreadStrategy),
				"engineType":            string(engineConfig.EngineType),
				"sourceActivationCount": r.sourceActivationCount(*run, edge.SourceSectionID),
			},
			targetSection:  edge.TargetSectionID,
			previousChatID: cloneStringPointer(currentChatID),
			chatID:         result.ChatID,
			childRunID:     result.Run.ID,
		}, nil
	case agentruns.EngineTypeExternalAgent:
		if r.externalChats == nil {
			return chatEdgeDispatchResult{}, ErrRuntimeUnavailable
		}
		result, err := r.externalChats.StartChat(r.baseContext, externalagents.StartChatRequest{
			ChatID:           nextChatID,
			Message:          message,
			EngineConfigID:   engineConfig.ID,
			AgentProfileID:   chooseOptionalString(targetAction.AgentProfileID, targetSection.AgentProfileID),
			Thinking:         false,
			ProjectConfigID:  projectConfigID,
			SectionID:        stringPointer(edge.TargetSectionID),
			PermissionMode:   externalagents.ChatPermissionMode(resolvedPermissionMode),
			SearchEnabled:    resolvedSearchEnabled,
			AdditionalInputs: childInputs,
		})
		if err != nil {
			return chatEdgeDispatchResult{}, err
		}
		return chatEdgeDispatchResult{
			action: map[string]any{
				"edgeId":                edge.ID,
				"actionType":            string(targetAction.Type),
				"targetSectionId":       edge.TargetSectionID,
				"chatId":                result.ChatID,
				"runId":                 result.Run.ID,
				"threadStrategy":        string(targetAction.ThreadStrategy),
				"engineType":            string(engineConfig.EngineType),
				"sourceActivationCount": r.sourceActivationCount(*run, edge.SourceSectionID),
			},
			targetSection:  edge.TargetSectionID,
			previousChatID: cloneStringPointer(currentChatID),
			chatID:         result.ChatID,
			childRunID:     result.Run.ID,
		}, nil
	default:
		return chatEdgeDispatchResult{}, fmt.Errorf("workflow edge %s uses unsupported engine type %s", edge.ID, engineConfig.EngineType)
	}
}

func (r *Runtime) applyChatEdgeDispatch(
	projectRuntime *projectstate.Runtime,
	run *agentruns.Run,
	projectConfigID string,
	dispatch chatEdgeDispatchResult,
) error {
	if dispatch.previousChatID == nil || *dispatch.previousChatID != dispatch.chatID {
		setOwnedChatBinding(run, dispatch.targetSection, dispatch.chatID)
	} else {
		clearOwnedChatBinding(run, dispatch.targetSection)
	}
	if _, err := projectRuntime.SetChatSectionChatID(r.baseContext, projectConfigID, dispatch.targetSection, stringPointer(dispatch.chatID)); err != nil {
		return err
	}
	r.appendChildRunID(run, dispatch.childRunID)
	r.addActiveChildRunID(run, dispatch.childRunID)
	return nil
}

func (r *Runtime) resolvePromptText(
	projectRuntime *projectstate.Runtime,
	projectConfigID string,
	edge projectstate.StateMachineEdge,
	targetAction projectstate.StateMachineTargetAction,
) (string, error) {
	if targetAction.InlinePrompt != nil && strings.TrimSpace(*targetAction.InlinePrompt) != "" {
		return *targetAction.InlinePrompt, nil
	}
	if targetAction.PromptSectionID != nil && strings.TrimSpace(*targetAction.PromptSectionID) != "" {
		projectSnapshot := projectRuntime.Snapshot()
		project, err := projectSnapshot.Document.ProjectByID(projectConfigID)
		if err != nil {
			return "", err
		}
		section, variant, _, err := project.ResolveSection(strings.TrimSpace(*targetAction.PromptSectionID))
		if err != nil {
			return "", err
		}
		payload, err := project.EffectiveSectionPayload(section.ID, variant.ID)
		if err != nil {
			return "", err
		}
		template := payloadString(payload, "template")
		format := prompttemplates.Format(strings.TrimSpace(payloadString(payload, "format")))
		if format == "" {
			format = prompttemplates.FormatJinja
		}
		if format != prompttemplates.FormatJinja {
			return "", fmt.Errorf("state machine edge %s prompt section %s format %s is unsupported", edge.ID, section.ID, format)
		}
		result := promptrender.RenderJinja(template, cloneStringMap(targetAction.PromptInputs))
		if result.RenderError != nil {
			return "", fmt.Errorf("state machine edge %s prompt section %s failed to render: %s", edge.ID, section.ID, *result.RenderError)
		}
		if strings.TrimSpace(result.RenderedText) == "" {
			return "", fmt.Errorf("state machine edge %s prompt section %s rendered an empty prompt", edge.ID, section.ID)
		}
		return result.RenderedText, nil
	}
	if targetAction.PromptTemplateID == nil || strings.TrimSpace(*targetAction.PromptTemplateID) == "" {
		return "", fmt.Errorf("state machine edge %s send_prompt action is missing prompt content", edge.ID)
	}
	if r.templates == nil {
		return "", ErrPromptTemplateStoreRequired
	}
	template, err := r.templates.Get(strings.TrimSpace(*targetAction.PromptTemplateID))
	if err != nil {
		return "", err
	}
	result := promptrender.RenderJinja(template.Template, cloneStringMap(targetAction.PromptInputs))
	if result.RenderError != nil {
		return "", fmt.Errorf("state machine edge %s prompt template %s failed to render: %s", edge.ID, template.ID, *result.RenderError)
	}
	if strings.TrimSpace(result.RenderedText) == "" {
		return "", fmt.Errorf("state machine edge %s prompt template %s rendered an empty prompt", edge.ID, template.ID)
	}
	return result.RenderedText, nil
}

func (r *Runtime) resolveEngineConfigID(
	edgeID string,
	targetSection graphSection,
	targetAction projectstate.StateMachineTargetAction,
) (string, error) {
	if targetAction.EngineConfigID != nil && strings.TrimSpace(*targetAction.EngineConfigID) != "" {
		return strings.TrimSpace(*targetAction.EngineConfigID), nil
	}
	if targetSection.EngineConfigID != nil && strings.TrimSpace(*targetSection.EngineConfigID) != "" {
		return strings.TrimSpace(*targetSection.EngineConfigID), nil
	}
	return "", fmt.Errorf("chat section %s is missing engineConfigId for state machine edge %s", targetSection.ID, edgeID)
}

func (r *Runtime) ensureSignalDispatchProfileAllowed(
	graph graph,
	targetSection graphSection,
	targetAction projectstate.StateMachineTargetAction,
) error {
	if !r.hasSignalFilteredOutgoingEdges(graph, targetSection.ID) {
		return nil
	}
	agentProfileID := chooseOptionalString(targetAction.AgentProfileID, targetSection.AgentProfileID)
	if agentProfileID == nil {
		return nil
	}
	profile, err := r.profiles.Get(*agentProfileID)
	if err != nil {
		return err
	}
	if workflowSignalToolAllowed(profile) {
		return nil
	}
	return fmt.Errorf(
		"%w: workflow chat section %s requires agent profile %s to allow %s",
		ErrInvalidStateMachineInput,
		targetSection.ID,
		profile.ID,
		workflowSignalToolBaseName,
	)
}

func (r *Runtime) hasSignalFilteredOutgoingEdges(graph graph, sourceSectionID string) bool {
	for _, edge := range r.outgoingEdges(graph, sourceSectionID) {
		if edge.SourceFilter == nil {
			continue
		}
		if edge.SourceFilter.Type == projectstate.StateMachineSourceFilterTypeSignal {
			return true
		}
	}
	return false
}

func workflowSignalToolAllowed(profile agentprofiles.Profile) bool {
	if len(profile.ToolAllowlist) == 0 {
		return true
	}
	requiredToolName := mcpx.NormalizeToolName(mcpx.BuildNamespacedToolName(mcpx.DefaultServerID, workflowSignalToolBaseName))
	serverID, baseName, ok := mcpx.SplitNamespacedToolName(requiredToolName)
	if !ok {
		return false
	}
	for _, entry := range profile.ToolAllowlist {
		normalizedEntry := mcpx.NormalizeToolName(strings.TrimSpace(entry))
		switch normalizedEntry {
		case requiredToolName, baseName, serverID:
			return true
		}
	}
	return false
}

func (r *Runtime) stopRunningChildRuns(parentRun agentruns.Run, projectConfigID string) ([]string, error) {
	childRuns, err := r.listChildRuns(parentRun, projectConfigID)
	if err != nil {
		return nil, err
	}
	stoppedRunIDs := make([]string, 0)
	for _, childRun := range childRuns {
		if childRun.Status != agentruns.RunStatusRunning {
			continue
		}
		switch runInputString(childRun, "runType") {
		case externalagents.RunTypeExternalAgent:
			if r.externalRuns == nil {
				continue
			}
			if _, err := r.externalRuns.StopRun(childRun.ID); err != nil && !errors.Is(err, agentruns.ErrRunNotFound) {
				return nil, err
			}
		default:
			if r.managedRuns == nil {
				continue
			}
			if _, err := r.managedRuns.StopRun(childRun.ID); err != nil && !errors.Is(err, agentruns.ErrRunNotFound) {
				return nil, err
			}
		}
		stoppedRunIDs = append(stoppedRunIDs, childRun.ID)
	}
	return stoppedRunIDs, nil
}

func (r *Runtime) stopChatIfRunning(chatID string, projectConfigID string) *agentruns.Run {
	runs, err := r.runs.ListByMetadata(agentruns.RunFilter{
		ChatID:          stringPointer(chatID),
		ProjectConfigID: stringPointer(projectConfigID),
	})
	if err != nil {
		return nil
	}
	runningRuns := make([]agentruns.Run, 0)
	for _, run := range runs {
		if run.Status == agentruns.RunStatusRunning {
			runningRuns = append(runningRuns, run)
		}
	}
	if len(runningRuns) == 0 {
		return nil
	}
	slices.SortFunc(runningRuns, func(left, right agentruns.Run) int {
		switch {
		case runLastUpdated(left).Before(runLastUpdated(right)):
			return 1
		case runLastUpdated(left).After(runLastUpdated(right)):
			return -1
		default:
			return strings.Compare(right.ID, left.ID)
		}
	})
	latest := runningRuns[0]
	switch runInputString(latest, "runType") {
	case externalagents.RunTypeExternalAgent:
		if r.externalRuns == nil {
			return nil
		}
		stopped, err := r.externalRuns.StopRun(latest.ID)
		if err != nil {
			return nil
		}
		return &stopped
	default:
		if r.managedRuns == nil {
			return nil
		}
		stopped, err := r.managedRuns.StopRun(latest.ID)
		if err != nil {
			return nil
		}
		return &stopped
	}
}

func (r *Runtime) listChildRuns(parentRun agentruns.Run, projectConfigID string) ([]agentruns.Run, error) {
	projectRuns, err := r.runs.ListByMetadata(agentruns.RunFilter{
		ProjectConfigID: stringPointer(projectConfigID),
	})
	if err != nil {
		return nil, err
	}
	childRuns := make([]agentruns.Run, 0)
	for _, run := range projectRuns {
		if run.ID == parentRun.ID {
			continue
		}
		if runInputString(run, inputKeyStateMachineRunID) != parentRun.ID {
			continue
		}
		if !runInputsStringEquals(run, inputKeyStateMachineParentRunType, RunTypeStateMachine) {
			continue
		}
		childRuns = append(childRuns, run)
	}
	return childRuns, nil
}

func (r *Runtime) clearOwnedChatBindings(run agentruns.Run, projectConfigID string, shareSessionID *string) error {
	projectRuntime, err := r.projectRuntime(shareSessionID)
	if err != nil {
		return err
	}
	for sectionID, ownedChatID := range ownedChatBindings(&run) {
		currentChatID, err := projectRuntime.ChatSectionChatID(projectConfigID, sectionID)
		if err != nil {
			return err
		}
		if currentChatID == nil || strings.TrimSpace(*currentChatID) != ownedChatID {
			continue
		}
		if _, err := projectRuntime.SetChatSectionChatID(r.baseContext, projectConfigID, sectionID, nil); err != nil {
			return err
		}
	}
	return nil
}

func (r *Runtime) ensureRunOutputsInitialized(run *agentruns.Run, graph graph) {
	if run.Outputs == nil {
		run.Outputs = map[string]any{}
	}
	defaults := map[string]any{
		outputKeyChildRunIDs:               []any{},
		outputKeyActiveChildRunIDs:         []any{},
		outputKeyActivatedEdgeIDs:          []any{},
		outputKeyEdgeActivationCounts:      map[string]any{},
		outputKeySourceActivationCounts:    map[string]any{},
		outputKeyProcessedChildTerminalIDs: []any{},
		outputKeyDispatchedStartActions:    []any{},
		outputKeyDispatchedEdgeActions:     []any{},
		outputKeyOwnedChatBindings:         map[string]any{},
		outputKeyGateIncomingEdgeIDs:       r.buildGateIncomingEdgeIDsBySectionID(graph),
		outputKeyGateInputEdgeIDs:          map[string]any{},
		outputKeyGateStatuses:              map[string]any{},
		outputKeyReachedEndSectionIDs:      []any{},
		outputKeySignalEvents:              []any{},
		outputKeyProcessedSignalEventIDs:   []any{},
		outputKeyFailureSummary:            nil,
		outputKeyMachineStateCleared:       false,
		outputKeyMachineStateClearedAt:     nil,
	}
	for key, value := range defaults {
		if _, ok := run.Outputs[key]; !ok {
			run.Outputs[key] = deepCloneJSONValue(value)
		}
	}
	r.refreshOutputs(run, graph)
}

func (r *Runtime) buildGateIncomingEdgeIDsBySectionID(graph graph) map[string]any {
	result := map[string]any{}
	for sectionID, section := range graph.Sections {
		if section.Kind != graphSectionKindGate {
			continue
		}
		incoming := []any{}
		for _, edge := range graph.Edges {
			if edge.TargetSectionID == sectionID {
				incoming = append(incoming, edge.ID)
			}
		}
		result[sectionID] = incoming
	}
	return result
}

func (r *Runtime) refreshOutputs(run *agentruns.Run, graph graph) {
	gateInputEdgeIDs := map[string]any{}
	for sectionID, section := range graph.Sections {
		if section.Kind != graphSectionKindGate {
			continue
		}
		inputIDs := r.currentGateInputEdgeIDs(*run, graph, sectionID)
		values := make([]any, 0, len(inputIDs))
		for _, inputID := range inputIDs {
			values = append(values, inputID)
		}
		gateInputEdgeIDs[sectionID] = values
		if _, ok := rawOutputMap(*run, outputKeyGateStatuses)[sectionID]; !ok {
			setGateStatus(run, sectionID, "waiting")
		}
	}
	run.Outputs[outputKeyGateInputEdgeIDs] = gateInputEdgeIDs
}

func (r *Runtime) currentGateInputEdgeIDs(run agentruns.Run, graph graph, gateSectionID string) []string {
	incomingEdges := r.incomingEdges(graph, gateSectionID)
	gateActivationCount := r.sourceActivationCount(run, gateSectionID)
	activated := make([]string, 0)
	for _, edge := range incomingEdges {
		if r.edgeActivationCount(run, edge.ID) > gateActivationCount {
			activated = append(activated, edge.ID)
		}
	}
	slices.Sort(activated)
	return activated
}

func (r *Runtime) clearMachineRunState(run *agentruns.Run) {
	run.Outputs[outputKeyChildRunIDs] = []any{}
	run.Outputs[outputKeyActiveChildRunIDs] = []any{}
	run.Outputs[outputKeyActivatedEdgeIDs] = []any{}
	run.Outputs[outputKeyEdgeActivationCounts] = map[string]any{}
	run.Outputs[outputKeySourceActivationCounts] = map[string]any{}
	run.Outputs[outputKeyProcessedChildTerminalIDs] = []any{}
	run.Outputs[outputKeyDispatchedStartActions] = []any{}
	run.Outputs[outputKeyDispatchedEdgeActions] = []any{}
	run.Outputs[outputKeyOwnedChatBindings] = map[string]any{}
	run.Outputs[outputKeyGateInputEdgeIDs] = map[string]any{}
	run.Outputs[outputKeyGateStatuses] = map[string]any{}
	run.Outputs[outputKeyReachedEndSectionIDs] = []any{}
	run.Outputs[outputKeySignalEvents] = []any{}
	run.Outputs[outputKeyProcessedSignalEventIDs] = []any{}
	run.Outputs[outputKeyFailureSummary] = nil
	run.Outputs[outputKeyMachineStateCleared] = true
	run.Outputs[outputKeyMachineStateClearedAt] = r.timeNow().UTC().Format(time.RFC3339Nano)
}

func (r *Runtime) appendEvent(run *agentruns.Run, eventType string, payload map[string]any) {
	run.Events = append(run.Events, agentruns.NewRunEvent(eventType, payload, r.timeNow()))
}

func (r *Runtime) failRun(run *agentruns.Run, reason string, message string, extraDetails map[string]any) {
	run.Outputs[outputKeyFailureSummary] = map[string]any{
		"reason":  reason,
		"message": message,
		"details": cloneAnyMap(extraDetails),
	}
	now := r.timeNow().UTC()
	run.Status = agentruns.RunStatusFailed
	run.FinishedAt = &now
	failurePayload := map[string]any{
		"reason":  reason,
		"message": message,
	}
	if len(extraDetails) > 0 {
		failurePayload["details"] = cloneAnyMap(extraDetails)
	}
	r.appendEvent(run, "run_failed", failurePayload)
}

func (r *Runtime) reachEnd(run *agentruns.Run, edge projectstate.StateMachineEdge) {
	reachedEnds := outputStringList(*run, outputKeyReachedEndSectionIDs)
	if !containsString(reachedEnds, edge.TargetSectionID) {
		run.Outputs[outputKeyReachedEndSectionIDs] = append(stringSliceToAny(reachedEnds), edge.TargetSectionID)
		r.appendEvent(run, "end_reached", map[string]any{
			"edgeId":       edge.ID,
			"endSectionId": edge.TargetSectionID,
		})
	}
	if run.Status != agentruns.RunStatusRunning {
		return
	}
	now := r.timeNow().UTC()
	run.Status = agentruns.RunStatusCompleted
	run.FinishedAt = &now
	r.appendEvent(run, "run_completed", map[string]any{})
}

func (r *Runtime) incrementEdgeActivationCount(run *agentruns.Run, edgeID string) {
	counts := outputIntMap(*run, outputKeyEdgeActivationCounts)
	counts[edgeID] = counts[edgeID] + 1
	run.Outputs[outputKeyEdgeActivationCounts] = intMapToAny(counts)
}

func (r *Runtime) edgeActivationCount(run agentruns.Run, edgeID string) int {
	return outputIntMap(run, outputKeyEdgeActivationCounts)[edgeID]
}

func (r *Runtime) incrementSourceActivationCount(run *agentruns.Run, sectionID string) {
	counts := outputIntMap(*run, outputKeySourceActivationCounts)
	counts[sectionID] = counts[sectionID] + 1
	run.Outputs[outputKeySourceActivationCounts] = intMapToAny(counts)
}

func (r *Runtime) sourceActivationCount(run agentruns.Run, sectionID string) int {
	return outputIntMap(run, outputKeySourceActivationCounts)[sectionID]
}

func (r *Runtime) ensureActivatedEdgeID(run *agentruns.Run, edgeID string) {
	activatedEdgeIDs := outputStringList(*run, outputKeyActivatedEdgeIDs)
	if containsString(activatedEdgeIDs, edgeID) {
		return
	}
	run.Outputs[outputKeyActivatedEdgeIDs] = append(stringSliceToAny(activatedEdgeIDs), edgeID)
}

func (r *Runtime) appendChildRunID(run *agentruns.Run, runID string) {
	childRunIDs := outputStringList(*run, outputKeyChildRunIDs)
	if containsString(childRunIDs, runID) {
		return
	}
	run.Outputs[outputKeyChildRunIDs] = append(stringSliceToAny(childRunIDs), runID)
}

func (r *Runtime) addActiveChildRunID(run *agentruns.Run, runID string) {
	activeRunIDs := outputStringList(*run, outputKeyActiveChildRunIDs)
	if containsString(activeRunIDs, runID) {
		return
	}
	run.Outputs[outputKeyActiveChildRunIDs] = append(stringSliceToAny(activeRunIDs), runID)
}

func (r *Runtime) removeActiveChildRunID(run *agentruns.Run, runID string) {
	activeRunIDs := outputStringList(*run, outputKeyActiveChildRunIDs)
	nextActive := make([]any, 0, len(activeRunIDs))
	for _, candidate := range activeRunIDs {
		if candidate == runID {
			continue
		}
		nextActive = append(nextActive, candidate)
	}
	run.Outputs[outputKeyActiveChildRunIDs] = nextActive
}

func (r *Runtime) markChildRunProcessed(run *agentruns.Run, childRunID string) bool {
	processed := outputStringList(*run, outputKeyProcessedChildTerminalIDs)
	if containsString(processed, childRunID) {
		return false
	}
	run.Outputs[outputKeyProcessedChildTerminalIDs] = append(stringSliceToAny(processed), childRunID)
	return true
}

func (r *Runtime) isMachineRunCleared(run agentruns.Run) bool {
	if run.Outputs == nil {
		return false
	}
	value, ok := run.Outputs[outputKeyMachineStateCleared]
	return ok && value == true
}

func ownedChatBindings(run *agentruns.Run) map[string]string {
	rawBindings := outputMap(*run, outputKeyOwnedChatBindings)
	bindings := map[string]string{}
	for sectionID, rawChatID := range rawBindings {
		chatID, ok := rawChatID.(string)
		if !ok || strings.TrimSpace(chatID) == "" {
			continue
		}
		bindings[sectionID] = chatID
	}
	return bindings
}

func setOwnedChatBinding(run *agentruns.Run, sectionID string, chatID string) {
	bindings := ownedChatBindings(run)
	bindings[sectionID] = chatID
	run.Outputs[outputKeyOwnedChatBindings] = stringMapToAny(bindings)
}

func clearOwnedChatBinding(run *agentruns.Run, sectionID string) {
	bindings := ownedChatBindings(run)
	delete(bindings, sectionID)
	run.Outputs[outputKeyOwnedChatBindings] = stringMapToAny(bindings)
}

func appendSignalEvent(run *agentruns.Run, signalEvent map[string]any) {
	signalEvents := outputListOfMaps(*run, outputKeySignalEvents)
	signalEvents = append(signalEvents, cloneAnyMap(signalEvent))
	run.Outputs[outputKeySignalEvents] = listOfMapsToAny(signalEvents)
}

func markSignalEventProcessed(run *agentruns.Run, signalEvent map[string]any) {
	processed := outputStringList(*run, outputKeyProcessedSignalEventIDs)
	signalEventID := signalEventString(signalEvent, "signalEventId")
	if signalEventID == "" || containsString(processed, signalEventID) {
		return
	}
	run.Outputs[outputKeyProcessedSignalEventIDs] = append(stringSliceToAny(processed), signalEventID)
}

func setGateStatus(run *agentruns.Run, sectionID string, status string) {
	statuses := rawOutputMap(*run, outputKeyGateStatuses)
	statuses[sectionID] = status
	run.Outputs[outputKeyGateStatuses] = statuses
}

func edgeMatchesChildTerminalRun(edge projectstate.StateMachineEdge, childRun agentruns.Run) bool {
	if edge.SourceFilter == nil {
		return childRun.Status == agentruns.RunStatusCompleted
	}
	switch edge.SourceFilter.Type {
	case projectstate.StateMachineSourceFilterTypeRunCompleted:
		return childRun.Status == agentruns.RunStatusCompleted
	case projectstate.StateMachineSourceFilterTypeRunFailed:
		return childRun.Status == agentruns.RunStatusFailed
	default:
		return false
	}
}

func edgeMatchesSignalEvent(edge projectstate.StateMachineEdge, signalEvent map[string]any) bool {
	if edge.SourceFilter == nil || edge.SourceFilter.Type != projectstate.StateMachineSourceFilterTypeSignal {
		return false
	}
	if derefOptionalString(edge.SourceFilter.SignalName) != signalEventString(signalEvent, "signalName") {
		return false
	}
	if edge.SourceFilter.PayloadField == nil || strings.TrimSpace(*edge.SourceFilter.PayloadField) == "" {
		return true
	}
	payload := signalEventPayload(signalEvent)
	rawValue, ok := payload[strings.TrimSpace(*edge.SourceFilter.PayloadField)]
	if !ok {
		return false
	}
	value, ok := rawValue.(string)
	if !ok {
		return false
	}
	return value == derefOptionalString(edge.SourceFilter.Equals)
}

func matchesSourceActivationCountCondition(edge projectstate.StateMachineEdge, sourceActivationCount int) bool {
	if edge.SourceActivationCountCondition == nil {
		return true
	}
	value := edge.SourceActivationCountCondition.Value
	switch edge.SourceActivationCountCondition.Operator {
	case projectstate.StateMachineCountOperatorLT:
		return sourceActivationCount < value
	case projectstate.StateMachineCountOperatorLTE:
		return sourceActivationCount <= value
	case projectstate.StateMachineCountOperatorEQ:
		return sourceActivationCount == value
	case projectstate.StateMachineCountOperatorGTE:
		return sourceActivationCount >= value
	case projectstate.StateMachineCountOperatorGT:
		return sourceActivationCount > value
	default:
		return false
	}
}

func resolvePermissionMode(section graphSection, targetAction projectstate.StateMachineTargetAction) string {
	if targetAction.PermissionMode != nil && strings.TrimSpace(*targetAction.PermissionMode) != "" {
		return strings.TrimSpace(*targetAction.PermissionMode)
	}
	if section.PermissionMode != nil && strings.TrimSpace(*section.PermissionMode) != "" {
		return strings.TrimSpace(*section.PermissionMode)
	}
	return string(projectstate.ChatPermissionModeMinimal)
}

func resolveSearchEnabled(section graphSection, targetAction projectstate.StateMachineTargetAction) bool {
	if targetAction.SearchEnabled != nil {
		return *targetAction.SearchEnabled
	}
	if section.SearchEnabled != nil {
		return *section.SearchEnabled
	}
	return true
}

func edgeIDs(edges []projectstate.StateMachineEdge) []any {
	result := make([]any, 0, len(edges))
	for _, edge := range edges {
		result = append(result, edge.ID)
	}
	return result
}

func targetSectionIDs(edges []projectstate.StateMachineEdge) []any {
	result := make([]any, 0, len(edges))
	for _, edge := range edges {
		result = append(result, edge.TargetSectionID)
	}
	return result
}

func runInputString(run agentruns.Run, key string) string {
	if run.Inputs == nil {
		return ""
	}
	value, ok := run.Inputs[key]
	if !ok {
		return ""
	}
	valueString, ok := value.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(valueString)
}

func runInputsStringEquals(run agentruns.Run, key string, expected string) bool {
	return runInputString(run, key) == strings.TrimSpace(expected)
}

func runMatchesShareSessionID(run agentruns.Run, shareSessionID *string) bool {
	expected := derefOptionalString(shareSessionID)
	return runInputString(run, inputKeyShareSessionID) == expected
}

func runLastUpdated(run agentruns.Run) time.Time {
	if run.FinishedAt != nil {
		return run.FinishedAt.UTC()
	}
	if len(run.Events) > 0 {
		return run.Events[len(run.Events)-1].Timestamp.UTC()
	}
	if run.StartedAt != nil {
		return run.StartedAt.UTC()
	}
	return time.Time{}
}

func outputStringList(run agentruns.Run, key string) []string {
	if run.Outputs == nil {
		return []string{}
	}
	rawValue, ok := run.Outputs[key]
	if !ok {
		return []string{}
	}
	rawItems, ok := rawValue.([]any)
	if !ok {
		return []string{}
	}
	items := make([]string, 0, len(rawItems))
	for _, rawItem := range rawItems {
		item, ok := rawItem.(string)
		if !ok || strings.TrimSpace(item) == "" {
			continue
		}
		items = append(items, item)
	}
	return items
}

func outputIntMap(run agentruns.Run, key string) map[string]int {
	if run.Outputs == nil {
		return map[string]int{}
	}
	rawValue, ok := run.Outputs[key]
	if !ok {
		return map[string]int{}
	}
	rawMap, ok := rawValue.(map[string]any)
	if !ok {
		return map[string]int{}
	}
	values := make(map[string]int, len(rawMap))
	for mapKey, rawEntry := range rawMap {
		switch typed := rawEntry.(type) {
		case int:
			values[mapKey] = typed
		case float64:
			values[mapKey] = int(typed)
		}
	}
	return values
}

func outputMap(run agentruns.Run, key string) map[string]any {
	return cloneAnyMap(rawOutputMap(run, key))
}

func rawOutputMap(run agentruns.Run, key string) map[string]any {
	if run.Outputs == nil {
		return map[string]any{}
	}
	rawValue, ok := run.Outputs[key]
	if !ok {
		return map[string]any{}
	}
	rawMap, ok := rawValue.(map[string]any)
	if !ok {
		return map[string]any{}
	}
	return rawMap
}

func outputListOfMaps(run agentruns.Run, key string) []map[string]any {
	if run.Outputs == nil {
		return []map[string]any{}
	}
	rawValue, ok := run.Outputs[key]
	if !ok {
		return []map[string]any{}
	}
	rawItems, ok := rawValue.([]any)
	if !ok {
		return []map[string]any{}
	}
	result := make([]map[string]any, 0, len(rawItems))
	for _, rawItem := range rawItems {
		entry, ok := rawItem.(map[string]any)
		if !ok {
			continue
		}
		result = append(result, cloneAnyMap(entry))
	}
	return result
}

func listOfMapsToAny(input []map[string]any) []any {
	result := make([]any, 0, len(input))
	for _, value := range input {
		result = append(result, cloneAnyMap(value))
	}
	return result
}

func intMapToAny(input map[string]int) map[string]any {
	result := make(map[string]any, len(input))
	for key, value := range input {
		result[key] = value
	}
	return result
}

func stringMapToAny(input map[string]string) map[string]any {
	result := make(map[string]any, len(input))
	for key, value := range input {
		result[key] = value
	}
	return result
}

func stringSliceToAny(input []string) []any {
	result := make([]any, 0, len(input))
	for _, value := range input {
		result = append(result, value)
	}
	return result
}

func cloneAnyMap(input map[string]any) map[string]any {
	if input == nil {
		return map[string]any{}
	}
	result := make(map[string]any, len(input))
	for key, value := range input {
		result[key] = deepCloneJSONValue(value)
	}
	return result
}

func cloneAnyMapMap(input map[string]any) map[string]any {
	return cloneAnyMap(input)
}

func cloneStringMap(input map[string]string) map[string]string {
	if len(input) == 0 {
		return map[string]string{}
	}
	cloned := make(map[string]string, len(input))
	for key, value := range input {
		cloned[key] = value
	}
	return cloned
}

func deepCloneJSONValue(value any) any {
	if value == nil {
		return nil
	}
	content, err := json.Marshal(value)
	if err != nil {
		return value
	}
	var cloned any
	if err := json.Unmarshal(content, &cloned); err != nil {
		return value
	}
	return cloned
}

func userTextMessage(prompt string) map[string]any {
	return map[string]any{
		"id":   fmt.Sprintf("workflow-%d", time.Now().UTC().UnixNano()),
		"role": "user",
		"content": []any{
			map[string]any{
				"type": "text",
				"text": prompt,
			},
		},
	}
}

func payloadString(payload map[string]any, key string) string {
	if payload == nil {
		return ""
	}
	rawValue, ok := payload[key]
	if !ok {
		return ""
	}
	value, ok := rawValue.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(value)
}

func optionalBoolPointer(payload map[string]any, key string) *bool {
	if payload == nil {
		return nil
	}
	rawValue, ok := payload[key]
	if !ok {
		return nil
	}
	value, ok := rawValue.(bool)
	if !ok {
		return nil
	}
	return &value
}

func optionalStringPointer(value string) *string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func cloneStringPointer(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func chooseOptionalString(primary *string, fallback *string) *string {
	if primary != nil && strings.TrimSpace(*primary) != "" {
		trimmed := strings.TrimSpace(*primary)
		return &trimmed
	}
	return cloneStringPointer(fallback)
}

func stringPointer(value string) *string {
	cloned := strings.TrimSpace(value)
	if cloned == "" {
		return nil
	}
	return &cloned
}

func normalizeOptionalString(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func derefOptionalString(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func derefGateType(value *projectstate.StateMachineGateType) projectstate.StateMachineGateType {
	if value == nil {
		return projectstate.StateMachineGateTypeAND
	}
	return *value
}

func containsString(values []string, target string) bool {
	for _, value := range values {
		if value == target {
			return true
		}
	}
	return false
}

func signalEventString(signalEvent map[string]any, key string) string {
	if signalEvent == nil {
		return ""
	}
	rawValue, ok := signalEvent[key]
	if !ok {
		return ""
	}
	value, ok := rawValue.(string)
	if !ok {
		return ""
	}
	return strings.TrimSpace(value)
}

func signalEventPayload(signalEvent map[string]any) map[string]any {
	if signalEvent == nil {
		return map[string]any{}
	}
	rawValue, ok := signalEvent["payload"]
	if !ok {
		return map[string]any{}
	}
	payload, ok := rawValue.(map[string]any)
	if !ok {
		return map[string]any{}
	}
	return cloneAnyMap(payload)
}

func (r *Runtime) nextSignalEventID() string {
	r.nextSignalEventOrdinal++
	return fmt.Sprintf("signal-event-%d", r.nextSignalEventOrdinal)
}
