package conversation

import "fmt"

// NarrationTextCommit identifies one immutable narration record and its
// independently sequenced conversation-stream publication.
type NarrationTextCommit struct {
	NarrationEventID string
	CommittedEventID string
	Text             string
}

type NarratorProjectionCommit struct {
	ConversationID           string
	TurnID                   string
	Expected                 NarratorStateExpectation
	ObservedThroughSequence  int
	Milestones               []NarrationTextCommit
	FinalSummary             *NarrationTextCommit
	Trigger                  NarrationTrigger
	ResolvedInvocation       ResolvedInvocation
	NarratorStateCommittedID string
	CommittedAt              string
}

type NarratorProjectionCommitResult struct {
	State        NarratorState
	Conversation *TopicConversation
	Events       []NarrationEvent
}

type NarratorFocusCommit struct {
	ConversationID           string
	TurnID                   string
	Expected                 NarratorStateExpectation
	SourceThroughSequence    int
	CurrentFocus             string
	TopicDescriptor          *NarrationTextCommit
	Trigger                  NarrationTrigger
	ResolvedInvocation       ResolvedInvocation
	NarratorStateCommittedID string
	ConversationCommittedID  *string
	CommittedAt              string
}

type NarratorFocusCommitResult struct {
	State        NarratorState
	Conversation *TopicConversation
	Event        *NarrationEvent
}

type NarratorStatusCommit struct {
	ConversationID           string
	TurnID                   *string
	Expected                 NarratorStateExpectation
	SourceSequenceStart      int
	SourceThroughSequence    int
	Question                 string
	Reply                    NarrationTextCommit
	ResolvedInvocation       ResolvedInvocation
	NarratorStateCommittedID string
	CommittedAt              string
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
	if err := validateNarratorOutputAudit(
		request.Expected,
		request.ResolvedInvocation,
		request.CommittedAt,
	); err != nil {
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
	if request.ObservedThroughSequence < request.Expected.ObservedThroughSequence {
		return fmt.Errorf(
			"narrator projection observed cursor %d must not move behind %d",
			request.ObservedThroughSequence,
			request.Expected.ObservedThroughSequence,
		)
	}
	if request.ObservedThroughSequence == request.Expected.ObservedThroughSequence {
		if request.Trigger != NarrationTriggerTurnTerminal {
			return fmt.Errorf(
				"narrator projection observed cursor %d must advance beyond %d",
				request.ObservedThroughSequence,
				request.Expected.ObservedThroughSequence,
			)
		}
		if len(request.Milestones) > 0 {
			return fmt.Errorf("terminal narrator finalization at current cursor cannot persist milestones")
		}
	}
	if request.Milestones == nil {
		return fmt.Errorf("narrator projection milestones must be an array, not null")
	}
	if len(request.Milestones) > 1 {
		return fmt.Errorf("narrator projection emitted %d milestones, maximum is 1", len(request.Milestones))
	}
	return nil
}

func validateNarratorProjectionChannel(request NarratorProjectionCommit) error {
	if !validNarrationTrigger(request.Trigger) ||
		request.Trigger == NarrationTriggerInputAccepted ||
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

func (request NarratorFocusCommit) Validate() error {
	if err := validateNarratorFocusTarget(request); err != nil {
		return err
	}
	if err := validateNarratorTopicDescriptorCommit(request.TopicDescriptor, request.ConversationCommittedID); err != nil {
		return err
	}
	if err := validateNarratorOutputAudit(
		request.Expected,
		request.ResolvedInvocation,
		request.CommittedAt,
	); err != nil {
		return err
	}
	return validateFocusOutputIdentities(request)
}

func validateNarratorFocusTarget(request NarratorFocusCommit) error {
	if err := validateIdentifier("narrator focus conversation id", request.ConversationID); err != nil {
		return err
	}
	if err := validateIdentifier("narrator focus turn id", request.TurnID); err != nil {
		return err
	}
	if err := validateNarratorExpectedVersion(request.Expected, request.ConversationID); err != nil {
		return err
	}
	if request.SourceThroughSequence <= 0 {
		return fmt.Errorf("narrator focus source sequence must be positive")
	}
	if err := validateTrimmedText("narrator focus current focus", request.CurrentFocus); err != nil {
		return err
	}
	switch request.Trigger {
	case NarrationTriggerInputAccepted, NarrationTriggerUserSteered:
		return nil
	default:
		return fmt.Errorf("narrator focus has unsupported trigger %q", request.Trigger)
	}
}

func validateNarratorTopicDescriptorCommit(
	_ *NarrationTextCommit,
	conversationCommittedID *string,
) error {
	if conversationCommittedID != nil {
		return fmt.Errorf("narrator focus cannot publish conversation update")
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
	return validateNarratorStatusIdentities(request)
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
	)
}

func addNarratorProjectionEnvelopeIDs(
	seen map[string]bool,
	request NarratorProjectionCommit,
) error {
	ids := []narratorCommitID{
		{label: "narrator invocation id", value: request.ResolvedInvocation.ID},
		{label: "narrator state committed event id", value: request.NarratorStateCommittedID},
	}
	return addNarratorCommitIDs(seen, ids)
}

func validateFocusOutputIdentities(request NarratorFocusCommit) error {
	seen := map[string]bool{}
	ids := []narratorCommitID{
		{label: "narrator invocation id", value: request.ResolvedInvocation.ID},
		{label: "narrator state committed event id", value: request.NarratorStateCommittedID},
	}
	if err := addNarratorCommitIDs(seen, ids); err != nil {
		return err
	}
	return validateOptionalNarratorOutputIdentities(seen, request.TopicDescriptor)
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
		{label: "narrator state committed event id", value: request.NarratorStateCommittedID},
		{label: "narrator status narration event id", value: request.Reply.NarrationEventID},
		{label: "narrator status committed event id", value: request.Reply.CommittedEventID},
	})
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
