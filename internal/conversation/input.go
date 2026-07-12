package conversation

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

const (
	MaxConversationInputIDBytes        = 512
	MaxConversationInputReferenceBytes = 512
	MaxConversationInputTextBytes      = MaxAuthoredInputBytes

	ConversationInputAcceptedEventKind = "conversation.input.accepted"

	conversationInputIDCharacters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.:"
)

type ConversationInputModality string
type ConversationInputMode string
type ConversationInputStatus string

const (
	ConversationInputModalityText  ConversationInputModality = "text"
	ConversationInputModalityVoice ConversationInputModality = "voice"

	ConversationInputModeRoute       ConversationInputMode = "route"
	ConversationInputModeSend        ConversationInputMode = "send"
	ConversationInputModeQueue       ConversationInputMode = "queue"
	ConversationInputModeSteer       ConversationInputMode = "steer"
	ConversationInputModeAskNarrator ConversationInputMode = "ask_narrator"
	ConversationInputModeSide        ConversationInputMode = "side"
	ConversationInputModeFork        ConversationInputMode = "fork"

	ConversationInputStatusAccepted              ConversationInputStatus = "accepted"
	ConversationInputStatusRouting               ConversationInputStatus = "routing"
	ConversationInputStatusAwaitingClarification ConversationInputStatus = "awaiting_clarification"
	ConversationInputStatusDispatched            ConversationInputStatus = "dispatched"
	ConversationInputStatusFailed                ConversationInputStatus = "failed"
)

// ConversationInput contains the immutable, caller-authored portion of one
// conversation-local submission. Durable processing state belongs to the
// accepted record so an idempotent retry keeps comparing the original input
// even after later phases advance its routing lifecycle.
type ConversationInput struct {
	ID             string                    `json:"id"`
	ConversationID string                    `json:"conversationId"`
	SourcePaneID   *string                   `json:"sourcePaneId"`
	ReplyToInputID *string                   `json:"replyToInputId"`
	Text           string                    `json:"text"`
	Modality       ConversationInputModality `json:"modality"`
	RequestedMode  ConversationInputMode     `json:"requestedMode"`
	SubmittedAt    string                    `json:"submittedAt"`
}

type AcceptedConversationInput struct {
	Sequence   int                     `json:"sequence"`
	Input      ConversationInput       `json:"input"`
	Status     ConversationInputStatus `json:"status"`
	AcceptedAt string                  `json:"acceptedAt"`
}

type ConversationInputConflictError struct {
	InputID string
}

func (err *ConversationInputConflictError) Error() string {
	return fmt.Sprintf("conversation input %s was already accepted with different content", err.InputID)
}

func IsConversationInputConflict(err error) bool {
	var conflict *ConversationInputConflictError
	return errors.As(err, &conflict)
}

func NormalizeConversationInput(input ConversationInput) (ConversationInput, error) {
	if err := validateConversationInputIdentity(input); err != nil {
		return ConversationInput{}, err
	}
	if err := validateConversationInputContent(input); err != nil {
		return ConversationInput{}, err
	}
	submittedAt, err := normalizeConversationInputTimestamp("conversation input submittedAt", input.SubmittedAt)
	if err != nil {
		return ConversationInput{}, err
	}
	normalized := cloneConversationInput(input)
	normalized.SubmittedAt = submittedAt
	return normalized, nil
}

func validateConversationInputIdentity(input ConversationInput) error {
	if err := ValidateConversationInputID(input.ID); err != nil {
		return err
	}
	if err := validateConversationInputReference("conversation input conversation id", input.ConversationID); err != nil {
		return err
	}
	if err := validateOptionalConversationInputReference("conversation input source pane id", input.SourcePaneID); err != nil {
		return err
	}
	if input.ReplyToInputID != nil {
		if err := validateConversationInputIdentifier(
			"conversation input reply-to input id",
			*input.ReplyToInputID,
		); err != nil {
			return err
		}
	}
	if input.ReplyToInputID != nil && *input.ReplyToInputID == input.ID {
		return errors.New("conversation input cannot reply to itself")
	}
	return nil
}

func validateConversationInputContent(input ConversationInput) error {
	if strings.TrimSpace(input.Text) == "" {
		return errors.New("conversation input text is required")
	}
	if len(input.Text) > MaxConversationInputTextBytes {
		return fmt.Errorf("conversation input text exceeds %d bytes", MaxConversationInputTextBytes)
	}
	if !validConversationInputModality(input.Modality) {
		return fmt.Errorf("unsupported conversation input modality %q", input.Modality)
	}
	if !validConversationInputMode(input.RequestedMode) {
		return fmt.Errorf("unsupported conversation input mode %q", input.RequestedMode)
	}
	return nil
}

func ValidateConversationInputID(inputID string) error {
	return validateConversationInputIdentifier("conversation input id", inputID)
}

func validateConversationInputIdentifier(label string, inputID string) error {
	if err := validateBoundedConversationInputIdentifier(label, inputID, MaxConversationInputIDBytes); err != nil {
		return err
	}
	for _, character := range inputID {
		if !strings.ContainsRune(conversationInputIDCharacters, character) {
			return fmt.Errorf("%s contains unsupported character %q", label, character)
		}
	}
	return nil
}

func (accepted AcceptedConversationInput) Validate() error {
	if accepted.Sequence <= 0 {
		return errors.New("accepted conversation input sequence must be positive")
	}
	normalized, err := NormalizeConversationInput(accepted.Input)
	if err != nil {
		return err
	}
	if !EqualConversationInputs(normalized, accepted.Input) {
		return errors.New("accepted conversation input is not normalized")
	}
	if !validConversationInputStatus(accepted.Status) {
		return fmt.Errorf("accepted conversation input has unsupported status %q", accepted.Status)
	}
	acceptedAt, err := normalizeConversationInputTimestamp("conversation input acceptedAt", accepted.AcceptedAt)
	if err != nil {
		return err
	}
	if acceptedAt != accepted.AcceptedAt {
		return errors.New("conversation input acceptedAt is not normalized")
	}
	return nil
}

func EqualConversationInputs(left ConversationInput, right ConversationInput) bool {
	return left.ID == right.ID &&
		left.ConversationID == right.ConversationID &&
		equalOptionalString(left.SourcePaneID, right.SourcePaneID) &&
		equalOptionalString(left.ReplyToInputID, right.ReplyToInputID) &&
		left.Text == right.Text &&
		left.Modality == right.Modality &&
		left.RequestedMode == right.RequestedMode &&
		left.SubmittedAt == right.SubmittedAt
}

func CloneAcceptedConversationInput(accepted AcceptedConversationInput) AcceptedConversationInput {
	accepted.Input = cloneConversationInput(accepted.Input)
	return accepted
}

func ConversationInputStreamID(conversationID string) (string, error) {
	if err := validateConversationInputReference("conversation input stream conversation id", conversationID); err != nil {
		return "", err
	}
	return "conversation:" + conversationID + ":inputs", nil
}

func ConversationInputAcceptedEventID(inputID string) (string, error) {
	if err := ValidateConversationInputID(inputID); err != nil {
		return "", err
	}
	return "conversation-input-accepted:" + inputID, nil
}

func validConversationInputModality(modality ConversationInputModality) bool {
	switch modality {
	case ConversationInputModalityText, ConversationInputModalityVoice:
		return true
	default:
		return false
	}
}

func validConversationInputMode(mode ConversationInputMode) bool {
	switch mode {
	case ConversationInputModeRoute,
		ConversationInputModeSend,
		ConversationInputModeQueue,
		ConversationInputModeSteer,
		ConversationInputModeAskNarrator,
		ConversationInputModeSide,
		ConversationInputModeFork:
		return true
	default:
		return false
	}
}

func validConversationInputStatus(status ConversationInputStatus) bool {
	switch status {
	case ConversationInputStatusAccepted,
		ConversationInputStatusRouting,
		ConversationInputStatusAwaitingClarification,
		ConversationInputStatusDispatched,
		ConversationInputStatusFailed:
		return true
	default:
		return false
	}
}

func validateConversationInputReference(label string, value string) error {
	return validateBoundedConversationInputIdentifier(label, value, MaxConversationInputReferenceBytes)
}

func validateOptionalConversationInputReference(label string, value *string) error {
	if value == nil {
		return nil
	}
	return validateConversationInputReference(label, *value)
}

func validateBoundedConversationInputIdentifier(label string, value string, maximumBytes int) error {
	if err := validateIdentifier(label, value); err != nil {
		return err
	}
	if len(value) > maximumBytes {
		return fmt.Errorf("%s exceeds %d bytes", label, maximumBytes)
	}
	return nil
}

func normalizeConversationInputTimestamp(label string, value string) (string, error) {
	if value == "" {
		return "", fmt.Errorf("%s is required", label)
	}
	parsed, err := time.Parse(time.RFC3339Nano, value)
	if err != nil {
		return "", fmt.Errorf("%s must be RFC3339: %w", label, err)
	}
	_, offset := parsed.Zone()
	if offset != 0 {
		return "", fmt.Errorf("%s must use UTC", label)
	}
	return parsed.UTC().Format(time.RFC3339Nano), nil
}

func cloneConversationInput(input ConversationInput) ConversationInput {
	input.SourcePaneID = cloneStringPointer(input.SourcePaneID)
	input.ReplyToInputID = cloneStringPointer(input.ReplyToInputID)
	return input
}
