package master

import (
	"errors"
	"fmt"
	"strings"
)

const (
	TranscriptStreamID              = "master:transcript"
	TranscriptEntryAddedKind        = "master.transcript.entry_added"
	MaxTranscriptEntryIDBytes       = MaxInputIDBytes + 64
	MaxTranscriptMessageBytes       = MaxRouteAnswerBytes
	MaxTranscriptReadEntries        = 200
	transcriptEntryIDPrefixUser     = "master-transcript:user:"
	transcriptEntryIDPrefixDecision = "master-transcript:decision:"
	transcriptEntryIDPrefixCancel   = "master-transcript:cancel:"
	transcriptEntryIDPrefixFailure  = "master-transcript:failure:"
)

type TranscriptEntryKind string

const (
	TranscriptEntryKindUserInput      TranscriptEntryKind = "user_input"
	TranscriptEntryKindAssistantReply TranscriptEntryKind = "assistant_reply"
	TranscriptEntryKindActionReceipt  TranscriptEntryKind = "action_receipt"
	TranscriptEntryKindCancellation   TranscriptEntryKind = "cancellation"
	TranscriptEntryKindFailure        TranscriptEntryKind = "failure"
)

type TranscriptUserInput struct {
	Text     string              `json:"text"`
	Modality MasterInputModality `json:"modality"`
}

type TranscriptAssistantReply struct {
	ReplyKind MasterReplyKind `json:"replyKind"`
	Text      string          `json:"text"`
}

type TranscriptActionReceipt struct {
	DecisionKind RouteDecisionKind `json:"decisionKind"`
	Text         string            `json:"text"`
}

type TranscriptCancellation struct {
	Message string `json:"message"`
}

type TranscriptFailure struct {
	Code      string `json:"code"`
	Message   string `json:"message"`
	Retryable bool   `json:"retryable"`
}

type TranscriptEntryPayload struct {
	ID             string                    `json:"id"`
	InputID        string                    `json:"inputId"`
	Kind           TranscriptEntryKind       `json:"kind"`
	CreatedAt      string                    `json:"createdAt"`
	UserInput      *TranscriptUserInput      `json:"userInput"`
	AssistantReply *TranscriptAssistantReply `json:"assistantReply"`
	ActionReceipt  *TranscriptActionReceipt  `json:"actionReceipt"`
	Cancellation   *TranscriptCancellation   `json:"cancellation"`
	Failure        *TranscriptFailure        `json:"failure"`
}

type TranscriptEntry struct {
	Sequence int                    `json:"sequence"`
	Payload  TranscriptEntryPayload `json:"payload"`
}

type Transcript struct {
	Entries      []TranscriptEntry `json:"entries"`
	LastSequence int               `json:"lastSequence"`
}

func TranscriptPayloadForAcceptedInput(
	accepted AcceptedMasterInput,
) (TranscriptEntryPayload, bool, error) {
	if err := accepted.Validate(); err != nil {
		return TranscriptEntryPayload{}, false, err
	}
	if accepted.Input.Source != MasterInputSourceShell {
		return TranscriptEntryPayload{}, false, nil
	}
	payload := TranscriptEntryPayload{
		ID:        transcriptEntryIDPrefixUser + accepted.Input.ID,
		InputID:   accepted.Input.ID,
		Kind:      TranscriptEntryKindUserInput,
		CreatedAt: accepted.AcceptedAt,
		UserInput: &TranscriptUserInput{
			Text:     accepted.Input.Text,
			Modality: accepted.Input.Modality,
		},
	}
	if err := payload.Validate(); err != nil {
		return TranscriptEntryPayload{}, false, err
	}
	return payload, true, nil
}

func TranscriptPayloadForRouteCommand(
	accepted AcceptedMasterInput,
	record RouteDecisionRecord,
	completedAt string,
) (TranscriptEntryPayload, bool, error) {
	if err := accepted.Validate(); err != nil {
		return TranscriptEntryPayload{}, false, err
	}
	if err := record.Validate(); err != nil {
		return TranscriptEntryPayload{}, false, err
	}
	if accepted.Input.Source != MasterInputSourceShell {
		return TranscriptEntryPayload{}, false, nil
	}
	if record.InputID != accepted.Input.ID {
		return TranscriptEntryPayload{}, false, errors.New("master transcript route record references another input")
	}
	createdAt, err := normalizeTimestamp("master transcript route completedAt", completedAt)
	if err != nil {
		return TranscriptEntryPayload{}, false, err
	}
	if createdAt != completedAt {
		return TranscriptEntryPayload{}, false, errors.New("master transcript route completedAt is not normalized")
	}
	payload := TranscriptEntryPayload{
		ID:        transcriptEntryIDPrefixDecision + record.ID,
		InputID:   record.InputID,
		Kind:      TranscriptEntryKindActionReceipt,
		CreatedAt: completedAt,
	}
	if record.ResultingCommand.Kind == RouteDecisionKindClarify ||
		record.ResultingCommand.Kind == RouteDecisionKindAnswerGlobal {
		payload.Kind = TranscriptEntryKindAssistantReply
		reply := transcriptAssistantReply(record.ResultingCommand)
		payload.AssistantReply = &reply
	} else {
		receipt, err := transcriptActionReceipt(record.ResultingCommand)
		if err != nil {
			return TranscriptEntryPayload{}, false, err
		}
		payload.ActionReceipt = &receipt
	}
	if err := payload.Validate(); err != nil {
		return TranscriptEntryPayload{}, false, err
	}
	return payload, true, nil
}

func TranscriptPayloadForCancellation(
	state InputRoutingState,
) (TranscriptEntryPayload, bool, error) {
	if err := state.Validate(); err != nil {
		return TranscriptEntryPayload{}, false, err
	}
	if state.Input.Input.Source != MasterInputSourceShell {
		return TranscriptEntryPayload{}, false, nil
	}
	if state.Status != InputRoutingStatusCancelled || state.Cancellation == nil {
		return TranscriptEntryPayload{}, false, errors.New("master transcript cancellation requires a cancelled routing state")
	}
	payload := TranscriptEntryPayload{
		ID:        transcriptEntryIDPrefixCancel + state.Input.Input.ID,
		InputID:   state.Input.Input.ID,
		Kind:      TranscriptEntryKindCancellation,
		CreatedAt: state.Cancellation.CancelledAt,
		Cancellation: &TranscriptCancellation{
			Message: "Setta cancelled this request before routing completed.",
		},
	}
	if err := payload.Validate(); err != nil {
		return TranscriptEntryPayload{}, false, err
	}
	return payload, true, nil
}

func TranscriptPayloadForFailure(
	accepted AcceptedMasterInput,
	failure InputRoutingFailure,
) (TranscriptEntryPayload, bool, error) {
	if err := accepted.Validate(); err != nil {
		return TranscriptEntryPayload{}, false, err
	}
	if err := failure.Validate(); err != nil {
		return TranscriptEntryPayload{}, false, err
	}
	if accepted.Input.Source != MasterInputSourceShell {
		return TranscriptEntryPayload{}, false, nil
	}
	if accepted.Input.ID != failure.InputID {
		return TranscriptEntryPayload{}, false, errors.New("master transcript failure references another input")
	}
	payload := TranscriptEntryPayload{
		ID:        fmt.Sprintf("%s%s:%d", transcriptEntryIDPrefixFailure, failure.InputID, failure.RoutingAttempt),
		InputID:   failure.InputID,
		Kind:      TranscriptEntryKindFailure,
		CreatedAt: failure.FailedAt,
		Failure: &TranscriptFailure{
			Code:      failure.Failure.Code,
			Message:   failure.Failure.Message,
			Retryable: failure.Failure.Retryable,
		},
	}
	if err := payload.Validate(); err != nil {
		return TranscriptEntryPayload{}, false, err
	}
	return payload, true, nil
}

func TranscriptEntryFromPayload(
	sequence int,
	payload TranscriptEntryPayload,
) (TranscriptEntry, error) {
	entry := TranscriptEntry{Sequence: sequence, Payload: CloneTranscriptEntryPayload(payload)}
	if err := entry.Validate(); err != nil {
		return TranscriptEntry{}, err
	}
	return entry, nil
}

func ValidateTranscriptReadLimit(limit int) error {
	if limit <= 0 || limit > MaxTranscriptReadEntries {
		return fmt.Errorf("master transcript read limit must be between 1 and %d", MaxTranscriptReadEntries)
	}
	return nil
}

func (payload TranscriptEntryPayload) Validate() error {
	if err := validateBoundedIdentifier("master transcript entry id", payload.ID, MaxTranscriptEntryIDBytes); err != nil {
		return err
	}
	if err := ValidateInputID(payload.InputID); err != nil {
		return fmt.Errorf("master transcript entry input id: %w", err)
	}
	createdAt, err := normalizeTimestamp("master transcript entry createdAt", payload.CreatedAt)
	if err != nil {
		return err
	}
	if createdAt != payload.CreatedAt {
		return errors.New("master transcript entry createdAt is not normalized")
	}
	if payload.payloadCount() != 1 {
		return errors.New("master transcript entry requires exactly one payload")
	}
	switch payload.Kind {
	case TranscriptEntryKindUserInput:
		return validateTranscriptUserInput(payload.UserInput)
	case TranscriptEntryKindAssistantReply:
		return validateTranscriptAssistantReply(payload.AssistantReply)
	case TranscriptEntryKindActionReceipt:
		return validateTranscriptActionReceipt(payload.ActionReceipt)
	case TranscriptEntryKindCancellation:
		return validateTranscriptCancellation(payload.Cancellation)
	case TranscriptEntryKindFailure:
		return validateTranscriptFailure(payload.Failure)
	default:
		return fmt.Errorf("unsupported master transcript entry kind %q", payload.Kind)
	}
}

func (payload TranscriptEntryPayload) payloadCount() int {
	count := 0
	for _, present := range []bool{
		payload.UserInput != nil,
		payload.AssistantReply != nil,
		payload.ActionReceipt != nil,
		payload.Cancellation != nil,
		payload.Failure != nil,
	} {
		if present {
			count++
		}
	}
	return count
}

func (entry TranscriptEntry) Validate() error {
	if entry.Sequence <= 0 {
		return errors.New("master transcript entry sequence must be positive")
	}
	return entry.Payload.Validate()
}

func (transcript Transcript) Validate() error {
	if len(transcript.Entries) > MaxTranscriptReadEntries {
		return fmt.Errorf("master transcript contains more than %d entries", MaxTranscriptReadEntries)
	}
	previous := 0
	for index, entry := range transcript.Entries {
		if err := entry.Validate(); err != nil {
			return fmt.Errorf("master transcript entry[%d]: %w", index, err)
		}
		if entry.Sequence <= previous {
			return errors.New("master transcript entries must be ordered by ascending sequence")
		}
		previous = entry.Sequence
	}
	if transcript.LastSequence < 0 {
		return errors.New("master transcript last sequence must be non-negative")
	}
	if len(transcript.Entries) > 0 && transcript.LastSequence != transcript.Entries[len(transcript.Entries)-1].Sequence {
		return errors.New("master transcript last sequence must match its last entry")
	}
	if len(transcript.Entries) == 0 && transcript.LastSequence != 0 {
		return errors.New("empty master transcript must have a zero last sequence")
	}
	return nil
}

func CloneTranscript(transcript Transcript) Transcript {
	transcript.Entries = CloneTranscriptEntries(transcript.Entries)
	return transcript
}

func CloneTranscriptEntries(entries []TranscriptEntry) []TranscriptEntry {
	cloned := make([]TranscriptEntry, len(entries))
	for index, entry := range entries {
		cloned[index] = CloneTranscriptEntry(entry)
	}
	return cloned
}

func CloneTranscriptEntry(entry TranscriptEntry) TranscriptEntry {
	entry.Payload = CloneTranscriptEntryPayload(entry.Payload)
	return entry
}

func CloneTranscriptEntryPayload(payload TranscriptEntryPayload) TranscriptEntryPayload {
	if payload.UserInput != nil {
		value := *payload.UserInput
		payload.UserInput = &value
	}
	if payload.AssistantReply != nil {
		value := *payload.AssistantReply
		payload.AssistantReply = &value
	}
	if payload.ActionReceipt != nil {
		value := *payload.ActionReceipt
		payload.ActionReceipt = &value
	}
	if payload.Cancellation != nil {
		value := *payload.Cancellation
		payload.Cancellation = &value
	}
	if payload.Failure != nil {
		value := *payload.Failure
		payload.Failure = &value
	}
	return payload
}

func validateTranscriptUserInput(payload *TranscriptUserInput) error {
	if payload == nil {
		return errors.New("master transcript user input requires userInput")
	}
	if strings.TrimSpace(payload.Text) == "" {
		return errors.New("master transcript user input text is required")
	}
	if len(payload.Text) > MaxInputTextBytes {
		return fmt.Errorf("master transcript user input text exceeds %d bytes", MaxInputTextBytes)
	}
	switch payload.Modality {
	case MasterInputModalityText, MasterInputModalityVoice:
		return nil
	default:
		return fmt.Errorf("unsupported master transcript input modality %q", payload.Modality)
	}
}

func validateTranscriptAssistantReply(payload *TranscriptAssistantReply) error {
	if payload == nil {
		return errors.New("master transcript assistant reply requires assistantReply")
	}
	switch payload.ReplyKind {
	case MasterReplyKindAnswer:
		return validateRouteText("master transcript answer", payload.Text, MaxRouteAnswerBytes)
	case MasterReplyKindClarification:
		return validateRouteText("master transcript clarification", payload.Text, MaxRouteQuestionBytes)
	default:
		return fmt.Errorf("unsupported master transcript reply kind %q", payload.ReplyKind)
	}
}

func validateTranscriptActionReceipt(payload *TranscriptActionReceipt) error {
	if payload == nil {
		return errors.New("master transcript action receipt requires actionReceipt")
	}
	if !validRouteDecisionKind(payload.DecisionKind) {
		return fmt.Errorf("unsupported master transcript action decision kind %q", payload.DecisionKind)
	}
	return validateRouteText("master transcript action receipt", payload.Text, MaxTranscriptMessageBytes)
}

func validateTranscriptCancellation(payload *TranscriptCancellation) error {
	if payload == nil {
		return errors.New("master transcript cancellation requires cancellation")
	}
	return validateRouteText("master transcript cancellation", payload.Message, MaxTranscriptMessageBytes)
}

func validateTranscriptFailure(payload *TranscriptFailure) error {
	if payload == nil {
		return errors.New("master transcript failure requires failure")
	}
	if err := validateBoundedIdentifier("master transcript failure code", payload.Code, MaxRouteReferenceBytes); err != nil {
		return err
	}
	return validateRouteText("master transcript failure message", payload.Message, MaxRouteFailureMessageBytes)
}

func transcriptAssistantReply(command RouteCommand) TranscriptAssistantReply {
	switch command.Kind {
	case RouteDecisionKindClarify:
		return TranscriptAssistantReply{
			ReplyKind: MasterReplyKindClarification,
			Text:      command.Clarify.Question,
		}
	case RouteDecisionKindAnswerGlobal:
		return TranscriptAssistantReply{
			ReplyKind: MasterReplyKindAnswer,
			Text:      command.AnswerGlobal.Text,
		}
	default:
		panic(fmt.Sprintf("unsupported master transcript reply command %q", command.Kind))
	}
}

func transcriptActionReceipt(command RouteCommand) (TranscriptActionReceipt, error) {
	text, err := transcriptActionReceiptText(command)
	if err != nil {
		return TranscriptActionReceipt{}, err
	}
	return TranscriptActionReceipt{
		DecisionKind: command.Kind,
		Text:         text,
	}, nil
}

func transcriptActionReceiptText(command RouteCommand) (string, error) {
	switch command.Kind {
	case RouteDecisionKindSendToAgent:
		return fmt.Sprintf("Setta sent this to %q.", command.SendToAgent.Target.Title), nil
	case RouteDecisionKindQueueAgentTurn:
		return fmt.Sprintf("Setta queued this in %q.", command.QueueAgentTurn.Target.Title), nil
	case RouteDecisionKindSteerActiveTurn:
		return fmt.Sprintf("Setta steered the active work in %q.", command.SteerActiveTurn.Target.Title), nil
	case RouteDecisionKindAskNarrator:
		return fmt.Sprintf("Setta asked the narrator for %q.", command.AskNarrator.Target.Title), nil
	case RouteDecisionKindFocusConversation:
		return fmt.Sprintf("Setta focused %q.", command.FocusConversation.Target.Title), nil
	case RouteDecisionKindCreateConversation:
		return fmt.Sprintf("Setta opened %q for this work.", command.CreateConversation.Target.Title), nil
	case RouteDecisionKindCreateSideConversation:
		return fmt.Sprintf("Setta opened a side conversation under %q.", command.CreateSideConversation.Target.Title), nil
	case RouteDecisionKindForkConversation:
		return fmt.Sprintf("Setta created a fork named %q.", command.ForkConversation.Target.Title), nil
	case RouteDecisionKindClarify, RouteDecisionKindAnswerGlobal:
		return "", fmt.Errorf("master transcript action receipt cannot use reply command %q", command.Kind)
	default:
		return "", fmt.Errorf("unsupported master transcript action command %q", command.Kind)
	}
}
