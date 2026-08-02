package director

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"

	"setta/internal/conversation"
	"setta/internal/jsonio"
)

const MaxDirectorReadinessQuestionBytes = 4 * 1024

type DirectorReadinessDisposition string

const (
	DirectorReadinessWorkPermitted    DirectorReadinessDisposition = "work_permitted"
	DirectorReadinessUserChoiceNeeded DirectorReadinessDisposition = "user_choice_needed"
)

const directorReadinessReview = `Act as Setta's pre-action readiness reviewer. Classify what authorizes the response before any new work starts.

Choose exactly one basis:
- non_work_or_control: the turn calls for conversation, explanation, status, app control, cancellation, or answers an earlier question.
- fully_specified: the requested outcome is sufficiently defined for normal implementation judgment and has one objectively checkable completion state.
- objectively_discoverable: an outcome-defining fact is unstated, but the supplied request or recent conversation establishes a concrete, authoritative basis that is actually available to the worker and yields one objectively correct answer.
- missing_user_requirement: the outcome depends on an unstated user-owned requirement, materially different results could all fit the known context, and no concrete authoritative basis for choosing among them is established here.

Do not infer an authoritative basis from contextual clues or from the possibility that future investigation might uncover one. Do not turn normal implementation details into user choices.

For missing_user_requirement, return one concise question about only the outcome-defining information. For every other basis, return an empty question. Do not perform, route, plan, or narrate the work.`

type DirectorReadinessRequest struct {
	Intent  SubmittedIntent
	History []DirectorHistoryItem
}

type DirectorReadinessReview struct {
	Disposition DirectorReadinessDisposition
	Question    string
	Invocation  conversation.ResolvedInvocation
}

type directorReadinessWireOutput struct {
	Basis    directorReadinessBasis `json:"basis"`
	Question string                 `json:"question"`
}

type directorReadinessBasis string

const (
	directorReadinessBasisNonWorkOrControl        directorReadinessBasis = "non_work_or_control"
	directorReadinessBasisFullySpecified          directorReadinessBasis = "fully_specified"
	directorReadinessBasisObjectivelyDiscoverable directorReadinessBasis = "objectively_discoverable"
	directorReadinessBasisMissingUserRequirement  directorReadinessBasis = "missing_user_requirement"
)

type directorReadinessInput struct {
	RecentConversation []directorReadinessHistoryItem `json:"recentConversation"`
	CurrentRequest     string                         `json:"currentRequest"`
}

type directorReadinessHistoryItem struct {
	TurnID string `json:"turnId"`
	Role   string `json:"role"`
	Text   string `json:"text"`
}

var directorReadinessOutputSchemaJSON = mustDirectorReadinessOutputSchemaJSON()

func mustDirectorReadinessOutputSchemaJSON() json.RawMessage {
	encoded, err := json.Marshal(map[string]any{
		"type":                 "object",
		"additionalProperties": false,
		"required":             []string{"basis", "question"},
		"properties": map[string]any{
			"basis": map[string]any{
				"type": "string",
				"enum": []string{
					string(directorReadinessBasisNonWorkOrControl),
					string(directorReadinessBasisFullySpecified),
					string(directorReadinessBasisObjectivelyDiscoverable),
					string(directorReadinessBasisMissingUserRequirement),
				},
			},
			"question": map[string]any{
				"type":      "string",
				"maxLength": MaxDirectorReadinessQuestionBytes,
			},
		},
	})
	if err != nil {
		panic(fmt.Sprintf("encode Director readiness output schema: %v", err))
	}
	return json.RawMessage(encoded)
}

func DirectorReadinessInstructions() string {
	return directorReadinessReview
}

func DirectorReadinessOutputSchema() json.RawMessage {
	return append(json.RawMessage{}, directorReadinessOutputSchemaJSON...)
}

func EncodeDirectorReadinessInput(
	request DirectorReadinessRequest,
	maxInputBytes int,
) (json.RawMessage, error) {
	if err := request.Validate(); err != nil {
		return nil, err
	}
	if maxInputBytes <= 0 {
		return nil, errors.New("Director readiness input budget must be positive")
	}
	history := append([]DirectorHistoryItem{}, request.History...)
	for {
		encoded, err := json.Marshal(directorReadinessInput{
			RecentConversation: directorReadinessHistory(history),
			CurrentRequest:     request.Intent.Text,
		})
		if err != nil {
			return nil, fmt.Errorf("encode Director readiness input: %w", err)
		}
		if len(encoded) <= maxInputBytes {
			return json.RawMessage(encoded), nil
		}
		if len(history) == 0 {
			return nil, fmt.Errorf(
				"%w: Director readiness input needs %d bytes, and the role allows %d",
				ErrDirectorIntentRejected,
				len(encoded),
				maxInputBytes,
			)
		}
		history = dropOldestDirectorReadinessTurn(history)
	}
}

func DecodeDirectorReadinessOutput(raw json.RawMessage) (DirectorReadinessDisposition, string, error) {
	var output directorReadinessWireOutput
	if err := jsonio.DecodeSingle(bytes.NewReader(raw), &output); err != nil {
		return "", "", fmt.Errorf("decode Director readiness output: %w", err)
	}
	disposition, err := directorReadinessDispositionForBasis(output.Basis)
	if err != nil {
		return "", "", err
	}
	if err := validateDirectorReadinessDecision(disposition, output.Question); err != nil {
		return "", "", err
	}
	return disposition, output.Question, nil
}

func directorReadinessDispositionForBasis(
	basis directorReadinessBasis,
) (DirectorReadinessDisposition, error) {
	switch basis {
	case directorReadinessBasisNonWorkOrControl,
		directorReadinessBasisFullySpecified,
		directorReadinessBasisObjectivelyDiscoverable:
		return DirectorReadinessWorkPermitted, nil
	case directorReadinessBasisMissingUserRequirement:
		return DirectorReadinessUserChoiceNeeded, nil
	default:
		return "", fmt.Errorf("unsupported Director readiness basis %q", basis)
	}
}

func (request DirectorReadinessRequest) Validate() error {
	if err := validateSubmittedIntent(request.Intent); err != nil {
		return err
	}
	for index, item := range request.History {
		if err := validateIdentifier("Director readiness history turn id", item.TurnID); err != nil {
			return fmt.Errorf("Director readiness history[%d]: %w", index, err)
		}
		if err := validateTrimmedText("Director readiness history text", item.Text); err != nil {
			return fmt.Errorf("Director readiness history[%d]: %w", index, err)
		}
	}
	return nil
}

func (review DirectorReadinessReview) Validate() error {
	if err := validateDirectorReadinessDecision(review.Disposition, review.Question); err != nil {
		return err
	}
	if _, err := validateDirectorTurnInvocation(0, review.Invocation); err != nil {
		return fmt.Errorf("Director readiness invocation: %w", err)
	}
	return nil
}

func validateDirectorReadinessDecision(
	disposition DirectorReadinessDisposition,
	question string,
) error {
	switch disposition {
	case DirectorReadinessWorkPermitted:
		if question != "" {
			return errors.New("work-permitted Director readiness output must have an empty question")
		}
		return nil
	case DirectorReadinessUserChoiceNeeded:
		if err := validateDecisionText(
			"Director readiness question",
			question,
			MaxDirectorReadinessQuestionBytes,
		); err != nil {
			return err
		}
		return nil
	default:
		return fmt.Errorf("unsupported Director readiness disposition %q", disposition)
	}
}

func directorReadinessHistory(history []DirectorHistoryItem) []directorReadinessHistoryItem {
	result := make([]directorReadinessHistoryItem, 0, len(history))
	for _, item := range history {
		role := "user_or_setta_context"
		if item.Assistant {
			role = "director"
		}
		result = append(result, directorReadinessHistoryItem{
			TurnID: item.TurnID,
			Role:   role,
			Text:   item.Text,
		})
	}
	return result
}

func dropOldestDirectorReadinessTurn(history []DirectorHistoryItem) []DirectorHistoryItem {
	turnID := history[0].TurnID
	first := 0
	for first < len(history) && history[first].TurnID == turnID {
		first++
	}
	return history[first:]
}

func toolsForDirectorReadiness(
	tools []SettaTool,
	review DirectorReadinessReview,
) ([]SettaTool, error) {
	if err := review.Validate(); err != nil {
		return nil, err
	}
	if review.Disposition == DirectorReadinessWorkPermitted {
		return tools, nil
	}
	restricted := make([]SettaTool, 0, len(tools))
	for _, tool := range tools {
		next := tool
		if directorReadinessBlocksTool(tool.Name) {
			question := review.Question
			next.Handler = func(context.Context, json.RawMessage) (SettaToolReceipt, error) {
				return SettaToolReceipt{}, fmt.Errorf(
					"%w: the requested outcome needs the user's answer before work can start: %s; call request_user_choice instead",
					ErrDirectorIntentRejected,
					question,
				)
			}
		}
		restricted = append(restricted, next)
	}
	return restricted, nil
}

func directorReadinessBlocksTool(tool string) bool {
	switch tool {
	case "create_workstream", "submit_work", "steer_work":
		return true
	default:
		return false
	}
}
