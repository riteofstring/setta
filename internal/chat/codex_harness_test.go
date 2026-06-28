package chat

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"setta/internal/codexapp"
	"setta/internal/workspace"
)

func TestCodexHarnessMapsStreamingTurn(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("stream"))
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)

	if sink.text != "hello from codex" {
		t.Fatalf("assistant text = %q, want streamed response", sink.text)
	}
	if sink.threadID != "thread_fake" || sink.turnID != "turn_fake" {
		t.Fatalf("linked refs = %q %q, want fake refs", sink.threadID, sink.turnID)
	}
}

func TestCodexHarnessRunsSemanticCartographerStructuredTask(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("structured-task"))
	result, err := harness.RunTask(context.Background(), HarnessTaskRequest{
		Surface:     HarnessSurfaceSemanticCartographer,
		HarnessKind: HarnessCodex,
		TurnMode:    HarnessTurnStructuredTask,
		OutputContract: HarnessOutputContract{
			Kind:       HarnessOutputStrictJSON,
			JSONSchema: json.RawMessage(`{"type":"object","required":["patches"],"properties":{"patches":{"type":"array"}}}`),
		},
		CapabilityPolicy: HarnessCapabilityPolicy{
			AllowedTools:      []string{},
			WorkspaceMutation: false,
			Approvals:         false,
			Streaming:         false,
		},
		StructuredTask: &HarnessStructuredTask{
			ID:        "cartographer_task_codex_test",
			Workspace: testTurnRequest(t).Workspace,
			Prompt:    "Return only a strict JSON patch envelope.",
			Input:     json.RawMessage(`{"workspaceId":"workspace_api","sourceRefs":{},"evidence":[]}`),
			Model:     "gpt-test",
		},
	})
	if err != nil {
		t.Fatalf("run structured task: %v", err)
	}
	requireTurnOutcome(t, result.Completion, TurnOutcomeCompleted)
	if string(result.StructuredOutput) != `{"patches":[]}` {
		t.Fatalf("structured output = %s, want empty patch envelope", result.StructuredOutput)
	}
	if result.Audit.HarnessKind != HarnessCodex ||
		result.Audit.Model != "gpt-test" ||
		result.Audit.RequestID != "cartographer_task_codex_test" ||
		result.Audit.ResponseID != "turn_fake" ||
		result.Audit.ThreadRef.ThreadID != "thread_fake" ||
		result.Audit.ThreadRef.LastTurnID != "turn_fake" ||
		result.Audit.ThreadRef.Status != HarnessRefLinked {
		t.Fatalf("audit = %+v, want codex structured task metadata", result.Audit)
	}
}

func TestCodexStructuredOutputUsesStreamedTextWhenCompletedTurnOmitsFinalText(t *testing.T) {
	output, err := codexStructuredOutputFromCompletedTurn(
		fakeCodexTurnWithItems("completed", []any{
			map[string]any{
				"id":   "agent_message_structured_fake",
				"text": "",
				"type": "agentMessage",
			},
		}),
		`{"patches":[]}`,
	)
	if err != nil {
		t.Fatalf("structured output from streamed text: %v", err)
	}
	if string(output) != `{"patches":[]}` {
		t.Fatalf("structured output = %s, want streamed patch envelope", output)
	}
}

func TestJSONRPCPendingCallFailsOnProcessExit(t *testing.T) {
	client, err := startTestJSONRPCClient(testCodexConfig("jsonrpc-pending-exit"))
	if err != nil {
		t.Fatalf("start json rpc client: %v", err)
	}
	defer client.Close()

	_, err = client.Call(context.Background(), "hold", map[string]any{})
	if err == nil {
		t.Fatal("call succeeded, want app-server exit error")
	}
	if !strings.Contains(err.Error(), "hold failed: codex app-server exited") {
		t.Fatalf("error = %q, want call exit error", err)
	}
}

func TestJSONRPCConcurrentPendingCallsObserveProcessExit(t *testing.T) {
	client, err := startTestJSONRPCClient(testCodexConfig("jsonrpc-exit-after-two-calls"))
	if err != nil {
		t.Fatalf("start json rpc client: %v", err)
	}
	defer client.Close()

	first := callJSONRPCAsync(client, "hold")
	second := callJSONRPCAsync(client, "hold")
	firstErr := waitForJSONRPCError(t, first)
	secondErr := waitForJSONRPCError(t, second)
	if !strings.Contains(firstErr.Error(), "codex app-server exited") {
		t.Fatalf("first error = %q, want app-server exit", firstErr)
	}
	if !strings.Contains(secondErr.Error(), "codex app-server exited") {
		t.Fatalf("second error = %q, want app-server exit", secondErr)
	}
}

func TestJSONRPCCloseFailsPendingCalls(t *testing.T) {
	client, err := startTestJSONRPCClient(testCodexConfig("jsonrpc-hold"))
	if err != nil {
		t.Fatalf("start json rpc client: %v", err)
	}
	done := callJSONRPCAsync(client, "hold")
	waitForNotification(t, client, "hold/received")

	client.Close()

	err = waitForJSONRPCError(t, done)
	if !strings.Contains(err.Error(), "codex app-server client closed") {
		t.Fatalf("error = %q, want client closed", err)
	}
}

func TestJSONRPCMalformedResponseIDFailsPendingCall(t *testing.T) {
	client, err := startTestJSONRPCClient(testCodexConfig("jsonrpc-malformed-response-id"))
	if err != nil {
		t.Fatalf("start json rpc client: %v", err)
	}
	defer client.Close()

	_, err = client.Call(context.Background(), "badID", map[string]any{})
	if err == nil {
		t.Fatal("call succeeded, want malformed response id error")
	}
	if !strings.Contains(err.Error(), "codex response id must be an integer") {
		t.Fatalf("error = %q, want malformed response id", err)
	}
}

func TestJSONRPCRoutesStringIDServerRequest(t *testing.T) {
	client, err := startTestJSONRPCClient(testCodexConfig("malformed-approval"))
	if err != nil {
		t.Fatalf("start json rpc client: %v", err)
	}
	defer client.Close()
	if _, err := client.Call(context.Background(), "initialize", map[string]any{}); err != nil {
		t.Fatalf("initialize: %v", err)
	}
	if _, err := client.Call(context.Background(), "thread/start", map[string]any{}); err != nil {
		t.Fatalf("thread/start: %v", err)
	}
	if _, err := client.Call(context.Background(), "turn/start", map[string]any{}); err != nil {
		t.Fatalf("turn/start: %v", err)
	}
	select {
	case request := <-client.Requests():
		if request.Method != "item/commandExecution/requestApproval" {
			t.Fatalf("request method = %q", request.Method)
		}
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for server request")
	}
}

func TestCodexHarnessMapsApprovalRequestAndResponse(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("approval"))
	sink := newRecordingSink()
	done := startCodexTurnAsync(t, harness, sink)

	approval := waitForApproval(t, sink)
	if approval.Kind != ApprovalKindCommand || approval.Command != "go test ./..." {
		t.Fatalf("approval = %+v, want command approval", approval)
	}
	if approval.ProviderItemID != "item_fake" {
		t.Fatalf("approval provider item id = %q, want item_fake", approval.ProviderItemID)
	}
	commandItem, ok := findRunItemType(sink.items, RunItemTypeCommandExecution)
	if !ok || commandItem.ProviderItemID != "item_fake" {
		t.Fatalf("items = %+v, want command approval run item", sink.items)
	}
	if err := harness.SubmitApproval(context.Background(), ApprovalResponse{
		ApprovalID: approval.ID,
		Approved:   true,
		RunID:      "run_fake",
	}); err != nil {
		t.Fatalf("submit approval: %v", err)
	}
	requireAsyncTurnOutcome(t, done, TurnOutcomeCompleted)
	if sink.text != "approved" {
		t.Fatalf("assistant text = %q, want approved", sink.text)
	}
}

func TestCodexHarnessMapsPermissionApprovalResponse(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("permission"))
	sink := newRecordingSink()
	done := startCodexTurnAsync(t, harness, sink)

	approval := waitForApproval(t, sink)
	if approval.Kind != ApprovalKindPermission || !strings.Contains(approval.Permission, "network") {
		t.Fatalf("approval = %+v, want permission approval with details", approval)
	}
	if !containsRunItemType(sink.items, RunItemTypeDynamicToolCall) {
		t.Fatalf("items = %+v, want permission approval run item", sink.items)
	}
	if err := harness.SubmitApproval(context.Background(), ApprovalResponse{
		ApprovalID: approval.ID,
		Approved:   true,
		RunID:      "run_fake",
	}); err != nil {
		t.Fatalf("submit approval: %v", err)
	}
	requireAsyncTurnOutcome(t, done, TurnOutcomeCompleted)
	if sink.text != "permission approved" {
		t.Fatalf("assistant text = %q, want permission approved", sink.text)
	}
}

func TestCodexHarnessMapsMultiQuestionUserInput(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("user-input"))
	sink := newRecordingSink()
	done := startCodexTurnAsync(t, harness, sink)

	approval := waitForApproval(t, sink)
	if approval.Kind != ApprovalKindUserInput || len(approval.Questions) != 2 {
		t.Fatalf("approval = %+v, want two user input questions", approval)
	}
	if !containsRunItemType(sink.items, RunItemTypeDynamicToolCall) {
		t.Fatalf("items = %+v, want user input approval run item", sink.items)
	}
	if err := harness.SubmitApproval(context.Background(), ApprovalResponse{
		ApprovalID: approval.ID,
		Answers: []ApprovalAnswer{
			{QuestionID: "branch", Answers: []string{"main"}},
			{QuestionID: "mode", Answers: []string{"fast"}},
		},
		Approved: true,
		RunID:    "run_fake",
	}); err != nil {
		t.Fatalf("submit approval: %v", err)
	}
	requireAsyncTurnOutcome(t, done, TurnOutcomeCompleted)
	if sink.text != "answers received" {
		t.Fatalf("assistant text = %q, want answers received", sink.text)
	}
}

func TestCodexHarnessMapsMCPElicitationFormResponse(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("mcp-elicitation-form"))
	sink := newRecordingSink()
	done := startCodexTurnAsync(t, harness, sink)

	approval := waitForApproval(t, sink)
	if approval.Kind != ApprovalKindStructured || approval.StructuredInput == nil || approval.StructuredInput.Mode != StructuredInputModeForm {
		t.Fatalf("approval = %+v, want structured form elicitation", approval)
	}
	if approval.StructuredInput.ServerName != "deploy" || len(approval.StructuredInput.Schema) == 0 {
		t.Fatalf("structured input = %+v, want server and schema", approval.StructuredInput)
	}
	if err := harness.SubmitApproval(context.Background(), ApprovalResponse{
		ApprovalID: approval.ID,
		Approved:   true,
		Answers: []ApprovalAnswer{
			{QuestionID: "target", Value: rawJSONPtr(`"staging"`)},
			{QuestionID: "confirm", Value: rawJSONPtr(`true`)},
		},
		RunID: "run_fake",
	}); err != nil {
		t.Fatalf("submit mcp elicitation: %v", err)
	}
	requireAsyncTurnOutcome(t, done, TurnOutcomeCompleted)
	if sink.text != "mcp form accepted" {
		t.Fatalf("assistant text = %q, want mcp form accepted", sink.text)
	}
}

func TestCodexHarnessMapsMCPElicitationFormCancel(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("mcp-elicitation-form-cancel"))
	sink := newRecordingSink()
	done := startCodexTurnAsync(t, harness, sink)

	approval := waitForApproval(t, sink)
	if approval.Kind != ApprovalKindStructured || approval.StructuredInput == nil {
		t.Fatalf("approval = %+v, want structured elicitation", approval)
	}
	if err := harness.SubmitApproval(context.Background(), ApprovalResponse{
		ApprovalID: approval.ID,
		Cancelled:  true,
		RunID:      "run_fake",
	}); err != nil {
		t.Fatalf("submit mcp cancel: %v", err)
	}
	requireAsyncTurnOutcome(t, done, TurnOutcomeCompleted)
	if sink.text != "mcp form cancelled" {
		t.Fatalf("assistant text = %q, want mcp form cancelled", sink.text)
	}
}

func TestCodexHarnessMapsMCPElicitationURLDecline(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("mcp-elicitation-url-decline"))
	sink := newRecordingSink()
	done := startCodexTurnAsync(t, harness, sink)

	approval := waitForApproval(t, sink)
	if approval.Kind != ApprovalKindStructured || approval.StructuredInput == nil || approval.StructuredInput.Mode != StructuredInputModeURL {
		t.Fatalf("approval = %+v, want structured url elicitation", approval)
	}
	if approval.StructuredInput.URL != "https://example.test/login" || approval.StructuredInput.ElicitationID != "elicitation_fake" {
		t.Fatalf("structured input = %+v, want url metadata", approval.StructuredInput)
	}
	if err := harness.SubmitApproval(context.Background(), ApprovalResponse{
		ApprovalID: approval.ID,
		Approved:   false,
		RunID:      "run_fake",
	}); err != nil {
		t.Fatalf("submit mcp decline: %v", err)
	}
	requireAsyncTurnOutcome(t, done, TurnOutcomeCompleted)
	if sink.text != "mcp url declined" {
		t.Fatalf("assistant text = %q, want mcp url declined", sink.text)
	}
}

func TestCodexHarnessReturnsUnsupportedDynamicToolError(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("dynamic-tool-unknown"))
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	item, ok := findLastRunItemType(sink.items, RunItemTypeDynamicToolCall)
	if !ok || item.Status != RunItemStatusFailed || !strings.Contains(item.Error, "unsupported dynamic tool") {
		t.Fatalf("items = %+v, want failed unsupported dynamic tool item", sink.items)
	}
}

func TestCodexHarnessDispatchesRegisteredDynamicTool(t *testing.T) {
	registry, err := NewAgentToolRegistry(AgentTool{
		Namespace: "setta",
		Name:      "fakeTool",
		InputSchema: AgentToolSchema{
			Type: AgentToolSchemaObject,
			Properties: map[string]AgentToolSchema{
				"value": {Type: AgentToolSchemaString},
			},
			Required: []string{"value"},
		},
		OutputSchema: AgentToolSchema{Type: AgentToolSchemaObject},
		PermissionRequirements: []AgentToolPermissionRequirement{{
			Kind:        AgentToolPermissionReadWorkspace,
			Description: "Read workspace state for the fake tool.",
		}},
		AuditMetadata: AgentToolAuditMetadata{
			DisplayName: "Fake dynamic tool",
			Description: "Deterministic dynamic tool test fixture.",
			Category:    "test",
		},
		Handler: func(_ context.Context, call AgentToolCall) (AgentToolResult, error) {
			if string(call.Arguments) != `{"value":"from codex"}` {
				t.Fatalf("tool arguments = %s, want structured json", call.Arguments)
			}
			return AgentToolResult{
				ContentItems: []AgentToolContentItem{{Type: "inputText", Text: "tool ok"}},
				Success:      true,
			}, nil
		},
	})
	if err != nil {
		t.Fatalf("tool registry: %v", err)
	}
	config := testCodexConfig("dynamic-tool-registered")
	config.Tools = registry
	harness := NewCodexHarness(config)
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	item, ok := findLastRunItemType(sink.items, RunItemTypeDynamicToolCall)
	if !ok || item.Status != RunItemStatusCompleted || item.Result != "tool ok" {
		t.Fatalf("items = %+v, want completed registered dynamic tool item", sink.items)
	}
}

func TestCodexHarnessReturnsUnavailableAttestation(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("attestation-unavailable"))
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if len(sink.diagnostics) != 1 || sink.diagnostics[0].code != "codex_attestation_unavailable" || sink.diagnostics[0].severity != DiagnosticSeverityError {
		t.Fatalf("diagnostics = %+v, want attestation unavailable diagnostic", sink.diagnostics)
	}
}

func TestCodexHarnessUsesConfiguredAttestationProvider(t *testing.T) {
	config := testCodexConfig("attestation-provider")
	config.AttestationProvider = fakeAttestationProvider{token: "token_fake"}
	harness := NewCodexHarness(config)
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if len(sink.diagnostics) != 0 {
		t.Fatalf("diagnostics = %+v, want none", sink.diagnostics)
	}
}

func TestCodexHarnessInterruptsActiveTurn(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("cancel"))
	sink := newRecordingSink()
	done := startCodexTurnAsync(t, harness, sink)
	waitForThreadLink(t, sink)

	if err := harness.CancelTurn(context.Background(), CancelRequest{RunID: "run_fake"}); err != nil {
		t.Fatalf("cancel turn: %v", err)
	}
	requireAsyncTurnOutcome(t, done, TurnOutcomeCancelled)
}

func TestCodexHarnessMapsFailedTurnOutcome(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("failed-turn"))
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeFailed)
	if completion.ErrorMessage != "model failed" {
		t.Fatalf("turn error = %q, want provider message", completion.ErrorMessage)
	}
}

func TestCodexHarnessRejectsUnknownTurnStatus(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("unknown-turn-status"))
	sink := newRecordingSink()

	_, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err == nil {
		t.Fatal("start turn succeeded, want unknown turn status error")
	}
	if !strings.Contains(err.Error(), "unsupported codex turn status: paused") {
		t.Fatalf("error = %q, want unsupported turn status", err)
	}
	if len(sink.diagnostics) != 1 || sink.diagnostics[0].code != "codex_turn_status_unsupported" {
		t.Fatalf("diagnostics = %+v, want unsupported turn status diagnostic", sink.diagnostics)
	}
}

func TestCodexHarnessSteersActiveTurn(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("steer"))
	sink := newRecordingSink()
	done := startCodexTurnAsync(t, harness, sink)
	waitForThreadLink(t, sink)

	if err := harness.SteerTurn(context.Background(), SteerRequest{
		RunID:    "run_fake",
		ThreadID: "thread_fake",
		TurnID:   "turn_fake",
		Text:     "adjust course",
	}); err != nil {
		t.Fatalf("steer turn: %v", err)
	}
	requireAsyncTurnOutcome(t, done, TurnOutcomeCompleted)
	if sink.text != "steered" {
		t.Fatalf("assistant text = %q, want steered", sink.text)
	}
}

func TestCodexHarnessMapsRunActivity(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("activity"))
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)

	if len(sink.items) < 5 {
		t.Fatalf("items = %+v, want command, reasoning, file, mcp, warning activity", sink.items)
	}
	commandItem, ok := findRunItemType(sink.items, RunItemTypeCommandExecution)
	if !ok || commandItem.Command != "go test ./..." {
		t.Fatalf("items = %+v, want command execution", sink.items)
	}
	if len(sink.outputs) != 1 || sink.outputs[0].stream != codexCommandExecutionOutputStream || sink.outputs[0].text != "ok\n" {
		t.Fatalf("outputs = %+v, want command output", sink.outputs)
	}
	if !containsRunItemType(sink.items, RunItemTypeNotice) {
		t.Fatalf("items = %+v, want notice", sink.items)
	}
	if !containsRunItemType(sink.items, RunItemTypeReasoning) {
		t.Fatalf("items = %+v, want reasoning summary", sink.items)
	}
}

func containsRunItemType(items []RunItem, itemType RunItemType) bool {
	_, ok := findRunItemType(items, itemType)
	return ok
}

func findRunItemType(items []RunItem, itemType RunItemType) (RunItem, bool) {
	for _, item := range items {
		if item.Type == itemType {
			return item, true
		}
	}
	return RunItem{}, false
}

func findLastRunItemType(items []RunItem, itemType RunItemType) (RunItem, bool) {
	for index := len(items) - 1; index >= 0; index-- {
		if items[index].Type == itemType {
			return items[index], true
		}
	}
	return RunItem{}, false
}

func findTraceType(traces []recordedTrace, traceType string) (recordedTrace, bool) {
	for _, trace := range traces {
		if trace.traceType == traceType {
			return trace, true
		}
	}
	return recordedTrace{}, false
}

func requireRunItemType(t *testing.T, items []RunItem, itemType RunItemType) RunItem {
	t.Helper()
	item, ok := findRunItemType(items, itemType)
	if !ok {
		t.Fatalf("items = %+v, want %s", items, itemType)
	}
	return item
}

func TestCodexHarnessReportsNotStartedBeforeActiveRegistration(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("stream"))

	err := harness.CancelTurn(context.Background(), CancelRequest{RunID: "run_fake"})
	if !errors.Is(err, ErrTurnNotStarted) {
		t.Fatalf("cancel turn error = %v, want ErrTurnNotStarted", err)
	}
}

func TestCodexHarnessRejectsMalformedApprovalRequest(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("malformed-approval"))
	sink := newRecordingSink()

	_, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err == nil {
		t.Fatal("start turn succeeded, want malformed approval error")
	}
	if !strings.Contains(err.Error(), "codex command approval.command is required") {
		t.Fatalf("error = %q, want missing command", err)
	}
}

func TestCodexHarnessRejectsMalformedAssistantDelta(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("malformed-delta"))
	sink := newRecordingSink()

	_, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err == nil {
		t.Fatal("start turn succeeded, want malformed delta error")
	}
	if !strings.Contains(err.Error(), "AgentMessageDeltaNotification has invalid shape") {
		t.Fatalf("error = %q, want malformed delta", err)
	}
}

func TestCodexHarnessReportsUnsupportedServerRequest(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("unsupported-request"))
	sink := newRecordingSink()

	_, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err == nil {
		t.Fatal("start turn succeeded, want unsupported request error")
	}
	if !strings.Contains(err.Error(), "unsupported codex app-server request") {
		t.Fatalf("error = %q, want unsupported request", err)
	}
	if containsRunItemType(sink.items, RunItemTypeNotice) {
		t.Fatalf("items = %+v, want no unsupported request notice", sink.items)
	}
	if len(sink.diagnostics) != 1 || sink.diagnostics[0].code != "codex_request_unsupported" {
		t.Fatalf("diagnostics = %+v, want unsupported request diagnostic", sink.diagnostics)
	}
}

func TestCodexHarnessReportsUnsupportedNotificationAsProviderDrift(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("unsupported-notification"))
	sink := newRecordingSink()

	_, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err == nil {
		t.Fatal("start turn succeeded, want unsupported notification error")
	}
	if !strings.Contains(err.Error(), "unsupported codex app-server notification") {
		t.Fatalf("error = %q, want unsupported notification", err)
	}
	if containsRunItemType(sink.items, RunItemTypeNotice) {
		t.Fatalf("items = %+v, want no unsupported notification notice", sink.items)
	}
	if len(sink.diagnostics) != 1 || sink.diagnostics[0].code != "codex_notification_unsupported" {
		t.Fatalf("diagnostics = %+v, want unsupported notification diagnostic", sink.diagnostics)
	}
}

func TestCodexHarnessRejectsDeprecatedThreadCompactedNotification(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("deprecated-thread-compacted-notification"))
	sink := newRecordingSink()

	_, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err == nil {
		t.Fatal("start turn succeeded, want deprecated thread compacted notification error")
	}
	if !strings.Contains(err.Error(), "unsupported codex app-server notification: thread/compacted") {
		t.Fatalf("error = %q, want unsupported thread/compacted notification", err)
	}
	if containsRunItemType(sink.items, RunItemTypeNotice) {
		t.Fatalf("items = %+v, want no deprecated compaction notice", sink.items)
	}
	if len(sink.diagnostics) != 1 || sink.diagnostics[0].code != "codex_notification_unsupported" {
		t.Fatalf("diagnostics = %+v, want unsupported notification diagnostic", sink.diagnostics)
	}
}

func TestCodexHarnessRejectsDeprecatedFileChangeOutputDeltaNotification(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("deprecated-file-change-output-delta-notification"))
	sink := newRecordingSink()

	_, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err == nil {
		t.Fatal("start turn succeeded, want deprecated file change output delta notification error")
	}
	if !strings.Contains(err.Error(), "unsupported codex app-server notification: item/fileChange/outputDelta") {
		t.Fatalf("error = %q, want unsupported file change output delta notification", err)
	}
	if containsRunItemType(sink.items, RunItemTypeFileChange) {
		t.Fatalf("items = %+v, want no deprecated file change output item", sink.items)
	}
	if len(sink.diagnostics) != 1 || sink.diagnostics[0].code != "codex_notification_unsupported" {
		t.Fatalf("diagnostics = %+v, want unsupported notification diagnostic", sink.diagnostics)
	}
}

func TestCodexHarnessHandlesRemoteControlStatusAsGlobalNotification(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("remote-control-status"))
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "hello from codex" {
		t.Fatalf("assistant text = %q, want streamed response", sink.text)
	}
	if len(sink.diagnostics) != 0 {
		t.Fatalf("diagnostics = %+v, want none", sink.diagnostics)
	}
}

func TestCodexHarnessHandlesMCPServerStartupStatusAsGlobalNotification(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("mcp-server-startup-status"))
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "hello from codex" {
		t.Fatalf("assistant text = %q, want streamed response", sink.text)
	}
	if len(sink.diagnostics) != 0 {
		t.Fatalf("diagnostics = %+v, want none", sink.diagnostics)
	}
}

func TestCodexHarnessHandlesReasoningItemSummaryArray(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("reasoning-summary-array"))
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	item, ok := findRunItemType(sink.items, RunItemTypeReasoning)
	if !ok {
		t.Fatalf("items = %+v, want reasoning item", sink.items)
	}
	if item.Summary != "checked context\nanswered directly" {
		t.Fatalf("reasoning summary = %q, want joined summary array", item.Summary)
	}
	if sink.text != "hello from codex" {
		t.Fatalf("assistant text = %q, want streamed response", sink.text)
	}
	if len(sink.diagnostics) != 0 {
		t.Fatalf("diagnostics = %+v, want none", sink.diagnostics)
	}
}

func TestCodexHarnessHandlesEmptyAgentMessageItemText(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("empty-agent-message-item-text"))
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	item, ok := findRunItemType(sink.items, RunItemTypeAgentMessage)
	if !ok {
		t.Fatalf("items = %+v, want agent message item", sink.items)
	}
	if item.Summary != "" {
		t.Fatalf("agent message summary = %q, want empty text accepted", item.Summary)
	}
	if sink.text != "hello from codex" {
		t.Fatalf("assistant text = %q, want streamed response", sink.text)
	}
	if len(sink.diagnostics) != 0 {
		t.Fatalf("diagnostics = %+v, want none", sink.diagnostics)
	}
}

func TestCodexHarnessHandlesAccountRateLimitsAsGlobalNotification(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("account-rate-limits"))
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "hello from codex" {
		t.Fatalf("assistant text = %q, want streamed response", sink.text)
	}
	if len(sink.diagnostics) != 0 {
		t.Fatalf("diagnostics = %+v, want none", sink.diagnostics)
	}
}

func TestCodexHarnessHandlesThreadGoalClearedAsLifecycleNotification(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("thread-goal-cleared"))
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "hello from codex" {
		t.Fatalf("assistant text = %q, want streamed response", sink.text)
	}
	if len(sink.diagnostics) != 0 {
		t.Fatalf("diagnostics = %+v, want none", sink.diagnostics)
	}
}

func TestCodexHarnessHandlesThreadStartedAsLifecycleNotification(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("thread-started-notification"))
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "hello from codex" {
		t.Fatalf("assistant text = %q, want streamed response", sink.text)
	}
	if len(sink.diagnostics) != 0 {
		t.Fatalf("diagnostics = %+v, want none", sink.diagnostics)
	}
}

func TestCodexHarnessHandlesThreadStatusChangedAsLifecycleNotification(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("thread-status-changed-notification"))
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "hello from codex" {
		t.Fatalf("assistant text = %q, want streamed response", sink.text)
	}
	if len(sink.diagnostics) != 0 {
		t.Fatalf("diagnostics = %+v, want none", sink.diagnostics)
	}
}

func TestCodexHarnessHandlesThreadTokenUsageAsTelemetryNotification(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("thread-token-usage-notification"))
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "hello from codex" {
		t.Fatalf("assistant text = %q, want streamed response", sink.text)
	}
	if len(sink.diagnostics) != 0 {
		t.Fatalf("diagnostics = %+v, want none", sink.diagnostics)
	}
}

func TestCodexHarnessHandlesTurnProtocolCoverageNotifications(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("protocol-coverage-notifications"))
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
	notice := requireRunItemType(t, sink.items, RunItemTypeNotice)
	if notice.NoticeKind != "deprecationNotice" {
		t.Fatalf("notice kind = %q, want deprecationNotice", notice.NoticeKind)
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
	for _, diagnostic := range sink.diagnostics {
		if diagnostic.severity == DiagnosticSeverityCritical {
			t.Fatalf("diagnostics = %+v, want no critical diagnostics for known coverage notifications", sink.diagnostics)
		}
	}
}

func TestCodexHookRunItemMapsSupportedStatuses(t *testing.T) {
	tests := []struct {
		provider string
		want     RunItemStatus
	}{
		{provider: "blocked", want: RunItemStatusFailed},
		{provider: "completed", want: RunItemStatusCompleted},
		{provider: "failed", want: RunItemStatusFailed},
		{provider: "running", want: RunItemStatusRunning},
		{provider: "stopped", want: RunItemStatusCancelled},
	}

	for _, test := range tests {
		t.Run(test.provider, func(t *testing.T) {
			item, err := codexHookRunItem(codexHookRunFixture(test.provider))
			if err != nil {
				t.Fatalf("hook run item: %v", err)
			}
			if item.Status != test.want {
				t.Fatalf("status = %s, want %s", item.Status, test.want)
			}
		})
	}
}

func TestCodexHookRunItemRejectsUnsupportedStatus(t *testing.T) {
	_, err := codexHookRunItem(codexHookRunFixture("paused"))
	if err == nil {
		t.Fatal("hook run item succeeded, want provider drift error")
	}
	if !strings.Contains(err.Error(), "unsupported codex hook status: paused") {
		t.Fatalf("error = %q, want unsupported hook status", err)
	}
}

func codexHookRunFixture(status string) map[string]any {
	return map[string]any{
		"durationMs":    float64(12),
		"entries":       []any{},
		"eventName":     "preToolUse",
		"executionMode": "auto",
		"id":            "hook_fake",
		"scope":         "workspace",
		"source":        "project",
		"sourcePath":    "/tmp/workspace/.codex/hooks.json",
		"status":        status,
		"statusMessage": nil,
	}
}

func TestCodexHarnessIgnoresProviderUserMessageItem(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("provider-user-message-item"))
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "hello from codex" {
		t.Fatalf("assistant text = %q, want streamed response", sink.text)
	}
	if len(sink.items) != 0 {
		t.Fatalf("items = %+v, want no user message run item", sink.items)
	}
}

func TestCodexHarnessContinuesAfterRetryableErrorNotification(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("retryable-error-notification"))
	sink := newRecordingSink()

	completion, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err != nil {
		t.Fatalf("start turn: %v", err)
	}
	requireTurnOutcome(t, completion, TurnOutcomeCompleted)
	if sink.text != "hello from codex" {
		t.Fatalf("assistant text = %q, want streamed response", sink.text)
	}
}

func TestCodexHarnessFailsTerminalErrorNotification(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("terminal-error-notification"))
	sink := newRecordingSink()

	_, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err == nil {
		t.Fatal("start turn succeeded, want terminal error notification")
	}
	if !strings.Contains(err.Error(), "codex app-server error notification: model unavailable") {
		t.Fatalf("error = %q, want terminal error notification", err)
	}
}

func TestCodexHarnessFailsMalformedRemoteControlStatus(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("malformed-remote-control-status"))
	sink := newRecordingSink()

	_, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err == nil {
		t.Fatal("start turn succeeded, want malformed remote control status error")
	}
	if !strings.Contains(err.Error(), "codex remote control status.status must be a string") {
		t.Fatalf("error = %q, want malformed remote control status", err)
	}
}

func TestCodexHarnessRejectsUnknownMCPServerStartupStatus(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("unknown-mcp-server-startup-status"))
	sink := newRecordingSink()

	_, err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err == nil {
		t.Fatal("start turn succeeded, want unknown mcp server startup status error")
	}
	if !strings.Contains(err.Error(), "unsupported codex mcp server startup status: waking") {
		t.Fatalf("error = %q, want unknown mcp server startup status", err)
	}
}

func TestCodexHarnessFakeAppServer(t *testing.T) {
	if os.Getenv("SETTA_FAKE_CODEX_APP_SERVER") == "" {
		return
	}
	fakeCodexAppServer(os.Getenv("SETTA_FAKE_CODEX_APP_SERVER"))
	os.Exit(0)
}

type fakeAttestationProvider struct {
	token string
}

func (provider fakeAttestationProvider) GenerateAttestation(context.Context) (string, error) {
	return provider.token, nil
}

func newRecordingSink() *recordingSink {
	return &recordingSink{
		approvalCh: make(chan ApprovalRequest, 1),
		linkCh:     make(chan struct{}, 4),
	}
}

func rawJSONPtr(value string) *json.RawMessage {
	raw := json.RawMessage(value)
	return &raw
}

func startCodexTurnAsync(t *testing.T, harness *CodexHarness, sink *recordingSink) <-chan codexTurnResult {
	t.Helper()
	request := testTurnRequest(t)
	done := make(chan codexTurnResult, 1)
	go func() {
		completion, err := harness.StartTurn(context.Background(), request, sink)
		done <- codexTurnResult{completion: completion, err: err}
	}()
	return done
}

func requireAsyncTurnOutcome(t *testing.T, done <-chan codexTurnResult, outcome TurnOutcome) {
	t.Helper()
	select {
	case result := <-done:
		if result.err != nil {
			t.Fatalf("start turn: %v", result.err)
		}
		requireTurnOutcome(t, result.completion, outcome)
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for turn outcome %s", outcome)
	}
}

func requireTurnOutcome(t *testing.T, completion TurnCompletion, outcome TurnOutcome) {
	t.Helper()
	if completion.Outcome != outcome {
		t.Fatalf("turn outcome = %s, want %s", completion.Outcome, outcome)
	}
}

func callJSONRPCAsync(client *codexapp.Client, method string) <-chan error {
	done := make(chan error, 1)
	go func() {
		_, err := client.Call(context.Background(), method, map[string]any{})
		done <- err
	}()
	return done
}

func waitForJSONRPCError(t *testing.T, done <-chan error) error {
	t.Helper()
	select {
	case err := <-done:
		if err == nil {
			t.Fatal("json rpc call succeeded, want error")
		}
		return err
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for json rpc error")
		return nil
	}
}

func waitForNotification(t *testing.T, client *codexapp.Client, method string) {
	t.Helper()
	select {
	case message := <-client.Notifications():
		if message.Method != method {
			t.Fatalf("notification method = %q, want %q", message.Method, method)
		}
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for notification %s", method)
	}
}

func waitForApproval(t *testing.T, sink *recordingSink) ApprovalRequest {
	t.Helper()
	select {
	case approval := <-sink.approvalCh:
		return approval
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for approval")
		return ApprovalRequest{}
	}
}

func waitForThreadLink(t *testing.T, sink *recordingSink) {
	t.Helper()
	select {
	case <-sink.linkCh:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for thread link")
	}
}

func testTurnRequest(t *testing.T) TurnRequest {
	t.Helper()
	rootPath := t.TempDir()
	return TurnRequest{
		Workspace: workspace.WorkspaceSummary{
			ID:           "workspace_api",
			RootPath:     rootPath,
			DisplayName:  "api",
			LastOpenedAt: "2026-05-29T20:00:00Z",
		},
		Conversation: Conversation{
			ID:          "conversation_api",
			WorkspaceID: "workspace_api",
		},
		Run: Run{
			ID:             "run_fake",
			WorkspaceID:    "workspace_api",
			ConversationID: "conversation_api",
		},
		Prompt: "hello",
	}
}

func testCodexConfig(mode string) CodexHarnessConfig {
	return CodexHarnessConfig{
		Args:    []string{"-test.run=TestCodexHarnessFakeAppServer", "--"},
		Command: os.Args[0],
		Env:     []string{"SETTA_FAKE_CODEX_APP_SERVER=" + mode},
	}
}

func fakeCodexAppServer(mode string) {
	scanner := bufio.NewScanner(os.Stdin)
	state := fakeCodexState{}
	for scanner.Scan() {
		var message map[string]any
		if err := json.Unmarshal(scanner.Bytes(), &message); err != nil {
			panic(err)
		}
		if handleFakeJSONRPCMode(mode, &state, message) {
			return
		}
		if handleFakeServerResponse(mode, &state, message) {
			return
		}
		if handleFakeApprovalResponse(mode, state, message) {
			return
		}
		done := handleFakeCodexMethod(mode, &state, message)
		if done {
			return
		}
	}
}

type fakeCodexState struct {
	approvalOutstanding  bool
	commandThreadResumed bool
	commandThreadStarted bool
	goalCleared          bool
	goalPaused           bool
	holdCalls            int
	modelListCalls       int
	responseOutstanding  string
	currentThreadID      string
}

func handleFakeJSONRPCMode(mode string, state *fakeCodexState, message map[string]any) bool {
	switch mode {
	case "jsonrpc-pending-exit":
		if message["method"] == "hold" {
			return true
		}
	case "jsonrpc-exit-after-two-calls":
		if message["method"] == "hold" {
			state.holdCalls++
			if state.holdCalls == 2 {
				return true
			}
		}
	case "jsonrpc-hold":
		if message["method"] == "hold" {
			writeFakeNotification("hold/received", map[string]any{})
			time.Sleep(2 * time.Second)
			return true
		}
	case "jsonrpc-malformed-response-id":
		if message["method"] == "badID" {
			writeFake(map[string]any{"id": "not-an-int", "result": map[string]any{}})
			return true
		}
	}
	return false
}

func handleFakeApprovalResponse(mode string, state fakeCodexState, message map[string]any) bool {
	if !state.approvalOutstanding || message["method"] != nil {
		return false
	}
	delta := "approved"
	if mode == "permission" {
		assertFakePermissionApproval(message)
		delta = "permission approved"
	}
	if mode == "user-input" {
		assertFakeUserInputApproval(message)
		delta = "answers received"
	}
	if mode == "mcp-elicitation-form" {
		assertFakeMCPElicitationResponse(message, "accept", map[string]any{"confirm": true, "target": "staging"})
		delta = "mcp form accepted"
	}
	if mode == "mcp-elicitation-form-cancel" {
		assertFakeMCPElicitationResponse(message, "cancel", nil)
		delta = "mcp form cancelled"
	}
	if mode == "mcp-elicitation-url-decline" {
		assertFakeMCPElicitationResponse(message, "decline", nil)
		delta = "mcp url declined"
	}
	writeFakeAssistantDelta(delta)
	writeFakeCompletedTurn("completed")
	return true
}

func handleFakeServerResponse(mode string, state *fakeCodexState, message map[string]any) bool {
	if state.responseOutstanding == "" || message["method"] != nil {
		return false
	}
	switch state.responseOutstanding {
	case "dynamic-tool-unknown":
		assertFakeErrorResponse(message, codexJSONRPCErrorToolUnavailable, "unsupported dynamic tool")
		writeFakeCompletedTurn("completed")
		return true
	case "dynamic-tool-registered":
		assertFakeDynamicToolResponse(message)
		writeFakeAssistantDelta("dynamic tool completed")
		writeFakeCompletedTurn("completed")
		return true
	case "attestation-unavailable":
		assertFakeErrorResponse(message, codexJSONRPCErrorCapabilityUnavailable, "attestation is unavailable")
		writeFakeCompletedTurn("completed")
		return true
	case "attestation-provider":
		assertFakeAttestationResponse(message)
		writeFakeCompletedTurn("completed")
		return true
	default:
		panic("unsupported fake response expectation " + state.responseOutstanding)
	}
}

func handleFakeCodexMethod(mode string, state *fakeCodexState, message map[string]any) bool {
	switch message["method"] {
	case "initialize":
		writeFakeInitializeResponse(message["id"])
	case "config/read":
		assertFakeConfigRead(message)
		writeFakeResponse(message["id"], map[string]any{
			"config": map[string]any{
				"model":                  "gpt-test",
				"model_reasoning_effort": "xhigh",
			},
			"layers":  []any{},
			"origins": map[string]any{},
		})
		return false
	case "thread/start", "thread/resume":
		handleFakeCommandThread(mode, state, message)
		assertFakeDynamicToolsThreadParams(mode, message)
		threadID := state.currentThreadID
		if threadID == "" {
			threadID = "thread_fake"
		}
		writeFakeThreadResponseForModeAndThread(message["id"], mode, fakeThreadResponseModel(mode), fakeThreadResponseEffort(mode), threadID)
	case "thread/read":
		params := fakeParams(message)
		threadID, _ := params["threadId"].(string)
		if threadID == "" {
			panic("thread/read missing threadId")
		}
		writeFakeResponse(message["id"], fakeCodexThreadReadResponse(mode, threadID))
	case "thread/goal/get":
		return handleFakeGoalGet(mode, message)
	case "thread/goal/set":
		return handleFakeGoalSetMethod(mode, state, message)
	case "thread/goal/clear":
		if mode == "goal-operation-resume" {
			panic("goal resume should not clear provider goal")
		}
		assertFakeThreadID(message)
		state.goalCleared = true
		if fakeGoalOperationMode(mode) {
			writeFakeThreadGoalCleared()
		}
		writeFakeResponse(message["id"], map[string]any{"cleared": true})
		return fakeCommandDone(mode)
	case "model/list":
		return handleFakeModelList(mode, state, message)
	case "thread/settings/update":
		return handleFakeThreadSettingsUpdate(mode, message)
	case "turn/start":
		return handleFakeTurnStart(mode, state, message)
	case "turn/interrupt":
		if mode == "goal-operation-cancel" && !state.goalPaused {
			writeFakeErrorResponse(message["id"], -32600, "goal pause is required before interrupt")
			return true
		}
		writeFakeResponse(message["id"], map[string]any{})
		writeFakeCompletedTurn("interrupted")
		return true
	case "turn/steer":
		assertFakeSteer(message)
		writeFakeResponse(message["id"], map[string]any{})
		writeFakeAssistantDelta("steered")
		writeFakeCompletedTurn("completed")
		return true
	}
	return false
}

func handleFakeTurnStart(mode string, state *fakeCodexState, message map[string]any) bool {
	if mode == "initial-settings" {
		assertFakeInitialTurnSettings(message)
	}
	if mode == "structured-task" {
		assertFakeStructuredTaskTurnStart(message)
	}
	writeFakeResponse(message["id"], map[string]any{
		"turn": fakeCodexTurn("inProgress"),
	})
	if handled, done := handleFakeAppServerStatusMode(mode); handled {
		return done
	}
	if handleFakeMismatchMode(mode) {
		return true
	}
	if handled, done := handleFakeCoreTurnStartMode(mode, state); handled {
		return done
	}
	if handled, done := handleFakeNotificationTurnStartMode(mode); handled {
		return done
	}
	if fakeGoalOperationMode(mode) {
		threadID := state.currentThreadID
		if threadID == "" {
			threadID = "thread_fake"
		}
		writeFakeStreamTurnForThread(threadID)
		return true
	}
	return false
}

func handleFakeNotificationTurnStartMode(mode string) (bool, bool) {
	switch mode {
	case "unsupported-notification":
		writeFakeNotification("turn/unknownStateChanged", map[string]any{
			"data":     map[string]any{"value": "unknown"},
			"threadId": "thread_fake",
			"turnId":   "turn_fake",
		})
		return true, true
	case "deprecated-thread-compacted-notification":
		writeFakeNotification("thread/compacted", map[string]any{
			"threadId": "thread_fake",
			"turnId":   "turn_fake",
		})
		return true, true
	case "deprecated-file-change-output-delta-notification":
		writeFakeNotification("item/fileChange/outputDelta", map[string]any{
			"delta":    "legacy patch output",
			"itemId":   "item_file_change_legacy",
			"threadId": "thread_fake",
			"turnId":   "turn_fake",
		})
		return true, true
	case "thread-started-notification":
		writeFakeThreadStarted()
		writeFakeStreamTurn()
		return true, true
	case "thread-status-changed-notification":
		writeFakeThreadStatusChanged("active")
		writeFakeStreamTurn()
		return true, true
	case "thread-token-usage-notification":
		writeFakeThreadTokenUsage()
		writeFakeStreamTurn()
		return true, true
	case "moderation-metadata-notification":
		writeFakeNotification("turn/moderationMetadata", map[string]any{
			"metadata": map[string]any{
				"presentation": "inline",
			},
			"threadId": "thread_fake",
			"turnId":   "turn_fake",
		})
		writeFakeStreamTurn()
		return true, true
	case "provider-user-message-item":
		writeFakeUserMessageItem()
		writeFakeStreamTurn()
		return true, true
	case "retryable-error-notification":
		writeFakeErrorNotification("temporary provider error", true)
		writeFakeStreamTurn()
		return true, true
	case "terminal-error-notification":
		writeFakeErrorNotification("model unavailable", false)
		return true, true
	case "protocol-coverage-notifications":
		writeFakeProtocolCoverageNotifications()
		return true, true
	default:
		return false, false
	}
}
