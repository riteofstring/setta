package realtime

import (
	"encoding/json"
	"strings"
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/externalagentconfigs"
	"setta/internal/llmconfig"
)

func TestNewUpdateArtifactsMessage(t *testing.T) {
	t.Parallel()

	message := NewUpdateArtifactsMessage(UpdateArtifactsContent{
		Artifacts: []any{
			map[string]any{
				"type": "BrushStroke",
				"id":   "artifacts/stroke.json",
			},
		},
		UpdateType: "update",
	})
	if message.MessageType != MessageTypeUpdateArtifacts {
		t.Fatalf("expected update artifacts message type, got %q", message.MessageType)
	}
	if message.Content.UpdateType != "update" {
		t.Fatalf("expected update type, got %q", message.Content.UpdateType)
	}
	if len(message.Content.Artifacts) != 1 {
		t.Fatalf("expected one artifact, got %#v", message.Content.Artifacts)
	}
}

func TestNewLLMStreamingResponseMessage(t *testing.T) {
	t.Parallel()

	message := NewLLMStreamingResponseMessage(LLMStreamingResponseContent{
		ChatID: "chat-alpha",
		Chunk: MessageStopEvent{
			Type:      StreamingEventTypeMessageStop,
			MessageID: "assistant-1",
		},
		SectionID:       stringPtr("section-chat"),
		ProjectConfigID: stringPtr("project-alpha"),
	})
	if message.MessageType != MessageTypeLLMStreamingResponse {
		t.Fatalf("expected llm streaming message type, got %q", message.MessageType)
	}
	if message.Content.ChatID != "chat-alpha" {
		t.Fatalf("expected chat-alpha chat id, got %q", message.Content.ChatID)
	}
	if message.Content.SectionID == nil || *message.Content.SectionID != "section-chat" {
		t.Fatalf("expected section id section-chat, got %#v", message.Content.SectionID)
	}
}

func TestNewAIFollowToolResultUpdateMessage(t *testing.T) {
	t.Parallel()

	message := NewAIFollowToolResultUpdateMessage(AIFollowToolResultUpdateContent{
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		IDsByType: map[string][]string{
			"section": {"section-1"},
		},
	})
	if message.MessageType != MessageTypeAIFollowToolResultUpdate {
		t.Fatalf("expected ai follow tool result update message type, got %q", message.MessageType)
	}
	if message.Content.ProjectConfigID != "project-alpha" {
		t.Fatalf("expected project-alpha project id, got %q", message.Content.ProjectConfigID)
	}
	if got := message.Content.IDsByType["section"]; len(got) != 1 || got[0] != "section-1" {
		t.Fatalf("unexpected result-follow ids %#v", message.Content.IDsByType)
	}
}

func TestNewListenerCoverageSnapshotMessageClonesContent(t *testing.T) {
	t.Parallel()

	snapshot := ListenerCoverageSnapshot{
		ProjectID: "project-alpha",
		Dependencies: []ListenerCoverageDependency{
			{Type: DependencyKeyTypeSectionParam, SectionID: "section-1", CodeObjID: "param-1"},
		},
		HasRealtimeWildcard: true,
	}
	message := NewListenerCoverageSnapshotMessage(snapshot)
	snapshot.Dependencies[0].SectionID = "mutated"

	if message.MessageType != MessageTypeListenerCoverageSnapshot {
		t.Fatalf("expected listener coverage snapshot message type, got %q", message.MessageType)
	}
	if message.Content.ProjectID != "project-alpha" {
		t.Fatalf("expected project-alpha project id, got %q", message.Content.ProjectID)
	}
	if got := message.Content.Dependencies[0].SectionID; got != "section-1" {
		t.Fatalf("expected cloned dependency content, got %q", got)
	}
	if !message.Content.HasRealtimeWildcard {
		t.Fatalf("expected realtime wildcard flag to persist, got %#v", message.Content)
	}
}

func TestNewAgentRunUpdatedMessageClonesContent(t *testing.T) {
	t.Parallel()

	run := agentruns.NewRun(nil, map[string]any{
		"runType": "state_machine",
	}, time.Date(2026, 3, 14, 12, 0, 0, 0, time.UTC))
	message := NewAgentRunUpdatedMessage(run)
	run.Inputs["mutated"] = true

	if message.MessageType != MessageTypeAgentRunUpdated {
		t.Fatalf("expected agent run updated message type, got %q", message.MessageType)
	}
	if message.Content.ID != run.ID {
		t.Fatalf("expected run id %q, got %q", run.ID, message.Content.ID)
	}
	if _, ok := message.Content.Inputs["mutated"]; ok {
		t.Fatalf("expected cloned content to ignore later run mutation, got %#v", message.Content.Inputs)
	}
}

func TestNewAgentRunUpdatedMessageJSONIncludesEmptySlices(t *testing.T) {
	t.Parallel()

	run := agentruns.NewRun(nil, map[string]any{
		"runType": "state_machine",
	}, time.Date(2026, 3, 14, 12, 0, 0, 0, time.UTC))
	message := NewAgentRunUpdatedMessage(run)

	payload, err := json.Marshal(message)
	if err != nil {
		t.Fatalf("marshal agent run update message: %v", err)
	}
	jsonText := string(payload)
	if !strings.Contains(jsonText, `"toolCalls":[]`) {
		t.Fatalf("expected toolCalls array in marshaled payload, got %s", jsonText)
	}
	if !strings.Contains(jsonText, `"events":[]`) {
		t.Fatalf("expected events array in marshaled payload, got %s", jsonText)
	}
}

func TestNewLLMAPIKeysUpdatedMessageJSONPreservesErrorFields(t *testing.T) {
	t.Parallel()

	errorCode := llmconfig.ManagedAPIKeysCorruptErrorCode
	messageText := "Managed API key index in .env is not valid JSON."
	message := NewLLMAPIKeysUpdatedMessage(llmconfig.ManagedAPIKeysSnapshot{
		APIKeys:   map[string]string{},
		Revision:  0,
		Corrupt:   true,
		ErrorCode: &errorCode,
		Message:   &messageText,
	})

	payload, err := json.Marshal(message)
	if err != nil {
		t.Fatalf("marshal llm api keys update message: %v", err)
	}
	jsonText := string(payload)
	if !strings.Contains(jsonText, `"messageType":"LLMApiKeysUpdated"`) {
		t.Fatalf("expected llm api keys update message type, got %s", jsonText)
	}
	if !strings.Contains(jsonText, `"corrupt":true`) {
		t.Fatalf("expected corrupt flag in marshaled payload, got %s", jsonText)
	}
	if !strings.Contains(jsonText, `"errorCode":"managed_api_keys_store_corrupt"`) {
		t.Fatalf("expected errorCode in marshaled payload, got %s", jsonText)
	}
	if !strings.Contains(jsonText, `"message":"Managed API key index in .env is not valid JSON."`) {
		t.Fatalf("expected message in marshaled payload, got %s", jsonText)
	}
}

func TestNewEngineConfigsUpdatedMessageClonesSlice(t *testing.T) {
	t.Parallel()

	configs := []agentruns.EngineConfig{
		{
			ID:         "engine-1",
			Name:       "Codex",
			EngineType: agentruns.EngineTypeExternalAgent,
		},
	}
	message := NewEngineConfigsUpdatedMessage(configs)
	configs[0].Name = "mutated"

	if message.MessageType != MessageTypeEngineConfigsUpdated {
		t.Fatalf("expected engine configs updated message type, got %q", message.MessageType)
	}
	if got := message.Content.Configs[0].Name; got != "Codex" {
		t.Fatalf("expected cloned engine config name Codex, got %q", got)
	}
}

func TestNewEngineConfigsUpdatedMessageJSONIncludesEmptyConfigArray(t *testing.T) {
	t.Parallel()

	message := NewEngineConfigsUpdatedMessage(nil)

	payload, err := json.Marshal(message)
	if err != nil {
		t.Fatalf("marshal engine configs updated message: %v", err)
	}
	if !strings.Contains(string(payload), `"configs":[]`) {
		t.Fatalf("expected configs array in marshaled payload, got %s", string(payload))
	}
}

func TestNewExternalAgentConfigsUpdatedMessageClonesSlice(t *testing.T) {
	t.Parallel()

	configs := []externalagentconfigs.Config{
		{
			ID:                 "config-1",
			Name:               "Codex",
			ToolType:           externalagentconfigs.ToolTypeCodex,
			RunMode:            externalagentconfigs.RunModeAppServer,
			WorkingDirStrategy: externalagentconfigs.WorkingDirStrategyProjectRoot,
		},
	}
	message := NewExternalAgentConfigsUpdatedMessage(configs)
	configs[0].Name = "mutated"

	if message.MessageType != MessageTypeExternalAgentConfigsUpdated {
		t.Fatalf("expected external agent configs updated message type, got %q", message.MessageType)
	}
	if got := message.Content.Configs[0].Name; got != "Codex" {
		t.Fatalf("expected cloned external agent config name Codex, got %q", got)
	}
}

func TestNewExternalAgentConfigsUpdatedMessageJSONIncludesEmptyConfigArray(t *testing.T) {
	t.Parallel()

	message := NewExternalAgentConfigsUpdatedMessage(nil)

	payload, err := json.Marshal(message)
	if err != nil {
		t.Fatalf("marshal external agent configs updated message: %v", err)
	}
	if !strings.Contains(string(payload), `"configs":[]`) {
		t.Fatalf("expected configs array in marshaled payload, got %s", string(payload))
	}
}

func stringPtr(value string) *string {
	return &value
}
