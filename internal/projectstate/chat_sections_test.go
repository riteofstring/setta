package projectstate

import (
	"context"
	"errors"
	"testing"
)

func TestRuntimeChatSectionMutationsUpdateEffectivePayload(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": chatSectionMutationTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	engineConfigID := "engine-config-1"
	transcriptionProfileID := "transcription-profile-1"
	agentProfileID := "agent-profile-1"
	if _, err := runtime.SetChatSectionSettings(context.Background(), "project-alpha", "chat-section", ChatSectionSettings{
		Managed:                true,
		EngineConfigID:         &engineConfigID,
		TranscriptionProfileID: &transcriptionProfileID,
		AgentProfileID:         &agentProfileID,
		Thinking:               true,
		PermissionMode:         ChatPermissionModeYOLO,
		SearchEnabled:          true,
		DictationMode:          ChatDictationModeProvider,
	}); err != nil {
		t.Fatalf("SetChatSectionSettings returned error: %v", err)
	}

	activeBranchID := "branch-1"
	parentBranchID := "branch-root"
	branchFromMessageID := "message-1"
	if _, err := runtime.SetChatSectionState(context.Background(), "project-alpha", "chat-section", ChatSectionState{
		Messages: []map[string]any{
			{"id": "message-1", "type": "user", "content": "hello"},
		},
		InputText:          "Draft input",
		WaitingForResponse: true,
		ToolCallArguments: map[string]string{
			"tool-call-1": "{\"query\":\"hello\"}",
		},
		ActiveBranchID: &activeBranchID,
		Branches: map[string]ChatSectionBranch{
			"branch-1": {
				Messages: []map[string]any{
					{"id": "message-1", "type": "user"},
				},
				CreatedAt:           42,
				ParentBranchID:      &parentBranchID,
				BranchFromMessageID: &branchFromMessageID,
			},
		},
	}); err != nil {
		t.Fatalf("SetChatSectionState returned error: %v", err)
	}

	chatID := "chat-1"
	if _, err := runtime.SetChatSectionChatID(context.Background(), "project-alpha", "chat-section", &chatID); err != nil {
		t.Fatalf("SetChatSectionChatID returned error: %v", err)
	}

	project := runtime.Snapshot().Document.Projects["project-alpha"]
	payload, err := effectiveSectionPayload(project, "chat-section", "chat-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload chat-section: %v", err)
	}
	if got := payloadRawStringField(payload, "engineConfigId"); got != "engine-config-1" {
		t.Fatalf("expected engineConfigId engine-config-1, got %q", got)
	}
	if got := payloadRawStringField(payload, "transcriptionProfileId"); got != "transcription-profile-1" {
		t.Fatalf("expected transcriptionProfileId transcription-profile-1, got %q", got)
	}
	if got := payloadRawStringField(payload, "agentProfileId"); got != "agent-profile-1" {
		t.Fatalf("expected agentProfileId agent-profile-1, got %q", got)
	}
	if !payloadBoolField(payload, "managed") {
		t.Fatal("expected managed=true")
	}
	if !payloadBoolField(payload, "thinking") {
		t.Fatal("expected thinking=true")
	}
	if !payloadBoolField(payload, "searchEnabled") {
		t.Fatal("expected searchEnabled=true")
	}
	if got := payloadRawStringField(payload, "permissionMode"); got != "yolo" {
		t.Fatalf("expected permissionMode yolo, got %q", got)
	}
	if got := payloadRawStringField(payload, "dictationMode"); got != "provider" {
		t.Fatalf("expected dictationMode provider, got %q", got)
	}
	if got := payloadRawStringField(payload, "inputText"); got != "Draft input" {
		t.Fatalf("expected inputText Draft input, got %q", got)
	}
	if !payloadBoolField(payload, "waitingForResponse") {
		t.Fatal("expected waitingForResponse=true")
	}
	if got := payloadRawStringField(payload, "chatId"); got != "chat-1" {
		t.Fatalf("expected chatId chat-1, got %q", got)
	}

	messages, ok := payload["messages"].([]any)
	if !ok || len(messages) != 1 {
		t.Fatalf("expected one stored message, got %#v", payload["messages"])
	}
	firstMessage, ok := messages[0].(map[string]any)
	if !ok || firstMessage["id"] != "message-1" {
		t.Fatalf("expected stored message id message-1, got %#v", messages[0])
	}

	toolCallArguments, ok := payload["toolCallArguments"].(map[string]any)
	if !ok || toolCallArguments["tool-call-1"] != "{\"query\":\"hello\"}" {
		t.Fatalf("expected stored toolCallArguments, got %#v", payload["toolCallArguments"])
	}
	if got := payloadRawStringField(payload, "activeBranchId"); got != "branch-1" {
		t.Fatalf("expected activeBranchId branch-1, got %q", got)
	}

	branches, ok := payload["branches"].(map[string]any)
	if !ok {
		t.Fatalf("expected branches object, got %#v", payload["branches"])
	}
	branchValue, ok := branches["branch-1"].(map[string]any)
	if !ok {
		t.Fatalf("expected branch-1 object, got %#v", branches["branch-1"])
	}
	if branchValue["createdAt"] != float64(42) {
		t.Fatalf("expected branch createdAt 42, got %#v", branchValue["createdAt"])
	}
	if branchValue["parentBranchId"] != "branch-root" {
		t.Fatalf("expected parentBranchId branch-root, got %#v", branchValue["parentBranchId"])
	}
	if branchValue["branchFromMessageId"] != "message-1" {
		t.Fatalf("expected branchFromMessageId message-1, got %#v", branchValue["branchFromMessageId"])
	}

	if _, err := runtime.SetChatSectionChatID(context.Background(), "project-alpha", "chat-section", nil); err != nil {
		t.Fatalf("clearing chat id returned error: %v", err)
	}
	project = runtime.Snapshot().Document.Projects["project-alpha"]
	payload, err = effectiveSectionPayload(project, "chat-section", "chat-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload chat-section after clear: %v", err)
	}
	if value, ok := payload["chatId"]; !ok || value != nil {
		t.Fatalf("expected chatId to persist as null after clear, got %#v", payload["chatId"])
	}
}

func TestRuntimeChatSectionMutationsRejectInvalidTargetsAndModes(t *testing.T) {
	t.Parallel()

	runtime, err := OpenOverlayRuntime(Document{
		SchemaVersion:    CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]Project{
			"project-alpha": chatSectionMutationTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := runtime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	if _, err := runtime.SetChatSectionSettings(context.Background(), "project-alpha", "plain-section", ChatSectionSettings{
		PermissionMode: ChatPermissionModeMinimal,
		DictationMode:  ChatDictationModeAuto,
	}); !errors.Is(err, ErrChatSectionRequired) {
		t.Fatalf("expected ErrChatSectionRequired from SetChatSectionSettings, got %v", err)
	}
	if _, err := runtime.SetChatSectionState(context.Background(), "project-alpha", "plain-section", ChatSectionState{}); !errors.Is(err, ErrChatSectionRequired) {
		t.Fatalf("expected ErrChatSectionRequired from SetChatSectionState, got %v", err)
	}
	if _, err := runtime.SetChatSectionChatID(context.Background(), "project-alpha", "plain-section", nil); !errors.Is(err, ErrChatSectionRequired) {
		t.Fatalf("expected ErrChatSectionRequired from SetChatSectionChatID, got %v", err)
	}
	if _, err := runtime.SetChatSectionSettings(context.Background(), "project-alpha", "chat-section", ChatSectionSettings{
		PermissionMode: ChatPermissionMode("unknown"),
		DictationMode:  ChatDictationModeAuto,
	}); !errors.Is(err, ErrChatPermissionModeInvalid) {
		t.Fatalf("expected ErrChatPermissionModeInvalid, got %v", err)
	}
	if _, err := runtime.SetChatSectionSettings(context.Background(), "project-alpha", "chat-section", ChatSectionSettings{
		PermissionMode: ChatPermissionModeMinimal,
		DictationMode:  ChatDictationMode("unknown"),
	}); !errors.Is(err, ErrChatDictationModeInvalid) {
		t.Fatalf("expected ErrChatDictationModeInvalid, got %v", err)
	}
}

func chatSectionMutationTestProject(t *testing.T) Project {
	t.Helper()

	project, err := Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"chat-section":  "chat-variant",
			"plain-section": "plain-variant",
		},
		Sections: map[string]Section{
			"chat-section": {
				ID:               "chat-section",
				Name:             "Chat Section",
				VariantIDs:       []string{"chat-variant"},
				DefaultVariantID: "chat-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]SectionVariant{
			"chat-variant": {
				ID:     "chat-variant",
				ImplID: "chat-impl",
			},
			"plain-variant": {
				ID:     "plain-variant",
				ImplID: "plain-impl",
			},
		},
		SectionImpls: map[string]SectionImpl{
			"chat-impl": {
				ID:   "chat-impl",
				Kind: SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{
					"id":   "chat-impl",
					"type": "Chat",
				}),
			},
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    SectionKind("frontend"),
				Payload: mustMarshalProjectObject(map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize chat section mutation project: %v", err)
	}
	return project
}
