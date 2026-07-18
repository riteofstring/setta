package chat

import (
	"context"
	"strings"
	"testing"

	"setta/internal/codexapp"
)

func TestCodexHarnessHandlesTurnProtocolCoverageNotifications(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("protocol-coverage-notifications"))
	connectionDiagnostics := &recordingConnectionDiagnosticSink{}
	harness.SetConnectionDiagnosticSink(connectionDiagnostics)
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "coverage complete" {
		t.Fatalf("assistant text = %q, want coverage complete", sink.text)
	}
	requireRunItemType(t, sink.items, RunItemTypeHook)
	requireRunItemType(t, sink.items, RunItemTypeApprovalReview)
	requireRunItemType(t, sink.items, RunItemTypeContextCompaction)
	requireRunItemType(t, sink.items, RunItemTypeFileChange)
	command := requireRunItemType(t, sink.items, RunItemTypeCommandExecution)
	commandDetails, ok := command.CommandExecutionDetails()
	if !ok || commandDetails.ProcessID != "scoped_process_fake" {
		t.Fatalf("command item = %+v, want scoped process command execution", command)
	}
	notice := requireRunItemType(t, sink.items, RunItemTypeNotice)
	if notice.NoticeKind != codexapp.CodexNotificationWarning {
		t.Fatalf("notice kind = %q, want warning", notice.NoticeKind)
	}
	reasoning := requireRunItemType(t, sink.items, RunItemTypeReasoning)
	if reasoning.HiddenText != "private reasoning" {
		t.Fatalf("reasoning hidden text = %q, want preserved private reasoning", reasoning.HiddenText)
	}
	trace, ok := findTraceType(sink.traces, "codex_turn_moderation_metadata")
	if !ok {
		t.Fatalf("traces = %+v, want moderation metadata trace", sink.traces)
	}
	if strings.Contains(trace.message, "presentation") || strings.Contains(trace.message, "inline") {
		t.Fatalf("moderation trace message = %q, want bounded non-raw evidence", trace.message)
	}
	for _, item := range sink.items {
		if item.ProviderItemID == "command_exec_command_process_fake" || item.ProviderItemID == "process_process_fake" {
			t.Fatalf("standalone process output leaked into run items: %+v", sink.items)
		}
	}
	for _, diagnostic := range sink.diagnostics {
		if diagnostic.severity == DiagnosticSeverityCritical {
			t.Fatalf("diagnostics = %+v, want no critical diagnostics for known coverage notifications", sink.diagnostics)
		}
		if diagnostic.code == "codex_windows_world_writable_warning" {
			t.Fatalf("turn diagnostics = %+v, want Windows warning handled as connection diagnostic", sink.diagnostics)
		}
	}
	if !connectionDiagnostics.hasWorkspaceDiagnostic("workspace_api", "codex_windows_world_writable_warning") {
		t.Fatalf("connection diagnostics = %+v, want workspace-scoped Windows warning", connectionDiagnostics.diagnostics)
	}
}
