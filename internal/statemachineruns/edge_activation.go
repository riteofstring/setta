package statemachineruns

import (
	"fmt"
	"sync"

	"setta/internal/agentruns"
	"setta/internal/externalagents"
	"setta/internal/managedchat"
	"setta/internal/projectstate"
)

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
