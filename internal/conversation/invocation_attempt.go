package conversation

import (
	"context"
	"errors"
	"fmt"
)

type InvocationAttemptCallKind string
type InvocationAttemptOutcome string
type InvocationValidationResult string
type InvocationCommitDecision string

const (
	InvocationAttemptCallInputRoute InvocationAttemptCallKind = "input_route"
	InvocationAttemptCallProjection InvocationAttemptCallKind = "projection"
	InvocationAttemptCallStatus     InvocationAttemptCallKind = "status"
	InvocationAttemptCallTerminal   InvocationAttemptCallKind = "terminal"
	InvocationAttemptCallCheckpoint InvocationAttemptCallKind = "checkpoint"

	InvocationAttemptOutcomeCompleted  InvocationAttemptOutcome = "completed"
	InvocationAttemptOutcomeFailed     InvocationAttemptOutcome = "failed"
	InvocationAttemptOutcomeCancelled  InvocationAttemptOutcome = "cancelled"
	InvocationAttemptOutcomeSuperseded InvocationAttemptOutcome = "superseded"
	InvocationAttemptOutcomeStale      InvocationAttemptOutcome = "stale"

	InvocationValidationNotRun InvocationValidationResult = "not_run"
	InvocationValidationPassed InvocationValidationResult = "passed"
	InvocationValidationFailed InvocationValidationResult = "failed"

	InvocationCommitOutputCommitted  InvocationCommitDecision = "output_committed"
	InvocationCommitFailureCommitted InvocationCommitDecision = "failure_committed"
	InvocationCommitCancelled        InvocationCommitDecision = "cancelled"
	InvocationCommitSuperseded       InvocationCommitDecision = "superseded"
	InvocationCommitRejectedStale    InvocationCommitDecision = "rejected_stale"
)

// InvocationAttemptCursorAudit records the durable narrator cursor on either
// side of one call without retaining checkpoint or projection text.
type InvocationAttemptCursorAudit struct {
	ObservedThroughSequence   int    `json:"observedThroughSequence"`
	CheckpointThroughSequence int    `json:"checkpointThroughSequence"`
	CurrentFocusRevision      int    `json:"currentFocusRevision"`
	UpdatedAt                 string `json:"updatedAt"`
}

type InvocationAttemptEventCount struct {
	Kind  TrajectoryEventKind `json:"kind"`
	Count int                 `json:"count"`
}

// InvocationAttemptContextAudit is a bounded, text-free description of the
// authority supplied to a narrator or conversation-local routing call. Empty
// ranges are represented as nil and all repeated fields remain bounded by the
// context materializers that own them.
type InvocationAttemptContextAudit struct {
	Materialized                 bool                            `json:"materialized"`
	InputID                      *string                         `json:"inputId"`
	ClarificationInputID         *string                         `json:"clarificationInputId"`
	RequestedThroughSequence     *int                            `json:"requestedThroughSequence"`
	SourceThroughSequence        int                             `json:"sourceThroughSequence"`
	AvailableRange               *TrajectorySequenceRange        `json:"availableRange"`
	IncludedRanges               []TrajectorySequenceRange       `json:"includedRanges"`
	EvaluationRange              *TrajectorySequenceRange        `json:"evaluationRange"`
	RemainingRange               *TrajectorySequenceRange        `json:"remainingRange"`
	OmittedStatusOnlyRange       *TrajectorySequenceRange        `json:"omittedStatusOnlyRange"`
	OmittedUnobservedRange       *TrajectorySequenceRange        `json:"omittedUnobservedRange"`
	PreCursor                    *InvocationAttemptCursorAudit   `json:"preCursor"`
	PostCursor                   *InvocationAttemptCursorAudit   `json:"postCursor"`
	ProposedObservedThrough      *int                            `json:"proposedObservedThrough"`
	ProposedCheckpointThrough    *int                            `json:"proposedCheckpointThrough"`
	PriorMilestoneCount          int                             `json:"priorMilestoneCount"`
	PriorFinalSummaryCount       int                             `json:"priorFinalSummaryCount"`
	PriorRouteDecisionCount      int                             `json:"priorRouteDecisionCount"`
	ValidCompletedForkPointCount int                             `json:"validCompletedForkPointCount"`
	EventCounts                  []InvocationAttemptEventCount   `json:"eventCounts"`
	AllowedDecisionKinds         []ConversationRouteDecisionKind `json:"allowedDecisionKinds"`
}

// InvocationAttemptOutputAudit records only the shape and byte size of model
// output. It deliberately excludes authored input, narration text, checkpoint
// text, and raw structured provider output.
type InvocationAttemptOutputAudit struct {
	StructuredKind         *string `json:"structuredKind"`
	MilestoneCount         int     `json:"milestoneCount"`
	StatusReplyBytes       int     `json:"statusReplyBytes"`
	FinalSummaryBytes      int     `json:"finalSummaryBytes"`
	TopicDescriptorBytes   int     `json:"topicDescriptorBytes"`
	CheckpointSummaryBytes int     `json:"checkpointSummaryBytes"`
}

// InvocationAttempt is the Go-owned terminal audit for one narrator or local
// routing attempt. Requested/resolved settings and provider references are
// optional because configuration, context, cancellation, or supersession may
// terminate work before those stages exist.
type InvocationAttempt struct {
	ID                 string                        `json:"id"`
	ConversationID     string                        `json:"conversationId"`
	TurnID             *string                       `json:"turnId"`
	CallKind           InvocationAttemptCallKind     `json:"callKind"`
	Trigger            *NarrationTrigger             `json:"trigger"`
	Generation         int                           `json:"generation"`
	Context            InvocationAttemptContextAudit `json:"context"`
	Requested          *RoleProfile                  `json:"requested"`
	Resolved           *ResolvedInvocationSettings   `json:"resolved"`
	ContextUsage       InvocationContextUsage        `json:"contextUsage"`
	ProviderReferences InvocationProviderReferences  `json:"providerReferences"`
	StartedAt          string                        `json:"startedAt"`
	EndedAt            string                        `json:"endedAt"`
	Outcome            InvocationAttemptOutcome      `json:"outcome"`
	ValidationResult   InvocationValidationResult    `json:"validationResult"`
	CommitDecision     InvocationCommitDecision      `json:"commitDecision"`
	Output             InvocationAttemptOutputAudit  `json:"output"`
	Failure            *Failure                      `json:"failure"`
}

func (attempt InvocationAttempt) Validate() error {
	if err := validateInvocationAttemptIdentity(attempt); err != nil {
		return err
	}
	if err := validateInvocationAttemptKind(attempt); err != nil {
		return err
	}
	if err := attempt.Context.validate(); err != nil {
		return fmt.Errorf("invocation attempt %s context: %w", attempt.ID, err)
	}
	return validateInvocationAttemptMetadata(attempt)
}

func validateInvocationAttemptIdentity(attempt InvocationAttempt) error {
	if err := validateIdentifier("invocation attempt id", attempt.ID); err != nil {
		return err
	}
	if err := validateIdentifier("invocation attempt conversation id", attempt.ConversationID); err != nil {
		return err
	}
	if err := validateOptionalIdentifier("invocation attempt turn id", attempt.TurnID); err != nil {
		return err
	}
	if attempt.Generation <= 0 {
		return errors.New("invocation attempt generation must be positive")
	}
	return nil
}

func validateInvocationAttemptMetadata(attempt InvocationAttempt) error {
	if err := validateInvocationAttemptModel(attempt); err != nil {
		return err
	}
	if err := attempt.ContextUsage.Validate(); err != nil {
		return err
	}
	if err := attempt.ProviderReferences.Validate(); err != nil {
		return err
	}
	if err := validateInvocationAttemptTimeline(attempt); err != nil {
		return err
	}
	if err := attempt.Output.validate(); err != nil {
		return err
	}
	return validateInvocationAttemptTerminalState(attempt)
}

func validateInvocationAttemptKind(attempt InvocationAttempt) error {
	switch attempt.CallKind {
	case InvocationAttemptCallInputRoute:
		return validateInputRouteInvocationAttemptTrigger(attempt.Trigger)
	case InvocationAttemptCallProjection:
		return validateProjectionInvocationAttemptTrigger(attempt.Trigger)
	case InvocationAttemptCallStatus:
		return validateRequiredInvocationAttemptTrigger(
			attempt.Trigger,
			NarrationTriggerExplicitStatusRequested,
			"status invocation attempt requires the explicit-status trigger",
		)
	case InvocationAttemptCallTerminal:
		return validateRequiredInvocationAttemptTrigger(
			attempt.Trigger,
			NarrationTriggerTurnTerminal,
			"terminal invocation attempt requires the terminal trigger",
		)
	case InvocationAttemptCallCheckpoint:
		return validateRequiredInvocationAttemptTrigger(
			attempt.Trigger,
			NarrationTriggerCheckpointWindowExceeded,
			"checkpoint invocation attempt requires the checkpoint trigger",
		)
	default:
		return fmt.Errorf("invocation attempt %s has unsupported call kind %q", attempt.ID, attempt.CallKind)
	}
}

func validateInputRouteInvocationAttemptTrigger(trigger *NarrationTrigger) error {
	if trigger != nil {
		return errors.New("input-route invocation attempt must not include a narrator trigger")
	}
	return nil
}

func validateProjectionInvocationAttemptTrigger(trigger *NarrationTrigger) error {
	if trigger == nil {
		return errors.New("projection invocation attempt has an invalid trigger")
	}
	switch *trigger {
	case NarrationTriggerExplicitStatusRequested,
		NarrationTriggerTurnTerminal,
		NarrationTriggerCheckpointWindowExceeded:
		return errors.New("projection invocation attempt has an invalid trigger")
	default:
		if !validNarrationTrigger(*trigger) {
			return errors.New("projection invocation attempt has an invalid trigger")
		}
		return nil
	}
}

func validateRequiredInvocationAttemptTrigger(
	actual *NarrationTrigger,
	want NarrationTrigger,
	message string,
) error {
	if actual == nil || *actual != want {
		return errors.New(message)
	}
	return nil
}

func (contextAudit InvocationAttemptContextAudit) validate() error {
	if err := validateInvocationAttemptContextIdentity(contextAudit); err != nil {
		return err
	}
	if err := validateInvocationAttemptContextSequences(contextAudit); err != nil {
		return err
	}
	if err := validateInvocationAttemptContextRanges(contextAudit); err != nil {
		return err
	}
	if err := validateInvocationAttemptContextArrays(contextAudit); err != nil {
		return err
	}
	return validateInvocationAttemptContextCursors(contextAudit)
}

func validateInvocationAttemptContextIdentity(contextAudit InvocationAttemptContextAudit) error {
	if err := validateOptionalIdentifier("invocation attempt context input id", contextAudit.InputID); err != nil {
		return err
	}
	if err := validateOptionalIdentifier("invocation attempt clarification input id", contextAudit.ClarificationInputID); err != nil {
		return err
	}
	if contextAudit.SourceThroughSequence < 0 {
		return errors.New("invocation attempt source-through sequence must be non-negative")
	}
	return nil
}

func validateInvocationAttemptContextSequences(contextAudit InvocationAttemptContextAudit) error {
	for label, value := range map[string]*int{
		"requested-through sequence":           contextAudit.RequestedThroughSequence,
		"proposed observed-through sequence":   contextAudit.ProposedObservedThrough,
		"proposed checkpoint-through sequence": contextAudit.ProposedCheckpointThrough,
	} {
		if value != nil && *value < 0 {
			return fmt.Errorf("invocation attempt %s must be non-negative", label)
		}
	}
	return nil
}

func validateInvocationAttemptContextRanges(contextAudit InvocationAttemptContextAudit) error {
	for label, value := range map[string]*TrajectorySequenceRange{
		"available range":           contextAudit.AvailableRange,
		"evaluation range":          contextAudit.EvaluationRange,
		"remaining range":           contextAudit.RemainingRange,
		"omitted status-only range": contextAudit.OmittedStatusOnlyRange,
		"omitted unobserved range":  contextAudit.OmittedUnobservedRange,
	} {
		if value != nil {
			if err := value.Validate(); err != nil {
				return fmt.Errorf("%s: %w", label, err)
			}
		}
	}
	return nil
}

func validateInvocationAttemptContextArrays(contextAudit InvocationAttemptContextAudit) error {
	if contextAudit.IncludedRanges == nil || contextAudit.EventCounts == nil ||
		contextAudit.AllowedDecisionKinds == nil {
		return errors.New("invocation attempt context arrays must not be null")
	}
	for _, sequenceRange := range contextAudit.IncludedRanges {
		if err := sequenceRange.Validate(); err != nil {
			return err
		}
	}
	if err := validateInvocationAttemptCounts(contextAudit); err != nil {
		return err
	}
	seenDecisionKinds := map[ConversationRouteDecisionKind]bool{}
	for _, kind := range contextAudit.AllowedDecisionKinds {
		if !validConversationRouteDecisionKind(kind) || seenDecisionKinds[kind] {
			return errors.New("invocation attempt allowed decision kinds must be supported and unique")
		}
		seenDecisionKinds[kind] = true
	}
	return nil
}

func validateInvocationAttemptContextCursors(contextAudit InvocationAttemptContextAudit) error {
	if contextAudit.PreCursor != nil {
		if err := contextAudit.PreCursor.validate(); err != nil {
			return err
		}
	}
	if contextAudit.PostCursor != nil {
		if err := contextAudit.PostCursor.validate(); err != nil {
			return err
		}
	}
	return nil
}

func validateInvocationAttemptCounts(contextAudit InvocationAttemptContextAudit) error {
	for _, count := range []int{
		contextAudit.PriorMilestoneCount,
		contextAudit.PriorFinalSummaryCount,
		contextAudit.PriorRouteDecisionCount,
		contextAudit.ValidCompletedForkPointCount,
	} {
		if count < 0 {
			return errors.New("invocation attempt context counts must be non-negative")
		}
	}
	seen := map[TrajectoryEventKind]bool{}
	for _, eventCount := range contextAudit.EventCounts {
		if eventCount.Count <= 0 || !invocationAttemptTrajectoryKind(eventCount.Kind) || seen[eventCount.Kind] {
			return errors.New("invocation attempt event counts must be positive, supported, and unique")
		}
		seen[eventCount.Kind] = true
	}
	return nil
}

func invocationAttemptTrajectoryKind(kind TrajectoryEventKind) bool {
	for _, candidate := range trajectoryEventKinds {
		if candidate == kind {
			return true
		}
	}
	return false
}

func (cursor InvocationAttemptCursorAudit) validate() error {
	if cursor.ObservedThroughSequence < 0 || cursor.CheckpointThroughSequence < 0 ||
		cursor.CurrentFocusRevision < 0 || cursor.CheckpointThroughSequence > cursor.ObservedThroughSequence {
		return errors.New("invocation attempt cursor is invalid")
	}
	_, err := validateTimestamp("invocation attempt cursor updatedAt", cursor.UpdatedAt)
	return err
}

func validateInvocationAttemptModel(attempt InvocationAttempt) error {
	if attempt.Requested != nil {
		if err := attempt.Requested.Validate(); err != nil {
			return fmt.Errorf("invocation attempt %s requested profile: %w", attempt.ID, err)
		}
		if attempt.Requested.Role != RoleNarrator {
			return errors.New("conversation invocation attempts require the narrator role")
		}
	}
	if attempt.Resolved != nil {
		if attempt.Requested == nil {
			return errors.New("resolved invocation attempt settings require a requested profile")
		}
		if err := attempt.Resolved.Validate(); err != nil {
			return fmt.Errorf("invocation attempt %s resolved settings: %w", attempt.ID, err)
		}
	}
	return nil
}

func validateInvocationAttemptTimeline(attempt InvocationAttempt) error {
	startedAt, err := validateTimestamp("invocation attempt startedAt", attempt.StartedAt)
	if err != nil {
		return err
	}
	endedAt, err := validateTimestamp("invocation attempt endedAt", attempt.EndedAt)
	if err != nil {
		return err
	}
	if endedAt.Before(startedAt) {
		return fmt.Errorf("invocation attempt %s endedAt precedes startedAt", attempt.ID)
	}
	return nil
}

func (output InvocationAttemptOutputAudit) validate() error {
	if err := validateOptionalIdentifier("invocation attempt structured output kind", output.StructuredKind); err != nil {
		return err
	}
	for _, count := range []int{
		output.MilestoneCount,
		output.StatusReplyBytes,
		output.FinalSummaryBytes,
		output.TopicDescriptorBytes,
		output.CheckpointSummaryBytes,
	} {
		if count < 0 {
			return errors.New("invocation attempt output counts must be non-negative")
		}
	}
	return nil
}

func validateInvocationAttemptTerminalState(attempt InvocationAttempt) error {
	if attempt.Failure != nil {
		if err := attempt.Failure.Validate(); err != nil {
			return err
		}
	}
	switch attempt.Outcome {
	case InvocationAttemptOutcomeCompleted:
		return validateCompletedInvocationAttempt(attempt)
	case InvocationAttemptOutcomeFailed:
		return validateFailedInvocationAttempt(attempt)
	case InvocationAttemptOutcomeCancelled:
		return validateUnsuccessfulInvocationAttempt(
			attempt,
			InvocationCommitCancelled,
			"cancelled invocation attempt has invalid terminal state",
		)
	case InvocationAttemptOutcomeSuperseded:
		return validateUnsuccessfulInvocationAttempt(
			attempt,
			InvocationCommitSuperseded,
			"superseded invocation attempt has invalid terminal state",
		)
	case InvocationAttemptOutcomeStale:
		return validateUnsuccessfulInvocationAttempt(
			attempt,
			InvocationCommitRejectedStale,
			"stale invocation attempt has invalid terminal state",
		)
	default:
		return fmt.Errorf("invocation attempt %s has unsupported outcome %q", attempt.ID, attempt.Outcome)
	}
}

func validateCompletedInvocationAttempt(attempt InvocationAttempt) error {
	if !invocationAttemptChecksPass(
		attempt.Failure == nil,
		attempt.Requested != nil,
		attempt.Resolved != nil,
		attempt.ValidationResult == InvocationValidationPassed,
		attempt.CommitDecision == InvocationCommitOutputCommitted,
	) {
		return errors.New("completed invocation attempt requires resolved validated committed output")
	}
	return nil
}

func validateFailedInvocationAttempt(attempt InvocationAttempt) error {
	if !invocationAttemptChecksPass(
		attempt.Failure != nil,
		attempt.CommitDecision == InvocationCommitFailureCommitted,
	) {
		return errors.New("failed invocation attempt requires a committed failure")
	}
	return nil
}

func validateUnsuccessfulInvocationAttempt(
	attempt InvocationAttempt,
	wantDecision InvocationCommitDecision,
	message string,
) error {
	if !invocationAttemptChecksPass(
		attempt.Failure == nil,
		attempt.CommitDecision == wantDecision,
	) {
		return errors.New(message)
	}
	return nil
}

func invocationAttemptChecksPass(checks ...bool) bool {
	for _, check := range checks {
		if !check {
			return false
		}
	}
	return true
}

func cloneInvocationAttempt(attempt InvocationAttempt) InvocationAttempt {
	cloned := attempt
	cloned.TurnID = cloneStringPointer(attempt.TurnID)
	if attempt.Trigger != nil {
		trigger := *attempt.Trigger
		cloned.Trigger = &trigger
	}
	cloned.Context = cloneInvocationAttemptContext(attempt.Context)
	if attempt.Requested != nil {
		requested := cloneRoleProfile(*attempt.Requested)
		cloned.Requested = &requested
	}
	if attempt.Resolved != nil {
		resolved := cloneResolvedInvocationSettings(*attempt.Resolved)
		cloned.Resolved = &resolved
	}
	cloned.ProviderReferences = cloneInvocationProviderReferences(attempt.ProviderReferences)
	cloned.Output.StructuredKind = cloneStringPointer(attempt.Output.StructuredKind)
	if attempt.Failure != nil {
		failure := *attempt.Failure
		cloned.Failure = &failure
	}
	return cloned
}

func cloneInvocationAttemptContext(value InvocationAttemptContextAudit) InvocationAttemptContextAudit {
	cloned := value
	cloned.InputID = cloneStringPointer(value.InputID)
	cloned.ClarificationInputID = cloneStringPointer(value.ClarificationInputID)
	cloned.RequestedThroughSequence = cloneIntPointer(value.RequestedThroughSequence)
	cloned.AvailableRange = cloneTrajectorySequenceRange(value.AvailableRange)
	cloned.IncludedRanges = append([]TrajectorySequenceRange{}, value.IncludedRanges...)
	cloned.EvaluationRange = cloneTrajectorySequenceRange(value.EvaluationRange)
	cloned.RemainingRange = cloneTrajectorySequenceRange(value.RemainingRange)
	cloned.OmittedStatusOnlyRange = cloneTrajectorySequenceRange(value.OmittedStatusOnlyRange)
	cloned.OmittedUnobservedRange = cloneTrajectorySequenceRange(value.OmittedUnobservedRange)
	cloned.PreCursor = cloneInvocationAttemptCursor(value.PreCursor)
	cloned.PostCursor = cloneInvocationAttemptCursor(value.PostCursor)
	cloned.ProposedObservedThrough = cloneIntPointer(value.ProposedObservedThrough)
	cloned.ProposedCheckpointThrough = cloneIntPointer(value.ProposedCheckpointThrough)
	cloned.EventCounts = append([]InvocationAttemptEventCount{}, value.EventCounts...)
	cloned.AllowedDecisionKinds = append([]ConversationRouteDecisionKind{}, value.AllowedDecisionKinds...)
	return cloned
}

func cloneInvocationAttemptCursor(value *InvocationAttemptCursorAudit) *InvocationAttemptCursorAudit {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func cloneRoleProfile(value RoleProfile) RoleProfile {
	cloned := value
	cloned.ModelSelection.ModelID = cloneStringPointer(value.ModelSelection.ModelID)
	cloned.ServiceTier = cloneStringPointer(value.ServiceTier)
	cloned.PermissionProfile.ToolAccess.AllowedTools = append(
		[]string{},
		value.PermissionProfile.ToolAccess.AllowedTools...,
	)
	return cloned
}

func cloneResolvedInvocationSettings(value ResolvedInvocationSettings) ResolvedInvocationSettings {
	cloned := value
	cloned.ServiceTier = cloneStringPointer(value.ServiceTier)
	cloned.PermissionProfile.ToolAccess.AllowedTools = append(
		[]string{},
		value.PermissionProfile.ToolAccess.AllowedTools...,
	)
	return cloned
}

func cloneInvocationProviderReferences(value InvocationProviderReferences) InvocationProviderReferences {
	cloned := value
	cloned.ThreadID = cloneStringPointer(value.ThreadID)
	cloned.TurnID = cloneStringPointer(value.TurnID)
	cloned.RequestID = cloneStringPointer(value.RequestID)
	cloned.ResponseID = cloneStringPointer(value.ResponseID)
	return cloned
}

func validateInvocationAttemptCommitTime(attempt InvocationAttempt, committedAt string) error {
	endedAt, err := validateTimestamp("invocation attempt endedAt", attempt.EndedAt)
	if err != nil {
		return err
	}
	commitTime, err := validateTimestamp("invocation attempt committedAt", committedAt)
	if err != nil {
		return err
	}
	if commitTime.Before(endedAt) {
		return errors.New("invocation attempt committedAt precedes endedAt")
	}
	return nil
}

// RecordInvocationAttempt publishes one terminal attempt that has no other
// state mutation, such as cancelled, superseded, or stale actor work.
func (store *Store) RecordInvocationAttempt(
	ctx context.Context,
	committedEventID string,
	attempt InvocationAttempt,
	committedAt string,
) error {
	if store == nil {
		return errors.New("conversation store is required")
	}
	if ctx == nil {
		return errors.New("invocation attempt context is required")
	}
	if err := validateIdentifier("invocation attempt committed event id", committedEventID); err != nil {
		return err
	}
	if err := attempt.Validate(); err != nil {
		return err
	}
	if err := validateInvocationAttemptCommitTime(attempt, committedAt); err != nil {
		return err
	}
	_, err := store.Transact(ctx, "record invocation attempt", func(transaction *WriteTransaction) error {
		return appendInvocationAttemptEvent(transaction, committedEventID, attempt, committedAt)
	})
	return err
}

func appendInvocationAttemptEvent(
	transaction *WriteTransaction,
	committedEventID string,
	attempt InvocationAttempt,
	committedAt string,
) error {
	streamID, err := ConversationStreamID(attempt.ConversationID)
	if err != nil {
		return err
	}
	_, err = transaction.AppendCommittedEvent(CommittedEventDraft{
		ID:       committedEventID,
		StreamID: streamID,
		Kind:     string(ConversationEventTypeInvocationAttempted),
		Payload: ConversationInvocationAttemptedEventPayload{
			Type:    ConversationEventTypeInvocationAttempted,
			Attempt: cloneInvocationAttempt(attempt),
		},
		CommittedAt: committedAt,
	})
	return err
}
