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
	outputKeyStartOutgoingTargetIDs    = "startOutgoingTargetSectionIds"
	outputKeyProcessedChildTerminalIDs = "processedChildTerminalRunIds"
	outputKeyDispatchedStartActions    = "dispatchedStartEdgeActions"
	outputKeyDispatchedEdgeActions     = "dispatchedEdgeActions"
	outputKeyOwnedChatBindings         = "ownedChatBindingsBySectionId"
	outputKeyGateIncomingEdgeIDs       = "gateIncomingEdgeIdsBySectionId"
	outputKeyGateInputEdgeIDs          = "gateInputEdgeIdsBySectionId"
	outputKeyGateStatuses              = "gateStatusBySectionId"
	outputKeyFiredGateSectionIDs       = "firedGateSectionIds"
	outputKeyBlockedGateSectionIDs     = "blockedGateSectionIds"
	outputKeyBlockedGateDetailsByID    = "blockedGateDetailsBySectionId"
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

type terminalChildRunUpdateContext struct {
	graph                 graph
	sourceSectionID       string
	projectConfigID       string
	shareSessionID        *string
	projectRuntime        *projectstate.Runtime
	sourceActivationCount int
}

type startRunRequest struct {
	projectConfigID string
	machineGroupID  string
	startSectionID  *string
	shareSessionID  *string
}

type progressState struct {
	possibleGateSectionIDs        map[string]struct{}
	possibleChatSourceSectionIDs  map[string]struct{}
	possibleEndSectionIDs         map[string]struct{}
	blockedGateSectionIDs         map[string]struct{}
	blockedGateDetailsBySectionID map[string]map[string]any
}

type progressReachability struct {
	possibleGateSectionIDs       map[string]struct{}
	possibleChatSourceSectionIDs map[string]struct{}
	possibleEndSectionIDs        map[string]struct{}
}

type graphSectionInventory struct {
	sections        map[string]graphSection
	startSectionIDs []string
	endSectionCount int
}

type preparedChatEdgeDispatch struct {
	engineConfig          agentruns.EngineConfig
	message               map[string]any
	agentProfileID        *string
	permissionMode        projectstate.ChatPermissionMode
	searchEnabled         bool
	nextChatID            *string
	childInputs           map[string]any
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

	request, err := normalizeStartRunRequest(projectConfigID, machineGroupID, startSectionID, shareSessionID)
	if err != nil {
		return agentruns.Run{}, err
	}

	existing, err := r.getLatestRunLocked(request.projectConfigID, request.machineGroupID, request.shareSessionID)
	if err != nil {
		return agentruns.Run{}, err
	}
	if existing != nil && existing.Status == agentruns.RunStatusRunning {
		return existing.Clone(), nil
	}

	run, graph, projectRuntime, err := r.createStartRun(request)
	if err != nil {
		return agentruns.Run{}, err
	}
	if err := r.persistInitializedStartRun(&run, graph, request); err != nil {
		return agentruns.Run{}, err
	}
	if activationErr := r.activateStartRun(projectRuntime, &run, graph, request); activationErr != nil {
		return run.Clone(), activationErr
	}
	return run.Clone(), nil
}

func normalizeStartRunRequest(
	projectConfigID string,
	machineGroupID string,
	startSectionID *string,
	shareSessionID *string,
) (startRunRequest, error) {
	request := startRunRequest{
		projectConfigID: strings.TrimSpace(projectConfigID),
		machineGroupID:  strings.TrimSpace(machineGroupID),
		startSectionID:  normalizeOptionalString(startSectionID),
		shareSessionID:  normalizeOptionalString(shareSessionID),
	}
	if request.projectConfigID == "" {
		return startRunRequest{}, fmt.Errorf("%w: projectConfigId is required", ErrInvalidStateMachineInput)
	}
	if request.machineGroupID == "" {
		return startRunRequest{}, fmt.Errorf("%w: machineGroupId is required", ErrInvalidStateMachineInput)
	}
	return request, nil
}

func (r *Runtime) createStartRun(request startRunRequest) (agentruns.Run, graph, *projectstate.Runtime, error) {
	resolvedGraph, projectRuntime, err := r.resolveGraph(
		request.projectConfigID,
		request.machineGroupID,
		request.startSectionID,
		request.shareSessionID,
	)
	if err != nil {
		return agentruns.Run{}, graph{}, nil, err
	}
	graphPayload, err := resolvedGraph.jsonValue()
	if err != nil {
		return agentruns.Run{}, graph{}, nil, err
	}

	inputs := map[string]any{
		"runType":               RunTypeStateMachine,
		inputKeyProjectConfigID: request.projectConfigID,
		inputKeyMachineGroupID:  request.machineGroupID,
		inputKeyStartSectionID:  resolvedGraph.StartSectionID,
		inputKeyMachineName:     resolvedGraph.MachineName,
		graphSnapshotInputKey:   graphPayload,
	}
	if request.shareSessionID != nil {
		inputs[inputKeyShareSessionID] = *request.shareSessionID
	}
	run := agentruns.NewRun(nil, inputs, r.timeNow())
	r.ensureRunOutputsInitialized(&run, resolvedGraph)
	if err := r.runs.Save(run); err != nil {
		return agentruns.Run{}, graph{}, nil, err
	}
	return run, resolvedGraph, projectRuntime, nil
}

func (r *Runtime) persistInitializedStartRun(run *agentruns.Run, graph graph, request startRunRequest) error {
	r.appendEvent(run, "run_started", map[string]any{
		inputKeyProjectConfigID: request.projectConfigID,
		inputKeyMachineGroupID:  request.machineGroupID,
		inputKeyStartSectionID:  graph.StartSectionID,
		inputKeyMachineName:     graph.MachineName,
	})
	r.appendEvent(run, "graph_resolved", map[string]any{
		"machineEdgeIds":             edgeIDs(graph.Edges),
		outputKeyGateIncomingEdgeIDs: cloneAnyMapMap(r.buildGateIncomingEdgeIDsBySectionID(graph)),
	})
	startEdges := r.outgoingEdges(graph, graph.StartSectionID)
	r.appendEvent(run, "start_edges_activated", map[string]any{
		"edgeIds":          edgeIDs(startEdges),
		"targetSectionIds": targetSectionIDs(startEdges),
	})
	return r.runs.Save(*run)
}

func (r *Runtime) activateStartRun(
	projectRuntime *projectstate.Runtime,
	run *agentruns.Run,
	graph graph,
	request startRunRequest,
) error {
	actionResults, activationErr := r.activateOutgoingEdges(
		projectRuntime,
		run,
		graph,
		graph.StartSectionID,
		request.projectConfigID,
		request.shareSessionID,
	)
	if activationErr != nil {
		r.failRun(run, "start_edge_action_failed", fmt.Sprintf("Workflow failed while dispatching the first action: %v", activationErr), map[string]any{
			"error": activationErr.Error(),
		})
		if err := r.runs.Save(*run); err != nil {
			return err
		}
		return activationErr
	}
	run.Outputs[outputKeyDispatchedStartActions] = actionResults
	r.incrementSourceActivationCount(run, graph.StartSectionID)
	r.refreshOutputs(run, graph)
	if len(actionResults) > 0 {
		r.appendActionEvents(run, graph, actionResults)
		r.appendEvent(run, "start_edge_actions_dispatched", map[string]any{
			"actions": actionResults,
		})
	}
	return r.runs.Save(*run)
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

func buildGraphSectionInventory(project projectstate.Project, machineGroupID string) graphSectionInventory {
	inventory := graphSectionInventory{
		sections:        map[string]graphSection{},
		startSectionIDs: []string{},
	}
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
			inventory.sections[sectionID] = section
			if section.Kind == graphSectionKindStart {
				inventory.startSectionIDs = append(inventory.startSectionIDs, sectionID)
			}
			if section.Kind == graphSectionKindEnd {
				inventory.endSectionCount++
			}
		}
	}
	return inventory
}

func resolveGraphStartSectionID(
	machineGroupID string,
	startSectionID *string,
	inventory graphSectionInventory,
) (string, error) {
	if len(inventory.startSectionIDs) == 0 {
		return "", fmt.Errorf(
			"%w: state machine group %s does not have a Start section",
			ErrInvalidStateMachineInput,
			machineGroupID,
		)
	}
	if inventory.endSectionCount == 0 {
		return "", fmt.Errorf(
			"%w: state machine group %s must resolve to at least one End section",
			ErrInvalidStateMachineInput,
			machineGroupID,
		)
	}
	if len(inventory.startSectionIDs) != 1 {
		return "", fmt.Errorf(
			"%w: state machine group %s must resolve to exactly one Start section",
			ErrInvalidStateMachineInput,
			machineGroupID,
		)
	}
	resolvedStartSectionID := inventory.startSectionIDs[0]
	requestedStartSectionID := strings.TrimSpace(derefOptionalString(startSectionID))
	if requestedStartSectionID != "" && requestedStartSectionID != resolvedStartSectionID {
		return "", fmt.Errorf(
			"%w: state machine start %s not found in group %s",
			projectstate.ErrSectionNotFound,
			requestedStartSectionID,
			machineGroupID,
		)
	}
	return resolvedStartSectionID, nil
}

func buildGraphEdges(
	project projectstate.Project,
	machineGroupID string,
	sections map[string]graphSection,
) ([]projectstate.StateMachineEdge, error) {
	edges := make([]projectstate.StateMachineEdge, 0)
	for _, edge := range project.StateMachineEdges {
		if edge.MachineGroupID != machineGroupID {
			continue
		}
		edges = append(edges, edge.Clone())
		if err := ensureGraphSection(project, sections, edge.SourceSectionID); err != nil {
			return nil, err
		}
		if err := ensureGraphSection(project, sections, edge.TargetSectionID); err != nil {
			return nil, err
		}
	}
	return edges, nil
}

func ensureGraphSection(
	project projectstate.Project,
	sections map[string]graphSection,
	sectionID string,
) error {
	if _, ok := sections[sectionID]; ok {
		return nil
	}
	section, err := buildGraphSection(project, sectionID)
	if err != nil {
		return err
	}
	sections[sectionID] = section
	return nil
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
	appendFiredGateSectionID(run, gateSectionID)
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
		var stoppedRunID any
		var clearedChatID any
		if currentChatID != nil {
			clearedChatID = *currentChatID
		}
		if currentChatID != nil && targetAction.StopIfRunning {
			if stoppedRun := r.stopChatIfRunning(*currentChatID, projectConfigID); stoppedRun != nil {
				stoppedRunID = stoppedRun.ID
			}
		}
		if _, err := projectRuntime.SetChatSectionChatID(r.baseContext, projectConfigID, edge.TargetSectionID, nil); err != nil {
			return nil, err
		}
		clearOwnedChatBinding(run, edge.TargetSectionID)
		return map[string]any{
			"edgeId":          edge.ID,
			"actionType":      string(targetAction.Type),
			"targetSectionId": edge.TargetSectionID,
			"clearedChatId":   clearedChatID,
			"stoppedRunId":    stoppedRunID,
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
	prepared, err := r.prepareChatEdgeDispatch(
		projectRuntime,
		run,
		graph,
		edge,
		targetSection,
		projectConfigID,
		shareSessionID,
		currentChatID,
		*targetAction,
	)
	if err != nil {
		return chatEdgeDispatchResult{}, err
	}

	switch prepared.engineConfig.EngineType {
	case agentruns.EngineTypeSettaLLM:
		result, err := r.startManagedChatEdge(projectConfigID, edge.TargetSectionID, prepared)
		if err != nil {
			return chatEdgeDispatchResult{}, err
		}
		return newChatEdgeDispatchResult(edge, *targetAction, prepared, currentChatID, result.ChatID, result.Run.ID), nil
	case agentruns.EngineTypeExternalAgent:
		result, err := r.startExternalChatEdge(projectConfigID, edge.TargetSectionID, prepared)
		if err != nil {
			return chatEdgeDispatchResult{}, err
		}
		return newChatEdgeDispatchResult(edge, *targetAction, prepared, currentChatID, result.ChatID, result.Run.ID), nil
	default:
		return chatEdgeDispatchResult{}, fmt.Errorf("workflow edge %s uses unsupported engine type %s", edge.ID, prepared.engineConfig.EngineType)
	}
}

func (r *Runtime) prepareChatEdgeDispatch(
	projectRuntime *projectstate.Runtime,
	run *agentruns.Run,
	graph graph,
	edge projectstate.StateMachineEdge,
	targetSection graphSection,
	projectConfigID string,
	shareSessionID *string,
	currentChatID *string,
	targetAction projectstate.StateMachineTargetAction,
) (preparedChatEdgeDispatch, error) {
	promptText, err := r.resolvePromptText(projectRuntime, projectConfigID, edge, targetAction)
	if err != nil {
		return preparedChatEdgeDispatch{}, err
	}
	engineConfigID, err := r.resolveEngineConfigID(edge.ID, targetSection, targetAction)
	if err != nil {
		return preparedChatEdgeDispatch{}, err
	}
	engineConfig, err := r.engines.Get(engineConfigID)
	if err != nil {
		return preparedChatEdgeDispatch{}, err
	}
	if err := r.ensureSignalDispatchProfileAllowed(graph, targetSection, targetAction); err != nil {
		return preparedChatEdgeDispatch{}, err
	}

	sourceActivationCount := r.sourceActivationCount(*run, edge.SourceSectionID)
	prepared := preparedChatEdgeDispatch{
		engineConfig:          engineConfig,
		message:               userTextMessage(promptText),
		agentProfileID:        chooseOptionalString(targetAction.AgentProfileID, targetSection.AgentProfileID),
		permissionMode:        projectstate.ChatPermissionMode(resolvePermissionMode(targetSection, targetAction)),
		searchEnabled:         resolveSearchEnabled(targetSection, targetAction),
		childInputs:           buildStateMachineChildInputs(*run, edge, sourceActivationCount, shareSessionID),
		sourceActivationCount: sourceActivationCount,
	}
	if targetAction.ThreadStrategy == projectstate.StateMachineThreadStrategyContinueCurrentThread && currentChatID != nil {
		prepared.nextChatID = cloneStringPointer(currentChatID)
	}
	return prepared, nil
}

func buildStateMachineChildInputs(
	run agentruns.Run,
	edge projectstate.StateMachineEdge,
	sourceActivationCount int,
	shareSessionID *string,
) map[string]any {
	childInputs := map[string]any{
		inputKeyStateMachineRunID:         run.ID,
		inputKeyMachineGroupID:            runInputString(run, inputKeyMachineGroupID),
		inputKeyStateMachineSourceEdgeID:  edge.ID,
		inputKeyStateMachineTargetSection: edge.TargetSectionID,
		inputKeyStateMachineSourceCount:   sourceActivationCount,
		inputKeyStateMachineParentRunType: RunTypeStateMachine,
	}
	if shareSessionID != nil {
		childInputs[inputKeyShareSessionID] = *shareSessionID
	}
	return childInputs
}

func (r *Runtime) startManagedChatEdge(
	projectConfigID string,
	targetSectionID string,
	prepared preparedChatEdgeDispatch,
) (managedchat.StartChatResult, error) {
	if r.managedChats == nil {
		return managedchat.StartChatResult{}, ErrRuntimeUnavailable
	}
	return r.managedChats.StartChat(managedchat.StartChatRequest{
		ChatID:           prepared.nextChatID,
		Message:          prepared.message,
		EngineConfigID:   prepared.engineConfig.ID,
		AgentProfileID:   prepared.agentProfileID,
		Thinking:         false,
		ProjectConfigID:  projectConfigID,
		SectionID:        stringPointer(targetSectionID),
		PermissionMode:   managedchat.ChatPermissionMode(prepared.permissionMode),
		SearchEnabled:    prepared.searchEnabled,
		AdditionalInputs: prepared.childInputs,
	})
}

func (r *Runtime) startExternalChatEdge(
	projectConfigID string,
	targetSectionID string,
	prepared preparedChatEdgeDispatch,
) (externalagents.StartChatResult, error) {
	if r.externalChats == nil {
		return externalagents.StartChatResult{}, ErrRuntimeUnavailable
	}
	return r.externalChats.StartChat(r.baseContext, externalagents.StartChatRequest{
		ChatID:           prepared.nextChatID,
		Message:          prepared.message,
		EngineConfigID:   prepared.engineConfig.ID,
		AgentProfileID:   prepared.agentProfileID,
		Thinking:         false,
		ProjectConfigID:  projectConfigID,
		SectionID:        stringPointer(targetSectionID),
		PermissionMode:   externalagents.ChatPermissionMode(prepared.permissionMode),
		SearchEnabled:    prepared.searchEnabled,
		AdditionalInputs: prepared.childInputs,
	})
}

func newChatEdgeDispatchResult(
	edge projectstate.StateMachineEdge,
	targetAction projectstate.StateMachineTargetAction,
	prepared preparedChatEdgeDispatch,
	currentChatID *string,
	chatID string,
	childRunID string,
) chatEdgeDispatchResult {
	return chatEdgeDispatchResult{
		action: map[string]any{
			"edgeId":                edge.ID,
			"actionType":            string(targetAction.Type),
			"targetSectionId":       edge.TargetSectionID,
			"chatId":                chatID,
			"runId":                 childRunID,
			"threadStrategy":        string(targetAction.ThreadStrategy),
			"engineType":            string(prepared.engineConfig.EngineType),
			"sourceActivationCount": prepared.sourceActivationCount,
		},
		targetSection:  edge.TargetSectionID,
		previousChatID: cloneStringPointer(currentChatID),
		chatID:         chatID,
		childRunID:     childRunID,
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
	inlinePrompt := derefOptionalString(targetAction.InlinePrompt)
	if strings.TrimSpace(inlinePrompt) != "" {
		return inlinePrompt, nil
	}
	promptSectionID := strings.TrimSpace(derefOptionalString(targetAction.PromptSectionID))
	if promptSectionID != "" {
		return r.resolvePromptSectionText(projectRuntime, projectConfigID, edge.ID, promptSectionID, targetAction.PromptInputs)
	}
	return r.resolvePromptTemplateText(edge.ID, targetAction.PromptTemplateID, targetAction.PromptInputs)
}

func (r *Runtime) resolvePromptSectionText(
	projectRuntime *projectstate.Runtime,
	projectConfigID string,
	edgeID string,
	promptSectionID string,
	promptInputs map[string]string,
) (string, error) {
	projectSnapshot := projectRuntime.Snapshot()
	project, err := projectSnapshot.Document.ProjectByID(projectConfigID)
	if err != nil {
		return "", err
	}
	section, variant, _, err := project.ResolveSection(promptSectionID)
	if err != nil {
		return "", err
	}
	payload, err := project.EffectiveSectionPayload(section.ID, variant.ID)
	if err != nil {
		return "", err
	}
	format := prompttemplates.Format(strings.TrimSpace(payloadString(payload, "format")))
	if format == "" {
		format = prompttemplates.FormatJinja
	}
	if format != prompttemplates.FormatJinja {
		return "", fmt.Errorf("state machine edge %s prompt section %s format %s is unsupported", edgeID, section.ID, format)
	}
	return renderJinjaPromptSource(
		fmt.Sprintf("state machine edge %s prompt section %s", edgeID, section.ID),
		payloadString(payload, "template"),
		promptInputs,
	)
}

func (r *Runtime) resolvePromptTemplateText(
	edgeID string,
	promptTemplateID *string,
	promptInputs map[string]string,
) (string, error) {
	normalizedPromptTemplateID := strings.TrimSpace(derefOptionalString(promptTemplateID))
	if normalizedPromptTemplateID == "" {
		return "", fmt.Errorf("state machine edge %s send_prompt action is missing prompt content", edgeID)
	}
	if r.templates == nil {
		return "", ErrPromptTemplateStoreRequired
	}
	template, err := r.templates.Get(normalizedPromptTemplateID)
	if err != nil {
		return "", err
	}
	return renderJinjaPromptSource(
		fmt.Sprintf("state machine edge %s prompt template %s", edgeID, template.ID),
		template.Template,
		promptInputs,
	)
}

func renderJinjaPromptSource(
	renderContext string,
	template string,
	promptInputs map[string]string,
) (string, error) {
	result := promptrender.RenderJinja(template, cloneStringMap(promptInputs))
	if result.RenderError != nil {
		return "", fmt.Errorf("%s failed to render: %s", renderContext, *result.RenderError)
	}
	if strings.TrimSpace(result.RenderedText) == "" {
		return "", fmt.Errorf("%s rendered an empty prompt", renderContext)
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

func (r *Runtime) stopRunningChildRuns(parentRun agentruns.Run) ([]string, error) {
	activeChildRunIDs := outputStringList(parentRun, outputKeyActiveChildRunIDs)
	stoppedRunIDs := make([]string, 0, len(activeChildRunIDs))
	for _, childRunID := range activeChildRunIDs {
		stoppedRunID, err := r.stopActiveChildRun(childRunID)
		if err != nil {
			return nil, err
		}
		stoppedRunIDs = append(stoppedRunIDs, stoppedRunID)
	}
	return stoppedRunIDs, nil
}

func (r *Runtime) stopActiveChildRun(childRunID string) (string, error) {
	childRun, err := r.runs.Load(childRunID)
	if err != nil {
		if errors.Is(err, agentruns.ErrRunNotFound) {
			return childRunID, nil
		}
		return "", err
	}
	if _, err := r.stopRunWithConfiguredStopper(childRun, true); err != nil {
		return "", err
	}
	return childRun.ID, nil
}

func (r *Runtime) stopChatIfRunning(chatID string, projectConfigID string) *agentruns.Run {
	latest, err := r.latestRunningChatRun(chatID, projectConfigID)
	if err != nil || latest == nil {
		return nil
	}
	stopped, err := r.stopRunWithConfiguredStopper(*latest, false)
	if err != nil {
		return nil
	}
	return stopped
}

func (r *Runtime) latestRunningChatRun(chatID string, projectConfigID string) (*agentruns.Run, error) {
	runs, err := r.runs.ListByMetadata(agentruns.RunFilter{
		ChatID:          stringPointer(chatID),
		ProjectConfigID: stringPointer(projectConfigID),
	})
	if err != nil {
		return nil, err
	}
	latestIndex := -1
	for index := range runs {
		if runs[index].Status != agentruns.RunStatusRunning {
			continue
		}
		if latestIndex == -1 || runSortsAfter(runs[index], runs[latestIndex]) {
			latestIndex = index
		}
	}
	if latestIndex == -1 {
		return nil, nil
	}
	latest := runs[latestIndex]
	return &latest, nil
}

func (r *Runtime) stopRunWithConfiguredStopper(run agentruns.Run, ignoreMissing bool) (*agentruns.Run, error) {
	if run.Status != agentruns.RunStatusRunning {
		return nil, nil
	}
	stopper := r.runStopper(run)
	if stopper == nil {
		return nil, nil
	}
	stopped, err := stopper.StopRun(run.ID)
	if err != nil {
		if ignoreMissing && errors.Is(err, agentruns.ErrRunNotFound) {
			return nil, nil
		}
		return nil, err
	}
	return &stopped, nil
}

func (r *Runtime) runStopper(run agentruns.Run) RunStopper {
	switch runInputString(run, "runType") {
	case externalagents.RunTypeExternalAgent:
		return r.externalRuns
	default:
		return r.managedRuns
	}
}

func runSortsAfter(left agentruns.Run, right agentruns.Run) bool {
	leftUpdated := runLastUpdated(left)
	rightUpdated := runLastUpdated(right)
	if !leftUpdated.Equal(rightUpdated) {
		return leftUpdated.After(rightUpdated)
	}
	return strings.Compare(left.ID, right.ID) > 0
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
		outputKeyStartOutgoingTargetIDs:    targetSectionIDs(r.outgoingEdges(graph, graph.StartSectionID)),
		outputKeyProcessedChildTerminalIDs: []any{},
		outputKeyDispatchedStartActions:    []any{},
		outputKeyDispatchedEdgeActions:     []any{},
		outputKeyOwnedChatBindings:         map[string]any{},
		outputKeyGateIncomingEdgeIDs:       r.buildGateIncomingEdgeIDsBySectionID(graph),
		outputKeyGateInputEdgeIDs:          map[string]any{},
		outputKeyGateStatuses:              map[string]any{},
		outputKeyFiredGateSectionIDs:       []any{},
		outputKeyBlockedGateSectionIDs:     []any{},
		outputKeyBlockedGateDetailsByID:    map[string]any{},
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
	r.refreshOutputsWithProgress(run, graph, r.computeProgressState(*run, graph))
}

func (r *Runtime) refreshOutputsWithProgress(run *agentruns.Run, graph graph, progress progressState) {
	gateInputEdgeIDs := map[string]any{}
	blockedGateSectionIDs := cloneStringSet(progress.blockedGateSectionIDs)
	blockedGateDetailsBySectionID := cloneAnyMapMapValues(progress.blockedGateDetailsBySectionID)
	if run.Status != agentruns.RunStatusRunning {
		for _, sectionID := range runBlockedGateSectionIDs(*run) {
			blockedGateSectionIDs[sectionID] = struct{}{}
		}
		for sectionID, detail := range runBlockedGateDetailsBySectionID(*run) {
			if _, ok := blockedGateDetailsBySectionID[sectionID]; ok {
				continue
			}
			blockedGateDetailsBySectionID[sectionID] = cloneAnyMap(detail)
		}
	}
	firedGateSectionIDs := outputStringList(*run, outputKeyFiredGateSectionIDs)
	for _, sectionID := range gateSectionIDs(graph) {
		inputIDs := r.currentGateInputEdgeIDs(*run, graph, sectionID)
		if run.Status == agentruns.RunStatusCompleted && containsString(firedGateSectionIDs, sectionID) {
			inputIDs = r.latestSatisfiedGateInputEdgeIDs(*run, graph, sectionID)
		}
		values := make([]any, 0, len(inputIDs))
		for _, inputID := range inputIDs {
			values = append(values, inputID)
		}
		gateInputEdgeIDs[sectionID] = values
		switch {
		case stringSetContains(blockedGateSectionIDs, sectionID):
			setGateStatus(run, sectionID, "blocked")
		case containsString(firedGateSectionIDs, sectionID):
			setGateStatus(run, sectionID, "satisfied")
		default:
			setGateStatus(run, sectionID, "waiting")
		}
	}
	run.Outputs[outputKeyGateInputEdgeIDs] = gateInputEdgeIDs
	run.Outputs[outputKeyBlockedGateSectionIDs] = stringSliceToAny(orderedSetIntersection(gateSectionIDs(graph), blockedGateSectionIDs))
	run.Outputs[outputKeyBlockedGateDetailsByID] = mapOfMapsToAny(blockedGateDetailsBySectionID)
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

func (r *Runtime) latestSatisfiedGateInputEdgeIDs(run agentruns.Run, graph graph, gateSectionID string) []string {
	gateActivationCount := r.sourceActivationCount(run, gateSectionID)
	if gateActivationCount <= 0 {
		return []string{}
	}
	incomingEdges := r.incomingEdges(graph, gateSectionID)
	activated := make([]string, 0, len(incomingEdges))
	for _, edge := range incomingEdges {
		if r.edgeActivationCount(run, edge.ID) >= gateActivationCount {
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
	run.Outputs[outputKeyFiredGateSectionIDs] = []any{}
	run.Outputs[outputKeyBlockedGateSectionIDs] = []any{}
	run.Outputs[outputKeyBlockedGateDetailsByID] = map[string]any{}
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

func (r *Runtime) appendChildRunTerminalEvent(
	run *agentruns.Run,
	childRun agentruns.Run,
	sourceSectionID string,
	sourceActivationCount int,
) {
	status := strings.TrimSpace(string(childRun.Status))
	if status == "" {
		return
	}
	r.appendEvent(run, "child_run_"+status, map[string]any{
		"childRunId":            childRun.ID,
		"sourceSectionId":       sourceSectionID,
		"sourceActivationCount": sourceActivationCount,
	})
}

func (r *Runtime) appendActionEvents(run *agentruns.Run, graph graph, actions []map[string]any) {
	for _, action := range actions {
		r.appendEvent(run, edgeActionEventType(graph, action), cloneAnyMap(action))
	}
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

func appendFiredGateSectionID(run *agentruns.Run, gateSectionID string) {
	firedGateSectionIDs := outputStringList(*run, outputKeyFiredGateSectionIDs)
	if containsString(firedGateSectionIDs, gateSectionID) {
		return
	}
	run.Outputs[outputKeyFiredGateSectionIDs] = append(stringSliceToAny(firedGateSectionIDs), gateSectionID)
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

func hasUnprocessedSignalEvents(run agentruns.Run) bool {
	processed := outputStringList(run, outputKeyProcessedSignalEventIDs)
	for _, signalEvent := range outputListOfMaps(run, outputKeySignalEvents) {
		signalEventID := signalEventString(signalEvent, "signalEventId")
		if signalEventID == "" {
			continue
		}
		if !containsString(processed, signalEventID) {
			return true
		}
	}
	return false
}

func shouldFailAsStalled(parentRun agentruns.Run, progress progressState) bool {
	if parentRun.Status != agentruns.RunStatusRunning {
		return false
	}
	if len(outputStringList(parentRun, outputKeyActiveChildRunIDs)) > 0 {
		return false
	}
	if len(progress.possibleGateSectionIDs) > 0 {
		return false
	}
	if len(progress.possibleChatSourceSectionIDs) > 0 {
		return false
	}
	if len(progress.possibleEndSectionIDs) > 0 {
		return false
	}
	return !hasUnprocessedSignalEvents(parentRun)
}

func setGateStatus(run *agentruns.Run, sectionID string, status string) {
	statuses := rawOutputMap(*run, outputKeyGateStatuses)
	statuses[sectionID] = status
	run.Outputs[outputKeyGateStatuses] = statuses
}

func (r *Runtime) blockRun(run *agentruns.Run, graph graph, progress progressState) error {
	blockedGateSectionIDs := orderedSetIntersection(gateSectionIDs(graph), progress.blockedGateSectionIDs)
	for _, gateSectionID := range blockedGateSectionIDs {
		r.appendEvent(run, "gate_blocked", cloneAnyMap(progress.blockedGateDetailsBySectionID[gateSectionID]))
	}
	activeChildRunIDs := outputStringList(*run, outputKeyActiveChildRunIDs)
	if len(activeChildRunIDs) > 0 {
		if _, err := r.stopRunningChildRuns(run.Clone()); err != nil {
			return err
		}
		r.appendEvent(run, "child_runs_cancelled", map[string]any{
			"childRunIds": stringSliceToAny(activeChildRunIDs),
		})
		for _, activeChildRunID := range activeChildRunIDs {
			r.removeActiveChildRunID(run, activeChildRunID)
		}
	}
	finalBlockedGateDetailsBySectionID := cloneAnyMapMapValues(progress.blockedGateDetailsBySectionID)
	if len(activeChildRunIDs) > 0 {
		postCancellationProgress := r.computeProgressState(*run, graph)
		for _, gateSectionID := range blockedGateSectionIDs {
			detail, ok := postCancellationProgress.blockedGateDetailsBySectionID[gateSectionID]
			if !ok {
				continue
			}
			finalBlockedGateDetailsBySectionID[gateSectionID] = cloneAnyMap(detail)
		}
	}
	gateDetailsBySectionID := mapOfMapsToAny(finalBlockedGateDetailsBySectionID)
	blockedGateLabels := make([]string, 0, len(blockedGateSectionIDs))
	for _, gateSectionID := range blockedGateSectionIDs {
		blockedGateLabels = append(blockedGateLabels, sectionDisplayLabel(graph, gateSectionID))
	}
	failureMessage := ""
	switch len(blockedGateLabels) {
	case 0:
		failureMessage = "Workflow blocked."
	case 1:
		failureMessage = fmt.Sprintf("Workflow blocked at gate %s.", blockedGateLabels[0])
	default:
		failureMessage = fmt.Sprintf("Workflow blocked at %d gates: %s.", len(blockedGateLabels), strings.Join(blockedGateLabels, ", "))
	}
	r.appendEvent(run, "run_blocked", map[string]any{
		"gateSectionIds":         stringSliceToAny(blockedGateSectionIDs),
		"gateDetailsBySectionId": gateDetailsBySectionID,
	})
	r.failRun(run, "run_blocked", failureMessage, map[string]any{
		"gateSectionIds":         stringSliceToAny(blockedGateSectionIDs),
		"gateDetailsBySectionId": gateDetailsBySectionID,
	})
	return nil
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

func (r *Runtime) computeProgressState(run agentruns.Run, graph graph) progressState {
	if run.Status == agentruns.RunStatusCompleted {
		return completedProgressState()
	}
	reachability := r.resolveProgressReachability(run, graph)
	blockedGateSectionIDs, blockedGateDetailsBySectionID := r.blockedGatesForProgress(run, graph, reachability)
	return progressState{
		possibleGateSectionIDs:        reachability.possibleGateSectionIDs,
		possibleChatSourceSectionIDs:  reachability.possibleChatSourceSectionIDs,
		possibleEndSectionIDs:         reachability.possibleEndSectionIDs,
		blockedGateSectionIDs:         blockedGateSectionIDs,
		blockedGateDetailsBySectionID: blockedGateDetailsBySectionID,
	}
}

func completedProgressState() progressState {
	return progressState{
		possibleGateSectionIDs:        map[string]struct{}{},
		possibleChatSourceSectionIDs:  map[string]struct{}{},
		possibleEndSectionIDs:         map[string]struct{}{},
		blockedGateSectionIDs:         map[string]struct{}{},
		blockedGateDetailsBySectionID: map[string]map[string]any{},
	}
}

func (r *Runtime) resolveProgressReachability(run agentruns.Run, graph graph) progressReachability {
	reachability := progressReachability{
		possibleGateSectionIDs:       map[string]struct{}{},
		possibleChatSourceSectionIDs: r.initialPossibleChatSourceSectionIDs(run),
		possibleEndSectionIDs:        map[string]struct{}{},
	}
	for {
		nextPossibleGateSectionIDs := r.nextPossibleGateSectionIDs(
			graph,
			run,
			reachability.possibleGateSectionIDs,
			reachability.possibleChatSourceSectionIDs,
		)
		nextPossibleChatSourceSectionIDs, nextPossibleEndSectionIDs := r.extendReachableTargetSections(
			graph,
			run,
			nextPossibleGateSectionIDs,
			reachability.possibleChatSourceSectionIDs,
			reachability.possibleEndSectionIDs,
		)
		if progressReachabilityStable(
			reachability,
			nextPossibleGateSectionIDs,
			nextPossibleChatSourceSectionIDs,
			nextPossibleEndSectionIDs,
		) {
			return progressReachability{
				possibleGateSectionIDs:       nextPossibleGateSectionIDs,
				possibleChatSourceSectionIDs: nextPossibleChatSourceSectionIDs,
				possibleEndSectionIDs:        nextPossibleEndSectionIDs,
			}
		}
		reachability = progressReachability{
			possibleGateSectionIDs:       nextPossibleGateSectionIDs,
			possibleChatSourceSectionIDs: nextPossibleChatSourceSectionIDs,
			possibleEndSectionIDs:        nextPossibleEndSectionIDs,
		}
	}
}

func (r *Runtime) nextPossibleGateSectionIDs(
	graph graph,
	run agentruns.Run,
	possibleGateSectionIDs map[string]struct{},
	possibleChatSourceSectionIDs map[string]struct{},
) map[string]struct{} {
	nextPossibleGateSectionIDs := map[string]struct{}{}
	for _, gateSectionID := range gateSectionIDs(graph) {
		if r.gateCanSatisfyLater(gateSectionID, graph, run, possibleGateSectionIDs, possibleChatSourceSectionIDs) {
			nextPossibleGateSectionIDs[gateSectionID] = struct{}{}
		}
	}
	return nextPossibleGateSectionIDs
}

func (r *Runtime) extendReachableTargetSections(
	graph graph,
	run agentruns.Run,
	nextPossibleGateSectionIDs map[string]struct{},
	possibleChatSourceSectionIDs map[string]struct{},
	possibleEndSectionIDs map[string]struct{},
) (map[string]struct{}, map[string]struct{}) {
	nextPossibleChatSourceSectionIDs := cloneStringSet(possibleChatSourceSectionIDs)
	nextPossibleEndSectionIDs := cloneStringSet(possibleEndSectionIDs)
	for _, edge := range graph.Edges {
		if !r.edgeSourceCanActivateLater(edge, graph, run, nextPossibleGateSectionIDs, possibleChatSourceSectionIDs) {
			continue
		}
		targetSection, ok := graph.Sections[edge.TargetSectionID]
		if !ok {
			continue
		}
		switch targetSection.Kind {
		case graphSectionKindChat:
			nextPossibleChatSourceSectionIDs[edge.TargetSectionID] = struct{}{}
		case graphSectionKindEnd:
			nextPossibleEndSectionIDs[edge.TargetSectionID] = struct{}{}
		}
	}
	return nextPossibleChatSourceSectionIDs, nextPossibleEndSectionIDs
}

func progressReachabilityStable(
	reachability progressReachability,
	nextPossibleGateSectionIDs map[string]struct{},
	nextPossibleChatSourceSectionIDs map[string]struct{},
	nextPossibleEndSectionIDs map[string]struct{},
) bool {
	return stringSetEquals(nextPossibleGateSectionIDs, reachability.possibleGateSectionIDs) &&
		stringSetEquals(nextPossibleChatSourceSectionIDs, reachability.possibleChatSourceSectionIDs) &&
		stringSetEquals(nextPossibleEndSectionIDs, reachability.possibleEndSectionIDs)
}

func (r *Runtime) blockedGatesForProgress(
	run agentruns.Run,
	graph graph,
	reachability progressReachability,
) (map[string]struct{}, map[string]map[string]any) {
	blockedGateSectionIDs := map[string]struct{}{}
	blockedGateDetailsBySectionID := map[string]map[string]any{}
	for _, gateSectionID := range gateSectionIDs(graph) {
		if !r.gateIsRelevant(gateSectionID, graph, run, reachability.possibleGateSectionIDs, reachability.possibleChatSourceSectionIDs) {
			continue
		}
		if stringSetContains(reachability.possibleGateSectionIDs, gateSectionID) {
			continue
		}
		blockedGateSectionIDs[gateSectionID] = struct{}{}
		blockedGateDetailsBySectionID[gateSectionID] = r.buildBlockedGateDetail(
			gateSectionID,
			graph,
			run,
			reachability.possibleGateSectionIDs,
			reachability.possibleChatSourceSectionIDs,
		)
	}
	return blockedGateSectionIDs, blockedGateDetailsBySectionID
}

func (r *Runtime) initialPossibleChatSourceSectionIDs(run agentruns.Run) map[string]struct{} {
	possible := map[string]struct{}{}
	for _, childRunID := range outputStringList(run, outputKeyActiveChildRunIDs) {
		childRun, err := r.runs.Load(childRunID)
		if err != nil {
			continue
		}
		if childRun.Status != agentruns.RunStatusRunning {
			continue
		}
		sourceSectionID := runInputString(childRun, inputKeyStateMachineTargetSection)
		if sourceSectionID == "" {
			continue
		}
		possible[sourceSectionID] = struct{}{}
	}
	return possible
}

func (r *Runtime) gateCanSatisfyLater(
	gateSectionID string,
	graph graph,
	run agentruns.Run,
	possibleGateSectionIDs map[string]struct{},
	possibleChatSourceSectionIDs map[string]struct{},
) bool {
	gateSection, ok := graph.Sections[gateSectionID]
	if !ok || gateSection.GateType == nil {
		return false
	}
	incomingEdges := r.incomingEdges(graph, gateSectionID)
	possibleEdgeCount := 0
	gateActivationCount := r.sourceActivationCount(run, gateSectionID)
	for _, edge := range incomingEdges {
		if r.edgeActivationCount(run, edge.ID) > gateActivationCount {
			possibleEdgeCount++
			continue
		}
		if r.edgeSourceCanActivateLater(edge, graph, run, possibleGateSectionIDs, possibleChatSourceSectionIDs) {
			possibleEdgeCount++
			continue
		}
		if *gateSection.GateType == projectstate.StateMachineGateTypeAND {
			return false
		}
	}
	return possibleEdgeCount > 0
}

func (r *Runtime) gateIsRelevant(
	gateSectionID string,
	graph graph,
	run agentruns.Run,
	possibleGateSectionIDs map[string]struct{},
	possibleChatSourceSectionIDs map[string]struct{},
) bool {
	gateActivationCount := r.sourceActivationCount(run, gateSectionID)
	for _, edge := range r.incomingEdges(graph, gateSectionID) {
		if r.edgeActivationCount(run, edge.ID) > gateActivationCount {
			return true
		}
		sourceActivationCount := r.sourceActivationCount(run, edge.SourceSectionID)
		if sourceActivationCount > gateActivationCount && matchesSourceActivationCountCondition(edge, sourceActivationCount-1) {
			return true
		}
		if r.edgeSourceCanActivateLater(edge, graph, run, possibleGateSectionIDs, possibleChatSourceSectionIDs) {
			return true
		}
	}
	return false
}

func (r *Runtime) edgeSourceCanActivateLater(
	edge projectstate.StateMachineEdge,
	graph graph,
	run agentruns.Run,
	possibleGateSectionIDs map[string]struct{},
	possibleChatSourceSectionIDs map[string]struct{},
) bool {
	sourceSection, ok := graph.Sections[edge.SourceSectionID]
	if !ok {
		return false
	}
	if sourceSection.Kind == graphSectionKindStart {
		return false
	}
	sourceActivationCount := r.sourceActivationCount(run, edge.SourceSectionID)
	if !matchesSourceActivationCountCondition(edge, sourceActivationCount) {
		return false
	}
	switch sourceSection.Kind {
	case graphSectionKindGate:
		return stringSetContains(possibleGateSectionIDs, edge.SourceSectionID)
	case graphSectionKindChat:
		return stringSetContains(possibleChatSourceSectionIDs, edge.SourceSectionID)
	default:
		return false
	}
}

func (r *Runtime) buildBlockedGateDetail(
	gateSectionID string,
	graph graph,
	run agentruns.Run,
	possibleGateSectionIDs map[string]struct{},
	possibleChatSourceSectionIDs map[string]struct{},
) map[string]any {
	gateSection, ok := graph.Sections[gateSectionID]
	if !ok || gateSection.GateType == nil {
		return map[string]any{}
	}
	incomingEdges := r.incomingEdges(graph, gateSectionID)
	activatedEdgeIDs := r.currentGateInputEdgeIDs(run, graph, gateSectionID)
	requiredEdgeIDs := make([]string, 0, len(incomingEdges))
	impossibleEdgeIDs := make([]string, 0, len(incomingEdges))
	for _, edge := range incomingEdges {
		if containsString(activatedEdgeIDs, edge.ID) {
			continue
		}
		requiredEdgeIDs = append(requiredEdgeIDs, edge.ID)
		if !r.edgeSourceCanActivateLater(edge, graph, run, possibleGateSectionIDs, possibleChatSourceSectionIDs) {
			impossibleEdgeIDs = append(impossibleEdgeIDs, edge.ID)
		}
	}
	return map[string]any{
		"gateSectionId":     gateSectionID,
		"gateType":          string(*gateSection.GateType),
		"activatedEdgeIds":  stringSliceToAny(activatedEdgeIDs),
		"requiredEdgeIds":   stringSliceToAny(requiredEdgeIDs),
		"impossibleEdgeIds": stringSliceToAny(impossibleEdgeIDs),
	}
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

func gateSectionIDs(graph graph) []string {
	result := make([]string, 0)
	for sectionID, section := range graph.Sections {
		if section.Kind != graphSectionKindGate {
			continue
		}
		result = append(result, sectionID)
	}
	slices.Sort(result)
	return result
}

func sectionDisplayLabel(graph graph, sectionID string) string {
	section, ok := graph.Sections[sectionID]
	if !ok {
		return sectionID
	}
	if strings.TrimSpace(section.Label) != "" {
		return strings.TrimSpace(section.Label)
	}
	return sectionID
}

func edgeActionEventType(graph graph, action map[string]any) string {
	actionType := payloadString(action, "actionType")
	edgeID := payloadString(action, "edgeId")
	if edgeID != "" {
		for _, edge := range graph.Edges {
			if edge.ID != edgeID {
				continue
			}
			sourceSection, ok := graph.Sections[edge.SourceSectionID]
			if ok && sourceSection.Kind == graphSectionKindStart {
				if actionType == string(projectstate.StateMachineTargetActionTypeResetThread) {
					return "start_edge_action_reset"
				}
				return "start_edge_action_dispatched"
			}
			break
		}
	}
	if actionType == string(projectstate.StateMachineTargetActionTypeResetThread) {
		return "edge_action_reset"
	}
	return "edge_action_dispatched"
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

func mapOfMapsToAny(input map[string]map[string]any) map[string]any {
	result := make(map[string]any, len(input))
	for key, value := range input {
		result[key] = cloneAnyMap(value)
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

func cloneAnyMapMapValues(input map[string]map[string]any) map[string]map[string]any {
	result := make(map[string]map[string]any, len(input))
	for key, value := range input {
		result[key] = cloneAnyMap(value)
	}
	return result
}

func cloneStringSet(input map[string]struct{}) map[string]struct{} {
	result := make(map[string]struct{}, len(input))
	for key := range input {
		result[key] = struct{}{}
	}
	return result
}

func stringSetEquals(left map[string]struct{}, right map[string]struct{}) bool {
	if len(left) != len(right) {
		return false
	}
	for key := range left {
		if _, ok := right[key]; !ok {
			return false
		}
	}
	return true
}

func stringSetContains(values map[string]struct{}, key string) bool {
	_, ok := values[key]
	return ok
}

func orderedSetIntersection(order []string, values map[string]struct{}) []string {
	result := make([]string, 0, len(values))
	for _, key := range order {
		if !stringSetContains(values, key) {
			continue
		}
		result = append(result, key)
	}
	return result
}

func runBlockedGateSectionIDs(run agentruns.Run) []string {
	failureSummary := outputMap(run, outputKeyFailureSummary)
	reason, _ := failureSummary["reason"].(string)
	if reason != "run_blocked" {
		return []string{}
	}
	details, _ := failureSummary["details"].(map[string]any)
	if details == nil {
		return []string{}
	}
	rawGateSectionIDs, _ := details["gateSectionIds"].([]any)
	if rawGateSectionIDs == nil {
		return []string{}
	}
	gateSectionIDs := make([]string, 0, len(rawGateSectionIDs))
	for _, rawGateSectionID := range rawGateSectionIDs {
		gateSectionID, ok := rawGateSectionID.(string)
		if !ok || strings.TrimSpace(gateSectionID) == "" {
			continue
		}
		gateSectionIDs = append(gateSectionIDs, strings.TrimSpace(gateSectionID))
	}
	return gateSectionIDs
}

func runBlockedGateDetailsBySectionID(run agentruns.Run) map[string]map[string]any {
	failureSummary := outputMap(run, outputKeyFailureSummary)
	reason, _ := failureSummary["reason"].(string)
	if reason != "run_blocked" {
		return map[string]map[string]any{}
	}
	details, _ := failureSummary["details"].(map[string]any)
	if details == nil {
		return map[string]map[string]any{}
	}
	rawGateDetails, _ := details["gateDetailsBySectionId"].(map[string]any)
	if rawGateDetails == nil {
		return map[string]map[string]any{}
	}
	gateDetails := make(map[string]map[string]any, len(rawGateDetails))
	for sectionID, rawDetail := range rawGateDetails {
		detail, ok := rawDetail.(map[string]any)
		if !ok {
			continue
		}
		gateDetails[sectionID] = cloneAnyMap(detail)
	}
	return gateDetails
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
