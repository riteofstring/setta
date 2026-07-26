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
	record          Workstream
	conversationID  string
	archived        bool
	activeRunID     *string
	queuedRunCount  int
	lastTerminalRun conversation.TurnStatus
	// lastCompletedRunID is the newest run this workstream carried to
	// completion. It is the point a fork branches from, so a workstream that
	// has never finished a run cannot be forked: there is no shared history for
	// the child to inherit.
	lastCompletedRunID  *string
	unresolvedApprovals map[string]bool
	unresolvedResources map[string]bool
	// blockedNodes are the workstream's unresolved blocked graph nodes. The
	// projector already decides which typed liveness and provider lifecycle
	// facts are blocking, so the registry reads that decision instead of
	// repeating it.
	blockedNodes map[string]bool
	artifactIDs  []string
	// recoverableFailures are the durable run failures nothing has recovered
	// yet, oldest first. They are what makes recover_path an authorized
	// decision, so a workstream that never failed cannot be asked to recover.
	recoverableFailures []DecisionRecoverableFailure
	// failureRuns maps each recoverable failure to the run it interrupted. The
	// Director names the failure; the run is trusted state, because recovery
	// restarts the work that failed rather than work a decision described.
	failureRuns map[string]string
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
	streamSequences   map[string]int
	// pendingParents holds the parentage a branch record committed for a
	// conversation whose own record has not arrived yet. Parentage is durable
	// before the conversation it belongs to, so a workstream is never registered
	// without knowing where it came from.
	pendingParents map[string]*string
	// decisions is the recent committed-decision history, oldest first. It is
	// bounded here rather than at materialization, because the Director only
	// ever receives the most recent few as continuity context.
	decisions []DecisionSummary
}

func newRegistryState() *registryState {
	return &registryState{
		projector:       NewDirectorGraphProjector(),
		workstreams:     map[string]*registryWorkstream{},
		byConversation:  map[string]string{},
		approvals:       map[string]*ApprovalRequest{},
		resources:       map[string]*ResourceRequest{},
		artifacts:       map[string]*WorkstreamArtifact{},
		streamSequences: map[string]int{},
		pendingParents:  map[string]*string{},
	}
}

func newRegistryWorkstream(record Workstream, conversationID string) *registryWorkstream {
	return &registryWorkstream{
		record:              record,
		conversationID:      conversationID,
		unresolvedApprovals: map[string]bool{},
		unresolvedResources: map[string]bool{},
		blockedNodes:        map[string]bool{},
		failureRuns:         map[string]string{},
	}
}

// deriveStatus answers the only question a background workstream renders: does
// this need me? Blockers rank above progress, and progress ranks above the last
// outcome, because an outcome the user cannot act on is the least useful thing
// the row could say.
func (workstream *registryWorkstream) deriveStatus() WorkstreamStatus {
	switch {
	case workstream.archived:
		return WorkstreamStatusArchived
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
func (state *registryState) registerWorkstreamRecord(
	record Workstream,
	conversationID string,
) (*registryWorkstream, error) {
	if err := validateIdentifier("workstream conversation id", conversationID); err != nil {
		return nil, err
	}
	if _, exists := state.workstreams[record.ID]; exists {
		return nil, fmt.Errorf("workstream %s is already registered", record.ID)
	}
	if owner, bound := state.byConversation[conversationID]; bound {
		return nil, fmt.Errorf(
			"conversation %s already belongs to workstream %s",
			conversationID,
			owner,
		)
	}
	if record.ConversationID != conversationID {
		return nil, fmt.Errorf(
			"workstream %s records conversation %s but was registered under %s",
			record.ID,
			record.ConversationID,
			conversationID,
		)
	}
	if err := ValidateWorkstream(record); err != nil {
		return nil, err
	}
	workstream := newRegistryWorkstream(record, conversationID)
	state.workstreams[record.ID] = workstream
	state.byConversation[conversationID] = record.ID
	state.order = append(state.order, record.ID)
	state.applyAggregateDelta(record, 1)
	return workstream, nil
}

// applyAggregateDelta keeps the app-wide counts correct for workstreams outside
// the snapshot window, so a background blocker is never invisible just because
// its workstream did not fit.
func (state *registryState) applyAggregateDelta(record Workstream, sign int) {
	if record.Status == WorkstreamStatusArchived {
		return
	}
	state.aggregates.WorkstreamCount += sign
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

// conversationForWorkstream is the inverse of the conversation index: which
// conversation a workstream's work runs in. The record does not carry it,
// because the renderer has never needed it; the Director does, to ask that
// conversation a question.
func (state *registryState) conversationForWorkstream(workstreamID string) (string, error) {
	workstream, exists := state.workstreams[workstreamID]
	if !exists {
		return "", fmt.Errorf("workstream %s is not tracked", workstreamID)
	}
	if workstream.conversationID == "" {
		return "", fmt.Errorf("workstream %s has no conversation", workstreamID)
	}
	return workstream.conversationID, nil
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
