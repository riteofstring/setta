package managedllm

import (
	"context"
	"testing"

	"setta/internal/mcpx"
	"setta/internal/realtime"
	"setta/internal/tools"
)

type captureResultFollowBroadcaster struct {
	messages []realtime.AIFollowToolResultUpdateMessage
}

func (c *captureResultFollowBroadcaster) BroadcastJSON(_ context.Context, message any, _ realtime.Selection) (int, error) {
	typed, ok := message.(realtime.AIFollowToolResultUpdateMessage)
	if !ok {
		return 0, nil
	}
	c.messages = append(c.messages, typed)
	return 1, nil
}

func TestBuildToolResultFollowContentResolvesTemporaryIDsFromStructuredContent(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	temporaryIDs, err := mcpx.NewTemporaryIDStore(mcpx.TemporaryIDMapPath(root))
	if err != nil {
		t.Fatalf("new temporary id store: %v", err)
	}
	temporarySectionID, err := temporaryIDs.EnsureTemporaryID("section-alpha")
	if err != nil {
		t.Fatalf("ensure temporary section id: %v", err)
	}
	temporaryCodeObjID, err := temporaryIDs.EnsureTemporaryID("code-obj-alpha")
	if err != nil {
		t.Fatalf("ensure temporary code object id: %v", err)
	}

	content, err := buildToolResultFollowContent(
		"project-alpha",
		"chat-alpha",
		mcpx.ToolDescriptor{
			Metadata: &tools.Metadata{
				ResultIDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection:    {"sectionId"},
					tools.IDTypeCodeObject: {"metaControlParamId"},
				},
			},
		},
		mcpx.ToolCallResult{
			StructuredContent: map[string]any{
				"sectionId":          temporarySectionID,
				"metaControlParamId": temporaryCodeObjID,
			},
		},
		temporaryIDs,
	)
	if err != nil {
		t.Fatalf("build result-follow content: %v", err)
	}
	if content == nil {
		t.Fatal("expected result-follow content")
	}
	if got := content.IDsByType["section"]; len(got) != 1 || got[0] != "section-alpha" {
		t.Fatalf("unexpected section ids %#v", content.IDsByType)
	}
	if got := content.IDsByType["codeObj"]; len(got) != 1 || got[0] != "code-obj-alpha" {
		t.Fatalf("unexpected code-object ids %#v", content.IDsByType)
	}
}

func TestBuildToolResultFollowContentParsesJSONTextPayload(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	temporaryIDs, err := mcpx.NewTemporaryIDStore(mcpx.TemporaryIDMapPath(root))
	if err != nil {
		t.Fatalf("new temporary id store: %v", err)
	}
	temporarySectionID, err := temporaryIDs.EnsureTemporaryID("section-beta")
	if err != nil {
		t.Fatalf("ensure temporary section id: %v", err)
	}

	content, err := buildToolResultFollowContent(
		"project-alpha",
		"chat-alpha",
		mcpx.ToolDescriptor{
			Metadata: &tools.Metadata{
				ResultIDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionId"},
				},
			},
		},
		mcpx.ToolCallResult{
			Text: `{"sectionId":"` + temporarySectionID + `"}`,
		},
		temporaryIDs,
	)
	if err != nil {
		t.Fatalf("build json-text result-follow content: %v", err)
	}
	if content == nil {
		t.Fatal("expected json-text result-follow content")
	}
	if got := content.IDsByType["section"]; len(got) != 1 || got[0] != "section-beta" {
		t.Fatalf("unexpected section ids %#v", content.IDsByType)
	}
}

func TestToolResultFollowEmitterBroadcastsFrontendUpdate(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	temporaryIDs, err := mcpx.NewTemporaryIDStore(mcpx.TemporaryIDMapPath(root))
	if err != nil {
		t.Fatalf("new temporary id store: %v", err)
	}
	temporarySectionID, err := temporaryIDs.EnsureTemporaryID("section-gamma")
	if err != nil {
		t.Fatalf("ensure temporary section id: %v", err)
	}

	broadcaster := &captureResultFollowBroadcaster{}
	emitter := NewToolResultFollowEmitter(ToolResultFollowEmitterOptions{
		Broadcaster:  broadcaster,
		TemporaryIDs: temporaryIDs,
	})
	if err := emitter.Emit(
		context.Background(),
		"project-alpha",
		"chat-alpha",
		mcpx.ToolDescriptor{
			Metadata: &tools.Metadata{
				ResultIDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionId"},
				},
			},
		},
		mcpx.ToolCallResult{
			StructuredContent: map[string]any{"sectionId": temporarySectionID},
		},
	); err != nil {
		t.Fatalf("emit result-follow update: %v", err)
	}

	if len(broadcaster.messages) != 1 {
		t.Fatalf("expected one result-follow broadcast, got %#v", broadcaster.messages)
	}
	if broadcaster.messages[0].Content.ChatID != "chat-alpha" {
		t.Fatalf("unexpected result-follow chat id %#v", broadcaster.messages[0])
	}
	if got := broadcaster.messages[0].Content.IDsByType["section"]; len(got) != 1 || got[0] != "section-gamma" {
		t.Fatalf("unexpected result-follow ids %#v", broadcaster.messages[0].Content.IDsByType)
	}
}
