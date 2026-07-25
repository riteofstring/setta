package director

import (
	"fmt"

	"setta/internal/conversation"

	"strconv"
)

// Run, plan, and public-text projection.
//
// Queue and run progress advance one durable run node rather than adding a node
// per lifecycle step, so a busy run reads as one piece of work instead of a
// chain of near-duplicates.

const (
	queuedRunSummary      = "Queued run"
	activeRunSummary      = "Active run"
	completedRunSummary   = "Run completed"
	failedRunSummary      = "Run failed"
	cancelledRunSummary   = "Run cancelled"
	planSummaryFallback   = "Plan updated"
	planStepFallback      = "Plan step"
	rerouteSummaryPattern = "Model rerouted from %s to %s"
)

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
		context.workstream.runSummaries[*context.runID] = payload.Input.Text
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
	// Steering keeps one run node and records the new instruction on it, so the
	// user sees what changed without the run appearing to restart.
	context.workstream.runSummaries[runID] = payload.Input.Text
	_, err = projector.commitRunNode(context, runID, SemanticNodeStatusActive, payload.Input.Text)
	return err
}

func projectTurnInterrupted(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.TurnInterrupted
	if payload == nil {
		return missingPayload(event)
	}
	summary := fmt.Sprintf("%s (%s)", cancelledRunSummary, payload.Reason)
	return projector.closeRun(context, event, SemanticNodeCancelled, SemanticNodeStatusCancelled, summary)
}

func projectTurnCompleted(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	if event.TurnCompleted == nil {
		return missingPayload(event)
	}
	return projector.closeRun(context, event, SemanticNodeCompleted, SemanticNodeStatusSucceeded, completedRunSummary)
}

func projectTurnFailed(projector *DirectorGraphProjector, context factContext, event conversation.TrajectoryEvent) error {
	payload := event.TurnFailed
	if payload == nil {
		return missingPayload(event)
	}
	// The public failure message is the only failure text that becomes graph
	// truth. The diagnostic reference stays behind the detail surfaces.
	summary := firstText(payload.Failure.Message, failedRunSummary)
	return projector.closeRun(context, event, SemanticNodeFailed, SemanticNodeStatusFailed, summary)
}

// closeRun ends the run node, adds the terminal node that closes the causal
// chain, and carries the run's artifacts onto it.
func (projector *DirectorGraphProjector) closeRun(
	context factContext,
	event conversation.TrajectoryEvent,
	kind SemanticNodeKind,
	status SemanticNodeStatus,
	summary string,
) error {
	runID, err := requireRunID(event)
	if err != nil {
		return err
	}
	if _, err := projector.commitRunNode(context, runID, status, summary); err != nil {
		return err
	}
	if _, err := projector.commitNode(context, nodeSpec{
		identity:    SemanticNodeIdentityRunTerminal,
		sourceID:    runID,
		kind:        kind,
		status:      status,
		actor:       context.actor,
		summary:     summary,
		evidence:    EvidenceRuntimeFact,
		artifactIDs: context.workstream.runArtifacts[runID],
		chain:       true,
	}); err != nil {
		return err
	}
	return projector.closeRunGoal(context, runID, status, kind)
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
	delete(context.workstream.goalNodes, runID)
	summary := context.workstream.runSummaries[runID]
	_, err := projector.commitNode(context, nodeSpec{
		nodeID:   goalNodeID,
		kind:     SemanticNodeUserGoal,
		status:   status,
		actor:    SemanticActorUser,
		summary:  summary,
		evidence: EvidenceRuntimeFact,
		runID:    &runID,
	})
	if err != nil {
		return fmt.Errorf("closing user goal for %s run %s: %w", kind, runID, err)
	}
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
	summary := firstText(context.workstream.runSummaries[runID], fallbackSummary)
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
	context.workstream.runSummaries[runID] = payload.Text
	nodeID, err := SemanticNodeID(SemanticNodeIdentityRun, runID)
	if err != nil {
		return err
	}
	index, exists := context.workstream.nodeIndex[nodeID]
	if !exists {
		// The run node lives outside this projection window. The completed
		// message still owns the final-answer surface; it never invents a node.
		return nil
	}
	_, err = projector.commitNode(context, nodeSpec{
		nodeID:  nodeID,
		status:  context.workstream.nodes[index].Status,
		summary: payload.Text,
		runID:   &runID,
	})
	return err
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
	planNodeID, err := projector.commitNode(context, nodeSpec{
		identity: SemanticNodeIdentityPlan,
		sourceID: runID,
		kind:     SemanticNodePlan,
		status:   planStatus(payload.Steps),
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
		if !dropped[node.ID] {
			remainingNodes = append(remainingNodes, node)
		}
	}
	workstream.nodes = remainingNodes
	workstream.nodeIndex = make(map[string]int, len(workstream.nodes))
	for index, node := range workstream.nodes {
		workstream.nodeIndex[node.ID] = index
	}
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
	for _, edge := range workstream.edges {
		if dropped[edge.FromNodeID] || dropped[edge.ToNodeID] {
			continue
		}
		remaining = append(remaining, edge)
		index[edge.ID] = true
	}
	workstream.edges = remaining
	workstream.edgeIndex = index
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
