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
