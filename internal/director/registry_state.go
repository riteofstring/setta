package director

import (
	"fmt"

	"setta/internal/conversation"
)

// The app-scoped registry state.
//
// Pane identity is no longer the owner of conversational work: a workstream is,
// and this is the fold that produces one. Every field here is derived from the
// durable log — conversation records the store already owns, plus the Director
// facts only the app can own — so restarting the app and replaying the log
// reproduces exactly this state.
//
// Status is computed from those inputs rather than claimed. The workstream
// lifecycle table validates a transition a caller asserts; a projection has
// nothing to assert, because its status is a function of what is durably true
// right now.

// registryWorkstream is one registry row plus the inputs its public record is
// derived from.
type registryWorkstream struct {
	record         Workstream
	conversationID string
	// projected reports that the workstream is registered in the graph
	// projector. Registration is deferred until the workstream produces its
	// first graph fact, because a fork's parentage is committed after the
	// conversation record that names it.
	projected           bool
	archived            bool
	activeRunID         *string
	queuedRunCount      int
	lastTerminalRun     conversation.TurnStatus
	unresolvedApprovals map[string]bool
	unresolvedResources map[string]bool
	// blockedNodes are the workstream's unresolved blocked graph nodes. The
	// projector already decides which typed liveness and provider lifecycle
	// facts are blocking, so the registry reads that decision instead of
	// repeating it.
	blockedNodes map[string]bool
	artifactIDs  []string
	// forkPoints are the completed runs this workstream offers as fork
	// origins, oldest first. Only a completed run can carry its history into a
	// fork, so a running or failed one is not a fork point.
	forkPoints []DecisionForkPoint
	// recoverableFailures are the durable run failures nothing has recovered
	// yet, oldest first. They are what makes recover_path an authorized
	// decision, so a workstream that never failed cannot be asked to recover.
	recoverableFailures []DecisionRecoverableFailure
}

// registryState is the whole app-scoped fold.
type registryState struct {
	projector         *DirectorGraphProjector
	projectorSequence int
	workstreams       map[string]*registryWorkstream
	order             []string
	byConversation    map[string]string
	approvals         map[string]*ApprovalRequest
	approvalOrder     []string
	resources         map[string]*ResourceRequest
	resourceOrder     []string
	artifacts         map[string]*WorkstreamArtifact
	artifactOrder     []string
	selected          *string
	aggregates        DirectorAggregates
	lastEventAt       *string
	cursor            conversation.CommittedEventCursor
	// decisions is the recent committed-decision history, oldest first. It is
	// bounded here rather than at materialization, because the Director only
	// ever receives the most recent few as continuity context.
	decisions []DecisionSummary
	// clarification is the question the Director is waiting on, if any. The
	// next committed decision supersedes it, because that decision is what the
	// user's answer produced.
	clarification *DecisionClarificationContext
}

func newRegistryState() *registryState {
	return &registryState{
		projector:      NewDirectorGraphProjector(),
		workstreams:    map[string]*registryWorkstream{},
		byConversation: map[string]string{},
		approvals:      map[string]*ApprovalRequest{},
		resources:      map[string]*ResourceRequest{},
		artifacts:      map[string]*WorkstreamArtifact{},
	}
}

func newRegistryWorkstream(record Workstream, conversationID string) *registryWorkstream {
	return &registryWorkstream{
		record:              record,
		conversationID:      conversationID,
		unresolvedApprovals: map[string]bool{},
		unresolvedResources: map[string]bool{},
		blockedNodes:        map[string]bool{},
	}
}

// deriveStatus answers the only question a background workstream renders: does
// this need me? Blockers rank above progress, and progress ranks above the last
// outcome, because an outcome the user cannot act on is the least useful thing
// the row could say.
func (workstream *registryWorkstream) deriveStatus() WorkstreamStatus {
	switch {
	case len(workstream.unresolvedResources) > 0:
		return WorkstreamStatusAwaitingResource
	case len(workstream.unresolvedApprovals) > 0 && workstream.activeRunID != nil:
		return WorkstreamStatusAwaitingApproval
	case len(workstream.unresolvedApprovals) > 0 || len(workstream.blockedNodes) > 0:
		return WorkstreamStatusBlocked
	case workstream.activeRunID != nil:
		return WorkstreamStatusRunning
	case workstream.queuedRunCount > 0:
		return WorkstreamStatusQueued
	case workstream.archived:
		return WorkstreamStatusArchived
	case workstream.lastTerminalRun == conversation.TurnStatusFailed:
		return WorkstreamStatusFailed
	case workstream.lastTerminalRun == conversation.TurnStatusCompleted:
		return WorkstreamStatusCompleted
	default:
		return WorkstreamStatusIdle
	}
}

// refreshWorkstream rebuilds one public record from its inputs and keeps the
// app-wide aggregates in step. The record is validated here so an impossible row
// fails where it was derived rather than at the snapshot boundary.
func (state *registryState) refreshWorkstream(workstream *registryWorkstream, at string) error {
	previous := workstream.record
	next := previous
	next.Status = workstream.deriveStatus()
	next.ActiveRunID = copyOptionalString(workstream.activeRunID)
	next.QueuedRunCount = workstream.queuedRunCount
	next.UnresolvedApprovalCount = len(workstream.unresolvedApprovals)
	next.UnresolvedResourceRequestCount = len(workstream.unresolvedResources)
	next.ArtifactCount = len(workstream.artifactIDs)
	next.UpdatedAt = laterTimestamp(previous.UpdatedAt, at)
	if milestone, found := state.projector.MilestoneFor(next.ID); found {
		next.UpdatedAt = laterTimestamp(next.UpdatedAt, milestone.OccurredAt)
		next.LastMilestone = &milestone
	}
	if err := ValidateWorkstream(next); err != nil {
		return err
	}
	state.applyAggregateDelta(previous, -1)
	state.applyAggregateDelta(next, 1)
	workstream.record = next
	return nil
}

// registerWorkstreamRecord admits a conversation to the registry. Conversation
// identity is the execution substrate; the workstream id is the app-scoped
// identity the renderer receives.
func (state *registryState) registerWorkstreamRecord(record Workstream) (*registryWorkstream, error) {
	if _, exists := state.workstreams[record.ID]; exists {
		return nil, fmt.Errorf("workstream %s is already registered", record.ID)
	}
	if owner, bound := state.byConversation[record.ConversationID]; bound {
		return nil, fmt.Errorf(
			"conversation %s already belongs to workstream %s",
			record.ConversationID,
			owner,
		)
	}
	if err := ValidateWorkstream(record); err != nil {
		return nil, err
	}
	workstream := newRegistryWorkstream(record, record.ConversationID)
	state.workstreams[record.ID] = workstream
	state.byConversation[record.ConversationID] = record.ID
	state.order = append(state.order, record.ID)
	state.aggregates.WorkstreamCount++
	state.applyAggregateDelta(record, 1)
	return workstream, nil
}

// applyAggregateDelta keeps the app-wide counts correct for workstreams outside
// the snapshot window, so a background blocker is never invisible just because
// its workstream did not fit.
func (state *registryState) applyAggregateDelta(record Workstream, sign int) {
	if record.ActiveRunID != nil {
		state.aggregates.RunningCount += sign
	}
	if record.QueuedRunCount > 0 {
		state.aggregates.QueuedCount += sign
	}
	if record.Status == WorkstreamStatusBlocked {
		state.aggregates.BlockedCount += sign
	}
	if record.UnresolvedApprovalCount > 0 {
		state.aggregates.AwaitingApprovalCount += sign
	}
	if record.UnresolvedResourceRequestCount > 0 {
		state.aggregates.AwaitingResourceCount += sign
	}
	if record.Status == WorkstreamStatusFailed {
		state.aggregates.FailedCount += sign
	}
	state.aggregates.UnresolvedApprovalCount += sign * record.UnresolvedApprovalCount
	state.aggregates.UnresolvedResourceRequestCount += sign * record.UnresolvedResourceRequestCount
	state.aggregates.ArtifactCount += sign * record.ArtifactCount
}

func (state *registryState) workstreamForConversation(conversationID string) (*registryWorkstream, error) {
	workstreamID, known := state.byConversation[conversationID]
	if !known {
		return nil, fmt.Errorf("conversation %s has no registered workstream", conversationID)
	}
	workstream, exists := state.workstreams[workstreamID]
	if !exists {
		return nil, fmt.Errorf("workstream %s is registered without a record", workstreamID)
	}
	return workstream, nil
}

// applyProjectorEvent advances the graph projection by one durable fact. The
// dense projector sequence is the registry's own ordering over the log, because
// the projector requires a contiguous stream and the log also carries facts no
// graph is projected from.
func (state *registryState) applyProjectorEvent(event ProjectorEvent) error {
	state.projectorSequence++
	event.Sequence = state.projectorSequence
	return state.projector.Apply(event)
}

// trackBlockedNodes reads the projector's own decision about what is blocking.
// A blocked node that is still waiting is an unresolved blocker; anything else —
// including a blocked node the projector resolved — is not.
func (workstream *registryWorkstream) trackBlockedNodes(change GraphChange) {
	for _, node := range change.Nodes {
		if node.Kind == SemanticNodeBlocked && node.Status == SemanticNodeStatusWaiting {
			workstream.blockedNodes[node.ID] = true
			continue
		}
		delete(workstream.blockedNodes, node.ID)
	}
	for _, nodeID := range change.RemovedNodeIDs {
		delete(workstream.blockedNodes, nodeID)
	}
}

func laterTimestamp(current string, candidate string) string {
	if current == "" {
		return candidate
	}
	if candidate == "" {
		return current
	}
	if validateTimestampOrder("registry timestamp", current, candidate) == nil {
		return candidate
	}
	return current
}
