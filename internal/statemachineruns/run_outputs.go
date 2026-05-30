package statemachineruns

import (
	"fmt"
	"slices"
	"strings"
	"time"

	"setta/internal/agentruns"
	"setta/internal/projectstate"
)

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
