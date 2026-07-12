package narration

import (
	"encoding/json"
	"fmt"
	"sort"
)

func projectionOutputSchema(context ProjectionContextBundle) (json.RawMessage, error) {
	if context.Kind != ContextKindProjection {
		return nil, fmt.Errorf("narrator projection schema received context kind %q", context.Kind)
	}
	if err := context.EvaluationRange.Validate(); err != nil {
		return nil, err
	}
	properties := map[string]any{
		"observedThroughSequence": boundedIntegerSchema(context.EvaluationRange.Start, context.EvaluationRange.End),
		"currentFocus":            boundedStringSchema(MaxNarratorCurrentFocusCharacters),
		"milestones":              milestoneArraySchema(),
		"topicDescriptor":         nullableBoundedStringSchema(MaxNarratorTopicDescriptorCharacters),
	}
	switch context.RequestedChannel {
	case ProjectionChannelWorking:
		properties["kind"] = enumStringSchema(string(CallOutputWorkingProjection))
	case ProjectionChannelTerminal:
		properties["kind"] = enumStringSchema(string(CallOutputTerminalProjection))
		properties["finalSummary"] = boundedStringSchema(MaxNarratorFinalSummaryCharacters)
	default:
		return nil, fmt.Errorf("narrator projection schema received channel %q", context.RequestedChannel)
	}
	return marshalOutputSchema(strictObjectSchema(properties))
}

func statusOutputSchema(context StatusContextBundle) (json.RawMessage, error) {
	if context.Kind != ContextKindStatus {
		return nil, fmt.Errorf("narrator status schema received context kind %q", context.Kind)
	}
	return marshalOutputSchema(strictObjectSchema(map[string]any{
		"kind":                  enumStringSchema(string(CallOutputStatusReply)),
		"sourceThroughSequence": boundedIntegerSchema(context.SourceThroughSequence, context.SourceThroughSequence),
		"statusReply":           boundedStringSchema(MaxNarratorStatusReplyCharacters),
	}))
}

func checkpointOutputSchema(context CheckpointContextBundle) (json.RawMessage, error) {
	if err := validateCheckpointBundle(context); err != nil {
		return nil, err
	}
	return marshalOutputSchema(strictObjectSchema(map[string]any{
		"coveredThroughSequence": boundedIntegerSchema(context.RequestedRange.End, context.RequestedRange.End),
		"historicalSummary":      boundedStringSchema(context.MaxHistoricalSummaryBytes),
	}))
}

func strictObjectSchema(properties map[string]any) map[string]any {
	required := make([]string, 0, len(properties))
	for name := range properties {
		required = append(required, name)
	}
	sort.Strings(required)
	return map[string]any{
		"type":                 "object",
		"properties":           properties,
		"required":             required,
		"additionalProperties": false,
	}
}

func enumStringSchema(value string) map[string]any {
	return map[string]any{
		"type": "string",
		"enum": []string{value},
	}
}

func boundedStringSchema(maximumCharacters int) map[string]any {
	return map[string]any{
		"type":      "string",
		"minLength": 1,
		"maxLength": maximumCharacters,
	}
}

func nullableBoundedStringSchema(maximumCharacters int) map[string]any {
	return map[string]any{
		"anyOf": []any{
			boundedStringSchema(maximumCharacters),
			map[string]any{"type": "null"},
		},
	}
}

func boundedIntegerSchema(minimum int, maximum int) map[string]any {
	return map[string]any{
		"type":    "integer",
		"minimum": minimum,
		"maximum": maximum,
	}
}

func milestoneArraySchema() map[string]any {
	return map[string]any{
		"type":     "array",
		"items":    boundedStringSchema(MaxNarratorMilestoneCharacters),
		"maxItems": MaxNarratorMilestonesPerCall,
	}
}

func marshalOutputSchema(schema map[string]any) (json.RawMessage, error) {
	encoded, err := json.Marshal(schema)
	if err != nil {
		return nil, fmt.Errorf("encode narrator output schema: %w", err)
	}
	return json.RawMessage(encoded), nil
}
