package chat

import (
	"context"
	"testing"
)

func TestAgentToolRegistryRequiresSchemasPermissionsAndAuditMetadata(t *testing.T) {
	_, err := NewAgentToolRegistry(AgentTool{
		Namespace: "setta",
		Name:      "missingSchema",
		AuditMetadata: AgentToolAuditMetadata{
			DisplayName: "Missing schema",
			Category:    "test",
		},
		Handler: func(context.Context, AgentToolCall) (AgentToolResult, error) {
			return AgentToolResult{Success: true}, nil
		},
	})
	if err == nil {
		t.Fatal("registered tool without schemas")
	}

	_, err = NewAgentToolRegistry(AgentTool{
		Namespace:    "setta",
		Name:         "missingAudit",
		InputSchema:  AgentToolSchema{Type: AgentToolSchemaObject},
		OutputSchema: AgentToolSchema{Type: AgentToolSchemaObject},
		Handler: func(context.Context, AgentToolCall) (AgentToolResult, error) {
			return AgentToolResult{Success: true}, nil
		},
	})
	if err == nil {
		t.Fatal("registered tool without audit metadata")
	}

	_, err = NewAgentToolRegistry(AgentTool{
		Namespace:    "setta",
		Name:         "badPermission",
		InputSchema:  AgentToolSchema{Type: AgentToolSchemaObject},
		OutputSchema: AgentToolSchema{Type: AgentToolSchemaObject},
		PermissionRequirements: []AgentToolPermissionRequirement{{
			Kind:        AgentToolPermissionKind("unsupported"),
			Description: "Unsupported permission.",
		}},
		AuditMetadata: AgentToolAuditMetadata{
			DisplayName: "Bad permission",
			Category:    "test",
		},
		Handler: func(context.Context, AgentToolCall) (AgentToolResult, error) {
			return AgentToolResult{Success: true}, nil
		},
	})
	if err == nil {
		t.Fatal("registered tool with unsupported permission")
	}
}

func TestAgentToolRegistryRegistersTypedToolDefinition(t *testing.T) {
	registry, err := NewAgentToolRegistry(AgentTool{
		Namespace: "setta",
		Name:      "openDiff",
		InputSchema: AgentToolSchema{
			Type: AgentToolSchemaObject,
			Properties: map[string]AgentToolSchema{
				"path": {Type: AgentToolSchemaString},
			},
			Required: []string{"path"},
		},
		OutputSchema: AgentToolSchema{Type: AgentToolSchemaObject},
		PermissionRequirements: []AgentToolPermissionRequirement{{
			Kind:        AgentToolPermissionReadWorkspace,
			Description: "Read the diff target from the current workspace.",
		}},
		AuditMetadata: AgentToolAuditMetadata{
			DisplayName: "Open diff",
			Description: "Open a workspace diff for review.",
			Category:    "workspace",
		},
		Handler: func(context.Context, AgentToolCall) (AgentToolResult, error) {
			return AgentToolResult{Success: true}, nil
		},
	})
	if err != nil {
		t.Fatalf("register tool: %v", err)
	}
	tool, ok := registry.Lookup("setta", "openDiff")
	if !ok {
		t.Fatal("registered tool was not found")
	}
	if tool.InputSchema.Properties["path"].Type != AgentToolSchemaString || tool.AuditMetadata.Category != "workspace" {
		t.Fatalf("tool = %+v, want typed schema and audit metadata", tool)
	}
}
