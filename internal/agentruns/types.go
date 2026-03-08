package agentruns

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"strings"
	"time"
)

type EngineType string

const (
	EngineTypeSettaLLM      EngineType = "setta_llm"
	EngineTypeExternalAgent EngineType = "external_agent"
)

type EngineConfigDefaults struct {
	Thinking *bool `json:"thinking,omitempty"`
}

type EngineConfig struct {
	ID                    string               `json:"id"`
	Name                  string               `json:"name"`
	EngineType            EngineType           `json:"engineType"`
	SettaLLMConfigID      *string              `json:"settaLlmConfigId,omitempty"`
	ExternalAgentConfigID *string              `json:"externalAgentConfigId,omitempty"`
	Defaults              EngineConfigDefaults `json:"defaults,omitempty"`
}

type RunStatus string

const (
	RunStatusQueued    RunStatus = "queued"
	RunStatusRunning   RunStatus = "running"
	RunStatusCompleted RunStatus = "completed"
	RunStatusFailed    RunStatus = "failed"
	RunStatusCancelled RunStatus = "cancelled"
)

type RunEvent struct {
	ID        string         `json:"id"`
	Timestamp time.Time      `json:"timestamp"`
	Type      string         `json:"type"`
	Payload   map[string]any `json:"payload,omitempty"`
}

type Run struct {
	ID         string           `json:"id"`
	ProfileID  *string          `json:"profileId,omitempty"`
	Status     RunStatus        `json:"status"`
	StartedAt  *time.Time       `json:"startedAt,omitempty"`
	FinishedAt *time.Time       `json:"finishedAt,omitempty"`
	Inputs     map[string]any   `json:"inputs,omitempty"`
	Outputs    map[string]any   `json:"outputs,omitempty"`
	ToolCalls  []map[string]any `json:"toolCalls,omitempty"`
	Cost       *float64         `json:"cost,omitempty"`
	Events     []RunEvent       `json:"events,omitempty"`
}

type RunFilter struct {
	RunType         *string
	ChatID          *string
	ProjectConfigID *string
}

type RunIndexEntry struct {
	RunType         *string `json:"runType,omitempty"`
	ChatID          *string `json:"chatId,omitempty"`
	ProjectConfigID *string `json:"projectConfigId,omitempty"`
}

type RunIndex struct {
	Version int                      `json:"version"`
	Runs    map[string]RunIndexEntry `json:"runs,omitempty"`
}

func NewRun(profileID *string, inputs map[string]any, now time.Time) Run {
	normalizedNow := now.UTC()
	return Run{
		ID:        newRandomID(),
		ProfileID: cloneStringPtr(profileID),
		Status:    RunStatusRunning,
		StartedAt: &normalizedNow,
		Inputs:    cloneAnyMap(inputs),
		ToolCalls: []map[string]any{},
		Events:    []RunEvent{},
	}
}

func NewRunEvent(eventType string, payload map[string]any, now time.Time) RunEvent {
	return RunEvent{
		ID:        newRandomID(),
		Timestamp: now.UTC(),
		Type:      strings.TrimSpace(eventType),
		Payload:   cloneAnyMap(payload),
	}
}

func (c EngineConfig) normalized() (EngineConfig, error) {
	normalized := EngineConfig{
		ID:         strings.TrimSpace(c.ID),
		Name:       strings.TrimSpace(c.Name),
		EngineType: EngineType(strings.TrimSpace(string(c.EngineType))),
		Defaults:   c.Defaults,
	}
	if normalized.ID == "" {
		return EngineConfig{}, fmt.Errorf("engine config id is required")
	}
	if normalized.Name == "" {
		return EngineConfig{}, fmt.Errorf("engine config %q name is required", normalized.ID)
	}
	switch normalized.EngineType {
	case EngineTypeSettaLLM, EngineTypeExternalAgent:
	default:
		return EngineConfig{}, fmt.Errorf("unsupported engine type %q", c.EngineType)
	}
	if c.SettaLLMConfigID != nil {
		trimmed := strings.TrimSpace(*c.SettaLLMConfigID)
		normalized.SettaLLMConfigID = &trimmed
	}
	if c.ExternalAgentConfigID != nil {
		trimmed := strings.TrimSpace(*c.ExternalAgentConfigID)
		normalized.ExternalAgentConfigID = &trimmed
	}
	return normalized, nil
}

func (r Run) normalized() (Run, error) {
	normalized := Run{
		ID:        strings.TrimSpace(r.ID),
		Status:    RunStatus(strings.TrimSpace(string(r.Status))),
		Inputs:    cloneAnyMap(r.Inputs),
		Outputs:   cloneAnyMap(r.Outputs),
		ToolCalls: cloneToolCalls(r.ToolCalls),
		Events:    cloneEvents(r.Events),
		Cost:      cloneFloat64Ptr(r.Cost),
	}
	if normalized.ID == "" {
		return Run{}, fmt.Errorf("agent run id is required")
	}
	switch normalized.Status {
	case RunStatusQueued, RunStatusRunning, RunStatusCompleted, RunStatusFailed, RunStatusCancelled:
	default:
		return Run{}, fmt.Errorf("agent run %q status is invalid", normalized.ID)
	}
	normalized.ProfileID = cloneStringPtr(r.ProfileID)
	if r.StartedAt != nil {
		startedAt := r.StartedAt.UTC()
		normalized.StartedAt = &startedAt
	}
	if r.FinishedAt != nil {
		finishedAt := r.FinishedAt.UTC()
		normalized.FinishedAt = &finishedAt
	}
	for index, event := range normalized.Events {
		if strings.TrimSpace(event.ID) == "" {
			return Run{}, fmt.Errorf("agent run %q event %d id is required", normalized.ID, index)
		}
		if strings.TrimSpace(event.Type) == "" {
			return Run{}, fmt.Errorf("agent run %q event %d type is required", normalized.ID, index)
		}
	}
	if normalized.ToolCalls == nil {
		normalized.ToolCalls = []map[string]any{}
	}
	if normalized.Events == nil {
		normalized.Events = []RunEvent{}
	}
	return normalized, nil
}

func (r Run) Clone() Run {
	normalized, err := r.normalized()
	if err != nil {
		return Run{}
	}
	return normalized
}

func (r RunIndexEntry) Clone() RunIndexEntry {
	return RunIndexEntry{
		RunType:         cloneStringPtr(r.RunType),
		ChatID:          cloneStringPtr(r.ChatID),
		ProjectConfigID: cloneStringPtr(r.ProjectConfigID),
	}
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

func cloneToolCalls(input []map[string]any) []map[string]any {
	if input == nil {
		return nil
	}
	cloned := make([]map[string]any, 0, len(input))
	for _, entry := range input {
		cloned = append(cloned, cloneAnyMap(entry))
	}
	return cloned
}

func cloneEvents(input []RunEvent) []RunEvent {
	if input == nil {
		return nil
	}
	cloned := make([]RunEvent, 0, len(input))
	for _, entry := range input {
		cloned = append(cloned, RunEvent{
			ID:        entry.ID,
			Timestamp: entry.Timestamp.UTC(),
			Type:      entry.Type,
			Payload:   cloneAnyMap(entry.Payload),
		})
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

func cloneFloat64Ptr(value *float64) *float64 {
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
		panic(fmt.Sprintf("agentruns: generate random id: %v", err))
	}
	return hex.EncodeToString(buffer)
}
