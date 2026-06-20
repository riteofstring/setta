package chat

import (
	"context"
	"encoding/json"
	"testing"

	"setta/internal/codexapp"
)

func TestCodexHarnessMapsTypedFilePatchNotification(t *testing.T) {
	sink := newRecordingSink()
	message := codexNotificationMessage(t, codexapp.CodexNotificationItemFileChangePatchUpdated, map[string]any{
		"changes": []any{
			map[string]any{
				"diff": "@@\n-old\n+new\n+second\n",
				"kind": map[string]any{"type": "update"},
				"path": "/workspace/internal/chat/service.go",
			},
			map[string]any{
				"diff": "@@\n+created\n",
				"kind": map[string]any{"type": "add"},
				"path": "/workspace/internal/chat/new.go",
			},
		},
		"itemId":   "file_patch_item",
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})

	if _, err := handleCodexPatchUpdated(message, "thread_fake", "turn_fake", sink); err != nil {
		t.Fatalf("handle patch updated: %v", err)
	}
	item := requireRunItemType(t, sink.items, RunItemTypeFileChange)
	if item.ProviderItemID != "file_patch_item" ||
		len(item.FileOperations) != 2 ||
		item.FileOperations[0].Operation != RunItemFileOperationWrite ||
		item.FileOperations[0].Additions != 2 ||
		item.FileOperations[0].Deletions != 1 ||
		item.FileOperations[1].Operation != RunItemFileOperationCreate ||
		item.DiffStats.ChangedFiles != 2 ||
		item.DiffStats.Additions != 3 ||
		item.DiffStats.Deletions != 1 ||
		!item.DiffStats.Structured {
		t.Fatalf("file patch item = %+v", item)
	}
}

func TestCodexHarnessMapsTypedTurnDiffNotification(t *testing.T) {
	sink := newRecordingSink()
	message := codexNotificationMessage(t, codexapp.CodexNotificationTurnDiffUpdated, map[string]any{
		"diff":     "diff --git a/internal/chat/types.go b/internal/chat/types.go\n--- a/internal/chat/types.go\n+++ b/internal/chat/types.go\n@@\n-old\n+new\n+another\n",
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})

	if _, err := handleCodexDiffUpdated(message, "thread_fake", "turn_fake", sink); err != nil {
		t.Fatalf("handle diff updated: %v", err)
	}
	item := requireRunItemType(t, sink.items, RunItemTypeDiff)
	if item.ProviderItemID != "diff_turn_fake" ||
		len(item.FileOperations) != 1 ||
		item.FileOperations[0].Path != "internal/chat/types.go" ||
		item.FileOperations[0].Operation != RunItemFileOperationDiff ||
		item.DiffStats.ChangedFiles != 1 ||
		item.DiffStats.Additions != 2 ||
		item.DiffStats.Deletions != 1 ||
		!item.DiffStats.Structured {
		t.Fatalf("diff item = %+v", item)
	}
}

func TestCodexDynamicToolUsesDeclaredFileOperationMetadata(t *testing.T) {
	tool := AgentTool{
		Namespace: "workspace",
		Name:      "read_file_range",
		InputSchema: AgentToolSchema{
			Type: AgentToolSchemaObject,
			Properties: map[string]AgentToolSchema{
				"path":      {Type: AgentToolSchemaString},
				"lineStart": {Type: AgentToolSchemaInteger},
				"lineEnd":   {Type: AgentToolSchemaInteger},
			},
		},
		OutputSchema: AgentToolSchema{Type: AgentToolSchemaObject},
		PermissionRequirements: []AgentToolPermissionRequirement{{
			Kind:        AgentToolPermissionReadWorkspace,
			Description: "Read a file range.",
		}},
		FileOperation: &AgentToolFileOperation{
			Operation:          RunItemFileOperationRead,
			PathArgument:       "path",
			RangeStartArgument: "lineStart",
			RangeEndArgument:   "lineEnd",
		},
		AuditMetadata: AgentToolAuditMetadata{
			DisplayName: "Read file range",
			Description: "Read a typed file range.",
			Category:    "workspace",
		},
		Handler: func(context.Context, AgentToolCall) (AgentToolResult, error) {
			return AgentToolResult{Success: true}, nil
		},
	}
	item, err := codexDynamicToolRunItem(AgentToolCall{
		CallID:    "tool_call_read",
		Namespace: "workspace",
		Tool:      "read_file_range",
		Arguments: json.RawMessage(`{"path":"internal/chat/types.go","lineStart":10,"lineEnd":20}`),
	}, tool, true)
	if err != nil {
		t.Fatalf("dynamic tool run item: %v", err)
	}
	if len(item.FileOperations) != 1 ||
		item.FileOperations[0].Operation != RunItemFileOperationRead ||
		item.FileOperations[0].Path != "internal/chat/types.go" ||
		item.FileOperations[0].RangeStart != 10 ||
		item.FileOperations[0].RangeEnd != 20 {
		t.Fatalf("dynamic tool file operations = %+v", item.FileOperations)
	}
}
