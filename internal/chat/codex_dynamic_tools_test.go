package chat

import (
	"context"
	"strings"
	"testing"

	"setta/internal/workspace"
)

func TestCodexDynamicToolSpecsFromRegistry(t *testing.T) {
	registry, err := NewAgentToolRegistry(
		testCodexAgentTool("conversation_open", false),
		testCodexAgentTool("workspace_archive", true),
	)
	if err != nil {
		t.Fatalf("tool registry: %v", err)
	}

	specs, err := codexDynamicToolSpecs(registry)
	if err != nil {
		t.Fatalf("dynamic tool specs: %v", err)
	}
	if len(specs) != 2 {
		t.Fatalf("specs = %+v, want two", specs)
	}
	if specs[0].Name != "conversation_open" || specs[0].Namespace != "setta" || specs[0].DeferLoading {
		t.Fatalf("first spec = %+v, want visible conversation_open", specs[0])
	}
	if specs[1].Name != "workspace_archive" || !specs[1].DeferLoading {
		t.Fatalf("second spec = %+v, want deferred workspace_archive", specs[1])
	}
	properties, ok := specs[0].InputSchema["properties"].(map[string]any)
	if !ok {
		t.Fatalf("input schema = %+v, want object properties", specs[0].InputSchema)
	}
	if properties["id"].(map[string]any)["type"] != "string" {
		t.Fatalf("input schema properties = %+v, want string id", properties)
	}
}

func TestCodexDynamicToolSpecsRejectNonSettaNamespace(t *testing.T) {
	tool := testCodexAgentTool("workspace_context", false)
	tool.Namespace = "other"
	registry, err := NewAgentToolRegistry(tool)
	if err != nil {
		t.Fatalf("tool registry: %v", err)
	}

	_, err = codexDynamicToolSpecs(registry)
	if err == nil || !strings.Contains(err.Error(), `must use namespace "setta"`) {
		t.Fatalf("dynamic tool specs error = %v, want namespace failure", err)
	}
}

func TestSettaWorkspaceContextToolReturnsCurrentTurnContext(t *testing.T) {
	registry, err := NewSettaAgentToolRegistry()
	if err != nil {
		t.Fatalf("setta tool registry: %v", err)
	}
	tool, ok := registry.Lookup("setta", "workspace_context")
	if !ok {
		t.Fatal("workspace_context was not registered")
	}
	ctx := ContextWithAgentToolRuntime(context.Background(), AgentToolRuntimeContext{
		Workspace: workspace.WorkspaceSummary{
			ID:          "workspace_api",
			RootPath:    "/tmp/workspace",
			DisplayName: "workspace",
		},
		Conversation: Conversation{
			ID:          "conversation_api",
			WorkspaceID: "workspace_api",
			Title:       "Current chat",
		},
		Run: Run{
			ID:             "run_api",
			WorkspaceID:    "workspace_api",
			ConversationID: "conversation_api",
			Status:         RunStatusRunning,
		},
		ThreadID: "thread_api",
		TurnID:   "turn_api",
	})

	result, err := tool.Handler(ctx, AgentToolCall{Arguments: []byte(`{}`)})
	if err != nil {
		t.Fatalf("workspace_context handler: %v", err)
	}
	if !result.Success || len(result.ContentItems) != 1 {
		t.Fatalf("result = %+v, want one successful content item", result)
	}
	text := result.ContentItems[0].Text
	for _, expected := range []string{`"rootPath": "/tmp/workspace"`, `"conversation_api"`, `"thread_api"`, `"turn_api"`} {
		if !strings.Contains(text, expected) {
			t.Fatalf("workspace_context text = %s, missing %s", text, expected)
		}
	}
}

func TestSettaMoveToTrashToolIsRegisteredWithWorkspaceWritePermission(t *testing.T) {
	registry, err := NewSettaAgentToolRegistry()
	if err != nil {
		t.Fatalf("setta tool registry: %v", err)
	}
	tool, ok := registry.Lookup("setta", "move_to_trash")
	if !ok {
		t.Fatal("move_to_trash was not registered")
	}
	if len(tool.PermissionRequirements) != 1 || tool.PermissionRequirements[0].Kind != AgentToolPermissionWriteWorkspace {
		t.Fatalf("move_to_trash permissions = %+v, want workspace write", tool.PermissionRequirements)
	}
	if len(tool.InputSchema.Required) != 1 || tool.InputSchema.Required[0] != "path" {
		t.Fatalf("move_to_trash input schema = %+v, want required path", tool.InputSchema)
	}
}

func testCodexAgentTool(name string, deferLoading bool) AgentTool {
	return AgentTool{
		Namespace:    SettaAgentToolNamespace,
		Name:         name,
		DeferLoading: deferLoading,
		InputSchema: AgentToolSchema{
			Type: AgentToolSchemaObject,
			Properties: map[string]AgentToolSchema{
				"id": {
					Type:        AgentToolSchemaString,
					Description: "Identifier to inspect.",
				},
			},
			Required: []string{"id"},
		},
		OutputSchema: AgentToolSchema{Type: AgentToolSchemaObject},
		PermissionRequirements: []AgentToolPermissionRequirement{{
			Kind:        AgentToolPermissionReadWorkspace,
			Description: "Read workspace state.",
		}},
		AuditMetadata: AgentToolAuditMetadata{
			DisplayName: strings.ReplaceAll(name, "_", " "),
			Description: "Test dynamic tool " + name + ".",
			Category:    "test",
		},
		Handler: func(context.Context, AgentToolCall) (AgentToolResult, error) {
			return AgentToolResult{Success: true}, nil
		},
	}
}
