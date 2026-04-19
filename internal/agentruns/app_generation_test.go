package agentruns

import "testing"

func TestParseAppGenerationModeKeepsFirstPassPublicNames(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name  string
		input string
		want  string
	}{
		{name: "json_render", input: "json_render", want: "json_render"},
		{name: "json_render_with_image", input: "json_render_with_image", want: "json_render_with_image"},
	}

	for _, testCase := range testCases {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			t.Parallel()

			got, ok := ParseAppGenerationMode(testCase.input)
			if !ok {
				t.Fatalf("expected %q to remain an allowed app-generation mode", testCase.input)
			}
			if got != testCase.want {
				t.Fatalf("expected normalized mode %q, got %q", testCase.want, got)
			}
		})
	}

	if _, ok := ParseAppGenerationMode("json-render"); ok {
		t.Fatal("expected renamed json-render mode to remain rejected")
	}
}

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
	if normalized["msg-plain"] != string(ChatAppGenerationMessageModePlainChat) {
		t.Fatalf("expected plain-chat entry to survive normalization, got %#v", normalized)
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
		"msg-image-mode": string(ChatAppGenerationMessageModeJSONRenderWithImage),
	}) {
		t.Fatal("expected retained image-mode user attachment to be reusable")
	}

	if HasRetainedImageAttachmentFromImageModeThread(messages, map[string]string{
		"msg-plain-image": string(ChatAppGenerationMessageModePlainChat),
		"msg-assistant":   string(ChatAppGenerationMessageModeJSONRenderWithImage),
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

	if normalized["msg-old"] != string(ChatAppGenerationMessageModeMCPServer) {
		t.Fatalf("expected prior normalized entries to survive, got %#v", normalized)
	}
	if normalized["msg-new"] != string(ChatAppGenerationMessageModePlainChat) {
		t.Fatalf("expected submitted turn to default to plain_chat, got %#v", normalized)
	}
}

func TestNormalizeSubmittedTurnAppGenerationByMessageIDOverridesSubmittedMode(t *testing.T) {
	t.Parallel()

	requestedMode := string(ChatAppGenerationMessageModeJSONRender)
	normalized := NormalizeSubmittedTurnAppGenerationByMessageID(
		map[string]any{"msg-new": ChatAppGenerationMessageModePlainChat},
		"msg-new",
		&requestedMode,
	)

	if normalized["msg-new"] != string(ChatAppGenerationMessageModeJSONRender) {
		t.Fatalf("expected submitted turn to use requested mode, got %#v", normalized)
	}
}
