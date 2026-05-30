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

func TestCodexRunItemStatusMappingCoversCurrentProtocolValues(t *testing.T) {
	tests := map[string]string{
		"completed":   RunItemStatusCompleted,
		"declined":    RunItemStatusCancelled,
		"failed":      RunItemStatusFailed,
		"inProgress":  RunItemStatusRunning,
		"interrupted": RunItemStatusCancelled,
		"succeeded":   RunItemStatusCompleted,
	}
	for status, want := range tests {
		got, err := mapCodexItemStatus(status)
		if err != nil {
			t.Fatalf("map status %s: %v", status, err)
		}
		if got != want {
			t.Fatalf("map status %s = %s, want %s", status, got, want)
		}
	}
}

func TestCodexRunItemStatusMappingRejectsUnknownValues(t *testing.T) {
	_, err := mapCodexItemStatus("running")
	if err == nil {
		t.Fatal("map status succeeded, want unsupported status error")
	}
	if !strings.Contains(err.Error(), "unsupported codex item status: running") {
		t.Fatalf("error = %q, want unsupported status", err)
	}
}

func TestJSONRPCPendingCallFailsOnProcessExit(t *testing.T) {
	client, err := startJSONRPCClient(testCodexConfig("jsonrpc-pending-exit"))
	if err != nil {
		t.Fatalf("start json rpc client: %v", err)
	}
	defer client.close()

	_, err = client.call(context.Background(), "hold", map[string]any{})
	if err == nil {
		t.Fatal("call succeeded, want app-server exit error")
	}
	if !strings.Contains(err.Error(), "hold failed: codex app-server exited") {
		t.Fatalf("error = %q, want call exit error", err)
	}
}

func TestJSONRPCConcurrentPendingCallsObserveProcessExit(t *testing.T) {
	client, err := startJSONRPCClient(testCodexConfig("jsonrpc-exit-after-two-calls"))
	if err != nil {
		t.Fatalf("start json rpc client: %v", err)
	}
	defer client.close()

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
	client, err := startJSONRPCClient(testCodexConfig("jsonrpc-hold"))
	if err != nil {
		t.Fatalf("start json rpc client: %v", err)
	}
	done := callJSONRPCAsync(client, "hold")
	waitForNotification(t, client, "hold/received")

	client.close()

	err = waitForJSONRPCError(t, done)
	if !strings.Contains(err.Error(), "codex app-server client closed") {
		t.Fatalf("error = %q, want client closed", err)
	}
}

func TestJSONRPCMalformedResponseIDFailsPendingCall(t *testing.T) {
	client, err := startJSONRPCClient(testCodexConfig("jsonrpc-malformed-response-id"))
	if err != nil {
		t.Fatalf("start json rpc client: %v", err)
	}
	defer client.close()

	_, err = client.call(context.Background(), "badID", map[string]any{})
	if err == nil {
		t.Fatal("call succeeded, want malformed response id error")
	}
	if !strings.Contains(err.Error(), "codex response id must be an integer") {
		t.Fatalf("error = %q, want malformed response id", err)
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
	if len(sink.outputs) != 1 || sink.outputs[0].text != "ok\n" {
		t.Fatalf("outputs = %+v, want command output", sink.outputs)
	}
	if !containsRunItemType(sink.items, RunItemTypeNotice) {
		t.Fatalf("items = %+v, want notice", sink.items)
	}
	if !containsRunItemType(sink.items, RunItemTypeReasoning) {
		t.Fatalf("items = %+v, want reasoning summary", sink.items)
	}
}

func containsRunItemType(items []RunItem, itemType string) bool {
	_, ok := findRunItemType(items, itemType)
	return ok
}

func findRunItemType(items []RunItem, itemType string) (RunItem, bool) {
	for _, item := range items {
		if item.Type == itemType {
			return item, true
		}
	}
	return RunItem{}, false
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
	if !strings.Contains(err.Error(), "codex assistant delta.delta must be a string") {
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

type recordingSink struct {
	approvalCh  chan ApprovalRequest
	diagnostics []recordedProviderDiagnostic
	items       []RunItem
	linkCh      chan struct{}
	outputs     []recordedOutput
	text        string
	threadID    string
	turnID      string
}

type codexTurnResult struct {
	completion TurnCompletion
	err        error
}

type recordedOutput struct {
	itemID string
	stream string
	text   string
}

type recordedProviderDiagnostic struct {
	code           string
	context        map[string]string
	message        string
	resyncRequired bool
}

func newRecordingSink() *recordingSink {
	return &recordingSink{
		approvalCh: make(chan ApprovalRequest, 1),
		linkCh:     make(chan struct{}, 1),
	}
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

func callJSONRPCAsync(client *jsonRPCClient, method string) <-chan error {
	done := make(chan error, 1)
	go func() {
		_, err := client.call(context.Background(), method, map[string]any{})
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

func waitForNotification(t *testing.T, client *jsonRPCClient, method string) {
	t.Helper()
	select {
	case message := <-client.notifications:
		if message.Method != method {
			t.Fatalf("notification method = %q, want %q", message.Method, method)
		}
	case <-time.After(2 * time.Second):
		t.Fatalf("timed out waiting for notification %s", method)
	}
}

func (sink *recordingSink) AssistantTextDelta(_ string, text string) error {
	sink.text += text
	return nil
}

func (sink *recordingSink) ApprovalRequested(approval ApprovalRequest) error {
	sink.approvalCh <- approval
	return nil
}

func (sink *recordingSink) ApprovalResolved(string, bool, string) error {
	return nil
}

func (sink *recordingSink) ProviderDiagnostic(code string, message string, context map[string]string, resyncRequired bool) error {
	sink.diagnostics = append(sink.diagnostics, recordedProviderDiagnostic{
		code:           code,
		context:        context,
		message:        message,
		resyncRequired: resyncRequired,
	})
	return nil
}

func (sink *recordingSink) RunItemOutputDelta(itemID string, stream string, text string) error {
	sink.outputs = append(sink.outputs, recordedOutput{itemID: itemID, stream: stream, text: text})
	return nil
}

func (sink *recordingSink) RunItemUpsert(item RunItem) error {
	sink.items = append(sink.items, item)
	return nil
}

func (sink *recordingSink) ThreadLinked(threadID string, _ string, turnID string) error {
	sink.threadID = threadID
	sink.turnID = turnID
	sink.linkCh <- struct{}{}
	return nil
}

func (sink *recordingSink) Trace(string, string) error {
	return nil
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
	approvalOutstanding bool
	holdCalls           int
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
	writeFakeAssistantDelta(delta)
	writeFakeCompletedTurn("completed")
	return true
}

func handleFakeCodexMethod(mode string, state *fakeCodexState, message map[string]any) bool {
	switch message["method"] {
	case "initialize":
		writeFakeInitializeResponse(message["id"])
	case "thread/start", "thread/resume":
		writeFakeThreadResponse(message["id"])
	case "turn/start":
		return handleFakeTurnStart(mode, state, message)
	case "turn/interrupt":
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
	writeFakeResponse(message["id"], map[string]any{
		"turn": map[string]any{"id": "turn_fake", "items": []any{}, "status": "inProgress"},
	})
	if handled, done := handleFakeAppServerStatusMode(mode); handled {
		return done
	}
	switch mode {
	case "stream":
		writeFakeStreamTurn()
		return true
	case "failed-turn":
		writeFakeFailedTurn()
		return true
	case "unknown-turn-status":
		writeFakeCompletedTurn("paused")
		return true
	case "steer":
		return false
	case "activity":
		writeFakeActivityTurn()
		return true
	case "approval", "permission", "user-input":
		state.approvalOutstanding = true
		writeFakeApprovalRequest(mode)
	case "malformed-approval":
		writeFakeMalformedApproval()
		return true
	case "malformed-delta":
		writeFakeMalformedDelta()
		return true
	case "unsupported-request":
		writeFakeUnsupportedRequest()
		return true
	case "unsupported-notification":
		writeFakeNotification("turn/unknownStateChanged", map[string]any{
			"data":     map[string]any{"value": "unknown"},
			"threadId": "thread_fake",
			"turnId":   "turn_fake",
		})
		return true
	case "thread-started-notification":
		writeFakeThreadStarted()
		writeFakeStreamTurn()
		return true
	case "thread-status-changed-notification":
		writeFakeThreadStatusChanged("active")
		writeFakeStreamTurn()
		return true
	case "thread-token-usage-notification":
		writeFakeThreadTokenUsage()
		writeFakeStreamTurn()
		return true
	case "provider-user-message-item":
		writeFakeUserMessageItem()
		writeFakeStreamTurn()
		return true
	case "retryable-error-notification":
		writeFakeErrorNotification("temporary provider error", true)
		writeFakeStreamTurn()
		return true
	case "terminal-error-notification":
		writeFakeErrorNotification("model unavailable", false)
		return true
	}
	return false
}

func handleFakeAppServerStatusMode(mode string) (bool, bool) {
	switch mode {
	case "remote-control-status":
		writeFakeRemoteControlStatus("disabled")
		writeFakeStreamTurn()
		return true, true
	case "malformed-remote-control-status":
		writeFakeNotification("remoteControl/status/changed", map[string]any{
			"environmentId":  nil,
			"installationId": "installation_fake",
			"serverName":     "fake.local",
			"status":         7,
		})
		return true, true
	case "mcp-server-startup-status":
		writeFakeMCPServerStartupStatus("codex_apps", "starting", nil)
		writeFakeStreamTurn()
		return true, true
	case "unknown-mcp-server-startup-status":
		writeFakeMCPServerStartupStatus("codex_apps", "waking", nil)
		return true, true
	case "reasoning-summary-array":
		writeFakeReasoningSummaryArrayItem()
		writeFakeStreamTurn()
		return true, true
	case "empty-agent-message-item-text":
		writeFakeEmptyAgentMessageItem()
		writeFakeStreamTurn()
		return true, true
	case "account-rate-limits":
		writeFakeAccountRateLimits()
		writeFakeStreamTurn()
		return true, true
	case "thread-goal-cleared":
		writeFakeThreadGoalCleared()
		writeFakeStreamTurn()
		return true, true
	default:
		return false, false
	}
}

func writeFakeInitializeResponse(id any) {
	writeFakeResponse(id, map[string]any{
		"codexHome":      "/tmp/codex",
		"platformFamily": "unix",
		"platformOs":     "test",
		"userAgent":      "fake",
	})
}

func writeFakeThreadResponse(id any) {
	writeFakeResponse(id, map[string]any{
		"thread": map[string]any{"id": "thread_fake"},
	})
}

func writeFakeStreamTurn() {
	writeFakeAssistantDelta("hello ")
	writeFakeAssistantDelta("from codex")
	writeFakeCompletedTurn("completed")
}

func writeFakeRemoteControlStatus(status string) {
	writeFakeNotification("remoteControl/status/changed", map[string]any{
		"environmentId":  nil,
		"installationId": "installation_fake",
		"serverName":     "fake.local",
		"status":         status,
	})
}

func writeFakeMCPServerStartupStatus(name string, status string, errorMessage any) {
	writeFakeNotification("mcpServer/startupStatus/updated", map[string]any{
		"error":  errorMessage,
		"name":   name,
		"status": status,
	})
}

func writeFakeReasoningSummaryArrayItem() {
	writeFakeNotification("item/completed", map[string]any{
		"item": map[string]any{
			"content": []string{},
			"id":      "reasoning_summary_array_fake",
			"summary": []string{"checked context", "answered directly"},
			"type":    "reasoning",
		},
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
}

func writeFakeEmptyAgentMessageItem() {
	writeFakeNotification("item/started", map[string]any{
		"item": map[string]any{
			"id":   "agent_message_empty_fake",
			"text": "",
			"type": "agentMessage",
		},
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
}

func writeFakeAccountRateLimits() {
	writeFakeNotification("account/rateLimits/updated", map[string]any{
		"rateLimits": map[string]any{
			"credits":              nil,
			"limitId":              "codex",
			"limitName":            "Codex",
			"planType":             "pro",
			"primary":              map[string]any{"resetsAt": nil, "usedPercent": 1, "windowDurationMins": 300},
			"rateLimitReachedType": nil,
			"secondary":            nil,
		},
	})
}

func writeFakeThreadGoalCleared() {
	writeFakeNotification("thread/goal/cleared", map[string]any{
		"threadId": "thread_fake",
	})
}

func writeFakeThreadStarted() {
	writeFakeNotification("thread/started", map[string]any{
		"thread": map[string]any{
			"id": "thread_fake",
		},
	})
}

func writeFakeThreadStatusChanged(statusType string) {
	status := map[string]any{
		"type": statusType,
	}
	if statusType == "active" {
		status["activeFlags"] = []string{}
	}
	writeFakeNotification("thread/status/changed", map[string]any{
		"status":   status,
		"threadId": "thread_fake",
	})
}

func writeFakeThreadTokenUsage() {
	breakdown := map[string]any{
		"cachedInputTokens":     0,
		"inputTokens":           1,
		"outputTokens":          2,
		"reasoningOutputTokens": 0,
		"totalTokens":           3,
	}
	writeFakeNotification("thread/tokenUsage/updated", map[string]any{
		"threadId": "thread_fake",
		"tokenUsage": map[string]any{
			"last":               breakdown,
			"modelContextWindow": nil,
			"total":              breakdown,
		},
		"turnId": "turn_fake",
	})
}

func writeFakeUserMessageItem() {
	writeFakeNotification("item/started", map[string]any{
		"item": map[string]any{
			"content": []any{map[string]any{
				"text": "hello",
				"type": "text",
			}},
			"id":   "user_message_fake",
			"type": "userMessage",
		},
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
}

func writeFakeErrorNotification(message string, willRetry bool) {
	writeFakeNotification("error", map[string]any{
		"error": map[string]any{
			"additionalDetails": nil,
			"codexErrorInfo":    nil,
			"message":           message,
		},
		"threadId":  "thread_fake",
		"turnId":    "turn_fake",
		"willRetry": willRetry,
	})
}

func writeFakeFailedTurn() {
	writeFakeNotification("turn/completed", map[string]any{
		"threadId": "thread_fake",
		"turn": map[string]any{
			"error":  map[string]any{"message": "model failed"},
			"id":     "turn_fake",
			"items":  []any{},
			"status": "failed",
		},
	})
}

func writeFakeActivityTurn() {
	writeFakeNotification("turn/started", map[string]any{
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
	writeFakeNotification("item/reasoning/summaryPartAdded", map[string]any{
		"itemId":   "reasoning_fake",
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
	writeFakeNotification("item/reasoning/summaryTextDelta", map[string]any{
		"delta":    "checked plan",
		"itemId":   "reasoning_fake",
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
	writeFakeNotification("item/started", map[string]any{
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
		"item": map[string]any{
			"id":      "command_fake",
			"type":    "commandExecution",
			"command": "go test ./...",
			"cwd":     "/tmp/workspace",
			"status":  "inProgress",
		},
	})
	writeFakeNotification("item/commandExecution/outputDelta", map[string]any{
		"delta":    "ok\n",
		"itemId":   "command_fake",
		"stream":   "stdout",
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
	writeFakeNotification("item/fileChange/patchUpdated", map[string]any{
		"changedPaths": []string{"/tmp/workspace/main.go"},
		"itemId":       "file_fake",
		"status":       "updated",
		"threadId":     "thread_fake",
		"turnId":       "turn_fake",
	})
	writeFakeNotification("item/mcpToolCall/progress", map[string]any{
		"itemId":   "mcp_fake",
		"progress": "halfway",
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
	writeFakeNotification("warning", map[string]any{
		"message":  "watch out",
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
	writeFakeNotification("item/completed", map[string]any{
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
		"item": map[string]any{
			"durationMs": 42,
			"exitCode":   0,
			"id":         "command_fake",
			"type":       "commandExecution",
			"command":    "go test ./...",
			"cwd":        "/tmp/workspace",
			"status":     "completed",
		},
	})
	writeFakeCompletedTurn("completed")
}

func writeFakeApprovalRequest(mode string) {
	switch mode {
	case "approval":
		writeFakeCommandApprovalRequest()
	case "permission":
		writeFakePermissionApprovalRequest()
	case "user-input":
		writeFakeUserInputApprovalRequest()
	}
}

func writeFakeCommandApprovalRequest() {
	writeFakeServerRequest("approval-1", "item/commandExecution/requestApproval", map[string]any{
		"command":     "go test ./...",
		"itemId":      "item_fake",
		"startedAtMs": 0,
		"threadId":    "thread_fake",
		"turnId":      "turn_fake",
	})
}

func writeFakePermissionApprovalRequest() {
	writeFakeServerRequest("approval-1", "item/permissions/requestApproval", map[string]any{
		"cwd":         "/tmp/workspace",
		"itemId":      "item_fake",
		"permissions": map[string]any{"network": map[string]any{"enabled": true}},
		"reason":      "Need network access",
		"startedAtMs": 0,
		"threadId":    "thread_fake",
		"turnId":      "turn_fake",
	})
}

func writeFakeUserInputApprovalRequest() {
	writeFakeServerRequest("approval-1", "item/tool/requestUserInput", map[string]any{
		"itemId": "item_fake",
		"questions": []map[string]any{
			{
				"header":   "Branch",
				"id":       "branch",
				"options":  []map[string]any{{"description": "Use main", "label": "main"}},
				"question": "Which branch?",
			},
			{
				"header":   "Mode",
				"id":       "mode",
				"options":  []map[string]any{{"description": "Fast mode", "label": "fast"}},
				"question": "Which mode?",
			},
		},
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
}

func writeFakeMalformedApproval() {
	writeFakeServerRequest("approval-1", "item/commandExecution/requestApproval", map[string]any{
		"itemId":   "item_fake",
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
	time.Sleep(2 * time.Second)
}

func writeFakeMalformedDelta() {
	writeFakeNotification("item/agentMessage/delta", map[string]any{
		"delta":    12,
		"itemId":   "item_fake",
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
	time.Sleep(2 * time.Second)
}

func writeFakeUnsupportedRequest() {
	writeFakeServerRequest("request-unsupported", "item/unknown/requestApproval", map[string]any{
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
	time.Sleep(2 * time.Second)
}

func writeFakeAssistantDelta(delta string) {
	writeFakeNotification("item/agentMessage/delta", map[string]any{
		"delta":    delta,
		"itemId":   "item_fake",
		"threadId": "thread_fake",
		"turnId":   "turn_fake",
	})
}

func writeFakeCompletedTurn(status string) {
	writeFakeNotification("turn/completed", map[string]any{
		"threadId": "thread_fake",
		"turn":     map[string]any{"id": "turn_fake", "items": []any{}, "status": status},
	})
}

func assertFakeSteer(message map[string]any) {
	params, ok := message["params"].(map[string]any)
	if !ok {
		panic("steer missing params")
	}
	if params["threadId"] != "thread_fake" || params["expectedTurnId"] != "turn_fake" {
		panic("steer targeted wrong turn")
	}
	input, ok := params["input"].([]any)
	if !ok || len(input) != 1 {
		panic("steer missing input")
	}
	first, ok := input[0].(map[string]any)
	if !ok || first["text"] != "adjust course" || first["type"] != "text" {
		panic("steer input mismatch")
	}
}

func assertFakePermissionApproval(message map[string]any) {
	result, ok := message["result"].(map[string]any)
	if !ok {
		panic("permission approval missing result")
	}
	permissions, ok := result["permissions"].(map[string]any)
	if !ok {
		panic("permission approval missing permissions")
	}
	network, ok := permissions["network"].(map[string]any)
	if !ok || network["enabled"] != true {
		panic("permission approval did not echo requested network permission")
	}
}

func assertFakeUserInputApproval(message map[string]any) {
	result, ok := message["result"].(map[string]any)
	if !ok {
		panic("user input approval missing result")
	}
	answers, ok := result["answers"].(map[string]any)
	if !ok {
		panic("user input approval missing answers")
	}
	assertFakeAnswer(answers, "branch", "main")
	assertFakeAnswer(answers, "mode", "fast")
}

func assertFakeAnswer(answers map[string]any, questionID string, expected string) {
	raw, ok := answers[questionID].(map[string]any)
	if !ok {
		panic("missing answer for " + questionID)
	}
	values, ok := raw["answers"].([]any)
	if !ok || len(values) != 1 || values[0] != expected {
		panic("unexpected answer for " + questionID)
	}
}

func writeFakeResponse(id any, result any) {
	writeFake(map[string]any{"id": id, "result": result})
}

func writeFakeNotification(method string, params any) {
	writeFake(map[string]any{"method": method, "params": params})
}

func writeFakeServerRequest(id any, method string, params any) {
	writeFake(map[string]any{"id": id, "method": method, "params": params})
}

func writeFake(payload any) {
	data, err := json.Marshal(payload)
	if err != nil {
		panic(err)
	}
	_, _ = os.Stdout.Write(append(data, '\n'))
}
