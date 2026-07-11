package narration

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
)

func projectionPrompt(contextBundle ProjectionContext, terminal bool) (string, []byte, error) {
	payload, err := json.Marshal(contextBundle)
	if err != nil {
		return "", nil, err
	}
	kind := CallKindWorking
	if terminal {
		kind = CallKindTerminal
	}
	prompt := fmt.Sprintf(
		"Evaluate this authoritative public trajectory as a %s. Historical checkpoint text is background only; current objective and steering fields win. Emit sparse semantic milestones only for meaningful phase changes. Return strict JSON only.\n%s",
		kind,
		payload,
	)
	schema, err := projectionSchema(terminal)
	return prompt, schema, err
}

func statusPrompt(contextBundle StatusContext) (string, []byte, error) {
	payload, err := json.Marshal(contextBundle)
	if err != nil {
		return "", nil, err
	}
	prompt := fmt.Sprintf("Answer the user's status question from this authoritative public state. Explicitly respect any omitted backlog range and return strict JSON only.\n%s", payload)
	schema, err := json.Marshal(map[string]any{
		"type": "object", "additionalProperties": false,
		"required": []string{"type", "sourceThroughSequence", "statusReply"},
		"properties": map[string]any{
			"type":                  map[string]any{"const": string(CallKindStatus)},
			"sourceThroughSequence": map[string]any{"type": "integer", "minimum": 0},
			"statusReply":           map[string]any{"type": "string", "minLength": 1, "maxLength": 1200},
		},
	})
	return prompt, schema, err
}

func checkpointPrompt(checkpoint string, start int, end int, events any, objective string) (string, []byte, error) {
	payload, err := json.Marshal(map[string]any{
		"historicalCheckpoint": checkpoint, "rangeStart": start, "rangeEnd": end,
		"events": events, "currentObjectiveForInterpretationOnly": objective,
	})
	if err != nil {
		return "", nil, err
	}
	prompt := fmt.Sprintf("Compact only the supplied contiguous already-observed historical range. Do not redefine the current objective, constraints, steering, focus, or narration. Return strict JSON only.\n%s", payload)
	schema, err := json.Marshal(map[string]any{
		"type": "object", "additionalProperties": false,
		"required": []string{"coveredThroughSequence", "historicalSummary"},
		"properties": map[string]any{
			"coveredThroughSequence": map[string]any{"type": "integer", "const": end},
			"historicalSummary":      map[string]any{"type": "string", "minLength": 1, "maxLength": 4000},
		},
	})
	return prompt, schema, err
}

func projectionSchema(terminal bool) ([]byte, error) {
	required := []string{"type", "observedThroughSequence", "currentFocus", "milestones", "topicDescriptor"}
	properties := map[string]any{
		"type":                    map[string]any{"const": string(CallKindWorking)},
		"observedThroughSequence": map[string]any{"type": "integer", "minimum": 1},
		"currentFocus":            map[string]any{"type": "string", "minLength": 1, "maxLength": 500},
		"milestones":              map[string]any{"type": "array", "maxItems": 3, "items": map[string]any{"type": "string", "minLength": 1, "maxLength": 240}},
		"topicDescriptor":         map[string]any{"type": []string{"string", "null"}, "maxLength": 500},
	}
	if terminal {
		properties["type"] = map[string]any{"const": string(CallKindTerminal)}
		properties["finalSummary"] = map[string]any{"type": "string", "minLength": 1, "maxLength": 1200}
		required = append(required, "finalSummary")
	}
	return json.Marshal(map[string]any{
		"type": "object", "additionalProperties": false,
		"required": required, "properties": properties,
	})
}

func decodeWorkingOutput(raw string, contextBundle ProjectionContext) (WorkingOutput, error) {
	var output WorkingOutput
	if err := decodeStrictJSON(raw, &output); err != nil {
		return WorkingOutput{}, err
	}
	if output.Type != string(CallKindWorking) {
		return WorkingOutput{}, fmt.Errorf("working projection type is %q", output.Type)
	}
	if err := validateProjectionOutput(output.ObservedThroughSequence, output.CurrentFocus, output.Milestones, output.TopicDescriptor, contextBundle); err != nil {
		return WorkingOutput{}, err
	}
	return output, nil
}

func decodeTerminalOutput(raw string, contextBundle ProjectionContext) (TerminalOutput, error) {
	var output TerminalOutput
	if err := decodeStrictJSON(raw, &output); err != nil {
		return TerminalOutput{}, err
	}
	if output.Type != string(CallKindTerminal) {
		return TerminalOutput{}, fmt.Errorf("terminal projection type is %q", output.Type)
	}
	if err := validateProjectionOutput(output.ObservedThroughSequence, output.CurrentFocus, output.Milestones, output.TopicDescriptor, contextBundle); err != nil {
		return TerminalOutput{}, err
	}
	if err := validateProjectionText("narrator final summary", output.FinalSummary, 1200); err != nil {
		return TerminalOutput{}, err
	}
	return output, nil
}

func validateProjectionOutput(observed int, focus string, milestones []string, descriptor *string, contextBundle ProjectionContext) error {
	if observed != contextBundle.IncludedRange.End {
		return fmt.Errorf("narrator observed sequence %d must equal supplied contiguous end %d", observed, contextBundle.IncludedRange.End)
	}
	if err := validateProjectionText("narrator current focus", focus, 500); err != nil {
		return err
	}
	if err := validateMilestones(milestones, contextBundle.PriorMilestones); err != nil {
		return err
	}
	if descriptor != nil {
		return validateProjectionText("narrator topic descriptor", *descriptor, 500)
	}
	return nil
}

func decodeStatusOutput(raw string, contextBundle StatusContext) (StatusOutput, error) {
	var output StatusOutput
	if err := decodeStrictJSON(raw, &output); err != nil {
		return StatusOutput{}, err
	}
	if output.Type != string(CallKindStatus) {
		return StatusOutput{}, fmt.Errorf("status output type is %q", output.Type)
	}
	if output.SourceThroughSequence != contextBundle.SourceThroughSequence {
		return StatusOutput{}, fmt.Errorf("status source sequence %d must equal %d", output.SourceThroughSequence, contextBundle.SourceThroughSequence)
	}
	if err := validateProjectionText("narrator status reply", output.StatusReply, 1200); err != nil {
		return StatusOutput{}, err
	}
	return output, nil
}

func decodeCheckpointOutput(raw string, requestedEnd int) (CheckpointOutput, error) {
	var output CheckpointOutput
	if err := decodeStrictJSON(raw, &output); err != nil {
		return CheckpointOutput{}, err
	}
	if output.CoveredThroughSequence != requestedEnd {
		return CheckpointOutput{}, fmt.Errorf("checkpoint covered sequence %d must equal %d", output.CoveredThroughSequence, requestedEnd)
	}
	if err := validateProjectionText("narrator checkpoint", output.HistoricalSummary, 4000); err != nil {
		return CheckpointOutput{}, err
	}
	return output, nil
}

func decodeStrictJSON(raw string, target any) error {
	decoder := json.NewDecoder(bytes.NewBufferString(raw))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	var extra any
	if err := decoder.Decode(&extra); err == nil {
		return errors.New("narrator output contains trailing JSON values")
	} else if !errors.Is(err, io.EOF) {
		return fmt.Errorf("decode narrator output trailer: %w", err)
	}
	return nil
}
