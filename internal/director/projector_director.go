package director

import "fmt"

// Director-fact projection.
//
// These are the app-scoped facts a conversation cannot own: which workstream the
// app selected, which decision routed the work, what the work is waiting for,
// what the Director concluded, what was validated, and what was recovered.

type directorHandler func(projector *DirectorGraphProjector, context factContext, fact DirectorFactEvent) error

// directorHandlers is total over the Director fact catalog. Registration is
// handled before dispatch, because it is what creates the workstream the other
// handlers resolve.
var directorHandlers = map[DirectorSourceFact]directorHandler{
	DirectorFactWorkstreamSelected:      projectWorkstreamSelected,
	DirectorFactWorkstreamResourceBound: projectWorkstreamMetadataOnly,
	DirectorFactDecisionCommitted:       projectDecisionCommitted,
	DirectorFactResourceRequestOpened:   projectResourceRequestOpened,
	DirectorFactResourceRequestResolved: projectResourceRequestResolved,
	DirectorFactInterpretationPublished: projectInterpretationPublished,
	DirectorFactValidationRecorded:      projectValidationRecorded,
	DirectorFactRecoveryAttempted:       projectRecoveryAttempted,
}

// registerWorkstream admits a workstream to the projection. Identity is
// app-scoped: the conversation it names is where the work executes, not what the
// workstream is.
func (projector *DirectorGraphProjector) registerWorkstream(fact DirectorFactEvent) error {
	payload := fact.WorkstreamRegistered
	if _, exists := projector.workstreams[fact.WorkstreamID]; exists {
		return fmt.Errorf("workstream %s is already registered", fact.WorkstreamID)
	}
	if existing, bound := projector.byConversation[payload.ConversationID]; bound {
		return fmt.Errorf(
			"conversation %s is already projected as workstream %s",
			payload.ConversationID,
			existing,
		)
	}
	if payload.ParentID != nil {
		if _, known := projector.workstreams[*payload.ParentID]; !known {
			return fmt.Errorf(
				"workstream %s names parent %s, which is not registered",
				fact.WorkstreamID,
				*payload.ParentID,
			)
		}
	}
	projector.workstreams[fact.WorkstreamID] = newProjectedWorkstream(fact.WorkstreamID)
	projector.workstreamParents[fact.WorkstreamID] = copyOptionalString(payload.ParentID)
	projector.byConversation[payload.ConversationID] = fact.WorkstreamID
	projector.order = append(projector.order, fact.WorkstreamID)
	return nil
}

// projectWorkstreamSelected changes app state and detail level. Selection is
// view-adjacent product state, so it never writes graph truth.
func projectWorkstreamSelected(projector *DirectorGraphProjector, context factContext, _ DirectorFactEvent) error {
	selected := context.workstream.id
	projector.selected = &selected
	return nil
}

// projectWorkstreamMetadataOnly records a fact the registry owns. Binding a
// folder changes the workstream's resource scope; the resource request node that
// asked for it resolves through its own fact.
func projectWorkstreamMetadataOnly(_ *DirectorGraphProjector, _ factContext, _ DirectorFactEvent) error {
	return nil
}

func projectDecisionCommitted(projector *DirectorGraphProjector, context factContext, fact DirectorFactEvent) error {
	payload := fact.DecisionCommitted
	nodeID, err := projector.commitNode(context, nodeSpec{
		identity: SemanticNodeIdentityDecision,
		sourceID: fact.ID,
		kind:     SemanticNodeDirectorDecision,
		status:   SemanticNodeStatusSucceeded,
		actor:    SemanticActorDirector,
		summary:  payload.PublicSummary,
		evidence: EvidenceStructuredDeclaration,
		chain:    true,
	})
	if err != nil {
		return err
	}
	if payload.TargetWorkstreamID == nil {
		return nil
	}
	// The delegated_to edge is drawn when the authorized work exists. A decision
	// that routes to a workstream which is neither itself nor one of its
	// children is routing, not delegation, and earns no edge.
	projector.pendingDelegation = append(projector.pendingDelegation, pendingDelegation{
		decisionWorkstreamID: context.workstream.id,
		decisionNodeID:       nodeID,
		targetWorkstreamID:   *payload.TargetWorkstreamID,
	})
	return nil
}

func projectResourceRequestOpened(projector *DirectorGraphProjector, context factContext, fact DirectorFactEvent) error {
	payload := fact.ResourceRequestOpened
	nodeID, err := projector.commitNode(context, nodeSpec{
		identity: SemanticNodeIdentityResourceRequest,
		sourceID: payload.RequestID,
		kind:     SemanticNodeResourceRequired,
		status:   SemanticNodeStatusWaiting,
		actor:    SemanticActorDirector,
		summary:  payload.PublicSummary,
		evidence: EvidenceRuntimeFact,
		chain:    true,
	})
	if err != nil {
		return err
	}
	return projector.addEdge(context, SemanticEdgeBlockedBy, projector.blockedByResource(context), context.workstream.id, nodeID)
}

// blockedByResource names the work a missing resource is holding up. A
// folderless workstream that has not started a run is blocked at its goal.
func (projector *DirectorGraphProjector) blockedByResource(context factContext) string {
	if context.runID == nil {
		return context.workstream.lastNodeID
	}
	runNodeID, err := SemanticNodeID(SemanticNodeIdentityRun, *context.runID)
	if err != nil {
		return ""
	}
	if _, exists := context.workstream.nodeIndex[runNodeID]; !exists {
		return context.workstream.lastNodeID
	}
	return runNodeID
}

func projectResourceRequestResolved(projector *DirectorGraphProjector, context factContext, fact DirectorFactEvent) error {
	payload := fact.ResourceRequestResolved
	nodeID, err := SemanticNodeID(SemanticNodeIdentityResourceRequest, payload.RequestID)
	if err != nil {
		return err
	}
	if _, exists := context.workstream.nodeIndex[nodeID]; !exists {
		return nil
	}
	status := SemanticNodeStatusSucceeded
	if payload.Status == ResourceRequestStatusCancelled {
		status = SemanticNodeStatusCancelled
	}
	_, err = projector.commitNode(context, nodeSpec{nodeID: nodeID, status: status})
	return err
}

func projectInterpretationPublished(projector *DirectorGraphProjector, context factContext, fact DirectorFactEvent) error {
	payload := fact.InterpretationPublished
	metadata := payload.Metadata
	// An interpretation is visibly distinguishable from a runtime fact because it
	// carries its evidence class, its attributable metadata, and the durable
	// events it was drawn from.
	_, err := projector.commitNode(context, nodeSpec{
		identity:            SemanticNodeIdentityInterpretation,
		sourceID:            payload.InterpretationID,
		kind:                SemanticNodeMilestone,
		status:              SemanticNodeStatusSucceeded,
		actor:               context.actor,
		summary:             payload.PublicSummary,
		evidence:            EvidenceDirectorInterpretation,
		interpretation:      &metadata,
		extraSourceEventIDs: payload.InterpretedEventIDs,
		chain:               true,
	})
	return err
}

func projectValidationRecorded(projector *DirectorGraphProjector, context factContext, fact DirectorFactEvent) error {
	payload := fact.ValidationRecorded
	status := SemanticNodeStatusSucceeded
	if payload.Outcome == DirectorValidationFailed {
		status = SemanticNodeStatusFailed
	}
	nodeID, err := projector.commitNode(context, nodeSpec{
		identity:            SemanticNodeIdentityValidation,
		sourceID:            payload.ValidationID,
		kind:                SemanticNodeValidation,
		status:              status,
		actor:               context.actor,
		summary:             payload.PublicSummary,
		evidence:            EvidenceRuntimeFact,
		extraSourceEventIDs: []string{payload.SubjectEventID},
		chain:               true,
	})
	if err != nil {
		return err
	}
	subjectNodeID := projector.nodeBySourceEvent[payload.SubjectEventID]
	return projector.addEdge(context, SemanticEdgeValidatedBy, subjectNodeID, context.workstream.id, nodeID)
}

func projectRecoveryAttempted(projector *DirectorGraphProjector, context factContext, fact DirectorFactEvent) error {
	payload := fact.RecoveryAttempted
	status, err := recoveryNodeStatus(payload.Status)
	if err != nil {
		return err
	}
	nodeID, err := projector.commitNode(context, nodeSpec{
		identity:            SemanticNodeIdentityRecovery,
		sourceID:            payload.RecoveryID,
		kind:                SemanticNodeRetry,
		status:              status,
		actor:               context.actor,
		summary:             payload.PublicSummary,
		evidence:            EvidenceRuntimeFact,
		extraSourceEventIDs: []string{payload.FailureEventID},
		chain:               true,
	})
	if err != nil {
		return err
	}
	// The named failure is the anchor when the projection still holds it;
	// otherwise the workstream's unresolved failure is.
	if failedNodeID, known := projector.nodeBySourceEvent[payload.FailureEventID]; known {
		if failedNodeID == context.workstream.recoveryAnchor {
			context.workstream.recoveryAnchor = ""
		}
		return projector.addEdge(context, SemanticEdgeRecoveredBy, failedNodeID, context.workstream.id, nodeID)
	}
	return projector.recoverFrom(context, nodeID)
}

func recoveryNodeStatus(status RecoveryStatus) (SemanticNodeStatus, error) {
	switch status {
	case RecoveryStatusDetected, RecoveryStatusRetrying:
		return SemanticNodeStatusActive, nil
	case RecoveryStatusRecovered:
		return SemanticNodeStatusSucceeded, nil
	case RecoveryStatusUnrecoverable:
		return SemanticNodeStatusFailed, nil
	default:
		return "", fmt.Errorf("unknown recovery status %q", status)
	}
}
