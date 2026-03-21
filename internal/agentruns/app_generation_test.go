package agentruns

import "testing"

func TestNormalizeAppGenerationByMessageIDKeepsPlainChatAndDropsInvalidEntries(t *testing.T) {
	t.Parallel()

	normalized := NormalizeAppGenerationByMessageID(map[string]any{
		"msg-plain": ChatAppGenerationMessageModePlainChat,
		"msg-app":   ChatAppGenerationMessageModeMCPServer,
		"msg-bad":   "invalid_mode",
		"":          ChatAppGenerationMessageModeJSONRender,
	})

	if len(normalized) != 2 {
		t.Fatalf("expected two normalized entries, got %#v", normalized)
	}
	if normalized["msg-plain"] != ChatAppGenerationMessageModePlainChat {
		t.Fatalf("expected plain-chat entry to survive normalization, got %#v", normalized)
	}
	if normalized["msg-app"] != ChatAppGenerationMessageModeMCPServer {
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

func TestMessageHasImageAttachmentRequiresImageMimeType(t *testing.T) {
	t.Parallel()

	if !MessageHasImageAttachment(map[string]any{
		"attachments": []any{
			map[string]any{"id": "image-1", "mimeType": "image/png"},
			map[string]any{"id": "notes-1", "mimeType": "text/plain"},
		},
	}) {
		t.Fatal("expected image attachment to be detected")
	}

	if MessageHasImageAttachment(map[string]any{
		"attachments": []any{
			map[string]any{"id": "notes-1", "mimeType": "text/plain"},
			map[string]any{"id": "missing-mime"},
		},
	}) {
		t.Fatal("expected non-image attachments to be ignored")
	}
}

func TestHasRetainedImageAttachmentFromImageModeThreadRequiresUserTurnImageModeAndImageAttachment(t *testing.T) {
	t.Parallel()

	messages := []map[string]any{
		{
			"id":          "msg-plain-image",
			"role":        "user",
			"attachments": []any{map[string]any{"id": "image-1", "mimeType": "image/png"}},
		},
		{
			"id":          "msg-image-mode",
			"role":        "user",
			"attachments": []any{map[string]any{"id": "image-2", "mimeType": "image/png"}},
		},
		{
			"id":          "msg-assistant",
			"role":        "assistant",
			"attachments": []any{map[string]any{"id": "image-3", "mimeType": "image/png"}},
		},
	}

	if !HasRetainedImageAttachmentFromImageModeThread(messages, map[string]string{
		"msg-image-mode": ChatAppGenerationMessageModeJSONRenderWithImage,
	}) {
		t.Fatal("expected retained image-mode user attachment to be reusable")
	}

	if HasRetainedImageAttachmentFromImageModeThread(messages, map[string]string{
		"msg-plain-image": ChatAppGenerationMessageModePlainChat,
		"msg-assistant":   ChatAppGenerationMessageModeJSONRenderWithImage,
	}) {
		t.Fatal("expected plain-chat or assistant attachments not to count as retained image provenance")
	}
}

func TestNormalizeSubmittedTurnAppGenerationByMessageIDRecordsPlainChatWhenModeUnset(t *testing.T) {
	t.Parallel()

	normalized := NormalizeSubmittedTurnAppGenerationByMessageID(
		map[string]any{"msg-old": ChatAppGenerationMessageModeMCPServer},
		"msg-new",
		nil,
	)

	if normalized["msg-old"] != ChatAppGenerationMessageModeMCPServer {
		t.Fatalf("expected prior normalized entries to survive, got %#v", normalized)
	}
	if normalized["msg-new"] != ChatAppGenerationMessageModePlainChat {
		t.Fatalf("expected submitted turn to default to plain_chat, got %#v", normalized)
	}
}

func TestNormalizeSubmittedTurnAppGenerationByMessageIDOverridesSubmittedMode(t *testing.T) {
	t.Parallel()

	requestedMode := ChatAppGenerationMessageModeJSONRender
	normalized := NormalizeSubmittedTurnAppGenerationByMessageID(
		map[string]any{"msg-new": ChatAppGenerationMessageModePlainChat},
		"msg-new",
		&requestedMode,
	)

	if normalized["msg-new"] != ChatAppGenerationMessageModeJSONRender {
		t.Fatalf("expected submitted turn to use requested mode, got %#v", normalized)
	}
}
