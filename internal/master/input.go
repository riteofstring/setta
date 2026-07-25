package master

import (
	"errors"
	"fmt"
	"strings"
	"time"
)

const (
	MaxInputIDBytes   = 512
	MaxInputTextBytes = 256 * 1024
	MaxFocusHintBytes = 512

	InputAcceptedEventKind  = "master.input.accepted"
	InputStreamID           = "master:inputs"
	masterInputIDCharacters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.:"
)

type MasterInputModality string
type MasterInputSource string

const (
	MasterInputModalityText  MasterInputModality = "text"
	MasterInputModalityVoice MasterInputModality = "voice"

	MasterInputSourceShell                  MasterInputSource = "shell"
	MasterInputSourceConversationEscalation MasterInputSource = "conversation_escalation"
)

type MasterInput struct {
	ID                             string              `json:"id"`
	Text                           string              `json:"text"`
	Modality                       MasterInputModality `json:"modality"`
	Source                         MasterInputSource   `json:"source"`
	SubmittedAt                    string              `json:"submittedAt"`
	FocusedWorkspaceID             *string             `json:"focusedWorkspaceId"`
	FocusedConversationID          *string             `json:"focusedConversationId"`
	OriginatingWorkspaceID         *string             `json:"originatingWorkspaceId"`
	OriginatingConversationID      *string             `json:"originatingConversationId"`
	OriginatingConversationInputID *string             `json:"originatingConversationInputId"`
}

// MasterReplyDelivery is derived from the trusted source linkage on a master
// input. Shell replies have no originating target and use the active shell
// interaction. Conversation escalations carry the exact conversation/input
// target and never populate the shell interaction.
type MasterReplyDelivery struct {
	OriginatingWorkspaceID         *string `json:"originatingWorkspaceId"`
	OriginatingConversationID      *string `json:"originatingConversationId"`
	OriginatingConversationInputID *string `json:"originatingConversationInputId"`
}

type AcceptedMasterInput struct {
	Sequence      int                 `json:"sequence"`
	Input         MasterInput         `json:"input"`
	ReplyDelivery MasterReplyDelivery `json:"replyDelivery"`
	AcceptedAt    string              `json:"acceptedAt"`
}

type InputConflictError struct {
	InputID string
}

func (err *InputConflictError) Error() string {
	return fmt.Sprintf("master input %s was already accepted with different content", err.InputID)
}

func IsInputConflict(err error) bool {
	var conflict *InputConflictError
	return errors.As(err, &conflict)
}

func NormalizeInput(input MasterInput) (MasterInput, error) {
	if err := validateMasterInputContent(input); err != nil {
		return MasterInput{}, err
	}
	submittedAt, err := normalizeTimestamp("master input submittedAt", input.SubmittedAt)
	if err != nil {
		return MasterInput{}, err
	}
	if err := validateMasterInputReferences(input); err != nil {
		return MasterInput{}, err
	}
	normalized := cloneInput(input)
	normalized.SubmittedAt = submittedAt
	return normalized, nil
}

func ValidateInputID(inputID string) error {
	if err := validateBoundedIdentifier("master input id", inputID, MaxInputIDBytes); err != nil {
		return err
	}
	for _, character := range inputID {
		if !strings.ContainsRune(masterInputIDCharacters, character) {
			return fmt.Errorf("master input id contains unsupported character %q", character)
		}
	}
	return nil
}

func (accepted AcceptedMasterInput) Validate() error {
	if accepted.Sequence <= 0 {
		return errors.New("accepted master input sequence must be positive")
	}
	normalized, err := NormalizeInput(accepted.Input)
	if err != nil {
		return err
	}
	if !EqualInputs(normalized, accepted.Input) {
		return errors.New("accepted master input is not normalized")
	}
	wantDelivery := ReplyDeliveryForInput(normalized)
	if !EqualReplyDeliveries(accepted.ReplyDelivery, wantDelivery) {
		return errors.New("accepted master input reply delivery does not match its source")
	}
	acceptedAt, err := normalizeTimestamp("master input acceptedAt", accepted.AcceptedAt)
	if err != nil {
		return err
	}
	if acceptedAt != accepted.AcceptedAt {
		return errors.New("master input acceptedAt is not normalized")
	}
	return nil
}

func EqualInputs(left MasterInput, right MasterInput) bool {
	return equalMasterInputCore(left, right) &&
		equalMasterInputFocus(left, right) &&
		equalMasterInputOrigin(left, right)
}

func equalMasterInputCore(left MasterInput, right MasterInput) bool {
	return left.ID == right.ID &&
		left.Text == right.Text &&
		left.Modality == right.Modality &&
		left.Source == right.Source &&
		left.SubmittedAt == right.SubmittedAt
}

func equalMasterInputFocus(left MasterInput, right MasterInput) bool {
	return equalOptionalString(left.FocusedWorkspaceID, right.FocusedWorkspaceID) &&
		equalOptionalString(left.FocusedConversationID, right.FocusedConversationID)
}

func equalMasterInputOrigin(left MasterInput, right MasterInput) bool {
	return equalOptionalString(left.OriginatingWorkspaceID, right.OriginatingWorkspaceID) &&
		equalOptionalString(left.OriginatingConversationID, right.OriginatingConversationID) &&
		equalOptionalString(left.OriginatingConversationInputID, right.OriginatingConversationInputID)
}

func CloneAcceptedInput(accepted AcceptedMasterInput) AcceptedMasterInput {
	accepted.Input = cloneInput(accepted.Input)
	accepted.ReplyDelivery = cloneReplyDelivery(accepted.ReplyDelivery)
	return accepted
}

func ReplyDeliveryForInput(input MasterInput) MasterReplyDelivery {
	delivery := MasterReplyDelivery{}
	if input.Source != MasterInputSourceConversationEscalation {
		return delivery
	}
	delivery.OriginatingWorkspaceID = cloneString(input.OriginatingWorkspaceID)
	delivery.OriginatingConversationID = cloneString(input.OriginatingConversationID)
	delivery.OriginatingConversationInputID = cloneString(input.OriginatingConversationInputID)
	return delivery
}

func EqualReplyDeliveries(left MasterReplyDelivery, right MasterReplyDelivery) bool {
	return equalOptionalString(left.OriginatingWorkspaceID, right.OriginatingWorkspaceID) &&
		equalOptionalString(left.OriginatingConversationID, right.OriginatingConversationID) &&
		equalOptionalString(left.OriginatingConversationInputID, right.OriginatingConversationInputID)
}

func AcceptedInputEventID(inputID string) string {
	return "master-input-accepted:" + inputID
}

func validateOptionalFocusHint(label string, value *string) error {
	if value == nil {
		return nil
	}
	return validateBoundedIdentifier(label, *value, MaxFocusHintBytes)
}

func validateMasterInputContent(input MasterInput) error {
	if err := ValidateInputID(input.ID); err != nil {
		return err
	}
	if strings.TrimSpace(input.Text) == "" {
		return errors.New("master input text is required")
	}
	if len(input.Text) > MaxInputTextBytes {
		return fmt.Errorf("master input text exceeds %d bytes", MaxInputTextBytes)
	}
	switch input.Modality {
	case MasterInputModalityText, MasterInputModalityVoice:
	default:
		return fmt.Errorf("unsupported master input modality %q", input.Modality)
	}
	switch input.Source {
	case MasterInputSourceShell, MasterInputSourceConversationEscalation:
		return nil
	default:
		return fmt.Errorf("unsupported master input source %q", input.Source)
	}
}

func validateMasterInputReferences(input MasterInput) error {
	references := []struct {
		label string
		value *string
	}{
		{label: "master input focused workspace id", value: input.FocusedWorkspaceID},
		{label: "master input focused conversation id", value: input.FocusedConversationID},
		{label: "master input originating workspace id", value: input.OriginatingWorkspaceID},
		{label: "master input originating conversation id", value: input.OriginatingConversationID},
		{label: "master input originating conversation input id", value: input.OriginatingConversationInputID},
	}
	for _, reference := range references {
		if err := validateOptionalFocusHint(reference.label, reference.value); err != nil {
			return err
		}
	}
	return validateMasterInputSourceLinkage(input)
}

func validateMasterInputSourceLinkage(input MasterInput) error {
	originating := []*string{
		input.OriginatingWorkspaceID,
		input.OriginatingConversationID,
		input.OriginatingConversationInputID,
	}
	switch input.Source {
	case MasterInputSourceShell:
		for _, value := range originating {
			if value != nil {
				return errors.New("shell master input cannot contain originating conversation linkage")
			}
		}
		return nil
	case MasterInputSourceConversationEscalation:
		if input.OriginatingWorkspaceID == nil ||
			input.OriginatingConversationID == nil ||
			input.OriginatingConversationInputID == nil {
			return errors.New("conversation-escalation master input requires originating workspace, conversation, and input ids")
		}
		return nil
	default:
		return fmt.Errorf("unsupported master input source %q", input.Source)
	}
}

func validateBoundedIdentifier(label string, value string, maximumBytes int) error {
	if value == "" {
		return fmt.Errorf("%s is required", label)
	}
	if strings.TrimSpace(value) != value {
		return fmt.Errorf("%s must not have surrounding whitespace", label)
	}
	if len(value) > maximumBytes {
		return fmt.Errorf("%s exceeds %d bytes", label, maximumBytes)
	}
	return nil
}

func normalizeTimestamp(label string, value string) (string, error) {
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

func cloneInput(input MasterInput) MasterInput {
	input.FocusedWorkspaceID = cloneString(input.FocusedWorkspaceID)
	input.FocusedConversationID = cloneString(input.FocusedConversationID)
	input.OriginatingWorkspaceID = cloneString(input.OriginatingWorkspaceID)
	input.OriginatingConversationID = cloneString(input.OriginatingConversationID)
	input.OriginatingConversationInputID = cloneString(input.OriginatingConversationInputID)
	return input
}

func cloneReplyDelivery(delivery MasterReplyDelivery) MasterReplyDelivery {
	delivery.OriginatingWorkspaceID = cloneString(delivery.OriginatingWorkspaceID)
	delivery.OriginatingConversationID = cloneString(delivery.OriginatingConversationID)
	delivery.OriginatingConversationInputID = cloneString(delivery.OriginatingConversationInputID)
	return delivery
}

func cloneString(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func equalOptionalString(left *string, right *string) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}
