package director

import (
	"fmt"
	"strings"

	"setta/internal/conversation"
)

// Activity, file-change, approval, delegation, artifact, and lifecycle
// projection.
//
// Every node kind here is resolved from a typed field. Nothing reads a command
// string, a diff body, or an approval question to decide what happened, and no
// node is created for an activity whose kind has no precise semantic owner yet.

const (
	subagentSummaryFallback   = "Delegated subagent"
	livenessSummaryFallback   = "Agent liveness changed"
	lifecycleSummaryFallback  = "Provider lifecycle changed"
	approvalSummaryFallback   = "Approval required"
	activitySummaryFallback   = "Activity"
	fileChangeSummaryFallback = "File change"
	validationSummaryFallback = "Validation recorded"
)

func projectActivityStarted(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.ActivityStarted
	if payload == nil {
		return missingPayload(event)
	}
	return projector.commitActivity(context, payload.Activity, SemanticNodeStatusActive, payload.Activity.Title)
}

func projectActivityProgressed(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.ActivityProgressed
	if payload == nil {
		return missingPayload(event)
	}
	// Progress advances the node the start created. Process output is a detail
	// surface, so it never becomes the node's label.
	nodeID, err := SemanticNodeID(SemanticNodeIdentityActivity, payload.ActivityID)
	if err != nil {
		return err
	}
	index, exists := context.workstream.nodeIndex[nodeID]
	if !exists {
		return nil
	}
	_, err = projector.commitNode(context, nodeSpec{
		nodeID: nodeID,
		status: context.workstream.nodes[index].Status,
	})
	return err
}

func projectActivityCompleted(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.ActivityCompleted
	if payload == nil {
		return missingPayload(event)
	}
	summary := firstText(payload.Summary, payload.Activity.Title)
	return projector.commitActivity(context, payload.Activity, SemanticNodeStatusSucceeded, summary)
}

func projectActivityFailed(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.ActivityFailed
	if payload == nil {
		return missingPayload(event)
	}
	summary := firstText(payload.Failure.Message, payload.Activity.Title)
	return projector.commitActivity(context, payload.Activity, SemanticNodeStatusFailed, summary)
}

// commitActivity resolves the node kind from the typed activity kind. An
// activity whose kind has no precise semantic meaning stays invisible rather
// than becoming a node the user cannot act on.
func (projector *DirectorGraphProjector) commitActivity(
	context factContext,
	activity conversation.TrajectoryActivity,
	status SemanticNodeStatus,
	summary string,
) error {
	kind, err := NodeKindForActivity(activity.Kind)
	if err != nil {
		return err
	}
	if kind == SemanticNodeNone {
		return nil
	}
	_, err = projector.commitNode(context, nodeSpec{
		identity: SemanticNodeIdentityActivity,
		sourceID: activity.ID,
		kind:     kind,
		status:   status,
		actor:    context.actor,
		summary:  firstText(summary, activity.Title, activitySummaryFallback),
		evidence: EvidenceRuntimeFact,
		chain:    true,
	})
	return err
}

func projectFileChangeProposed(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.FileChangeProposed
	if payload == nil {
		return missingPayload(event)
	}
	nodeID, err := projector.commitNode(context, nodeSpec{
		identity: SemanticNodeIdentityFileChange,
		sourceID: payload.ProviderItemID,
		kind:     SemanticNodeAction,
		// A proposed change cannot progress until something decides to apply it,
		// whether that is the user answering an approval or the permission
		// profile allowing it outright.
		status:   SemanticNodeStatusWaiting,
		actor:    context.actor,
		summary:  fileChangeSummary(payload.Changes),
		evidence: EvidenceRuntimeFact,
		chain:    true,
	})
	if err != nil {
		return err
	}
	if context.runID != nil {
		context.workstream.fileChangeNode[*context.runID] = nodeID
	}
	return nil
}

func projectFileChangeCompleted(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.FileChangeCompleted
	if payload == nil {
		return missingPayload(event)
	}
	status, err := fileChangeStatus(payload.Outcome)
	if err != nil {
		return err
	}
	summary := fileChangeSummary(payload.Changes)
	if payload.Failure != nil {
		summary = firstText(payload.Failure.Message, summary)
	}
	_, err = projector.commitNode(context, nodeSpec{
		identity: SemanticNodeIdentityFileChange,
		sourceID: payload.ProviderItemID,
		kind:     SemanticNodeAction,
		status:   status,
		actor:    context.actor,
		summary:  summary,
		evidence: EvidenceRuntimeFact,
		chain:    true,
	})
	if err == nil && context.runID != nil {
		delete(context.workstream.fileChangeNode, *context.runID)
	}
	return err
}

func fileChangeStatus(outcome conversation.FileChangeOutcome) (SemanticNodeStatus, error) {
	switch outcome {
	case conversation.FileChangeOutcomeCompleted:
		return SemanticNodeStatusSucceeded, nil
	case conversation.FileChangeOutcomeFailed:
		return SemanticNodeStatusFailed, nil
	case conversation.FileChangeOutcomeDeclined:
		return SemanticNodeStatusCancelled, nil
	default:
		return "", fmt.Errorf("unknown file change outcome %q", outcome)
	}
}

// fileChangeSummary names the paths a change touches. Diff bodies stay out of
// graph state; they belong to the detail surface that can redact and scroll.
func fileChangeSummary(changes []conversation.FileChange) string {
	if len(changes) == 0 {
		return fileChangeSummaryFallback
	}
	if len(changes) == 1 {
		return fmt.Sprintf("%s %s", changes[0].Kind, changes[0].Path)
	}
	paths := make([]string, 0, len(changes))
	for _, change := range changes {
		paths = append(paths, change.Path)
	}
	return fmt.Sprintf("%d file changes: %s", len(changes), strings.Join(paths, ", "))
}

func projectApprovalRequested(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.ApprovalRequested
	if payload == nil {
		return missingPayload(event)
	}
	approval := payload.Approval
	// Only the approval's public title becomes graph truth. Bodies, commands,
	// questions, and secret fields stay with the approval surface that can
	// redact them.
	nodeID, err := projector.commitNode(context, nodeSpec{
		identity: SemanticNodeIdentityApproval,
		sourceID: approval.ID,
		kind:     SemanticNodeApprovalRequired,
		status:   SemanticNodeStatusWaiting,
		actor:    SemanticActorSystem,
		summary:  firstText(approval.Title, approvalSummaryFallback),
		evidence: EvidenceRuntimeFact,
		chain:    true,
	})
	if err != nil {
		return err
	}
	return projector.addEdge(context, SemanticEdgeBlockedBy, projector.approvalBlocked(context, approval.Kind), context.workstream.id, nodeID)
}

// approvalBlocked names what the approval is holding up: the file change it
// gates when it gates one, and the run otherwise.
func (projector *DirectorGraphProjector) approvalBlocked(context factContext, kind conversation.TrajectoryApprovalKind) string {
	if context.runID == nil {
		return context.workstream.lastNodeID
	}
	if kind == conversation.TrajectoryApprovalKindFileChange {
		if fileChangeNodeID, waiting := context.workstream.fileChangeNode[*context.runID]; waiting {
			return fileChangeNodeID
		}
	}
	runNodeID, err := SemanticNodeID(SemanticNodeIdentityRun, *context.runID)
	if err != nil {
		return ""
	}
	if _, exists := context.workstream.nodeIndex[runNodeID]; !exists {
		return ""
	}
	return runNodeID
}

func projectApprovalResolved(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.ApprovalResolved
	if payload == nil {
		return missingPayload(event)
	}
	resolution := payload.Resolution
	status, err := ApprovalStatusForDecision(resolution.Decision)
	if err != nil {
		return err
	}
	nodeStatus, err := approvalNodeStatus(status)
	if err != nil {
		return err
	}
	nodeID, err := SemanticNodeID(SemanticNodeIdentityApproval, resolution.ApprovalID)
	if err != nil {
		return err
	}
	if _, exists := context.workstream.nodeIndex[nodeID]; !exists {
		// The request that this resolves is outside the window. Resolving an
		// approval the graph never showed must not invent a node for it.
		return nil
	}
	// The decision is the only part of a resolution that becomes graph truth.
	// Free-text responses and structured answers may carry secrets, so they stay
	// with the approval record.
	_, err = projector.commitNode(context, nodeSpec{
		nodeID:   nodeID,
		status:   nodeStatus,
		evidence: EvidenceRuntimeFact,
	})
	return err
}

func approvalNodeStatus(status ApprovalStatus) (SemanticNodeStatus, error) {
	switch status {
	case ApprovalStatusApproved, ApprovalStatusApprovedForSession, ApprovalStatusAnswered:
		return SemanticNodeStatusSucceeded, nil
	case ApprovalStatusDenied:
		return SemanticNodeStatusFailed, nil
	case ApprovalStatusCancelled, ApprovalStatusSuperseded:
		return SemanticNodeStatusCancelled, nil
	case ApprovalStatusPending:
		return SemanticNodeStatusWaiting, nil
	default:
		return "", fmt.Errorf("unknown approval status %q", status)
	}
}

func projectSubagentStarted(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	if event.SubagentStarted == nil {
		return missingPayload(event)
	}
	return projector.commitSubagent(context, event.SubagentStarted.Subagent)
}

func projectSubagentUpdated(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	if event.SubagentUpdated == nil {
		return missingPayload(event)
	}
	return projector.commitSubagent(context, event.SubagentUpdated.Subagent)
}

func projectSubagentCompleted(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	if event.SubagentCompleted == nil {
		return missingPayload(event)
	}
	return projector.commitSubagent(context, event.SubagentCompleted.Subagent)
}

// commitSubagent keeps a provider subagent as a delegation node inside its
// parent workstream. It becomes a background workstream only when product state
// gives it a durable address of its own.
func (projector *DirectorGraphProjector) commitSubagent(context factContext, subagent conversation.Subagent) error {
	status, err := subagentNodeStatus(subagent.Status)
	if err != nil {
		return err
	}
	nodeID, err := projector.commitNode(context, nodeSpec{
		identity: SemanticNodeIdentitySubagent,
		sourceID: subagent.ID,
		kind:     SemanticNodeDelegation,
		status:   status,
		actor:    SemanticActorWorker,
		summary:  firstText(optionalText(subagent.Message), subagentSummaryFallback),
		evidence: EvidenceRuntimeFact,
		chain:    true,
	})
	if err != nil {
		return err
	}
	if context.runID == nil {
		return nil
	}
	runNodeID, err := SemanticNodeID(SemanticNodeIdentityRun, *context.runID)
	if err != nil {
		return err
	}
	if _, exists := context.workstream.nodeIndex[runNodeID]; !exists {
		return nil
	}
	return projector.addEdge(context, SemanticEdgeDelegatedTo, runNodeID, context.workstream.id, nodeID)
}

func subagentNodeStatus(status conversation.SubagentStatus) (SemanticNodeStatus, error) {
	switch status {
	case conversation.SubagentStatusPendingInit:
		return SemanticNodeStatusPending, nil
	case conversation.SubagentStatusRunning:
		return SemanticNodeStatusActive, nil
	case conversation.SubagentStatusCompleted:
		return SemanticNodeStatusSucceeded, nil
	case conversation.SubagentStatusInterrupted, conversation.SubagentStatusShutdown:
		return SemanticNodeStatusCancelled, nil
	case conversation.SubagentStatusErrored, conversation.SubagentStatusNotFound:
		return SemanticNodeStatusFailed, nil
	default:
		return "", fmt.Errorf("unknown subagent status %q", status)
	}
}

func projectArtifactEmitted(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.ArtifactEmitted
	if payload == nil {
		return missingPayload(event)
	}
	projector.artifactIDs[payload.ArtifactID] = true
	nodeID, err := projector.commitNode(context, nodeSpec{
		identity:    SemanticNodeIdentityArtifact,
		sourceID:    payload.ArtifactID,
		kind:        SemanticNodeArtifact,
		status:      SemanticNodeStatusSucceeded,
		actor:       SemanticActorSystem,
		summary:     payload.Title,
		evidence:    EvidenceRuntimeFact,
		artifactIDs: []string{payload.ArtifactID},
		chain:       true,
	})
	if err != nil {
		return err
	}
	if context.runID == nil {
		return nil
	}
	runID := *context.runID
	context.workstream.runArtifacts[runID] = appendUniqueStrings(context.workstream.runArtifacts[runID], payload.ArtifactID)
	runNodeID, err := SemanticNodeID(SemanticNodeIdentityRun, runID)
	if err != nil {
		return err
	}
	if _, exists := context.workstream.nodeIndex[runNodeID]; !exists {
		return nil
	}
	return projector.addEdge(context, SemanticEdgeProduced, runNodeID, context.workstream.id, nodeID)
}

func projectAgentLivenessChanged(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.AgentLivenessChanged
	if payload == nil {
		return missingPayload(event)
	}
	kind, err := NodeKindForAgentLiveness(payload.Liveness.Status)
	if err != nil {
		return err
	}
	summary := firstText(payload.Liveness.Message, livenessSummaryFallback)
	return projector.commitLifecycleNode(context, event.ID, kind, summary)
}

func projectProviderLifecycleChanged(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.ProviderLifecycleChanged
	if payload == nil {
		return missingPayload(event)
	}
	kind, err := NodeKindForProviderLifecycle(payload.Lifecycle.Status)
	if err != nil {
		return err
	}
	summary := firstText(payload.Lifecycle.Message, lifecycleSummaryFallback)
	return projector.commitLifecycleNode(context, event.ID, kind, summary)
}

// projectValidationRecorded makes a provider check visible once it reaches a
// verdict, and connects it to the work it covers. A check that is still running
// is not a fact the user can act on, so it updates metadata and draws nothing.
func projectProviderValidationRecorded(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.ValidationRecorded
	if payload == nil {
		return missingPayload(event)
	}
	validation := payload.Validation
	kind, err := NodeKindForValidation(validation.Status)
	if err != nil {
		return err
	}
	if kind == SemanticNodeNone {
		return nil
	}
	status, err := SemanticNodeStatusForValidation(validation.Status)
	if err != nil {
		return err
	}
	nodeID, err := projector.commitNode(context, nodeSpec{
		identity: SemanticNodeIdentityValidation,
		sourceID: validation.ID,
		kind:     kind,
		status:   status,
		actor:    SemanticActorProvider,
		summary:  firstText(validation.Summary, validationSummaryFallback),
		evidence: EvidenceRuntimeFact,
		chain:    true,
	})
	if err != nil {
		return err
	}
	return projector.addEdge(
		context,
		SemanticEdgeValidatedBy,
		projector.validationSubject(context, validation.Subject),
		context.workstream.id,
		nodeID,
	)
}

// validationSubject names the node the check covers. The provider names the item
// it reviewed when one exists, so the subject is resolved from that typed id
// rather than from whatever node happens to be last; a check over the whole run
// falls back to the run node.
func (projector *DirectorGraphProjector) validationSubject(context factContext, subject *string) string {
	if subject != nil {
		for _, identity := range []SemanticNodeIdentity{SemanticNodeIdentityActivity, SemanticNodeIdentityFileChange} {
			nodeID, err := SemanticNodeID(identity, *subject)
			if err != nil {
				continue
			}
			if _, exists := context.workstream.nodeIndex[nodeID]; exists {
				return nodeID
			}
		}
	}
	if context.runID == nil {
		return ""
	}
	runNodeID, err := SemanticNodeID(SemanticNodeIdentityRun, *context.runID)
	if err != nil {
		return ""
	}
	if _, exists := context.workstream.nodeIndex[runNodeID]; !exists {
		return ""
	}
	return runNodeID
}

func projectModelRerouted(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.ModelRerouted
	if payload == nil {
		return missingPayload(event)
	}
	// The typed reroute reason owns the meaning. Risk is never inferred from the
	// surrounding text.
	summary := firstText(
		payload.Reroute.Reason,
		fmt.Sprintf(rerouteSummaryPattern, payload.Reroute.FromModelID, payload.Reroute.ToModelID),
	)
	return projector.commitLifecycleNode(context, event.ID, SemanticNodeRecovery, summary)
}

// commitLifecycleNode makes a lifecycle fact visible only when the typed state
// says the user or the Director has to act. Healthy states update metadata the
// registry owns and draw nothing.
func (projector *DirectorGraphProjector) commitLifecycleNode(
	context factContext,
	sourceID string,
	kind SemanticNodeKind,
	summary string,
) error {
	if kind == SemanticNodeNone {
		return nil
	}
	status := SemanticNodeStatusWaiting
	if kind == SemanticNodeRecovery {
		status = SemanticNodeStatusActive
	}
	nodeID, err := projector.commitNode(context, nodeSpec{
		identity: SemanticNodeIdentityLifecycle,
		sourceID: sourceID,
		kind:     kind,
		status:   status,
		actor:    SemanticActorProvider,
		summary:  summary,
		evidence: EvidenceRuntimeFact,
		chain:    true,
	})
	if err != nil {
		return err
	}
	if kind == SemanticNodeBlocked {
		return projector.blockActiveRun(context, nodeID)
	}
	return projector.recoverFrom(context, nodeID)
}

// blockActiveRun connects the run a typed lifecycle fact is holding up.
func (projector *DirectorGraphProjector) blockActiveRun(context factContext, blockedNodeID string) error {
	if context.runID == nil {
		return nil
	}
	runNodeID, err := SemanticNodeID(SemanticNodeIdentityRun, *context.runID)
	if err != nil {
		return err
	}
	if _, exists := context.workstream.nodeIndex[runNodeID]; !exists {
		return nil
	}
	return projector.addEdge(context, SemanticEdgeBlockedBy, runNodeID, context.workstream.id, blockedNodeID)
}
