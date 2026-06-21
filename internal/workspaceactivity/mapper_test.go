package workspaceactivity

import (
	"encoding/json"
	"testing"

	"setta/internal/chat"
	"setta/internal/orchestrator"
)

func TestActivityRecordFromCommandRunItemUsesTypedFields(t *testing.T) {
	metadata := &chat.ConversationWorkflowMetadata{
		DefinitionID:        "workflow_definition",
		DefinitionVersionID: "workflow_version",
		ExecutionID:         "workflow_execution",
		NodeID:              "node_build",
		NodeExecutionID:     "node_execution_build",
	}
	record, ok, err := ActivityRecordFromChatRunItem(chat.RunItem{
		Command:        "  npm test -- --runInBand  ",
		CompletedAt:    "2026-06-21T12:00:02Z",
		ConversationID: "conversation",
		CreatedAt:      "2026-06-21T12:00:00Z",
		Cwd:            "/tmp/workspace",
		DurationMs:     1200,
		ExitCode:       0,
		ID:             "run_item_command",
		ProviderItemID: "provider_command",
		RunID:          "run_command",
		StartedAt:      "2026-06-21T12:00:01Z",
		Status:         chat.RunItemStatusCompleted,
		Type:           chat.RunItemTypeCommandExecution,
		WorkspaceID:    "workspace",
	}, ChatRunItemContext{
		ConversationWorkflow: metadata,
		Revision:             4,
	})
	if err != nil {
		t.Fatalf("map command activity: %v", err)
	}
	if !ok {
		t.Fatal("command run item was not mapped")
	}
	if record.Kind != ActivityKindCommand || record.Status != ActivityStatusCompleted {
		t.Fatalf("record kind/status = %s/%s", record.Kind, record.Status)
	}
	if record.Command == nil || record.Command.CommandPreview != "npm test -- --runInBand" {
		t.Fatalf("command payload = %+v", record.Command)
	}
	if record.Command.ExitCode == nil || *record.Command.ExitCode != 0 {
		t.Fatalf("exit code = %+v, want 0", record.Command.ExitCode)
	}
	if record.GraphAnchor == nil || record.GraphAnchor.WorkflowNodeID != "node_build" {
		t.Fatalf("graph anchor = %+v, want workflow node anchor", record.GraphAnchor)
	}
	if record.Provenance.ProviderItemID != "provider_command" || record.Provenance.WorkflowExecutionID != "workflow_execution" {
		t.Fatalf("provenance = %+v", record.Provenance)
	}
}

func TestActivityRecordFromFileChangeBoundsTypedPaths(t *testing.T) {
	paths := []string{}
	for index := 0; index < maxFilePaths+3; index++ {
		paths = append(paths, "file.go")
	}
	record, ok, err := ActivityRecordFromChatRunItem(chat.RunItem{
		ConversationID: "conversation",
		CreatedAt:      "2026-06-21T12:00:00Z",
		FilePaths:      paths,
		ID:             "run_item_file",
		PatchStatus:    "applied",
		ProviderItemID: "provider_file",
		RunID:          "run_file",
		Status:         chat.RunItemStatusRunning,
		Type:           chat.RunItemTypeFileChange,
		WorkspaceID:    "workspace",
	}, ChatRunItemContext{})
	if err != nil {
		t.Fatalf("map file activity: %v", err)
	}
	if !ok {
		t.Fatal("file change run item was not mapped")
	}
	if record.FileChange == nil {
		t.Fatal("file change payload was nil")
	}
	if record.FileChange.PathCount != maxFilePaths+3 {
		t.Fatalf("path count = %d", record.FileChange.PathCount)
	}
	if len(record.FileChange.Paths) != maxFilePaths || !record.FileChange.PathsTruncated {
		t.Fatalf("bounded paths = %d truncated=%v", len(record.FileChange.Paths), record.FileChange.PathsTruncated)
	}
	if record.FileChange.PatchStatus != "applied" {
		t.Fatalf("patch status = %q", record.FileChange.PatchStatus)
	}
}

func TestActivityRecordsFromWorkflowApprovalEventsUseTypedPayloads(t *testing.T) {
	request := chat.ApprovalRequest{
		Command: "git apply patch.diff",
		ID:      "approval_1",
		Kind:    chat.ApprovalKindCommand,
		Status:  chat.ApprovalStatusPending,
		Title:   "Approve command",
	}
	requestJSON, err := json.Marshal(request)
	if err != nil {
		t.Fatalf("marshal approval request: %v", err)
	}
	requestedPayload, err := json.Marshal(orchestrator.RunnerApprovalRequestedPayload{
		ApprovalID:   "approval_1",
		ApprovalKind: orchestrator.RunnerApprovalKind(chat.ApprovalKindCommand),
		Request:      requestJSON,
		Title:        "Approve command",
	})
	if err != nil {
		t.Fatalf("marshal requested payload: %v", err)
	}
	requested := workflowEventWithRunnerEvent(t, orchestrator.RunnerEvent{
		ID:                 "runner_event_requested",
		NodeID:             "node_review",
		NodeExecutionID:    "node_execution_review",
		OccurredAt:         "2026-06-21T12:00:00Z",
		Payload:            requestedPayload,
		RunnerEventOrdinal: 2,
		RunnerKind:         orchestrator.ActionKindAgentCodex,
		Type:               orchestrator.RunnerEventApprovalRequested,
	})

	records, err := ActivityRecordsFromWorkflowEvent(requested, WorkflowEventContext{Revision: 8})
	if err != nil {
		t.Fatalf("map requested approval: %v", err)
	}
	if len(records) != 1 {
		t.Fatalf("records = %d, want approval only", len(records))
	}
	record := records[0]
	if record.ActivityID != "workflow_approval:workflow_execution:approval_1" {
		t.Fatalf("activity id = %q", record.ActivityID)
	}
	if record.Status != ActivityStatusWaitingApproval || record.Approval == nil {
		t.Fatalf("approval record = %+v", record)
	}
	if record.Approval.Kind == nil || *record.Approval.Kind != chat.ApprovalKindCommand {
		t.Fatalf("approval kind = %+v", record.Approval.Kind)
	}
	if record.Approval.CommandPreview != "git apply patch.diff" {
		t.Fatalf("command preview = %q", record.Approval.CommandPreview)
	}

	resolvedPayload, err := json.Marshal(orchestrator.RunnerApprovalResolvedPayload{
		ApprovalID: "approval_1",
		Approved:   true,
		ResolvedAt: "2026-06-21T12:00:03Z",
		Status:     string(chat.ApprovalStatusApproved),
	})
	if err != nil {
		t.Fatalf("marshal resolved payload: %v", err)
	}
	resolved := workflowEventWithRunnerEvent(t, orchestrator.RunnerEvent{
		ID:                 "runner_event_resolved",
		NodeID:             "node_review",
		NodeExecutionID:    "node_execution_review",
		OccurredAt:         "2026-06-21T12:00:03Z",
		Payload:            resolvedPayload,
		RunnerEventOrdinal: 3,
		RunnerKind:         orchestrator.ActionKindAgentCodex,
		Type:               orchestrator.RunnerEventApprovalResolved,
	})
	records, err = ActivityRecordsFromWorkflowEvent(resolved, WorkflowEventContext{Revision: 9})
	if err != nil {
		t.Fatalf("map resolved approval: %v", err)
	}
	if len(records) != 1 || records[0].Status != ActivityStatusApproved {
		t.Fatalf("resolved records = %+v", records)
	}
}

func workflowEventWithRunnerEvent(t *testing.T, runnerEvent orchestrator.RunnerEvent) orchestrator.WorkflowEvent {
	t.Helper()
	details, err := json.Marshal(struct {
		RunnerEvent orchestrator.RunnerEvent `json:"runnerEvent"`
	}{RunnerEvent: runnerEvent})
	if err != nil {
		t.Fatalf("marshal runner event details: %v", err)
	}
	return orchestrator.WorkflowEvent{
		CreatedAt:           "2026-06-21T12:00:00Z",
		DefinitionID:        "workflow_definition",
		DefinitionVersionID: "workflow_version",
		Details:             details,
		ExecutionID:         "workflow_execution",
		ID:                  "workflow_event_" + runnerEvent.ID,
		NodeExecutionID:     "node_execution_review",
		NodeID:              "node_review",
		Ordinal:             4,
		SchemaVersion:       orchestrator.SchemaVersion,
		Type:                orchestrator.WorkflowEventType(runnerEvent.Type),
		WorkspaceID:         "workspace",
	}
}
