package mcpx

import (
	"context"
	"testing"

	sdkmcp "github.com/modelcontextprotocol/go-sdk/mcp"
)

type recordingStateMachineRunProvider struct {
	report                map[string]any
	err                   error
	disabled              bool
	projectConfigID       string
	childRunID            *string
	machineRunID          *string
	sectionID             *string
	signalName            string
	payload               map[string]any
	shareSessionID        *string
	reportSignalCallCount int
}

func (p *recordingStateMachineRunProvider) Disabled() bool {
	return p == nil || p.disabled
}

func (p *recordingStateMachineRunProvider) ReportSignal(
	projectConfigID string,
	childRunID *string,
	machineRunID *string,
	sectionID *string,
	signalName string,
	payload map[string]any,
	shareSessionID *string,
) (map[string]any, error) {
	p.reportSignalCallCount++
	p.projectConfigID = projectConfigID
	p.childRunID = childRunID
	p.machineRunID = machineRunID
	p.sectionID = sectionID
	p.signalName = signalName
	p.payload = payload
	p.shareSessionID = shareSessionID
	if p.err != nil {
		return nil, p.err
	}
	if p.report == nil {
		return map[string]any{
			"status":                "ok",
			"signalEventId":         "signal-1",
			"machineRunId":          "machine-1",
			"childRunId":            "child-run-1",
			"sourceSectionId":       "chat-section",
			"signalName":            signalName,
			"sourceActivationCount": 0,
		}, nil
	}
	return p.report, nil
}

func TestServerReportStateMachineSignalUsesScopedRunContext(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	provider := &recordingStateMachineRunProvider{
		report: map[string]any{
			"status":                "ok",
			"signalEventId":         "signal-1",
			"machineRunId":          "machine-1",
			"childRunId":            "child-run-1",
			"sourceSectionId":       "chat-section",
			"signalName":            "merge_decision",
			"sourceActivationCount": 1,
		},
	}
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		LSPDiagnostics:   openScopedTestLSPDiagnosticsRegistry(),
		StateMachineRuns: provider,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"runId":           "child-run-1",
			"allowUnscoped":   true,
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", result.StructuredContent)
	}

	result, err = clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "report_state_machine_signal",
		Arguments: map[string]any{
			"signalName": "merge_decision",
			"sectionId":  "chat-section",
			"payload": map[string]any{
				"decision": "retry",
			},
		},
	})
	if err != nil {
		t.Fatalf("call report_state_machine_signal: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected report_state_machine_signal success, got %#v", result.StructuredContent)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["status"] != "ok" {
		t.Fatalf("expected ok status, got %#v", payload["status"])
	}
	if provider.reportSignalCallCount != 1 {
		t.Fatalf("expected one ReportSignal call, got %d", provider.reportSignalCallCount)
	}
	if provider.projectConfigID != "project-alpha" {
		t.Fatalf("expected project-alpha project config id, got %#v", provider.projectConfigID)
	}
	if provider.childRunID == nil || *provider.childRunID != "child-run-1" {
		t.Fatalf("expected child-run-1 child run id, got %#v", provider.childRunID)
	}
	if provider.machineRunID != nil {
		t.Fatalf("expected nil machine run id, got %#v", provider.machineRunID)
	}
	if provider.sectionID == nil || *provider.sectionID != "chat-section" {
		t.Fatalf("expected chat-section source section id, got %#v", provider.sectionID)
	}
	if provider.signalName != "merge_decision" {
		t.Fatalf("expected merge_decision signal name, got %#v", provider.signalName)
	}
	if provider.payload["decision"] != "retry" {
		t.Fatalf("expected retry payload, got %#v", provider.payload)
	}
	if provider.shareSessionID != nil {
		t.Fatalf("expected nil share session id, got %#v", provider.shareSessionID)
	}
}

func TestServerReportStateMachineSignalForwardsShareSessionID(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	provider := &recordingStateMachineRunProvider{}
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		LSPDiagnostics:   openScopedTestLSPDiagnosticsRegistry(),
		StateMachineRuns: provider,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"shareSessionId":  "share-session-a",
			"runId":           "child-run-1",
			"allowUnscoped":   true,
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", result.StructuredContent)
	}

	result, err = clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "report_state_machine_signal",
		Arguments: map[string]any{
			"signalName": "merge_decision",
			"sectionId":  "chat-section",
		},
	})
	if err != nil {
		t.Fatalf("call report_state_machine_signal: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected report_state_machine_signal success, got %#v", result.StructuredContent)
	}
	if provider.shareSessionID == nil || *provider.shareSessionID != "share-session-a" {
		t.Fatalf("expected share-session-a share session id, got %#v", provider.shareSessionID)
	}
}

func TestServerReportStateMachineSignalRequiresActiveChildRun(t *testing.T) {
	t.Parallel()

	projectRuntime := openScopedTestProjectRuntime(t)
	provider := &recordingStateMachineRunProvider{}
	_, clientSession := newScopedTestServerSessionWithOptions(t, t.TempDir(), projectRuntime, ServerOptions{
		WorkspaceRoot:    t.TempDir(),
		ProjectState:     projectRuntime,
		LSPDiagnostics:   openScopedTestLSPDiagnosticsRegistry(),
		StateMachineRuns: provider,
	})
	defer clientSession.Close()

	result, err := clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "set_agentic_context",
		Arguments: map[string]any{
			"projectConfigId": "project-alpha",
			"allowUnscoped":   true,
		},
	})
	if err != nil {
		t.Fatalf("call set_agentic_context: %v", err)
	}
	if result.IsError {
		t.Fatalf("expected set_agentic_context success, got %#v", result.StructuredContent)
	}

	result, err = clientSession.CallTool(context.Background(), &sdkmcp.CallToolParams{
		Name: "report_state_machine_signal",
		Arguments: map[string]any{
			"signalName": "merge_decision",
		},
	})
	if err != nil {
		t.Fatalf("call report_state_machine_signal without runId: %v", err)
	}
	if !result.IsError {
		t.Fatal("expected report_state_machine_signal without runId to fail")
	}
	if provider.reportSignalCallCount != 0 {
		t.Fatalf("expected runtime provider not to be called, got %d calls", provider.reportSignalCallCount)
	}

	payload := mustStructuredMap(t, result.StructuredContent)
	if payload["code"] != "invalid_arguments" {
		t.Fatalf("expected invalid_arguments code, got %#v", payload["code"])
	}
	if payload["message"] != "report_state_machine_signal requires an active child run." {
		t.Fatalf("unexpected error message %#v", payload["message"])
	}
}
