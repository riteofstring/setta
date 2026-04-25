package agentruns

import "testing"

func TestNormalizeAppGenerationByMessageIDPreservesAnyNonEmptyMode(t *testing.T) {
	t.Parallel()

	normalized := NormalizeAppGenerationByMessageID(map[string]any{
		"msg-plain":  ChatAppGenerationMessageModePlainChat,
		"msg-vendor": " vendor_mode ",
		"msg-app":    ChatAppGenerationMessageModeMCPServer,
		"msg-empty":  "   ",
		"":           "vendor_mode",
	})

	if len(normalized) != 3 {
		t.Fatalf("expected three normalized entries, got %#v", normalized)
	}
	if normalized["msg-plain"] != string(ChatAppGenerationMessageModePlainChat) {
		t.Fatalf("expected plain-chat entry to survive normalization, got %#v", normalized)
	}
	if normalized["msg-vendor"] != "vendor_mode" {
		t.Fatalf("expected provider-defined mode to survive normalization, got %#v", normalized)
	}
	if normalized["msg-app"] != string(ChatAppGenerationMessageModeMCPServer) {
		t.Fatalf("expected app-generation entry to survive normalization, got %#v", normalized)
	}
}

func TestExtractAppGenerationByMessageIDIgnoresLegacyModeWithoutAuthoritativeMapping(t *testing.T) {
	t.Parallel()

	normalized := ExtractAppGenerationByMessageID(map[string]any{
		"appGenerationMode": ChatAppGenerationMessageModeMCPServer,
		"messages": []any{
			map[string]any{
				"id":   "msg-legacy",
				"role": "user",
			},
		},
	})

	if len(normalized) != 0 {
		t.Fatalf("expected legacy top-level mode without authoritative mapping to be ignored, got %#v", normalized)
	}
}

func TestNormalizeSubmittedTurnAppGenerationByMessageIDRecordsPlainChatWhenModeUnset(t *testing.T) {
	t.Parallel()

	normalized := NormalizeSubmittedTurnAppGenerationByMessageID(
		map[string]any{"msg-old": "vendor_mode"},
		"msg-new",
		nil,
	)

	if normalized["msg-old"] != "vendor_mode" {
		t.Fatalf("expected prior normalized entries to survive, got %#v", normalized)
	}
	if normalized["msg-new"] != string(ChatAppGenerationMessageModePlainChat) {
		t.Fatalf("expected submitted turn to default to plain_chat, got %#v", normalized)
	}
}

func TestNormalizeSubmittedTurnAppGenerationByMessageIDOverridesSubmittedModeAndPreservesProviderModes(t *testing.T) {
	t.Parallel()

	requestedMode := "vendor_mode"
	normalized := NormalizeSubmittedTurnAppGenerationByMessageID(
		map[string]any{"msg-old": "vendor_mode_old", "msg-new": ChatAppGenerationMessageModePlainChat},
		"msg-new",
		&requestedMode,
	)

	if normalized["msg-old"] != "vendor_mode_old" {
		t.Fatalf("expected existing provider-defined mode to survive, got %#v", normalized)
	}
	if normalized["msg-new"] != "vendor_mode" {
		t.Fatalf("expected submitted turn to use requested mode, got %#v", normalized)
	}
}
