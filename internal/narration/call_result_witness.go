package narration

import (
	"bytes"
	"encoding/json"
	"errors"
	"reflect"

	"setta/internal/conversation"
)

// successfulCallWitness binds a validated result to the exact provider input
// and audit metadata produced by Caller. CallResult remains a value that actor
// workers may pass around, but a later prepared commit cannot be rebound to a
// same-sized mutated context or altered provider/model timeline.
type successfulCallWitness struct {
	metadata successfulCallMetadata
	model    ModelResolution
	input    json.RawMessage
	output   json.RawMessage
}

type successfulCallMetadata struct {
	requestID        string
	generation       uint64
	kind             RequestKind
	trigger          conversation.NarrationTrigger
	conversationID   string
	workspaceRoot    string
	providerThreadID string
	providerTurnID   string
	inputBytes       int
	inputTokens      int
	outputBytes      int
	outputTokens     int
	startedAt        string
	endedAt          string
}

func newSuccessfulCallWitness(
	workspaceRoot string,
	input json.RawMessage,
	result CallResult,
) *successfulCallWitness {
	return &successfulCallWitness{
		metadata: successfulCallMetadataFor(workspaceRoot, result),
		model:    cloneModelResolution(result.Model),
		input:    append(json.RawMessage{}, input...),
		output:   append(json.RawMessage{}, result.StructuredOutput...),
	}
}

func successfulCallMetadataFor(workspaceRoot string, result CallResult) successfulCallMetadata {
	return successfulCallMetadata{
		requestID:        result.RequestID,
		generation:       result.Generation,
		kind:             result.Kind,
		trigger:          result.Trigger,
		conversationID:   result.ConversationID,
		workspaceRoot:    workspaceRoot,
		providerThreadID: result.ProviderThreadID,
		providerTurnID:   result.ProviderTurnID,
		inputBytes:       result.InputBytes,
		inputTokens:      result.InputTokens,
		outputBytes:      result.OutputBytes,
		outputTokens:     result.OutputTokens,
		startedAt:        result.StartedAt,
		endedAt:          result.EndedAt,
	}
}

func validateSuccessfulCallWitness(
	request CallRequest,
	prepared preparedCallRequest,
	result CallResult,
) error {
	witness := result.witness
	if witness == nil {
		return errors.New("narrator successful call result has no caller witness")
	}
	if witness.metadata != successfulCallMetadataFor(request.WorkspaceRoot, result) {
		return errors.New("narrator successful call result metadata changed after provider validation")
	}
	if !reflect.DeepEqual(witness.model, result.Model) {
		return errors.New("narrator successful call model audit changed after provider validation")
	}
	if !bytes.Equal(witness.input, prepared.input) {
		return errors.New("narrator successful call context changed after provider validation")
	}
	if !bytes.Equal(witness.output, result.StructuredOutput) {
		return errors.New("narrator successful call structured output changed after provider validation")
	}
	return nil
}
