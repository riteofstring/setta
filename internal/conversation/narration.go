package conversation

import (
	"fmt"
	"time"
)

type NarratorStatus string
type NarrationEventKind string
type NarrationTrigger string

const (
	NarratorStatusReady    NarratorStatus = "ready"
	NarratorStatusRunning  NarratorStatus = "running"
	NarratorStatusDegraded NarratorStatus = "degraded"

	NarrationEventKindMilestone       NarrationEventKind = "milestone"
	NarrationEventKindStatusReply     NarrationEventKind = "status_reply"
	NarrationEventKindFinalSummary    NarrationEventKind = "final_summary"
	NarrationEventKindTopicDescriptor NarrationEventKind = "topic_descriptor"

	NarrationTriggerInputAccepted            NarrationTrigger = "input_accepted"
	NarrationTriggerProgressWindowElapsed    NarrationTrigger = "progress_window_elapsed"
	NarrationTriggerPlanChanged              NarrationTrigger = "plan_changed"
	NarrationTriggerPhaseActivityCompleted   NarrationTrigger = "phase_activity_completed"
	NarrationTriggerApprovalRequired         NarrationTrigger = "approval_required"
	NarrationTriggerUserSteered              NarrationTrigger = "user_steered"
	NarrationTriggerExplicitStatusRequested  NarrationTrigger = "explicit_status_requested"
	NarrationTriggerTurnTerminal             NarrationTrigger = "turn_terminal"
	NarrationTriggerCheckpointWindowExceeded NarrationTrigger = "checkpoint_window_exceeded"
)

type NarratorDegradation struct {
	Code                string `json:"code"`
	Message             string `json:"message"`
	Retryable           bool   `json:"retryable"`
	DiagnosticReference string `json:"diagnosticReference"`
	DegradedAt          string `json:"degradedAt"`
}

type NarratorState struct {
	ConversationID             string               `json:"conversationId"`
	ObservedThroughSequence    int                  `json:"observedThroughSequence"`
	CheckpointThroughSequence  int                  `json:"checkpointThroughSequence"`
	CheckpointText             string               `json:"checkpointText"`
	CurrentFocus               string               `json:"currentFocus"`
	CurrentFocusRevision       int                  `json:"currentFocusRevision"`
	CurrentFocusSourceSequence int                  `json:"currentFocusSourceSequence"`
	TopicDescriptor            string               `json:"topicDescriptor"`
	LastInvocationAt           *string              `json:"lastInvocationAt"`
	Status                     NarratorStatus       `json:"status"`
	Degradation                *NarratorDegradation `json:"degradation"`
	UpdatedAt                  string               `json:"updatedAt"`
}

type NarrationMilestone struct {
	Text string `json:"text"`
}

type NarrationStatusReply struct {
	Question string `json:"question"`
	Text     string `json:"text"`
}

type NarrationFinalSummary struct {
	Text string `json:"text"`
}

type NarrationTopicDescriptor struct {
	Text string `json:"text"`
}

type NarrationEvent struct {
	StreamSequence      int                       `json:"streamSequence"`
	ID                  string                    `json:"id"`
	ConversationID      string                    `json:"conversationId"`
	TurnID              *string                   `json:"turnId"`
	Kind                NarrationEventKind        `json:"kind"`
	SourceSequenceStart int                       `json:"sourceSequenceStart"`
	SourceSequenceEnd   int                       `json:"sourceSequenceEnd"`
	Trigger             NarrationTrigger          `json:"trigger"`
	ResolvedInvocation  ResolvedInvocation        `json:"resolvedInvocation"`
	CreatedAt           string                    `json:"createdAt"`
	Milestone           *NarrationMilestone       `json:"milestone"`
	StatusReply         *NarrationStatusReply     `json:"statusReply"`
	FinalSummary        *NarrationFinalSummary    `json:"finalSummary"`
	TopicDescriptor     *NarrationTopicDescriptor `json:"topicDescriptor"`
}

// UserVisibleText returns the text the product presents as narrator speech.
// Topic descriptors name a conversation and are presentation metadata rather
// than communication about the work, so they are intentionally excluded.
func (event NarrationEvent) UserVisibleText() (string, bool) {
	switch event.Kind {
	case NarrationEventKindMilestone:
		if event.Milestone == nil {
			return "", false
		}
		return event.Milestone.Text, true
	case NarrationEventKindStatusReply:
		if event.StatusReply == nil {
			return "", false
		}
		return event.StatusReply.Text, true
	case NarrationEventKindFinalSummary:
		if event.FinalSummary == nil {
			return "", false
		}
		return event.FinalSummary.Text, true
	case NarrationEventKindTopicDescriptor:
		return "", false
	default:
		return "", false
	}
}

func (degradation NarratorDegradation) Validate() error {
	if err := validateIdentifier("narrator degradation code", degradation.Code); err != nil {
		return err
	}
	if err := validateTrimmedText("narrator degradation message", degradation.Message); err != nil {
		return err
	}
	if err := validateIdentifier("narrator degradation diagnostic reference", degradation.DiagnosticReference); err != nil {
		return err
	}
	_, err := validateTimestamp("narrator degradation degradedAt", degradation.DegradedAt)
	return err
}

func (state NarratorState) Validate() error {
	if err := validateIdentifier("narrator state conversation id", state.ConversationID); err != nil {
		return err
	}
	if err := validateNarratorCursors(state); err != nil {
		return err
	}
	if err := validateNarratorFocus(state); err != nil {
		return err
	}
	if state.Degradation != nil {
		if err := state.Degradation.Validate(); err != nil {
			return err
		}
	}
	if err := validateNarratorStatus(state); err != nil {
		return err
	}
	return validateNarratorStateTimeline(state)
}

func validateNarratorStateTimeline(state NarratorState) error {
	updatedAt, err := validateTimestamp("narrator state updatedAt", state.UpdatedAt)
	if err != nil {
		return err
	}
	if err := validateOptionalTimestampNotAfter("narrator lastInvocationAt", state.LastInvocationAt, updatedAt); err != nil {
		return fmt.Errorf("narrator state %s: %w", state.ConversationID, err)
	}
	if state.Degradation == nil {
		return nil
	}
	return validateNarratorDegradedAt(state, updatedAt)
}

func validateOptionalTimestampNotAfter(label string, value *string, limit time.Time) error {
	if value == nil {
		return nil
	}
	parsed, err := validateTimestampPointer(label, value)
	if err != nil {
		return err
	}
	if parsed.After(limit) {
		return fmt.Errorf("%s follows updatedAt", label)
	}
	return nil
}

func validateNarratorDegradedAt(state NarratorState, updatedAt time.Time) error {
	degradedAt, err := validateTimestamp("narrator degradation degradedAt", state.Degradation.DegradedAt)
	if err != nil {
		return err
	}
	if degradedAt.After(updatedAt) {
		return fmt.Errorf("narrator state %s degradedAt follows updatedAt", state.ConversationID)
	}
	return nil
}

func validateNarratorCursors(state NarratorState) error {
	if state.ObservedThroughSequence < 0 {
		return fmt.Errorf("narrator state %s observed cursor must be non-negative", state.ConversationID)
	}
	if state.CheckpointThroughSequence < 0 {
		return fmt.Errorf("narrator state %s checkpoint cursor must be non-negative", state.ConversationID)
	}
	if state.CheckpointThroughSequence > state.ObservedThroughSequence {
		return fmt.Errorf("narrator state %s checkpoint cursor %d exceeds observed cursor %d", state.ConversationID, state.CheckpointThroughSequence, state.ObservedThroughSequence)
	}
	if state.CheckpointThroughSequence == 0 && state.CheckpointText != "" {
		return fmt.Errorf("narrator state %s has checkpoint text without covered trajectory", state.ConversationID)
	}
	if state.CheckpointThroughSequence > 0 {
		if err := validateTrimmedText("narrator checkpoint text", state.CheckpointText); err != nil {
			return err
		}
	}
	return nil
}

func validateNarratorFocus(state NarratorState) error {
	if state.CurrentFocusRevision < 0 {
		return fmt.Errorf("narrator state %s current focus revision must be non-negative", state.ConversationID)
	}
	if state.CurrentFocusSourceSequence < 0 {
		return fmt.Errorf("narrator state %s current focus source sequence must be non-negative", state.ConversationID)
	}
	if state.CurrentFocusRevision == 0 && state.CurrentFocus != "" {
		return fmt.Errorf("narrator state %s has current focus without a revision", state.ConversationID)
	}
	if state.CurrentFocusRevision == 0 && state.CurrentFocusSourceSequence != 0 {
		return fmt.Errorf("narrator state %s has a current focus source without a revision", state.ConversationID)
	}
	if state.CurrentFocusRevision > 0 {
		if err := validateTrimmedText("narrator current focus", state.CurrentFocus); err != nil {
			return err
		}
		if state.CurrentFocusSourceSequence == 0 {
			return fmt.Errorf("narrator state %s has current focus without a source sequence", state.ConversationID)
		}
	}
	return nil
}

func validateNarratorStatus(state NarratorState) error {
	switch state.Status {
	case NarratorStatusReady, NarratorStatusRunning:
		if state.Degradation != nil {
			return fmt.Errorf("narrator state %s status %s must not include degradation", state.ConversationID, state.Status)
		}
	case NarratorStatusDegraded:
		if state.Degradation == nil {
			return fmt.Errorf("degraded narrator state %s requires degradation", state.ConversationID)
		}
	default:
		return fmt.Errorf("narrator state %s has unsupported status %q", state.ConversationID, state.Status)
	}
	return nil
}

func (event NarrationEvent) Validate() error {
	if err := validateNarrationEventEnvelope(event); err != nil {
		return err
	}
	if err := validateNarrationEventInvocation(event); err != nil {
		return err
	}
	if _, err := validateTimestamp("narration event createdAt", event.CreatedAt); err != nil {
		return err
	}
	if countNarrationBranches(event) != 1 {
		return fmt.Errorf("narration event %s must populate exactly one payload branch, found %d", event.ID, countNarrationBranches(event))
	}
	return validateNarrationEventBranch(event)
}

func validateNarrationEventEnvelope(event NarrationEvent) error {
	if event.StreamSequence <= 0 {
		return fmt.Errorf("narration event stream sequence must be positive")
	}
	if err := validateIdentifier("narration event id", event.ID); err != nil {
		return err
	}
	if err := validateIdentifier("narration event conversation id", event.ConversationID); err != nil {
		return err
	}
	if err := validateOptionalIdentifier("narration event turn id", event.TurnID); err != nil {
		return err
	}
	if event.SourceSequenceStart < 0 || event.SourceSequenceEnd < event.SourceSequenceStart {
		return fmt.Errorf("narration event %s has invalid source range %d..%d", event.ID, event.SourceSequenceStart, event.SourceSequenceEnd)
	}
	if !validNarrationTrigger(event.Trigger) || event.Trigger == NarrationTriggerCheckpointWindowExceeded {
		return fmt.Errorf("narration event %s has unsupported projection trigger %q", event.ID, event.Trigger)
	}
	return nil
}

func validateNarrationEventInvocation(event NarrationEvent) error {
	if err := event.ResolvedInvocation.Validate(); err != nil {
		return fmt.Errorf("narration event %s invocation: %w", event.ID, err)
	}
	if event.ResolvedInvocation.Role != RoleNarrator || event.ResolvedInvocation.Outcome != InvocationOutcomeSucceeded {
		return fmt.Errorf("narration event %s requires a successful narrator invocation", event.ID)
	}
	return nil
}

func countNarrationBranches(event NarrationEvent) int {
	branchCount := 0
	for _, present := range []bool{
		event.Milestone != nil,
		event.StatusReply != nil,
		event.FinalSummary != nil,
		event.TopicDescriptor != nil,
	} {
		if present {
			branchCount++
		}
	}
	return branchCount
}

func validateNarrationEventBranch(event NarrationEvent) error {
	switch event.Kind {
	case NarrationEventKindMilestone:
		return validateMilestoneEvent(event)
	case NarrationEventKindStatusReply:
		return validateStatusReplyEvent(event)
	case NarrationEventKindFinalSummary:
		return validateFinalSummaryEvent(event)
	case NarrationEventKindTopicDescriptor:
		return validateTopicDescriptorEvent(event)
	default:
		return fmt.Errorf("narration event %s has unsupported kind %q", event.ID, event.Kind)
	}
}

func validateMilestoneEvent(event NarrationEvent) error {
	if event.Milestone == nil {
		return fmt.Errorf("narration event %s kind %s requires milestone payload", event.ID, event.Kind)
	}
	if event.TurnID == nil {
		return fmt.Errorf("milestone narration event %s requires turn id", event.ID)
	}
	if event.Trigger == NarrationTriggerExplicitStatusRequested {
		return fmt.Errorf("milestone narration event %s cannot be emitted by a status-only call", event.ID)
	}
	return validateTrimmedText("narration milestone text", event.Milestone.Text)
}

func validateStatusReplyEvent(event NarrationEvent) error {
	if event.StatusReply == nil {
		return fmt.Errorf("narration event %s kind %s requires status reply payload", event.ID, event.Kind)
	}
	if event.Trigger != NarrationTriggerExplicitStatusRequested {
		return fmt.Errorf("status reply narration event %s requires explicit status trigger", event.ID)
	}
	if err := validateTrimmedText("narration status question", event.StatusReply.Question); err != nil {
		return err
	}
	return validateTrimmedText("narration status reply text", event.StatusReply.Text)
}

func validateFinalSummaryEvent(event NarrationEvent) error {
	if event.FinalSummary == nil {
		return fmt.Errorf("narration event %s kind %s requires final summary payload", event.ID, event.Kind)
	}
	if event.TurnID == nil || event.Trigger != NarrationTriggerTurnTerminal {
		return fmt.Errorf("final summary narration event %s requires turn id and terminal trigger", event.ID)
	}
	return validateTrimmedText("narration final summary text", event.FinalSummary.Text)
}

func validateTopicDescriptorEvent(event NarrationEvent) error {
	if event.TopicDescriptor == nil {
		return fmt.Errorf("narration event %s kind %s requires topic descriptor payload", event.ID, event.Kind)
	}
	if event.TurnID == nil {
		return fmt.Errorf("topic descriptor narration event %s requires turn id", event.ID)
	}
	if event.Trigger == NarrationTriggerExplicitStatusRequested {
		return fmt.Errorf("topic descriptor narration event %s cannot be emitted by a status-only call", event.ID)
	}
	return validateTrimmedText("narration topic descriptor text", event.TopicDescriptor.Text)
}

func validNarrationTrigger(trigger NarrationTrigger) bool {
	switch trigger {
	case NarrationTriggerInputAccepted,
		NarrationTriggerProgressWindowElapsed,
		NarrationTriggerPlanChanged,
		NarrationTriggerPhaseActivityCompleted,
		NarrationTriggerApprovalRequired,
		NarrationTriggerUserSteered,
		NarrationTriggerExplicitStatusRequested,
		NarrationTriggerTurnTerminal,
		NarrationTriggerCheckpointWindowExceeded:
		return true
	default:
		return false
	}
}
