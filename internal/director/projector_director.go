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

// registerWorkstream admits a workstream to the projection and gives it its
// anchor node. Identity is app-scoped: the conversation it names is where the
// work executes, not what the workstream is.
//
// The anchor is what makes an idle workstream visible as itself. Registration is
// durable state the user acted to create, so the workstream the app just made is
// on the canvas before anything has been asked of it, and every later fact in it
// chains from the anchor rather than from nothing.
func (projector *DirectorGraphProjector) registerWorkstream(
	fact DirectorFactEvent,
	edgeKinds []SemanticEdgeKind,
) error {
	payload := fact.WorkstreamRegistered
	workstreamID := *fact.WorkstreamID
	if _, exists := projector.workstreams[workstreamID]; exists {
		return fmt.Errorf("workstream %s is already registered", workstreamID)
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
				workstreamID,
				*payload.ParentID,
			)
		}
	}
	workstream := newProjectedWorkstream(workstreamID)
	projector.workstreams[workstreamID] = workstream
	projector.workstreamParents[workstreamID] = copyOptionalString(payload.ParentID)
	projector.byConversation[payload.ConversationID] = workstreamID
	projector.order = append(projector.order, workstreamID)
	context := factContext{
		eventID:    fact.ID,
		emittedAt:  fact.EmittedAt,
		workstream: workstream,
		actor:      fact.Actor,
		sourceFact: string(fact.Kind),
		edgeKinds:  edgeKinds,
	}
	nodeID, err := projector.commitNode(context, nodeSpec{
		identity: SemanticNodeIdentityWorkstream,
		sourceID: workstreamID,
		kind:     SemanticNodeWorkstream,
		status:   SemanticNodeStatusActive,
		actor:    fact.Actor,
		summary:  payload.Title,
		evidence: EvidenceRuntimeFact,
	})
	if err != nil {
		return err
	}
	// The work a decision delegated now exists, so the edge it earned lands on
	// the anchor: the delegation is to the workstream, not to whichever fact it
	// happens to produce first.
	return projector.resolveDelegation(context, nodeID)
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
	if err := projector.validateDecisionTarget(*payload); err != nil {
		return err
	}
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
	if payload.Decision != DirectorDecisionCreateWorkstream {
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
	case DirectorDecisionAnswerDirectly:
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
	return projector.addEdge(context, SemanticEdgeBlockedBy, blockedNodeID, context.workstream.id, nodeID)
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

func projectInterpretationPublished(projector *DirectorGraphProjector, context factContext, fact DirectorFactEvent) error {
	payload := fact.InterpretationPublished
	for _, sourceEventID := range payload.InterpretedEventIDs {
		if err := projector.requirePriorSourceEvent(context.workstream.id, sourceEventID); err != nil {
			return fmt.Errorf("interpretation %s: %w", payload.InterpretationID, err)
		}
	}
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
	subjectNodeID, err := projector.requirePriorSemanticNode(context.workstream.id, payload.SubjectEventID)
	if err != nil {
		return fmt.Errorf("validation %s: %w", payload.ValidationID, err)
	}
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
	return projector.addEdge(context, SemanticEdgeValidatedBy, subjectNodeID, context.workstream.id, nodeID)
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
	if err := projector.addEdge(context, SemanticEdgeRecoveredBy, failedNodeID, context.workstream.id, nodeID); err != nil {
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
