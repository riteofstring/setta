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

const (
	MasterInputModalityText  MasterInputModality = "text"
	MasterInputModalityVoice MasterInputModality = "voice"
)

type MasterInput struct {
	ID                    string              `json:"id"`
	Text                  string              `json:"text"`
	Modality              MasterInputModality `json:"modality"`
	SubmittedAt           string              `json:"submittedAt"`
	FocusedWorkspaceID    *string             `json:"focusedWorkspaceId"`
	FocusedConversationID *string             `json:"focusedConversationId"`
	FocusedPaneID         *string             `json:"focusedPaneId"`
}

type AcceptedMasterInput struct {
	Sequence   int         `json:"sequence"`
	Input      MasterInput `json:"input"`
	AcceptedAt string      `json:"acceptedAt"`
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
	if err := ValidateInputID(input.ID); err != nil {
		return MasterInput{}, err
	}
	if strings.TrimSpace(input.Text) == "" {
		return MasterInput{}, errors.New("master input text is required")
	}
	if len(input.Text) > MaxInputTextBytes {
		return MasterInput{}, fmt.Errorf("master input text exceeds %d bytes", MaxInputTextBytes)
	}
	switch input.Modality {
	case MasterInputModalityText, MasterInputModalityVoice:
	default:
		return MasterInput{}, fmt.Errorf("unsupported master input modality %q", input.Modality)
	}
	submittedAt, err := normalizeTimestamp("master input submittedAt", input.SubmittedAt)
	if err != nil {
		return MasterInput{}, err
	}
	if err := validateOptionalFocusHint("master input focused workspace id", input.FocusedWorkspaceID); err != nil {
		return MasterInput{}, err
	}
	if err := validateOptionalFocusHint("master input focused conversation id", input.FocusedConversationID); err != nil {
		return MasterInput{}, err
	}
	if err := validateOptionalFocusHint("master input focused pane id", input.FocusedPaneID); err != nil {
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
	return left.ID == right.ID &&
		left.Text == right.Text &&
		left.Modality == right.Modality &&
		left.SubmittedAt == right.SubmittedAt &&
		equalOptionalString(left.FocusedWorkspaceID, right.FocusedWorkspaceID) &&
		equalOptionalString(left.FocusedConversationID, right.FocusedConversationID) &&
		equalOptionalString(left.FocusedPaneID, right.FocusedPaneID)
}

func CloneAcceptedInput(accepted AcceptedMasterInput) AcceptedMasterInput {
	accepted.Input = cloneInput(accepted.Input)
	return accepted
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
	input.FocusedPaneID = cloneString(input.FocusedPaneID)
	return input
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
