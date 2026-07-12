package conversation

import (
	"errors"
	"fmt"
	"reflect"
)

// NarrationTextCommit identifies one immutable narration record and its
// independently sequenced conversation-stream publication.
type NarrationTextCommit struct {
	NarrationEventID string
	CommittedEventID string
	Text             string
}

type NarratorProjectionCommit struct {
	ConversationID               string
	TurnID                       string
	Expected                     NarratorStateExpectation
	ObservedThroughSequence      int
	CurrentFocus                 string
	Milestones                   []NarrationTextCommit
	FinalSummary                 *NarrationTextCommit
	TopicDescriptor              *NarrationTextCommit
	Trigger                      NarrationTrigger
	ResolvedInvocation           ResolvedInvocation
	InvocationAttempt            InvocationAttempt
	InvocationAttemptCommittedID string
	NarratorStateCommittedID     string
	ConversationCommittedID      *string
	CommittedAt                  string
}

type NarratorProjectionCommitResult struct {
	State        NarratorState
	Conversation *TopicConversation
	Events       []NarrationEvent
}

type NarratorStatusCommit struct {
	ConversationID               string
	TurnID                       *string
	Expected                     NarratorStateExpectation
	SourceSequenceStart          int
	SourceThroughSequence        int
	Question                     string
	Reply                        NarrationTextCommit
	ResolvedInvocation           ResolvedInvocation
	InvocationAttempt            InvocationAttempt
	InvocationAttemptCommittedID string
	NarratorStateCommittedID     string
	CommittedAt                  string
}

type NarratorStatusCommitResult struct {
	State NarratorState
	Event NarrationEvent
}

func (request NarratorProjectionCommit) Validate() error {
	if err := validateNarratorProjectionTarget(request); err != nil {
		return err
	}
	if err := validateNarratorProjectionChannel(request); err != nil {
		return err
	}
	if err := validateNarratorTopicDescriptorCommit(request); err != nil {
		return err
	}
	if err := validateNarratorOutputAudit(
		request.Expected,
		request.ResolvedInvocation,
		request.CommittedAt,
	); err != nil {
		return err
	}
	if err := validateSuccessfulNarratorAttempt(request.InvocationAttempt, request.ResolvedInvocation, request.CommittedAt); err != nil {
		return err
	}
	if err := validateProjectionInvocationAttempt(request); err != nil {
		return err
	}
	return validateProjectionOutputIdentities(request)
}

func validateNarratorProjectionTarget(request NarratorProjectionCommit) error {
	if err := validateIdentifier("narrator projection conversation id", request.ConversationID); err != nil {
		return err
	}
	if err := validateIdentifier("narrator projection turn id", request.TurnID); err != nil {
		return err
	}
	if err := validateNarratorExpectedVersion(request.Expected, request.ConversationID); err != nil {
		return err
	}
	if request.ObservedThroughSequence <= request.Expected.ObservedThroughSequence {
		return fmt.Errorf(
			"narrator projection observed cursor %d must advance beyond %d",
			request.ObservedThroughSequence,
			request.Expected.ObservedThroughSequence,
		)
	}
	if err := validateTrimmedText("narrator projection current focus", request.CurrentFocus); err != nil {
		return err
	}
	if request.Milestones == nil {
		return fmt.Errorf("narrator projection milestones must be an array, not null")
	}
	return nil
}

func validateNarratorProjectionChannel(request NarratorProjectionCommit) error {
	if !validNarrationTrigger(request.Trigger) ||
		request.Trigger == NarrationTriggerExplicitStatusRequested ||
		request.Trigger == NarrationTriggerCheckpointWindowExceeded {
		return fmt.Errorf("narrator projection has unsupported trigger %q", request.Trigger)
	}
	if request.Trigger == NarrationTriggerTurnTerminal {
		if request.FinalSummary == nil {
			return fmt.Errorf("terminal narrator projection requires final summary")
		}
	} else if request.FinalSummary != nil {
		return fmt.Errorf("nonterminal narrator projection cannot persist final summary")
	}
	return nil
}

func validateNarratorTopicDescriptorCommit(request NarratorProjectionCommit) error {
	if request.TopicDescriptor == nil && request.ConversationCommittedID != nil {
		return fmt.Errorf("narrator projection cannot publish conversation update without topic descriptor")
	}
	if request.TopicDescriptor != nil {
		if err := validateOptionalIdentifier("narrator projection conversation committed event id", request.ConversationCommittedID); err != nil {
			return err
		}
		if request.ConversationCommittedID == nil {
			return fmt.Errorf("narrator topic descriptor requires conversation committed event id")
		}
	}
	return nil
}

func (request NarratorStatusCommit) Validate() error {
	if err := validateNarratorStatusTarget(request); err != nil {
		return err
	}
	if err := validateNarrationTextCommit("narrator status reply", request.Reply); err != nil {
		return err
	}
	if err := validateNarratorOutputAudit(
		request.Expected,
		request.ResolvedInvocation,
		request.CommittedAt,
	); err != nil {
		return err
	}
	if err := validateSuccessfulNarratorAttempt(request.InvocationAttempt, request.ResolvedInvocation, request.CommittedAt); err != nil {
		return err
	}
	if err := validateStatusInvocationAttempt(request); err != nil {
		return err
	}
	return validateNarratorStatusIdentities(request)
}

func validateProjectionInvocationAttempt(request NarratorProjectionCommit) error {
	attempt := request.InvocationAttempt
	wantCallKind := InvocationAttemptCallProjection
	if request.Trigger == NarrationTriggerTurnTerminal {
		wantCallKind = InvocationAttemptCallTerminal
	}
	if !invocationAttemptChecksPass(
		attempt.ConversationID == request.ConversationID,
		invocationAttemptStringEquals(attempt.TurnID, request.TurnID),
		attempt.CallKind == wantCallKind,
		invocationAttemptTriggerEquals(attempt.Trigger, request.Trigger),
		attempt.Context.Materialized,
		invocationAttemptIntEquals(attempt.Context.ProposedObservedThrough, request.ObservedThroughSequence),
	) {
		return fmt.Errorf("narrator projection invocation attempt does not match its output envelope")
	}
	wantFinalSummaryBytes := narrationTextCommitBytes(request.FinalSummary)
	wantTopicDescriptorBytes := narrationTextCommitBytes(request.TopicDescriptor)
	if !invocationAttemptChecksPass(
		attempt.Output.StructuredKind != nil,
		attempt.Output.MilestoneCount == len(request.Milestones),
		attempt.Output.StatusReplyBytes == 0,
		attempt.Output.FinalSummaryBytes == wantFinalSummaryBytes,
		attempt.Output.TopicDescriptorBytes == wantTopicDescriptorBytes,
		attempt.Output.CheckpointSummaryBytes == 0,
	) {
		return fmt.Errorf("narrator projection invocation attempt output does not match committed narration")
	}
	return nil
}

func validateStatusInvocationAttempt(request NarratorStatusCommit) error {
	attempt := request.InvocationAttempt
	if !invocationAttemptChecksPass(
		attempt.ConversationID == request.ConversationID,
		equalOptionalString(attempt.TurnID, request.TurnID),
		attempt.CallKind == InvocationAttemptCallStatus,
		invocationAttemptTriggerEquals(attempt.Trigger, NarrationTriggerExplicitStatusRequested),
		attempt.Context.Materialized,
		attempt.Context.SourceThroughSequence == request.SourceThroughSequence,
		attempt.Output.StructuredKind != nil,
		attempt.Output.MilestoneCount == 0,
		attempt.Output.StatusReplyBytes == len(request.Reply.Text),
		attempt.Output.FinalSummaryBytes == 0,
		attempt.Output.TopicDescriptorBytes == 0,
		attempt.Output.CheckpointSummaryBytes == 0,
	) {
		return fmt.Errorf("narrator status invocation attempt does not match committed reply")
	}
	return nil
}

func narrationTextCommitBytes(value *NarrationTextCommit) int {
	if value == nil {
		return 0
	}
	return len(value.Text)
}

func validateNarratorStatusTarget(request NarratorStatusCommit) error {
	if err := validateIdentifier("narrator status conversation id", request.ConversationID); err != nil {
		return err
	}
	if err := validateOptionalIdentifier("narrator status turn id", request.TurnID); err != nil {
		return err
	}
	if err := validateNarratorExpectedVersion(request.Expected, request.ConversationID); err != nil {
		return err
	}
	if request.SourceSequenceStart < 0 || request.SourceThroughSequence < request.SourceSequenceStart {
		return fmt.Errorf(
			"narrator status has invalid source range %d..%d",
			request.SourceSequenceStart,
			request.SourceThroughSequence,
		)
	}
	if err := validateTrimmedText("narrator status question", request.Question); err != nil {
		return err
	}
	return nil
}

func validateProjectionOutputIdentities(request NarratorProjectionCommit) error {
	seen := map[string]bool{}
	if err := addNarratorProjectionEnvelopeIDs(seen, request); err != nil {
		return err
	}
	if err := validateNarratorMilestoneIdentities(seen, request.Milestones); err != nil {
		return err
	}
	return validateOptionalNarratorOutputIdentities(
		seen,
		request.FinalSummary,
		request.TopicDescriptor,
	)
}

func addNarratorProjectionEnvelopeIDs(
	seen map[string]bool,
	request NarratorProjectionCommit,
) error {
	ids := []narratorCommitID{
		{label: "narrator invocation id", value: request.ResolvedInvocation.ID},
		{label: "narrator invocation attempt committed event id", value: request.InvocationAttemptCommittedID},
		{label: "narrator state committed event id", value: request.NarratorStateCommittedID},
	}
	if request.ConversationCommittedID != nil {
		ids = append(ids, narratorCommitID{
			label: "conversation committed event id",
			value: *request.ConversationCommittedID,
		})
	}
	return addNarratorCommitIDs(seen, ids)
}

func validateNarratorMilestoneIdentities(
	seen map[string]bool,
	milestones []NarrationTextCommit,
) error {
	for index, milestone := range milestones {
		if err := validateNarrationTextCommit(fmt.Sprintf("narrator milestone %d", index), milestone); err != nil {
			return err
		}
		if err := addNarrationTextCommitIDs(seen, milestone); err != nil {
			return err
		}
	}
	return nil
}

func validateOptionalNarratorOutputIdentities(
	seen map[string]bool,
	outputs ...*NarrationTextCommit,
) error {
	for _, output := range outputs {
		if output == nil {
			continue
		}
		if err := validateNarrationTextCommit("narrator projection output", *output); err != nil {
			return err
		}
		if err := addNarrationTextCommitIDs(seen, *output); err != nil {
			return err
		}
	}
	return nil
}

func validateNarratorStatusIdentities(request NarratorStatusCommit) error {
	return addNarratorCommitIDs(map[string]bool{}, []narratorCommitID{
		{label: "narrator invocation id", value: request.ResolvedInvocation.ID},
		{label: "narrator invocation attempt committed event id", value: request.InvocationAttemptCommittedID},
		{label: "narrator state committed event id", value: request.NarratorStateCommittedID},
		{label: "narrator status narration event id", value: request.Reply.NarrationEventID},
		{label: "narrator status committed event id", value: request.Reply.CommittedEventID},
	})
}

func validateSuccessfulNarratorAttempt(
	attempt InvocationAttempt,
	invocation ResolvedInvocation,
	committedAt string,
) error {
	if err := attempt.Validate(); err != nil {
		return fmt.Errorf("narrator invocation attempt: %w", err)
	}
	if !invocationAttemptChecksPass(
		attempt.Outcome == InvocationAttemptOutcomeCompleted,
		attempt.CommitDecision == InvocationCommitOutputCommitted,
		attempt.Requested != nil,
		attempt.Resolved != nil,
		resolvedInvocationEndedAtMatches(attempt, invocation),
	) {
		return fmt.Errorf("narrator output requires a completed invocation attempt")
	}
	if !invocationAttemptChecksPass(
		reflect.DeepEqual(*attempt.Requested, invocation.Requested),
		reflect.DeepEqual(*attempt.Resolved, invocation.Resolved),
		attempt.ContextUsage == invocation.ContextUsage,
		reflect.DeepEqual(attempt.ProviderReferences, invocation.ProviderReferences),
		attempt.StartedAt == invocation.StartedAt,
	) {
		return fmt.Errorf("narrator invocation attempt does not match resolved invocation")
	}
	return validateInvocationAttemptCommitTime(attempt, committedAt)
}

func invocationAttemptTriggerEquals(actual *NarrationTrigger, want NarrationTrigger) bool {
	return actual != nil && *actual == want
}

func invocationAttemptIntEquals(actual *int, want int) bool {
	return actual != nil && *actual == want
}

type narratorCommitID struct {
	label string
	value string
}

func addNarratorCommitIDs(seen map[string]bool, ids []narratorCommitID) error {
	for _, id := range ids {
		if err := addNarratorCommitID(seen, id.label, id.value); err != nil {
			return err
		}
	}
	return nil
}

func validateNarrationTextCommit(label string, output NarrationTextCommit) error {
	if err := validateIdentifier(label+" narration event id", output.NarrationEventID); err != nil {
		return err
	}
	if err := validateIdentifier(label+" committed event id", output.CommittedEventID); err != nil {
		return err
	}
	return validateTrimmedText(label+" text", output.Text)
}

func addNarrationTextCommitIDs(seen map[string]bool, output NarrationTextCommit) error {
	if err := addNarratorCommitID(seen, "narration event id", output.NarrationEventID); err != nil {
		return err
	}
	return addNarratorCommitID(seen, "narration committed event id", output.CommittedEventID)
}

func addNarratorCommitID(seen map[string]bool, label string, id string) error {
	if err := validateIdentifier(label, id); err != nil {
		return err
	}
	if seen[id] {
		return fmt.Errorf("%s %q is reused within one narrator commit", label, id)
	}
	seen[id] = true
	return nil
}

func validateSuccessfulNarratorInvocation(invocation ResolvedInvocation) error {
	if err := invocation.Validate(); err != nil {
		return fmt.Errorf("narrator output invocation: %w", err)
	}
	if invocation.Role != RoleNarrator || invocation.Outcome != InvocationOutcomeSucceeded {
		return fmt.Errorf("narrator output requires a successful narrator invocation")
	}
	if invocation.ContextUsage.InputBytes <= 0 || invocation.ContextUsage.OutputBytes <= 0 ||
		invocation.ContextUsage.EstimatedInputTokens <= 0 ||
		invocation.ContextUsage.EstimatedOutputTokens <= 0 {
		return errors.New("narrator output invocation requires positive input/output byte and token usage")
	}
	return nil
}

func validateNarratorOutputAudit(
	expected NarratorStateExpectation,
	invocation ResolvedInvocation,
	committedAt string,
) error {
	if err := validateSuccessfulNarratorInvocation(invocation); err != nil {
		return err
	}
	if err := validateNarratorCommitTimestamp(expected.UpdatedAt, committedAt); err != nil {
		return err
	}
	return validateNarratorInvocationCommitOrder(invocation, committedAt)
}

func validateNarratorCommitTimestamp(expectedUpdatedAt string, committedAt string) error {
	expected, err := validateTimestamp("narrator expected updatedAt", expectedUpdatedAt)
	if err != nil {
		return err
	}
	committed, err := validateTimestamp("narrator output committedAt", committedAt)
	if err != nil {
		return err
	}
	if !committed.After(expected) {
		return fmt.Errorf("narrator output committedAt must advance beyond expected updatedAt")
	}
	return nil
}

func validateNarratorInvocationCommitOrder(invocation ResolvedInvocation, committedAt string) error {
	endedAt, err := validateTimestampPointer("narrator invocation endedAt", invocation.EndedAt)
	if err != nil {
		return err
	}
	committed, err := validateTimestamp("narrator output committedAt", committedAt)
	if err != nil {
		return err
	}
	if committed.Before(endedAt) {
		return fmt.Errorf("narrator output committedAt precedes invocation endedAt")
	}
	return nil
}
