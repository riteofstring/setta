package director

import "fmt"

// Director-fact projection.
//
// These are the app-scoped facts a conversation cannot own: which workstream the
// app selected, which decision routed the work, what the work is waiting for,
// and what was recovered.

type directorHandler func(projector *DirectorGraphProjector, context factContext, fact DirectorFactEvent) error

// directorHandlers is total over the Director fact catalog, so a fact kind with
// no projection fails at the boundary instead of silently vanishing.
var directorHandlers = map[DirectorSourceFact]directorHandler{
	DirectorFactWorkstreamSelected:      projectWorkstreamSelected,
	DirectorFactWorkstreamResourceBound: projectWorkstreamMetadataOnly,
	DirectorFactDecisionCommitted:       projectDecisionCommitted,
	DirectorFactResourceRequestOpened:   projectResourceRequestOpened,
	DirectorFactResourceRequestResolved: projectResourceRequestResolved,
	DirectorFactRecoveryAttempted:       projectRecoveryAttempted,
}

// projectWorkstreamSelected changes app state and detail level. Selection is
// view-adjacent product state, so it never writes graph truth.
func projectWorkstreamSelected(projector *DirectorGraphProjector, context factContext, fact DirectorFactEvent) error {
	if !equalOptionalString(projector.selected, fact.WorkstreamSelected.PreviousWorkstreamID) {
		return fmt.Errorf(
			"workstream selection %s expected previous workstream %v, got %v",
			fact.ID,
			projector.selected,
			fact.WorkstreamSelected.PreviousWorkstreamID,
		)
	}
	/*
	 * The selection is the fact's own, not the lane the fact was folded in.
	 *
	 * A fact naming no workstream is folded in the Director's lane, so reading
	 * the lane's id here recorded the Director's lane as the selected
	 * workstream — and the next selection's previous-selection check then
	 * disagreed with the log and stopped the follower. Selecting the Director's
	 * view is a nil selection, which is exactly what the fact carries.
	 */
	projector.selected = copyOptionalString(fact.WorkstreamID)
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
	if err := projector.validateDecisionTarget(*payload); err != nil {
		return err
	}
	// The decision is drawn where it was made and nowhere else. Every workstream
	// the Director creates is independent, so a decision has no work of another
	// workstream's to point at: what it started is a lane of its own, and the
	// workstream anchor already says the work exists.
	_, err := projector.commitNode(context, nodeSpec{
		identity: SemanticNodeIdentityDecision,
		sourceID: fact.ID,
		kind:     SemanticNodeDirectorDecision,
		status:   SemanticNodeStatusSucceeded,
		actor:    SemanticActorDirector,
		summary:  payload.PublicSummary,
		evidence: EvidenceStructuredDeclaration,
		chain:    true,
	})
	return err
}

func (projector *DirectorGraphProjector) validateDecisionTarget(
	payload DirectorDecisionCommitted,
) error {
	switch payload.Decision {
	case DirectorDecisionCreateWorkstream:
		if _, exists := projector.workstreams[*payload.TargetWorkstreamID]; exists {
			return fmt.Errorf("create-workstream decision targets existing workstream %s", *payload.TargetWorkstreamID)
		}
	case DirectorDecisionSendToWorkstream,
		DirectorDecisionQueueBehindRun,
		DirectorDecisionSteerRun,
		DirectorDecisionSelectWorkstream:
		if _, exists := projector.workstreams[*payload.TargetWorkstreamID]; !exists {
			return fmt.Errorf("decision %q targets unknown workstream %s", payload.Decision, *payload.TargetWorkstreamID)
		}
	case DirectorDecisionRecoverPath:
		if payload.TargetWorkstreamID != nil {
			if _, exists := projector.workstreams[*payload.TargetWorkstreamID]; !exists {
				return fmt.Errorf("recovery decision targets unknown workstream %s", *payload.TargetWorkstreamID)
			}
		}
	}
	return nil
}

func projectResourceRequestOpened(projector *DirectorGraphProjector, context factContext, fact DirectorFactEvent) error {
	payload := fact.ResourceRequestOpened
	blockedNodeID := projector.blockedByResource(context)
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
	return projector.addEdge(context, SemanticEdgeBlockedBy, blockedNodeID, nodeID)
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
		if goalNodeID := context.workstream.goalNodes[*context.runID]; goalNodeID != "" {
			return goalNodeID
		}
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
		return fmt.Errorf("resource request %s resolved before it was opened", payload.RequestID)
	}
	status := SemanticNodeStatusSucceeded
	if payload.Status == ResourceRequestStatusCancelled {
		status = SemanticNodeStatusCancelled
	}
	_, err = projector.commitNode(context, nodeSpec{nodeID: nodeID, status: status})
	return err
}

func projectRecoveryAttempted(projector *DirectorGraphProjector, context factContext, fact DirectorFactEvent) error {
	payload := fact.RecoveryAttempted
	failedNodeID, err := projector.requireRecoverableSemanticNode(
		context.workstream.id,
		payload.FailureEventID,
	)
	if err != nil {
		return fmt.Errorf("recovery %s: %w", payload.RecoveryID, err)
	}
	previous, exists := context.workstream.recoveryStatuses[payload.RecoveryID]
	if exists {
		if err := ValidateRecoveryTransition(previous, payload.Status); err != nil {
			return err
		}
	} else if err := recoveryLifecycle.validateInitial(payload.Status); err != nil {
		return err
	}
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
	if failedNodeID == context.workstream.recoveryAnchor {
		context.workstream.recoveryAnchor = ""
	}
	if err := projector.addEdge(context, SemanticEdgeRecoveredBy, failedNodeID, nodeID); err != nil {
		return err
	}
	context.workstream.recoveryStatuses[payload.RecoveryID] = payload.Status
	return nil
}

func (projector *DirectorGraphProjector) requirePriorSourceEvent(
	workstreamID string,
	sourceEventID string,
) error {
	owner, known := projector.sourceEventOwners[sourceEventID]
	if !known {
		return fmt.Errorf("cites unknown prior event %q", sourceEventID)
	}
	if owner != workstreamID {
		return fmt.Errorf(
			"cites event %q from workstream %q without cross-workstream authority",
			sourceEventID,
			owner,
		)
	}
	return nil
}

func (projector *DirectorGraphProjector) requirePriorSemanticNode(
	workstreamID string,
	sourceEventID string,
) (string, error) {
	if err := projector.requirePriorSourceEvent(workstreamID, sourceEventID); err != nil {
		return "", err
	}
	nodeID := projector.nodeBySourceEvent[sourceEventID]
	if nodeID == "" {
		return "", fmt.Errorf("event %q has no semantic node", sourceEventID)
	}
	workstream := projector.workstreams[workstreamID]
	if workstream == nil {
		return "", fmt.Errorf("workstream %q is not registered", workstreamID)
	}
	if _, exists := workstream.nodeIndex[nodeID]; !exists {
		return "", fmt.Errorf("event %q resolves to node %q outside workstream %q", sourceEventID, nodeID, workstreamID)
	}
	return nodeID, nil
}

func (projector *DirectorGraphProjector) requireRecoverableSemanticNode(
	workstreamID string,
	sourceEventID string,
) (string, error) {
	nodeID, err := projector.requirePriorSemanticNode(workstreamID, sourceEventID)
	if err != nil {
		return "", err
	}
	workstream := projector.workstreams[workstreamID]
	node := workstream.nodes[workstream.nodeIndex[nodeID]]
	recoverable := node.Status == SemanticNodeStatusFailed ||
		node.Status == SemanticNodeStatusCancelled ||
		(node.Kind == SemanticNodeBlocked && node.Status == SemanticNodeStatusWaiting)
	if !recoverable {
		return "", fmt.Errorf(
			"event %q resolves to healthy node %q with status %q",
			sourceEventID,
			nodeID,
			node.Status,
		)
	}
	return nodeID, nil
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
