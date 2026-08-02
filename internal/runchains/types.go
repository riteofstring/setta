package runchains

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
)

type StepInput struct {
	ID                     string           `json:"id"`
	Name                   string           `json:"name"`
	EngineConfigID         string           `json:"engineConfigId"`
	AgentProfileID         *string          `json:"agentProfileId,omitempty"`
	Prompt                 *string          `json:"prompt,omitempty"`
	Messages               []map[string]any `json:"messages,omitempty"`
	Inputs                 map[string]any   `json:"inputs,omitempty"`
	IncludePreviousOutputs *bool            `json:"includePreviousOutputs,omitempty"`
}

type SpecInput struct {
	ID            string      `json:"id"`
	Name          string      `json:"name"`
	Steps         []StepInput `json:"steps"`
	StopOnFailure *bool       `json:"stopOnFailure,omitempty"`
}

type Step struct {
	ID                     string           `json:"id"`
	Name                   string           `json:"name"`
	EngineConfigID         string           `json:"engineConfigId"`
	AgentProfileID         *string          `json:"agentProfileId,omitempty"`
	Prompt                 *string          `json:"prompt,omitempty"`
	Messages               []map[string]any `json:"messages,omitempty"`
	Inputs                 map[string]any   `json:"inputs,omitempty"`
	IncludePreviousOutputs bool             `json:"includePreviousOutputs"`
}

type Spec struct {
	ID            string `json:"id"`
	Name          string `json:"name"`
	Steps         []Step `json:"steps"`
	StopOnFailure bool   `json:"stopOnFailure"`
}

func NormalizeSpec(input SpecInput) (Spec, error) {
	specID := strings.TrimSpace(input.ID)
	if specID == "" {
		specID = newRandomID()
	}
	stopOnFailure := true
	if input.StopOnFailure != nil {
		stopOnFailure = *input.StopOnFailure
	}
	steps := make([]Step, 0, len(input.Steps))
	for index, stepInput := range input.Steps {
		step, err := normalizeStep(stepInput, index)
		if err != nil {
			return Spec{}, err
		}
		steps = append(steps, step)
	}
	return Spec{
		ID:            specID,
		Name:          input.Name,
		Steps:         steps,
		StopOnFailure: stopOnFailure,
	}, nil
}

func normalizeStep(input StepInput, index int) (Step, error) {
	label := fmt.Sprintf("run chain step %d", index)
	stepID := strings.TrimSpace(input.ID)
	if stepID == "" {
		stepID = newRandomID()
	}
	engineConfigID := strings.TrimSpace(input.EngineConfigID)
	if engineConfigID == "" {
		return Step{}, fmt.Errorf("%w: %s engineConfigId is required", ErrInvalidRunChainInput, label)
	}
	var agentProfileID *string
	if input.AgentProfileID != nil {
		trimmed := strings.TrimSpace(*input.AgentProfileID)
		if trimmed != "" {
			agentProfileID = &trimmed
		}
	}
	includePreviousOutputs := true
	if input.IncludePreviousOutputs != nil {
		includePreviousOutputs = *input.IncludePreviousOutputs
	}
	return Step{
		ID:                     stepID,
		Name:                   input.Name,
		EngineConfigID:         engineConfigID,
		AgentProfileID:         agentProfileID,
		Prompt:                 cloneStringPtr(input.Prompt),
		Messages:               cloneMessageList(input.Messages),
		Inputs:                 cloneAnyMap(input.Inputs),
		IncludePreviousOutputs: includePreviousOutputs,
	}, nil
}

func (s Spec) jsonValue() (map[string]any, error) {
	content, err := json.Marshal(s)
	if err != nil {
		return nil, fmt.Errorf("encode run chain spec: %w", err)
	}
	var payload map[string]any
	if err := json.Unmarshal(content, &payload); err != nil {
		return nil, fmt.Errorf("decode run chain spec payload: %w", err)
	}
	return payload, nil
}

func cloneAnyMap(input map[string]any) map[string]any {
	if input == nil {
		return nil
	}
	cloned := make(map[string]any, len(input))
	for key, value := range input {
		cloned[key] = deepCloneJSONValue(value)
	}
	return cloned
}

func cloneAnySlice(input []any) []any {
	if input == nil {
		return nil
	}
	cloned := make([]any, 0, len(input))
	for _, value := range input {
		cloned = append(cloned, deepCloneJSONValue(value))
	}
	return cloned
}

func cloneMessageList(input []map[string]any) []map[string]any {
	if input == nil {
		return nil
	}
	cloned := make([]map[string]any, 0, len(input))
	for _, entry := range input {
		cloned = append(cloned, cloneAnyMap(entry))
	}
	return cloned
}

func cloneStringPtr(value *string) *string {
	if value == nil {
		return nil
	}
	cloned := *value
	return &cloned
}

func deepCloneJSONValue(value any) any {
	if value == nil {
		return nil
	}
	content, err := json.Marshal(value)
	if err != nil {
		return value
	}
	var cloned any
	if err := json.Unmarshal(content, &cloned); err != nil {
		return value
	}
	return cloned
}

func newRandomID() string {
	buffer := make([]byte, 16)
	if _, err := rand.Read(buffer); err != nil {
		panic(fmt.Sprintf("runchains: generate random id: %v", err))
	}
	return hex.EncodeToString(buffer)
}
