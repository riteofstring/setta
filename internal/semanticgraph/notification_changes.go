package semanticgraph

func (service *Service) publishSemanticGraphChange(draft semanticGraphChangeDraft) (SemanticGraphChangeEvent, bool) {
	if draft.WorkspaceID == "" || len(draft.ChangedAreas) == 0 || service.semanticGraphChanges == nil {
		return SemanticGraphChangeEvent{}, false
	}
	return service.semanticGraphChanges.publish(draft)
}

func (service *Service) publishSemanticGraphChangeForEvents(events []SemanticEvent, draft semanticGraphChangeDraft) (SemanticGraphChangeEvent, bool) {
	if len(events) == 0 {
		return service.publishSemanticGraphChange(draft)
	}
	if draft.WorkspaceID == "" {
		draft.WorkspaceID = events[0].WorkspaceID
	}
	for _, event := range events {
		applySemanticEventChange(&draft, event)
	}
	return service.publishSemanticGraphChange(draft)
}

func (service *Service) publishSemanticGraphChangeForCartographerAudit(workspaceID string, targetEntityIDs []string, runIDs []string, windowIDs []string, patchIDs []string) (SemanticGraphChangeEvent, bool) {
	return service.publishSemanticGraphChange(semanticGraphChangeDraft{
		WorkspaceID:           workspaceID,
		ChangedAreas:          []SemanticGraphChangeArea{SemanticGraphChangeAreaCartographerAudit, SemanticGraphChangeAreaWorkingSet},
		TargetEntityIDs:       targetEntityIDs,
		CartographerRunIDs:    runIDs,
		CartographerWindowIDs: windowIDs,
		CartographerPatchIDs:  patchIDs,
	})
}

func cartographerPatchApplicationChangeDraft(workspaceID string, run CartographerRun, patches []CartographerPatchRecord) semanticGraphChangeDraft {
	draft := semanticGraphChangeDraft{
		WorkspaceID:           workspaceID,
		ChangedAreas:          []SemanticGraphChangeArea{SemanticGraphChangeAreaCartographerAudit, SemanticGraphChangeAreaWorkingSet},
		TargetEntityIDs:       []string{run.TargetEntityID},
		CartographerRunIDs:    []string{run.ID},
		CartographerWindowIDs: []string{run.WindowID},
	}
	for _, patch := range patches {
		draft.CartographerPatchIDs = append(draft.CartographerPatchIDs, patch.ID)
		draft.CartographerWindowIDs = append(draft.CartographerWindowIDs, patch.WindowID)
		draft.TargetEntityIDs = append(draft.TargetEntityIDs, cartographerPatchTargetEntityIDs(patch.Patch)...)
	}
	return draft
}

func applySemanticEventChange(draft *semanticGraphChangeDraft, event SemanticEvent) {
	draft.CreatedSemanticEventIDs = append(draft.CreatedSemanticEventIDs, event.EventID)
	draft.TargetEntityIDs = append(draft.TargetEntityIDs, event.TargetEntityID)
	if draft.OccurredAt == "" || event.ObservedAt > draft.OccurredAt {
		draft.OccurredAt = event.ObservedAt
	}
	switch event.EventType {
	case EventNodeCreated, EventNodeUpdated, EventNodeRenamed, EventNodeDismissed, EventNodePromoted, EventNodeSplit, EventNodeMerged:
		applySemanticNodeEventChange(draft, event)
	case EventEdgeCreated, EventEdgeUpdated, EventEdgeRemoved:
		applySemanticEdgeEventChange(draft, event)
	case EventEvidenceAttached, EventActivityStarted, EventActivityEnded, EventConstraintCheckRecorded:
		applySemanticActivityEventChange(draft, event)
	case EventSteeringCreated, EventSteeringUpdated:
		applySemanticSteeringEventChange(draft, event)
	case EventContextPackCreated:
		applySemanticContextPackEventChange(draft, event)
	}
}

func applySemanticNodeEventChange(draft *semanticGraphChangeDraft, event SemanticEvent) {
	draft.ChangedAreas = append(draft.ChangedAreas, SemanticGraphChangeAreaGraph)
	switch event.EventType {
	case EventNodeCreated:
		payload, ok := notificationPayload[nodeCreatedPayload](event)
		if ok {
			draft.SemanticNodeIDs = append(draft.SemanticNodeIDs, payload.NodeID)
			return
		}
		draft.SemanticNodeIDs = append(draft.SemanticNodeIDs, event.TargetEntityID)
	case EventNodeUpdated, EventNodeRenamed, EventNodeDismissed, EventNodePromoted:
		draft.SemanticNodeIDs = append(draft.SemanticNodeIDs, event.TargetEntityID)
	case EventNodeSplit:
		applySemanticNodeSplitEventChange(draft, event)
	case EventNodeMerged:
		applySemanticNodeMergedEventChange(draft, event)
	}
}

func applySemanticNodeSplitEventChange(draft *semanticGraphChangeDraft, event SemanticEvent) {
	payload, ok := notificationPayload[nodeSplitPayload](event)
	if !ok {
		draft.SemanticNodeIDs = append(draft.SemanticNodeIDs, event.TargetEntityID)
		return
	}
	draft.SemanticNodeIDs = append(draft.SemanticNodeIDs, payload.SourceNodeID)
	for _, node := range payload.Nodes {
		draft.SemanticNodeIDs = append(draft.SemanticNodeIDs, node.NodeID)
		draft.TargetEntityIDs = append(draft.TargetEntityIDs, node.NodeID)
	}
}

func applySemanticNodeMergedEventChange(draft *semanticGraphChangeDraft, event SemanticEvent) {
	payload, ok := notificationPayload[nodeMergedPayload](event)
	if !ok {
		draft.SemanticNodeIDs = append(draft.SemanticNodeIDs, event.TargetEntityID)
		return
	}
	draft.SemanticNodeIDs = append(draft.SemanticNodeIDs, payload.SourceNodeIDs...)
	draft.SemanticNodeIDs = append(draft.SemanticNodeIDs, payload.TargetNode.NodeID)
	draft.TargetEntityIDs = append(draft.TargetEntityIDs, payload.SourceNodeIDs...)
	draft.TargetEntityIDs = append(draft.TargetEntityIDs, payload.TargetNode.NodeID)
}

func applySemanticEdgeEventChange(draft *semanticGraphChangeDraft, event SemanticEvent) {
	draft.ChangedAreas = append(draft.ChangedAreas, SemanticGraphChangeAreaGraph)
	switch event.EventType {
	case EventEdgeCreated:
		payload, ok := notificationPayload[edgeCreatedPayload](event)
		if !ok {
			draft.SemanticEdgeIDs = append(draft.SemanticEdgeIDs, event.TargetEntityID)
			return
		}
		draft.SemanticEdgeIDs = append(draft.SemanticEdgeIDs, payload.EdgeID)
		draft.SemanticNodeIDs = append(draft.SemanticNodeIDs, payload.FromNodeID, payload.ToNodeID)
		draft.TargetEntityIDs = append(draft.TargetEntityIDs, payload.FromNodeID, payload.ToNodeID)
	case EventEdgeUpdated, EventEdgeRemoved:
		draft.SemanticEdgeIDs = append(draft.SemanticEdgeIDs, event.TargetEntityID)
	}
}

func applySemanticActivityEventChange(draft *semanticGraphChangeDraft, event SemanticEvent) {
	draft.ChangedAreas = append(draft.ChangedAreas, SemanticGraphChangeAreaActivity)
	switch event.EventType {
	case EventEvidenceAttached:
		payload, ok := notificationPayload[evidenceAttachedPayload](event)
		if ok {
			draft.SemanticNodeIDs = append(draft.SemanticNodeIDs, payload.TargetEntityID)
			draft.TargetEntityIDs = append(draft.TargetEntityIDs, payload.TargetEntityID)
		}
	case EventActivityStarted, EventActivityEnded, EventConstraintCheckRecorded:
		draft.SemanticNodeIDs = append(draft.SemanticNodeIDs, event.TargetEntityID)
	}
}

func applySemanticSteeringEventChange(draft *semanticGraphChangeDraft, event SemanticEvent) {
	draft.ChangedAreas = append(draft.ChangedAreas, SemanticGraphChangeAreaSteering)
	draft.SemanticNodeIDs = append(draft.SemanticNodeIDs, event.TargetEntityID)
}

func applySemanticContextPackEventChange(draft *semanticGraphChangeDraft, event SemanticEvent) {
	draft.ChangedAreas = append(draft.ChangedAreas, SemanticGraphChangeAreaContextPacks)
	draft.SemanticNodeIDs = append(draft.SemanticNodeIDs, event.TargetEntityID)
}

func notificationPayload[T any](event SemanticEvent) (T, bool) {
	payload, err := decodeStrictPayload[T](event)
	return payload, err == nil
}

func semanticLayoutPositionEntityIDs(positions []SemanticLayoutPositionInput) []string {
	ids := make([]string, 0, len(positions))
	for _, position := range positions {
		ids = append(ids, position.EntityID)
	}
	return ids
}

func cartographerPatchTargetEntityIDs(patch CartographerPatch) []string {
	ids := []string{
		patch.Payload.TargetEntityID,
		patch.Payload.SemanticNodeID,
		patch.Payload.FromNodeID,
		patch.Payload.ToNodeID,
	}
	if patch.Payload.NewNode != nil {
		ids = append(ids, patch.Payload.NewNode.SemanticNodeID)
	}
	for _, node := range patch.Payload.NewNodes {
		ids = append(ids, node.SemanticNodeID)
	}
	if patch.Payload.TargetNode != nil {
		ids = append(ids, patch.Payload.TargetNode.SemanticNodeID)
	}
	return ids
}
