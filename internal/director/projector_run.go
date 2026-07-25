package director

import (
	"fmt"
	"strconv"

	"setta/internal/conversation"
)

// Run, plan, and public-text projection.
//
// Queue and run progress advance one durable run node rather than adding a node
// per lifecycle step, so a busy run reads as one piece of work instead of a
// chain of near-duplicates.

const (
	queuedRunSummary    = "Queued run"
	activeRunSummary    = "Active run"
	completedRunSummary = "Run completed"
	failedRunSummary    = "Run failed"
	cancelledRunSummary = "Run cancelled"
	planSummaryFallback = "Plan updated"
	planStepFallback    = "Plan step"
)

type runFinalResponse struct {
	eventID string
	text    string
}

type trajectoryHandler func(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error

// trajectoryHandlers is total over the durable trajectory catalog: a kind with
// no handler fails loudly rather than projecting nothing.
var trajectoryHandlers = map[conversation.TrajectoryEventKind]trajectoryHandler{
	conversation.TrajectoryEventUserInputAccepted:     projectUserInputAccepted,
	conversation.TrajectoryEventTurnQueued:            projectTurnQueued,
	conversation.TrajectoryEventTurnPromoted:          projectTurnPromoted,
	conversation.TrajectoryEventTurnStarted:           projectTurnStarted,
	conversation.TrajectoryEventTurnSteered:           projectTurnSteered,
	conversation.TrajectoryEventTurnInterrupted:       projectTurnInterrupted,
	conversation.TrajectoryEventTurnCompleted:         projectTurnCompleted,
	conversation.TrajectoryEventTurnFailed:            projectTurnFailed,
	conversation.TrajectoryEventPlanChanged:           projectPlanChanged,
	conversation.TrajectoryEventAgentMessageCompleted: projectAgentMessageCompleted,
	// Streaming public text and public reasoning summaries are detail surfaces.
	// They update the transcript the user reads; they never create, rename, or
	// advance a semantic node.
	conversation.TrajectoryEventAgentPublicTextDelta:          projectDetailSurfaceOnly,
	conversation.TrajectoryEventPublicReasoningSummaryUpdated: projectDetailSurfaceOnly,
	conversation.TrajectoryEventActivityStarted:               projectActivityStarted,
	conversation.TrajectoryEventActivityProgressed:            projectActivityProgressed,
	conversation.TrajectoryEventActivityCompleted:             projectActivityCompleted,
	conversation.TrajectoryEventActivityFailed:                projectActivityFailed,
	conversation.TrajectoryEventFileChangeProposed:            projectFileChangeProposed,
	conversation.TrajectoryEventFileChangeCompleted:           projectFileChangeCompleted,
	conversation.TrajectoryEventApprovalRequested:             projectApprovalRequested,
	conversation.TrajectoryEventApprovalResolved:              projectApprovalResolved,
	conversation.TrajectoryEventSubagentStarted:               projectSubagentStarted,
	conversation.TrajectoryEventSubagentUpdated:               projectSubagentUpdated,
	conversation.TrajectoryEventSubagentCompleted:             projectSubagentCompleted,
	conversation.TrajectoryEventArtifactEmitted:               projectArtifactEmitted,
	conversation.TrajectoryEventAgentLivenessChanged:          projectAgentLivenessChanged,
	conversation.TrajectoryEventProviderLifecycleChanged:      projectProviderLifecycleChanged,
	conversation.TrajectoryEventValidationRecorded:            projectProviderValidationRecorded,
	conversation.TrajectoryEventModelRerouted:                 projectModelRerouted,
}

func projectDetailSurfaceOnly(_ *DirectorGraphProjector, _ factContext, _ conversation.TrajectoryEvent) error {
	return nil
}

func projectUserInputAccepted(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.UserInputAccepted
	if payload == nil {
		return missingPayload(event)
	}
	nodeID, err := projector.commitNode(context, nodeSpec{
		identity: SemanticNodeIdentityInput,
		sourceID: event.ID,
		kind:     SemanticNodeUserGoal,
		status:   SemanticNodeStatusActive,
		actor:    SemanticActorUser,
		summary:  payload.Input.Text,
		evidence: EvidenceRuntimeFact,
		chain:    true,
	})
	if err != nil {
		return err
	}
	if context.runID != nil {
		context.workstream.goalNodes[*context.runID] = nodeID
		context.workstream.runInputs[*context.runID] = payload.Input.Text
	}
	return nil
}

func projectTurnQueued(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	if event.TurnQueued == nil {
		return missingPayload(event)
	}
	runID, err := requireRunID(event)
	if err != nil {
		return err
	}
	blockedBehind := lastOpenRunNodeID(context.workstream, runID)
	nodeID, err := projector.commitRunNode(context, runID, SemanticNodeStatusPending, queuedRunSummary)
	if err != nil {
		return err
	}
	if err := projector.addEdge(context, SemanticEdgeDependsOn, nodeID, context.workstream.id, blockedBehind); err != nil {
		return err
	}
	return projector.resolveDelegation(context, nodeID)
}

func projectTurnPromoted(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	if event.TurnPromoted == nil {
		return missingPayload(event)
	}
	runID, err := requireRunID(event)
	if err != nil {
		return err
	}
	if err := requireRunNodeStatus(context.workstream, runID, SemanticNodeStatusPending); err != nil {
		return fmt.Errorf("promote run %s: %w", runID, err)
	}
	_, err = projector.commitRunNode(context, runID, SemanticNodeStatusActive, activeRunSummary)
	return err
}

func projectTurnStarted(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	if event.TurnStarted == nil {
		return missingPayload(event)
	}
	runID, err := requireRunID(event)
	if err != nil {
		return err
	}
	nodeID, err := projector.commitRunNode(context, runID, SemanticNodeStatusActive, activeRunSummary)
	if err != nil {
		return err
	}
	return projector.resolveDelegation(context, nodeID)
}

func projectTurnSteered(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.TurnSteered
	if payload == nil {
		return missingPayload(event)
	}
	runID, err := requireRunID(event)
	if err != nil {
		return err
	}
	if err := requireRunNodeStatus(context.workstream, runID, SemanticNodeStatusActive); err != nil {
		return fmt.Errorf("steer run %s: %w", runID, err)
	}
	// Steering keeps one run node and records the new instruction on it, so the
	// user sees what changed without the run appearing to restart.
	context.workstream.runInputs[runID] = payload.Input.Text
	_, err = projector.commitRunNode(context, runID, SemanticNodeStatusActive, payload.Input.Text)
	return err
}

func requireRunNodeStatus(
	workstream *projectedWorkstream,
	runID string,
	status SemanticNodeStatus,
) error {
	nodeID, err := SemanticNodeID(SemanticNodeIdentityRun, runID)
	if err != nil {
		return err
	}
	index, exists := workstream.nodeIndex[nodeID]
	if !exists {
		return fmt.Errorf("run node %s does not exist", nodeID)
	}
	if workstream.nodes[index].Status != status {
		return fmt.Errorf(
			"run node %s has status %q, want %q",
			nodeID,
			workstream.nodes[index].Status,
			status,
		)
	}
	return nil
}

func projectTurnInterrupted(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.TurnInterrupted
	if payload == nil {
		return missingPayload(event)
	}
	// The conversation owns two durable moments with this event kind: the user's
	// accepted control request and the later provider/system terminal outcome.
	// Only the latter proves the run stopped. Closing the graph on the request
	// would disagree with the still-running conversation and reject the valid
	// terminal event during cold replay.
	if event.Actor == conversation.TrajectoryActorUser {
		return nil
	}
	summary := fmt.Sprintf("%s (%s)", cancelledRunSummary, payload.Reason)
	return projector.closeRun(
		context,
		event,
		SemanticNodeCancelled,
		SemanticNodeStatusCancelled,
		summary,
		"",
	)
}

func projectTurnCompleted(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	if event.TurnCompleted == nil {
		return missingPayload(event)
	}
	runID, err := requireRunID(event)
	if err != nil {
		return err
	}
	finalResponse := context.workstream.runFinalResponses[runID]
	return projector.closeRun(
		context,
		event,
		SemanticNodeCompleted,
		SemanticNodeStatusSucceeded,
		firstText(finalResponse.text, completedRunSummary),
		finalResponse.eventID,
	)
}

func projectTurnFailed(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.TurnFailed
	if payload == nil {
		return missingPayload(event)
	}
	// The public failure message is the only failure text that becomes graph
	// truth. The diagnostic reference stays behind the detail surfaces.
	summary := firstText(payload.Failure.Message, failedRunSummary)
	return projector.closeRun(context, event, SemanticNodeFailed, SemanticNodeStatusFailed, summary, "")
}

// closeRun ends the run node, adds the terminal node that closes the causal
// chain, and carries the run's artifacts onto it.
func (projector *DirectorGraphProjector) closeRun(
	context factContext,
	event conversation.TrajectoryEvent,
	kind SemanticNodeKind,
	status SemanticNodeStatus,
	summary string,
	summaryEventID string,
) error {
	runID, err := requireRunID(event)
	if err != nil {
		return err
	}
	terminalNodeID, err := SemanticNodeID(SemanticNodeIdentityRunTerminal, runID)
	if err != nil {
		return err
	}
	if _, terminal := context.workstream.nodeIndex[terminalNodeID]; terminal {
		return fmt.Errorf("run %s already has a terminal fact", runID)
	}
	if _, err := projector.commitRunNode(context, runID, status, summary); err != nil {
		return err
	}
	if err := projector.closeRunGoal(context, runID, status, kind); err != nil {
		return err
	}
	if err := projector.finalizeRunLifecycleNodes(context, runID, status); err != nil {
		return err
	}
	if err := projector.finalizeUnfinishedRunNodes(context, runID, status); err != nil {
		return err
	}
	terminalNodeID, err = projector.commitNode(context, nodeSpec{
		identity:            SemanticNodeIdentityRunTerminal,
		sourceID:            runID,
		kind:                kind,
		status:              status,
		actor:               context.actor,
		summary:             summary,
		evidence:            EvidenceRuntimeFact,
		artifactIDs:         context.workstream.runArtifacts[runID],
		extraSourceEventIDs: optionalSourceEventID(summaryEventID),
		chain:               true,
	})
	if err != nil {
		return err
	}
	projector.nodeBySourceEvent[event.ID] = terminalNodeID
	delete(context.workstream.runInputs, runID)
	delete(context.workstream.runFinalResponses, runID)
	projector.clearSucceededRunRecoveryAnchor(context.workstream, runID, status)
	return nil
}

// finalizeUnfinishedRunNodes prevents a terminal run from leaving declared
// work visibly active. A missing item-level terminal fact never becomes fake
// success: unfinished approvals and resources are cancelled, recovery state
// follows the run outcome, and other work fails or is cancelled with the run.
func (projector *DirectorGraphProjector) finalizeUnfinishedRunNodes(
	context factContext,
	runID string,
	runStatus SemanticNodeStatus,
) error {
	nodeIDs := make([]string, 0)
	for _, node := range context.workstream.nodes {
		if node.RunID == nil ||
			*node.RunID != runID ||
			IsTerminalSemanticNodeStatus(node.Status) {
			continue
		}
		nodeIDs = append(nodeIDs, node.ID)
	}
	for _, nodeID := range nodeIDs {
		index, exists := context.workstream.nodeIndex[nodeID]
		if !exists {
			continue
		}
		node := context.workstream.nodes[index]
		status := unfinishedRunNodeStatus(node.Kind, runStatus)
		if _, err := projector.commitNode(context, nodeSpec{
			nodeID: nodeID,
			status: status,
		}); err != nil {
			return fmt.Errorf("finalize unfinished run node %s: %w", nodeID, err)
		}
	}
	return nil
}

func unfinishedRunNodeStatus(
	kind SemanticNodeKind,
	runStatus SemanticNodeStatus,
) SemanticNodeStatus {
	switch kind {
	case SemanticNodeApprovalRequired, SemanticNodeResourceRequired:
		return SemanticNodeStatusCancelled
	case SemanticNodeRetry, SemanticNodeRecovery:
		if runStatus == SemanticNodeStatusSucceeded {
			return SemanticNodeStatusSucceeded
		}
		return SemanticNodeStatusFailed
	case SemanticNodeBlocked:
		return runStatus
	default:
		if runStatus == SemanticNodeStatusFailed {
			return SemanticNodeStatusFailed
		}
		return SemanticNodeStatusCancelled
	}
}

func (projector *DirectorGraphProjector) clearSucceededRunRecoveryAnchor(
	workstream *projectedWorkstream,
	runID string,
	runStatus SemanticNodeStatus,
) {
	if runStatus != SemanticNodeStatusSucceeded || workstream.recoveryAnchor == "" {
		return
	}
	index, exists := workstream.nodeIndex[workstream.recoveryAnchor]
	if !exists {
		workstream.recoveryAnchor = ""
		return
	}
	anchorRunID := workstream.nodes[index].RunID
	if anchorRunID != nil && *anchorRunID == runID {
		workstream.recoveryAnchor = ""
	}
}

func (projector *DirectorGraphProjector) finalizeRunLifecycleNodes(
	context factContext,
	runID string,
	runStatus SemanticNodeStatus,
) error {
	blockedStatus := runStatus
	if blockedStatus != SemanticNodeStatusSucceeded &&
		blockedStatus != SemanticNodeStatusFailed &&
		blockedStatus != SemanticNodeStatusCancelled {
		return fmt.Errorf("run %s closed with nonterminal semantic status %q", runID, runStatus)
	}
	recoveryStatus := SemanticNodeStatusSucceeded
	if runStatus != SemanticNodeStatusSucceeded {
		recoveryStatus = SemanticNodeStatusFailed
	}
	for _, tracked := range []struct {
		nodeID string
		status SemanticNodeStatus
	}{
		{nodeID: context.workstream.agentLivenessBlock[runID], status: blockedStatus},
		{nodeID: context.workstream.agentLivenessRecovery[runID], status: recoveryStatus},
		{
			nodeID: context.workstream.providerLifecycleNode[providerLifecycleTrackingKey("turn_retry", &runID)],
			status: recoveryStatus,
		},
		{
			nodeID: context.workstream.providerLifecycleNode[providerLifecycleTrackingKey("turn_failure", &runID)],
			status: blockedStatus,
		},
	} {
		if err := projector.resolveTrackedLifecycleNode(context, tracked.nodeID, tracked.status, ""); err != nil {
			return err
		}
	}
	delete(context.workstream.agentLivenessBlock, runID)
	delete(context.workstream.agentLivenessRecovery, runID)
	delete(
		context.workstream.providerLifecycleNode,
		providerLifecycleTrackingKey("turn_retry", &runID),
	)
	delete(
		context.workstream.providerLifecycleNode,
		providerLifecycleTrackingKey("turn_failure", &runID),
	)
	return nil
}

// closeRunGoal ends the user goal with the run it started, so a goal never sits
// active after the work that served it finished.
func (projector *DirectorGraphProjector) closeRunGoal(
	context factContext,
	runID string,
	status SemanticNodeStatus,
	kind SemanticNodeKind,
) error {
	goalNodeID, tracked := context.workstream.goalNodes[runID]
	if !tracked {
		return nil
	}
	_, err := projector.commitNode(context, nodeSpec{
		nodeID:   goalNodeID,
		kind:     SemanticNodeUserGoal,
		status:   status,
		actor:    SemanticActorUser,
		evidence: EvidenceRuntimeFact,
		runID:    &runID,
	})
	if err != nil {
		return fmt.Errorf("closing user goal for %s run %s: %w", kind, runID, err)
	}
	delete(context.workstream.goalNodes, runID)
	return nil
}

// commitRunNode advances the single durable run node. The run keeps the input
// that created it as its label whenever the projection saw that input.
func (projector *DirectorGraphProjector) commitRunNode(
	context factContext,
	runID string,
	status SemanticNodeStatus,
	fallbackSummary string,
) (string, error) {
	summary := firstText(context.workstream.runInputs[runID], fallbackSummary)
	nodeID, err := projector.commitNode(context, nodeSpec{
		identity: SemanticNodeIdentityRun,
		sourceID: runID,
		kind:     SemanticNodeAction,
		status:   status,
		actor:    context.actor,
		summary:  summary,
		evidence: EvidenceRuntimeFact,
		runID:    &runID,
		chain:    true,
	})
	if err != nil {
		return "", err
	}
	context.workstream.trackRunNode(nodeID, status)
	return nodeID, nil
}

// trackRunNode keeps the ordered list of runs that have not reached a terminal
// state, which is how queued work finds the run it depends on.
func (workstream *projectedWorkstream) trackRunNode(nodeID string, status SemanticNodeStatus) {
	if IsTerminalSemanticNodeStatus(status) {
		remaining := workstream.openRunNodeIDs[:0]
		for _, open := range workstream.openRunNodeIDs {
			if open != nodeID {
				remaining = append(remaining, open)
			}
		}
		workstream.openRunNodeIDs = remaining
		return
	}
	for _, open := range workstream.openRunNodeIDs {
		if open == nodeID {
			return
		}
	}
	workstream.openRunNodeIDs = append(workstream.openRunNodeIDs, nodeID)
}

func lastOpenRunNodeID(workstream *projectedWorkstream, runID string) string {
	for index := len(workstream.openRunNodeIDs) - 1; index >= 0; index-- {
		candidate := workstream.openRunNodeIDs[index]
		if candidate != workstream.lastRunNodeID[runID] {
			return candidate
		}
	}
	return ""
}

func projectAgentMessageCompleted(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.AgentMessageCompleted
	if payload == nil {
		return missingPayload(event)
	}
	runID, err := requireRunID(event)
	if err != nil {
		return err
	}
	// A completed assistant message is the outcome text, not a replacement for
	// either the user's goal or the action that carried it out. Hold it until
	// the typed turn-completed fact authorizes a terminal outcome node.
	context.workstream.runFinalResponses[runID] = runFinalResponse{
		eventID: event.ID,
		text:    payload.Text,
	}
	return nil
}

func optionalSourceEventID(eventID string) []string {
	if eventID == "" {
		return nil
	}
	return []string{eventID}
}

func projectPlanChanged(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.PlanChanged
	if payload == nil {
		return missingPayload(event)
	}
	runID, err := requireRunID(event)
	if err != nil {
		return err
	}
	summary := firstText(optionalText(payload.Explanation), planSummaryFallback)
	status := planStatus(payload.Steps)
	planNodeID, err := SemanticNodeID(SemanticNodeIdentityPlan, runID)
	if err != nil {
		return err
	}
	if index, exists := context.workstream.nodeIndex[planNodeID]; exists &&
		IsTerminalSemanticNodeStatus(context.workstream.nodes[index].Status) {
		// A later plan after a terminal plan is a replacement, usually after
		// steering or a newly declared terminal plan. Retire the old live
		// projection instead of resurrecting its terminal node and rewriting
		// its provenance.
		projector.retirePlanSteps(context.workstream, runID)
		projector.dropNodes(context.workstream, map[string]bool{planNodeID: true})
	}
	planNodeID, err = projector.commitNode(context, nodeSpec{
		identity: SemanticNodeIdentityPlan,
		sourceID: runID,
		kind:     SemanticNodePlan,
		status:   status,
		actor:    context.actor,
		summary:  summary,
		evidence: EvidenceStructuredDeclaration,
		chain:    true,
	})
	if err != nil {
		return err
	}
	projector.retirePlanSteps(context.workstream, runID)
	return projector.commitPlanSteps(context, event, runID, planNodeID)
}

// retirePlanSteps drops the step nodes of a superseded plan out of the live
// window. Provider plan steps carry no stable identity, so a new plan is a new
// set of steps; the durable events that produced the old ones are untouched.
func (projector *DirectorGraphProjector) retirePlanSteps(workstream *projectedWorkstream, runID string) {
	retired := workstream.planStepNodes[runID]
	if len(retired) == 0 {
		return
	}
	dropped := make(map[string]bool, len(retired))
	for _, nodeID := range retired {
		dropped[nodeID] = true
	}
	projector.dropNodes(workstream, dropped)
	delete(workstream.planStepNodes, runID)
}

// dropNodes removes nodes from the live window and repairs everything that
// pointed at them, so a compacted projection can never keep an edge or a chain
// anchored to a node the renderer will not receive.
func (projector *DirectorGraphProjector) dropNodes(workstream *projectedWorkstream, dropped map[string]bool) {
	remainingNodes := make([]SemanticNode, 0, len(workstream.nodes))
	for _, node := range workstream.nodes {
		if dropped[node.ID] {
			workstream.removedNodeOrder = append(workstream.removedNodeOrder, node.ID)
			continue
		}
		remainingNodes = append(remainingNodes, node)
	}
	workstream.nodes = remainingNodes
	workstream.nodeIndex = make(map[string]int, len(workstream.nodes))
	for index, node := range workstream.nodes {
		workstream.nodeIndex[node.ID] = index
	}
	workstream.markNodesRemoved(dropped)
	workstream.dropEdgesTouching(dropped)
	workstream.repairAnchors(dropped)
	for eventID, nodeID := range projector.nodeBySourceEvent {
		if dropped[nodeID] {
			delete(projector.nodeBySourceEvent, eventID)
		}
	}
}

func (workstream *projectedWorkstream) dropEdgesTouching(dropped map[string]bool) {
	remaining := make([]SemanticEdge, 0, len(workstream.edges))
	index := make(map[string]bool, len(workstream.edges))
	droppedEdges := map[string]bool{}
	for _, edge := range workstream.edges {
		if dropped[edge.FromNodeID] || dropped[edge.ToNodeID] {
			droppedEdges[edge.ID] = true
			continue
		}
		remaining = append(remaining, edge)
		index[edge.ID] = true
	}
	workstream.edges = remaining
	workstream.edgeIndex = index
	workstream.markEdgesDropped(droppedEdges)
}

func (workstream *projectedWorkstream) repairAnchors(dropped map[string]bool) {
	if dropped[workstream.lastNodeID] {
		workstream.lastNodeID = ""
		if len(workstream.nodes) > 0 {
			workstream.lastNodeID = workstream.nodes[len(workstream.nodes)-1].ID
		}
	}
	for runID, nodeID := range workstream.lastRunNodeID {
		if dropped[nodeID] {
			delete(workstream.lastRunNodeID, runID)
		}
	}
	if dropped[workstream.recoveryAnchor] {
		workstream.recoveryAnchor = ""
	}
	remainingOpen := workstream.openRunNodeIDs[:0]
	for _, nodeID := range workstream.openRunNodeIDs {
		if !dropped[nodeID] {
			remainingOpen = append(remainingOpen, nodeID)
		}
	}
	workstream.openRunNodeIDs = remainingOpen
}

func (projector *DirectorGraphProjector) commitPlanSteps(
	context factContext,
	event conversation.TrajectoryEvent,
	runID string,
	planNodeID string,
) error {
	stepNodeIDs := make([]string, 0, len(event.PlanChanged.Steps))
	previousStepID := ""
	for index, step := range event.PlanChanged.Steps {
		stepNodeID, err := PlanStepNodeID(event.ID, index)
		if err != nil {
			return err
		}
		status, err := SemanticNodeStatusForPlanStep(step.Status)
		if err != nil {
			return err
		}
		if _, err := projector.commitNode(context, nodeSpec{
			nodeID:   stepNodeID,
			kind:     SemanticNodeMilestone,
			status:   status,
			actor:    context.actor,
			summary:  firstText(step.Text, planStepFallback+" "+strconv.Itoa(index+1)),
			evidence: EvidenceStructuredDeclaration,
		}); err != nil {
			return err
		}
		if err := projector.addEdge(context, SemanticEdgeDependsOn, planNodeID, context.workstream.id, stepNodeID); err != nil {
			return err
		}
		if err := projector.addEdge(context, SemanticEdgeFollowedBy, previousStepID, context.workstream.id, stepNodeID); err != nil {
			return err
		}
		previousStepID = stepNodeID
		stepNodeIDs = append(stepNodeIDs, stepNodeID)
	}
	context.workstream.planStepNodes[runID] = stepNodeIDs
	return nil
}

func planStatus(steps []conversation.PlanStep) SemanticNodeStatus {
	for _, step := range steps {
		if step.Status != conversation.PlanStepStatusCompleted {
			return SemanticNodeStatusActive
		}
	}
	if len(steps) == 0 {
		return SemanticNodeStatusActive
	}
	return SemanticNodeStatusSucceeded
}

func requireRunID(event conversation.TrajectoryEvent) (string, error) {
	if event.TurnID == nil {
		return "", fmt.Errorf("trajectory event %s of kind %q requires a run id", event.ID, event.Kind)
	}
	return *event.TurnID, nil
}

func missingPayload(event conversation.TrajectoryEvent) error {
	return fmt.Errorf("trajectory event %s of kind %q has no payload", event.ID, event.Kind)
}

func optionalText(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}
