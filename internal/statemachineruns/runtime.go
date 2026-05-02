package statemachineruns

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"sync"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/externalagents"
	"setta/internal/managedchat"
	"setta/internal/projectstate"
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
