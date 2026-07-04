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
		CompletedAt:    "2026-06-21T12:00:02Z",
		ConversationID: "conversation",
		CreatedAt:      "2026-06-21T12:00:00Z",
		ID:             "run_item_command",
		ProviderItemID: "provider_command",
		RunID:          "run_command",
		StartedAt:      "2026-06-21T12:00:01Z",
		Status:         chat.RunItemStatusCompleted,
		Type:           chat.RunItemTypeCommandExecution,
		WorkspaceID:    "workspace",
		Details: chat.NewRunItemCommandExecutionDetails(chat.RunItemCommandExecutionDetails{
			Command:    "  npm test -- --runInBand  ",
			Cwd:        "/tmp/workspace",
			DurationMs: 1200,
			ExitCode:   0,
		}),
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

func TestActivityRecordSkipsProvisionalUnifiedExecStartup(t *testing.T) {
	source := chat.RunItemCommandSourceUnifiedExecStartup
	running := chat.RunItem{
		ConversationID: "conversation",
		CreatedAt:      "2026-06-21T12:00:00Z",
		ID:             "run_item_startup",
		ProviderItemID: "provider_startup",
		RunID:          "run_startup",
		Status:         chat.RunItemStatusRunning,
		Type:           chat.RunItemTypeCommandExecution,
		WorkspaceID:    "workspace",
		Details: chat.NewRunItemCommandExecutionDetails(chat.RunItemCommandExecutionDetails{
			Command: "command -v tokei",
			Source:  &source,
		}),
	}
	if record, ok, err := ActivityRecordFromChatRunItem(running, ChatRunItemContext{}); err != nil || ok {
		t.Fatalf("running unified exec startup mapped as record=%+v ok=%v err=%v, want skipped", record, ok, err)
	}
	running.Status = chat.RunItemStatusCompleted
	record, ok, err := ActivityRecordFromChatRunItem(running, ChatRunItemContext{})
	if err != nil {
		t.Fatalf("map completed unified exec startup: %v", err)
	}
	if !ok || record.Kind != ActivityKindCommand || record.Status != ActivityStatusCompleted {
		t.Fatalf("completed unified exec startup record=%+v ok=%v, want completed command", record, ok)
	}
}

func TestActivityRecordFromFileChangeBoundsTypedPaths(t *testing.T) {
	paths := []string{}
	for index := 0; index < maxFilePaths+3; index++ {
		paths = append(paths, "file.go")
	}
	filePaths := make([]chat.RunItemFileChangePath, 0, len(paths))
	for _, path := range paths {
		filePaths = append(filePaths, chat.RunItemFileChangePath{Path: path})
	}
	record, ok, err := ActivityRecordFromChatRunItem(chat.RunItem{
		ConversationID: "conversation",
		CreatedAt:      "2026-06-21T12:00:00Z",
		ID:             "run_item_file",
		ProviderItemID: "provider_file",
		RunID:          "run_file",
		Status:         chat.RunItemStatusRunning,
		Type:           chat.RunItemTypeFileChange,
		WorkspaceID:    "workspace",
		Details: chat.NewRunItemFileChangeDetails(chat.RunItemFileChangeDetails{
			PatchStatus: "applied",
			Paths:       filePaths,
		}),
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

func TestActivityRecordsFromCancelledWorkflowApprovalEventUsesCancelledStatus(t *testing.T) {
	cancelledPayload, err := json.Marshal(orchestrator.RunnerApprovalResolvedPayload{
		ApprovalID: "approval_1",
		ResolvedAt: "2026-06-21T12:00:04Z",
		Status:     string(chat.ApprovalStatusCancelled),
	})
	if err != nil {
		t.Fatalf("marshal cancelled payload: %v", err)
	}
	cancelled := workflowEventWithRunnerEvent(t, orchestrator.RunnerEvent{
		ID:                 "runner_event_cancelled",
		NodeID:             "node_review",
		NodeExecutionID:    "node_execution_review",
		OccurredAt:         "2026-06-21T12:00:04Z",
		Payload:            cancelledPayload,
		RunnerEventOrdinal: 4,
		RunnerKind:         orchestrator.ActionKindAgentCodex,
		Type:               orchestrator.RunnerEventApprovalResolved,
	})
	records, err := ActivityRecordsFromWorkflowEvent(cancelled, WorkflowEventContext{Revision: 10})
	if err != nil {
		t.Fatalf("map cancelled approval: %v", err)
	}
	if len(records) != 1 || records[0].Status != ActivityStatusCancelled || records[0].Approval.Status != chat.ApprovalStatusCancelled {
		t.Fatalf("cancelled records = %+v", records)
	}
}

func TestActivityRecordsFromNonfatalRunnerFailureUseDiagnosticStatus(t *testing.T) {
	payload, err := json.Marshal(orchestrator.RunnerAttemptFailedPayload{
		ErrorCode: "workflow_runner_cancel_failed",
		Message:   "runner cancel failed",
	})
	if err != nil {
		t.Fatalf("marshal runner failure payload: %v", err)
	}
	runnerEvent := orchestrator.RunnerEvent{
		ID:                 "runner_event_failed",
		NodeID:             "node_review",
		NodeExecutionID:    "node_execution_review",
		OccurredAt:         "2026-06-21T12:00:04Z",
		Payload:            payload,
		RunnerEventOrdinal: 4,
		RunnerKind:         orchestrator.ActionKindAgentCodex,
		Type:               orchestrator.RunnerEventAttemptFailed,
	}
	details, err := json.Marshal(struct {
		Nonfatal    bool                     `json:"nonfatal"`
		RunnerEvent orchestrator.RunnerEvent `json:"runnerEvent"`
	}{Nonfatal: true, RunnerEvent: runnerEvent})
	if err != nil {
		t.Fatalf("marshal nonfatal details: %v", err)
	}
	event := workflowEventWithDetails(orchestrator.EventRunnerAttemptFailed, details)
	records, err := ActivityRecordsFromWorkflowEvent(event, WorkflowEventContext{Revision: 11})
	if err != nil {
		t.Fatalf("map nonfatal runner failure: %v", err)
	}
	if len(records) != 1 || records[0].Kind != ActivityKindWorkflowStatus || records[0].Status != ActivityStatusUnknown {
		t.Fatalf("nonfatal failure records = %+v", records)
	}
}

func TestTerminalNodeActivityRecordsSynthesizeCancelledNodesFromExecutionState(t *testing.T) {
	execution := orchestrator.WorkflowExecution{
		ID:                  "workflow_execution",
		WorkspaceID:         "workspace",
		DefinitionID:        "workflow_definition",
		DefinitionVersionID: "workflow_version",
		Status:              orchestrator.ExecutionStatusCancelled,
		CompletedAt:         "2026-06-21T12:00:09Z",
		NodeExecutions: []orchestrator.WorkflowNodeExecution{
			{
				ID:          "node_execution_build",
				NodeID:      "node_build",
				Status:      orchestrator.NodeExecutionStatusCancelled,
				ScheduledAt: "2026-06-21T12:00:01Z",
				StartedAt:   "2026-06-21T12:00:02Z",
				CompletedAt: "2026-06-21T12:00:09Z",
			},
			{
				ID:          "node_execution_review",
				NodeID:      "node_review",
				Status:      orchestrator.NodeExecutionStatusFailed,
				ScheduledAt: "2026-06-21T12:00:01Z",
				CompletedAt: "2026-06-21T12:00:08Z",
				Error:       "  runner exited unexpectedly  ",
			},
			{
				ID:     "node_execution_running",
				NodeID: "node_running",
				Status: orchestrator.NodeExecutionStatusRunning,
			},
		},
	}

	records := TerminalNodeActivityRecords(execution, map[string]struct{}{}, WorkflowEventContext{Revision: 7})

	byNode := map[string]WorkspaceActivityRecord{}
	for _, record := range records {
		byNode[terminalNodeRecordNodeID(t, record)] = record
	}
	if len(byNode) != 2 {
		t.Fatalf("synthesized terminal records = %+v, want node_build + node_review only", records)
	}

	// A cancelled node left in-flight: terminal cancelled status, node-state detail ref,
	// and a valid cancelled-action event type so the generated decoder accepts the typed
	// payload (an empty event type would be rejected). No error means an empty message.
	assertTerminalNodeRecord(t, byNode["node_build"], terminalNodeRecordExpectation{
		activityID: "workflow_node_state:workflow_execution:node_build",
		status:     ActivityStatusCancelled,
		nodeID:     "node_build",
		eventType:  orchestrator.EventActionCancelled,
		updatedAt:  "2026-06-21T12:00:09Z",
		revision:   7,
		message:    "",
	})
	assertTerminalNodeRecord(t, byNode["node_review"], terminalNodeRecordExpectation{
		activityID: "workflow_node_state:workflow_execution:node_review",
		status:     ActivityStatusFailed,
		nodeID:     "node_review",
		eventType:  orchestrator.EventActionFailed,
		updatedAt:  "2026-06-21T12:00:08Z",
		revision:   7,
		message:    "runner exited unexpectedly",
	})
}

type terminalNodeRecordExpectation struct {
	activityID string
	status     WorkspaceActivityStatus
	nodeID     string
	eventType  orchestrator.WorkflowEventType
	updatedAt  string
	revision   int
	message    string
}

func terminalNodeRecordNodeID(t *testing.T, record WorkspaceActivityRecord) string {
	t.Helper()
	if record.GraphAnchor == nil {
		t.Fatalf("synthesized record missing anchor: %+v", record)
	}
	return record.GraphAnchor.WorkflowNodeID
}

func assertTerminalNodeRecord(t *testing.T, record WorkspaceActivityRecord, want terminalNodeRecordExpectation) {
	t.Helper()
	if record.ActivityID != want.activityID || record.UpdatedAt != want.updatedAt || record.Revision != want.revision {
		t.Fatalf("record identity = %s/%s/%d", record.ActivityID, record.UpdatedAt, record.Revision)
	}
	if record.Kind != ActivityKindWorkflowStatus || record.Status != want.status {
		t.Fatalf("record kind/status = %s/%s, want workflow_status/%s", record.Kind, record.Status, want.status)
	}
	anchor := record.GraphAnchor
	if anchor == nil || anchor.Kind != AnchorKindWorkflowNode || anchor.WorkflowExecutionID != "workflow_execution" {
		t.Fatalf("graph anchor = %+v", anchor)
	}
	if record.DetailRef.Kind != DetailKindWorkflowNode || record.Provenance.WorkflowNodeID != want.nodeID {
		t.Fatalf("detail/provenance = %+v / %+v", record.DetailRef, record.Provenance)
	}
	if record.Workflow == nil || record.Workflow.EventType != want.eventType || record.Workflow.Message != want.message {
		t.Fatalf("workflow payload = %+v", record.Workflow)
	}
}

func TestTerminalNodeActivityRecordsSkipNodesCoveredByEvents(t *testing.T) {
	execution := orchestrator.WorkflowExecution{
		ID:          "workflow_execution",
		WorkspaceID: "workspace",
		NodeExecutions: []orchestrator.WorkflowNodeExecution{
			// node_build failed but already has a terminal event record, so it must be skipped.
			{ID: "node_execution_build", NodeID: "node_build", Status: orchestrator.NodeExecutionStatusFailed, CompletedAt: "2026-06-21T12:00:05Z"},
			// node_succeeded ended successfully, so it is never synthesized regardless of coverage.
			{ID: "node_execution_done", NodeID: "node_done", Status: orchestrator.NodeExecutionStatusSucceeded, CompletedAt: "2026-06-21T12:00:05Z"},
			{ID: "node_execution_review", NodeID: "node_review", Status: orchestrator.NodeExecutionStatusCancelled, CompletedAt: "2026-06-21T12:00:06Z"},
		},
	}

	covered := map[string]struct{}{"node_execution_build": {}}
	records := TerminalNodeActivityRecords(execution, covered, WorkflowEventContext{Revision: 3})

	if len(records) != 1 || records[0].GraphAnchor.WorkflowNodeID != "node_review" {
		t.Fatalf("records = %+v, want only the unsuccessful node without a terminal event", records)
	}
}

func TestTerminalNodeActivityRecordsSynthesizeLaterFailedAttemptOfCoveredNode(t *testing.T) {
	// A loop re-runs node_build: the first attempt succeeded and emitted a terminal event,
	// then a later attempt failed without one. Keying coverage by node-execution id (not
	// graph node id) ensures the first attempt's event does not suppress synthesis for the
	// later failed attempt that actually needs an explanatory chip.
	execution := orchestrator.WorkflowExecution{
		ID:          "workflow_execution",
		WorkspaceID: "workspace",
		NodeExecutions: []orchestrator.WorkflowNodeExecution{
			{ID: "node_execution_build_1", NodeID: "node_build", Iteration: 1, Status: orchestrator.NodeExecutionStatusSucceeded, CompletedAt: "2026-06-21T12:00:03Z"},
			{ID: "node_execution_build_2", NodeID: "node_build", Iteration: 2, Status: orchestrator.NodeExecutionStatusFailed, CompletedAt: "2026-06-21T12:00:07Z"},
		},
	}

	covered := map[string]struct{}{"node_execution_build_1": {}}
	records := TerminalNodeActivityRecords(execution, covered, WorkflowEventContext{Revision: 4})

	if len(records) != 1 {
		t.Fatalf("records = %+v, want the later failed attempt synthesized", records)
	}
	if records[0].Status != ActivityStatusFailed || records[0].Provenance.WorkflowNodeExecutionID != "node_execution_build_2" {
		t.Fatalf("synthesized record = %+v, want failed node_execution_build_2", records[0])
	}
}

func TestTerminalStatusNodeExecutionIDIdentifiesEventTerminalAttempts(t *testing.T) {
	terminal := WorkspaceActivityRecord{
		Kind:   ActivityKindWorkflowStatus,
		Status: ActivityStatusCompleted,
		GraphAnchor: &WorkspaceActivityAnchor{
			Kind:                    AnchorKindWorkflowNode,
			WorkflowNodeID:          "node_build",
			WorkflowNodeExecutionID: "node_execution_build",
		},
	}
	if nodeExecutionID, ok := TerminalStatusNodeExecutionID(terminal); !ok || nodeExecutionID != "node_execution_build" {
		t.Fatalf("terminal node execution id = %q/%v", nodeExecutionID, ok)
	}

	running := WorkspaceActivityRecord{
		Kind:        ActivityKindWorkflowStatus,
		Status:      ActivityStatusRunning,
		GraphAnchor: &WorkspaceActivityAnchor{Kind: AnchorKindWorkflowNode, WorkflowNodeExecutionID: "node_execution_build"},
	}
	if _, ok := TerminalStatusNodeExecutionID(running); ok {
		t.Fatal("running status should not count as a terminal node record")
	}

	executionLevel := WorkspaceActivityRecord{
		Kind:        ActivityKindWorkflowStatus,
		Status:      ActivityStatusCancelled,
		GraphAnchor: &WorkspaceActivityAnchor{Kind: AnchorKindWorkflowExecution},
	}
	if _, ok := TerminalStatusNodeExecutionID(executionLevel); ok {
		t.Fatal("execution-level record should not count as a terminal node record")
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
	return workflowEventWithDetails(orchestrator.WorkflowEventType(runnerEvent.Type), details)
}

func workflowEventWithDetails(eventType orchestrator.WorkflowEventType, details json.RawMessage) orchestrator.WorkflowEvent {
	return orchestrator.WorkflowEvent{
		CreatedAt:           "2026-06-21T12:00:00Z",
		DefinitionID:        "workflow_definition",
		DefinitionVersionID: "workflow_version",
		Details:             details,
		ExecutionID:         "workflow_execution",
		ID:                  "workflow_event_test",
		NodeExecutionID:     "node_execution_review",
		NodeID:              "node_review",
		Ordinal:             4,
		SchemaVersion:       orchestrator.SchemaVersion,
		Type:                eventType,
		WorkspaceID:         "workspace",
	}
}
