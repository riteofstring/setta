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
	approvalSummaryFallback   = "Approval required"
	fileChangeSummaryFallback = "File change"
	validationSummaryFallback = "Validation recorded"
)

func projectActivityStarted(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.ActivityStarted
	if payload == nil {
		return missingPayload(event)
	}
	return projector.commitActivity(
		context,
		payload.Activity,
		SemanticNodeStatusActive,
	)
}

func projectActivityProgressed(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.ActivityProgressed
	if payload == nil {
		return missingPayload(event)
	}
	// Progress advances the node the start created. Process output is a detail
	// surface, so it never becomes the node's label.
	for _, nodes := range []map[string]string{
		context.workstream.activityNodes,
		context.workstream.fileChangeNodes,
	} {
		nodeID := nodes[payload.ActivityID]
		index, exists := context.workstream.nodeIndex[nodeID]
		if !exists {
			continue
		}
		_, err := projector.commitNode(context, nodeSpec{
			nodeID: nodeID,
			status: context.workstream.nodes[index].Status,
		})
		return err
	}
	// The progress payload does not repeat the activity kind. An invisible
	// `other` activity therefore has no node to advance, while visible kinds
	// are checked when their typed terminal fact arrives.
	return nil
}

func projectActivityCompleted(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.ActivityCompleted
	if payload == nil {
		return missingPayload(event)
	}
	return projector.commitActivity(context, payload.Activity, SemanticNodeStatusSucceeded)
}

func projectActivityFailed(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.ActivityFailed
	if payload == nil {
		return missingPayload(event)
	}
	return projector.commitActivity(context, payload.Activity, SemanticNodeStatusFailed)
}

// commitActivity resolves the node kind from the typed activity kind. An
// activity whose kind has no precise semantic meaning stays invisible rather
// than becoming a node the user cannot act on.
func (projector *DirectorGraphProjector) commitActivity(
	context factContext,
	activity conversation.TrajectoryActivity,
	status SemanticNodeStatus,
) error {
	kind, err := NodeKindForActivity(activity.Kind)
	if err != nil {
		return err
	}
	if kind == SemanticNodeNone {
		return nil
	}
	nodeID, tracked, err := providerBackedNodeID(
		context,
		context.workstream.activityNodes,
		activity.ID,
		SemanticNodeIdentityActivity,
	)
	if err != nil {
		return err
	}
	publicSummary, err := activityPublicSummary(activity.Kind)
	if err != nil {
		return err
	}
	_, err = projector.commitNode(context, nodeSpec{
		nodeID: nodeID,
		kind:   kind,
		status: status,
		actor:  context.actor,
		// Provider activity titles and summaries can contain full commands,
		// arguments, paths, or tool output. The semantic graph names the typed
		// activity and leaves those private details on their owning surface.
		summary:  publicSummary,
		evidence: EvidenceRuntimeFact,
		chain:    true,
	})
	if err == nil && !tracked {
		context.workstream.activityNodes[activity.ID] = nodeID
	}
	return err
}

func activityPublicSummary(kind conversation.TrajectoryActivityKind) (string, error) {
	switch kind {
	case conversation.TrajectoryActivityCommand:
		return "Command", nil
	case conversation.TrajectoryActivityMCPTool:
		return "MCP tool", nil
	case conversation.TrajectoryActivityDynamicTool:
		return "Tool", nil
	case conversation.TrajectoryActivityWebSearch:
		return "Web search", nil
	case conversation.TrajectoryActivityImageView:
		return "Image inspection", nil
	case conversation.TrajectoryActivityImageGeneration:
		return "Image generation", nil
	case conversation.TrajectoryActivitySleep:
		return "Wait", nil
	case conversation.TrajectoryActivityHook:
		return "Hook", nil
	case conversation.TrajectoryActivityFileChange:
		return fileChangeSummaryFallback, nil
	case conversation.TrajectoryActivitySubagent:
		return subagentSummaryFallback, nil
	case conversation.TrajectoryActivityOther:
		return "", nil
	default:
		return "", fmt.Errorf("unsupported trajectory activity kind %q", kind)
	}
}

func projectFileChangeProposed(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.FileChangeProposed
	if payload == nil {
		return missingPayload(event)
	}
	nodeID, tracked, err := providerBackedNodeID(
		context,
		context.workstream.fileChangeNodes,
		payload.ProviderItemID,
		SemanticNodeIdentityFileChange,
	)
	if err != nil {
		return err
	}
	_, err = projector.commitNode(context, nodeSpec{
		nodeID: nodeID,
		kind:   SemanticNodeAction,
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
	if !tracked {
		context.workstream.fileChangeNodes[payload.ProviderItemID] = nodeID
	}
	if context.runID != nil {
		context.workstream.pendingFileChangeNode[*context.runID] = nodeID
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
	nodeID, tracked, err := providerBackedNodeID(
		context,
		context.workstream.fileChangeNodes,
		payload.ProviderItemID,
		SemanticNodeIdentityFileChange,
	)
	if err != nil {
		return err
	}
	summary := fileChangeSummary(payload.Changes)
	if payload.Failure != nil {
		summary = firstText(payload.Failure.Message, summary)
	}
	_, err = projector.commitNode(context, nodeSpec{
		nodeID:   nodeID,
		kind:     SemanticNodeAction,
		status:   status,
		actor:    context.actor,
		summary:  summary,
		evidence: EvidenceRuntimeFact,
		chain:    true,
	})
	if err == nil {
		if !tracked {
			context.workstream.fileChangeNodes[payload.ProviderItemID] = nodeID
		}
		if context.runID != nil {
			delete(context.workstream.pendingFileChangeNode, *context.runID)
		}
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
	nodeID, tracked, err := providerBackedNodeID(
		context,
		context.workstream.approvalNodes,
		approval.ID,
		SemanticNodeIdentityApproval,
	)
	if err != nil {
		return err
	}
	_, err = projector.commitNode(context, nodeSpec{
		nodeID:   nodeID,
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
	if !tracked {
		context.workstream.approvalNodes[approval.ID] = nodeID
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
		if fileChangeNodeID, waiting := context.workstream.pendingFileChangeNode[*context.runID]; waiting {
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
	nodeID, exists := context.workstream.approvalNodes[resolution.ApprovalID]
	if !exists {
		return fmt.Errorf("approval %s resolved before it was requested", resolution.ApprovalID)
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
	nodeID, tracked, err := providerBackedNodeID(
		context,
		context.workstream.subagentNodes,
		subagent.ID,
		SemanticNodeIdentitySubagent,
	)
	if err != nil {
		return err
	}
	_, err = projector.commitNode(context, nodeSpec{
		nodeID:   nodeID,
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
	if !tracked {
		context.workstream.subagentNodes[subagent.ID] = nodeID
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
	if projector.artifactIDs[payload.ArtifactID] {
		return fmt.Errorf("artifact %s was emitted more than once", payload.ArtifactID)
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
		delete(projector.artifactIDs, payload.ArtifactID)
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
	runID, err := requireRunID(event)
	if err != nil {
		return err
	}
	switch kind {
	case SemanticNodeBlocked:
		nodeID, err := projector.commitTrackedLifecycleNode(
			context,
			event.ID,
			context.workstream.agentLivenessBlock[runID],
			kind,
			SemanticNodeStatusWaiting,
			summary,
		)
		if err != nil {
			return err
		}
		context.workstream.agentLivenessBlock[runID] = nodeID
		return projector.blockActiveRun(context, nodeID)
	case SemanticNodeRecovery:
		nodeID, err := projector.commitTrackedLifecycleNode(
			context,
			event.ID,
			context.workstream.agentLivenessRecovery[runID],
			kind,
			SemanticNodeStatusActive,
			summary,
		)
		if err != nil {
			return err
		}
		context.workstream.agentLivenessRecovery[runID] = nodeID
		if blocked := context.workstream.agentLivenessBlock[runID]; blocked != "" {
			return projector.addEdge(context, SemanticEdgeRecoveredBy, blocked, context.workstream.id, nodeID)
		}
		return projector.recoverFrom(context, nodeID)
	case SemanticNodeNone:
		if payload.Liveness.Status != conversation.AgentLivenessAttached {
			return nil
		}
		if err := projector.resolveTrackedLifecycleNode(
			context,
			context.workstream.agentLivenessBlock[runID],
			SemanticNodeStatusSucceeded,
			summary,
		); err != nil {
			return err
		}
		if err := projector.resolveTrackedLifecycleNode(
			context,
			context.workstream.agentLivenessRecovery[runID],
			SemanticNodeStatusSucceeded,
			summary,
		); err != nil {
			return err
		}
		delete(context.workstream.agentLivenessBlock, runID)
		delete(context.workstream.agentLivenessRecovery, runID)
		return nil
	default:
		return fmt.Errorf("unsupported agent liveness node kind %q", kind)
	}
}

func projectProviderLifecycleChanged(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.ProviderLifecycleChanged
	if payload == nil {
		return missingPayload(event)
	}
	lifecycle := payload.Lifecycle
	kind, err := NodeKindForProviderLifecycle(lifecycle.Status)
	if err != nil {
		return err
	}
	category, err := providerLifecycleCategory(lifecycle.Reason)
	if err != nil {
		return err
	}
	summary, err := providerLifecycleSummary(lifecycle.Reason)
	if err != nil {
		return err
	}
	if kind == SemanticNodeNone {
		return projector.resolveProviderLifecycleNode(context, category, summary)
	}
	return projector.commitProviderLifecycleNode(context, event.ID, category, kind, summary)
}

func providerLifecycleCategory(reason conversation.ProviderLifecycleReason) (string, error) {
	switch reason {
	case conversation.ProviderLifecycleReasonEnvironmentConnected,
		conversation.ProviderLifecycleReasonEnvironmentDisconnected:
		return "environment", nil
	case conversation.ProviderLifecycleReasonTurnRetrying:
		return "turn_retry", nil
	case conversation.ProviderLifecycleReasonTurnFailed:
		return "turn_failure", nil
	case conversation.ProviderLifecycleReasonSessionFailed,
		conversation.ProviderLifecycleReasonThreadIdle,
		conversation.ProviderLifecycleReasonThreadActive,
		conversation.ProviderLifecycleReasonThreadNotLoaded,
		conversation.ProviderLifecycleReasonThreadSystemError,
		conversation.ProviderLifecycleReasonThreadClosed:
		return "thread", nil
	default:
		return "", fmt.Errorf("unknown provider lifecycle reason %q", reason)
	}
}

func providerLifecycleSummary(reason conversation.ProviderLifecycleReason) (string, error) {
	switch reason {
	case conversation.ProviderLifecycleReasonSessionFailed:
		return "Provider session failed", nil
	case conversation.ProviderLifecycleReasonTurnRetrying:
		return "Provider turn is retrying", nil
	case conversation.ProviderLifecycleReasonTurnFailed:
		return "Provider turn failed", nil
	case conversation.ProviderLifecycleReasonThreadIdle:
		return "Provider thread is idle", nil
	case conversation.ProviderLifecycleReasonThreadActive:
		return "Provider thread is active", nil
	case conversation.ProviderLifecycleReasonThreadNotLoaded:
		return "Provider thread is not loaded", nil
	case conversation.ProviderLifecycleReasonThreadSystemError:
		return "Provider thread reported a system error", nil
	case conversation.ProviderLifecycleReasonThreadClosed:
		return "Provider thread closed", nil
	case conversation.ProviderLifecycleReasonEnvironmentConnected:
		return "Provider environment connected", nil
	case conversation.ProviderLifecycleReasonEnvironmentDisconnected:
		return "Provider environment disconnected", nil
	default:
		return "", fmt.Errorf("unknown provider lifecycle reason %q", reason)
	}
}

func (projector *DirectorGraphProjector) commitProviderLifecycleNode(
	context factContext,
	sourceID string,
	category string,
	kind SemanticNodeKind,
	summary string,
) error {
	status := SemanticNodeStatusWaiting
	if kind == SemanticNodeRecovery {
		status = SemanticNodeStatusActive
	}
	key := providerLifecycleTrackingKey(category, context.runID)
	nodeContext := providerLifecycleNodeContext(context, category)
	nodeID, err := projector.commitTrackedLifecycleNode(
		nodeContext,
		sourceID,
		context.workstream.providerLifecycleNode[key],
		kind,
		status,
		summary,
	)
	if err != nil {
		return err
	}
	context.workstream.providerLifecycleNode[key] = nodeID
	if kind == SemanticNodeBlocked {
		return projector.blockActiveRun(context, nodeID)
	}
	return projector.recoverFrom(context, nodeID)
}

func (projector *DirectorGraphProjector) resolveProviderLifecycleNode(
	context factContext,
	category string,
	summary string,
) error {
	key := providerLifecycleTrackingKey(category, context.runID)
	nodeID := context.workstream.providerLifecycleNode[key]
	if nodeID == "" {
		return nil
	}
	if _, exists := context.workstream.nodeIndex[nodeID]; !exists {
		delete(context.workstream.providerLifecycleNode, key)
		return nil
	}
	nodeContext := providerLifecycleNodeContext(context, category)
	if err := projector.resolveTrackedLifecycleNode(
		nodeContext,
		nodeID,
		SemanticNodeStatusSucceeded,
		summary,
	); err != nil {
		return err
	}
	delete(context.workstream.providerLifecycleNode, key)
	if context.workstream.recoveryAnchor == nodeID {
		context.workstream.recoveryAnchor = ""
	}
	return nil
}

func providerLifecycleNodeContext(context factContext, category string) factContext {
	if category == "turn_retry" || category == "turn_failure" {
		return context
	}
	context.runID = nil
	return context
}

func providerLifecycleTrackingKey(category string, runID *string) string {
	if category != "turn_retry" && category != "turn_failure" {
		return category
	}
	if runID == nil {
		return category
	}
	return category + ":" + *runID
}

func (projector *DirectorGraphProjector) commitTrackedLifecycleNode(
	context factContext,
	sourceID string,
	trackedNodeID string,
	kind SemanticNodeKind,
	status SemanticNodeStatus,
	summary string,
) (string, error) {
	if trackedNodeID != "" {
		if _, exists := context.workstream.nodeIndex[trackedNodeID]; exists {
			return projector.commitNode(context, nodeSpec{
				nodeID:  trackedNodeID,
				status:  status,
				summary: summary,
			})
		}
	}
	return projector.commitNode(context, nodeSpec{
		identity: SemanticNodeIdentityLifecycle,
		sourceID: sourceID,
		kind:     kind,
		status:   status,
		actor:    context.actor,
		summary:  summary,
		evidence: EvidenceRuntimeFact,
		chain:    true,
	})
}

func (projector *DirectorGraphProjector) resolveTrackedLifecycleNode(
	context factContext,
	nodeID string,
	status SemanticNodeStatus,
	summary string,
) error {
	if nodeID == "" {
		return nil
	}
	if _, exists := context.workstream.nodeIndex[nodeID]; !exists {
		return nil
	}
	_, err := projector.commitNode(context, nodeSpec{
		nodeID:  nodeID,
		status:  status,
		summary: summary,
	})
	if err == nil && context.workstream.recoveryAnchor == nodeID {
		context.workstream.recoveryAnchor = ""
	}
	return err
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
	subjectNodeID, err := projector.validationSubject(context, validation.Subject)
	if err != nil {
		return err
	}
	nodeID, tracked, err := providerBackedNodeID(
		context,
		context.workstream.validationNodes,
		validation.ID,
		SemanticNodeIdentityValidation,
	)
	if err != nil {
		return err
	}
	_, err = projector.commitNode(context, nodeSpec{
		nodeID:   nodeID,
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
	if !tracked {
		context.workstream.validationNodes[validation.ID] = nodeID
	}
	return projector.addEdge(
		context,
		SemanticEdgeValidatedBy,
		subjectNodeID,
		context.workstream.id,
		nodeID,
	)
}

// validationSubject names the node the check covers. The provider names the item
// it reviewed when one exists, so the subject is resolved from that typed id
// rather than from whatever node happens to be last; a check over the whole run
// falls back to the run node.
func (projector *DirectorGraphProjector) validationSubject(
	context factContext,
	subject *string,
) (string, error) {
	if subject != nil {
		for _, nodes := range []map[string]string{
			context.workstream.activityNodes,
			context.workstream.fileChangeNodes,
		} {
			nodeID := nodes[*subject]
			if _, exists := context.workstream.nodeIndex[nodeID]; exists {
				return nodeID, nil
			}
		}
		return "", fmt.Errorf("validation subject %q has no projected activity", *subject)
	}
	if context.runID == nil {
		return "", fmt.Errorf("run-wide validation has no run id")
	}
	runNodeID, err := SemanticNodeID(SemanticNodeIdentityRun, *context.runID)
	if err != nil {
		return "", err
	}
	if _, exists := context.workstream.nodeIndex[runNodeID]; !exists {
		return "", fmt.Errorf("run-wide validation references unknown run node %q", runNodeID)
	}
	return runNodeID, nil
}

// providerBackedNodeID keeps execution metadata behind the projector boundary.
// A provider id may address a later update locally, but the graph id itself is
// derived from the first durable Setta event that makes the node visible.
func providerBackedNodeID(
	context factContext,
	nodes map[string]string,
	providerID string,
	identity SemanticNodeIdentity,
) (string, bool, error) {
	if nodeID, tracked := nodes[providerID]; tracked {
		return nodeID, true, nil
	}
	nodeID, err := SemanticNodeID(identity, context.eventID)
	return nodeID, false, err
}

func projectModelRerouted(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.ModelRerouted
	if payload == nil {
		return missingPayload(event)
	}
	// The typed reroute reason owns the meaning. Risk is never inferred from the
	// surrounding text.
	summary, err := modelRerouteSummary(payload.Reroute)
	if err != nil {
		return err
	}
	return projector.commitLifecycleNode(context, event.ID, SemanticNodeRecovery, summary)
}

func modelRerouteSummary(reroute conversation.InvocationModelReroute) (string, error) {
	switch reroute.Reason {
	case conversation.InvocationModelRerouteReasonHighRiskCyberActivity:
		return fmt.Sprintf(
			"Model rerouted from %s to %s for high-risk cyber activity",
			reroute.FromModelID,
			reroute.ToModelID,
		), nil
	default:
		return "", fmt.Errorf("unsupported model-reroute reason %q", reroute.Reason)
	}
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
