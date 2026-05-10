package statemachineruns

import (
	"setta/internal/agentruns"
	"setta/internal/projectstate"
)

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
