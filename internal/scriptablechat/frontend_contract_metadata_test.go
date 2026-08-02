package scriptablechat

import (
	"reflect"
	"testing"
)

func TestFrontendDefaultToolChatMessageUsesTypedOwnerDefaults(t *testing.T) {
	message := FrontendDefaultToolChatMessage()
	if message.Role != ChatRoleTool || message.ToolCallID != "" || !message.StartedAt.IsZero() {
		t.Fatalf("unexpected tool chat defaults: %#v", message)
	}
	if message.Arguments == nil {
		t.Fatal("expected tool chat arguments map to be initialized")
	}
	if message.Content == nil {
		t.Fatal("expected tool chat content slice to be initialized")
	}
}

func TestFrontendBindingTagsLiveOnOwnerTypes(t *testing.T) {
	field, ok := reflect.TypeOf(ToolChatMessage{}).FieldByName("StartedAt")
	if !ok {
		t.Fatal("ToolChatMessage.StartedAt field not found")
	}
	if got := field.Tag.Get("ts_create_expr"); got != "\"\"" {
		t.Fatalf("ToolChatMessage.StartedAt ts_create_expr = %q, want %q", got, "\"\"")
	}
}
