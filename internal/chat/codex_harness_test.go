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

	if err := harness.StartTurn(context.Background(), testTurnRequest(t), sink); err != nil {
		t.Fatalf("start turn: %v", err)
	}

	if sink.text != "hello from codex" {
		t.Fatalf("assistant text = %q, want streamed response", sink.text)
	}
	if sink.threadID != "thread_fake" || sink.turnID != "turn_fake" {
		t.Fatalf("linked refs = %q %q, want fake refs", sink.threadID, sink.turnID)
	}
}

func TestCodexHarnessMapsApprovalRequestAndResponse(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("approval"))
	sink := newRecordingSink()
	done := make(chan error, 1)

	go func() {
		done <- harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	}()

	approval := waitForApproval(t, sink)
	if approval.Kind != ApprovalKindCommand || approval.Command != "go test ./..." {
		t.Fatalf("approval = %+v, want command approval", approval)
	}
	if err := harness.SubmitApproval(context.Background(), ApprovalResponse{
		ApprovalID: approval.ID,
		Approved:   true,
		RunID:      "run_fake",
	}); err != nil {
		t.Fatalf("submit approval: %v", err)
	}
	if err := <-done; err != nil {
		t.Fatalf("start turn after approval: %v", err)
	}
	if sink.text != "approved" {
		t.Fatalf("assistant text = %q, want approved", sink.text)
	}
}

func TestCodexHarnessMapsPermissionApprovalResponse(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("permission"))
	sink := newRecordingSink()
	done := make(chan error, 1)

	go func() {
		done <- harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	}()

	approval := waitForApproval(t, sink)
	if approval.Kind != ApprovalKindPermission || !strings.Contains(approval.Permission, "network") {
		t.Fatalf("approval = %+v, want permission approval with details", approval)
	}
	if err := harness.SubmitApproval(context.Background(), ApprovalResponse{
		ApprovalID: approval.ID,
		Approved:   true,
		RunID:      "run_fake",
	}); err != nil {
		t.Fatalf("submit approval: %v", err)
	}
	if err := <-done; err != nil {
		t.Fatalf("start turn after approval: %v", err)
	}
	if sink.text != "permission approved" {
		t.Fatalf("assistant text = %q, want permission approved", sink.text)
	}
}

func TestCodexHarnessMapsMultiQuestionUserInput(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("user-input"))
	sink := newRecordingSink()
	done := make(chan error, 1)

	go func() {
		done <- harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	}()

	approval := waitForApproval(t, sink)
	if approval.Kind != ApprovalKindUserInput || len(approval.Questions) != 2 {
		t.Fatalf("approval = %+v, want two user input questions", approval)
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
	if err := <-done; err != nil {
		t.Fatalf("start turn after user input: %v", err)
	}
	if sink.text != "answers received" {
		t.Fatalf("assistant text = %q, want answers received", sink.text)
	}
}

func TestCodexHarnessInterruptsActiveTurn(t *testing.T) {
	harness := NewCodexHarness(testCodexConfig("cancel"))
	sink := newRecordingSink()
	done := make(chan error, 1)

	go func() {
		done <- harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	}()
	waitForThreadLink(t, sink)

	if err := harness.CancelTurn(context.Background(), CancelRequest{RunID: "run_fake"}); err != nil {
		t.Fatalf("cancel turn: %v", err)
	}
	if err := <-done; err != nil {
		t.Fatalf("start turn after interrupt: %v", err)
	}
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

	err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
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

	err := harness.StartTurn(context.Background(), testTurnRequest(t), sink)
	if err == nil {
		t.Fatal("start turn succeeded, want malformed delta error")
	}
	if !strings.Contains(err.Error(), "codex assistant delta.delta must be a string") {
		t.Fatalf("error = %q, want malformed delta", err)
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
	approvalCh chan ApprovalRequest
	linkCh     chan struct{}
	text       string
	threadID   string
	turnID     string
}

func newRecordingSink() *recordingSink {
	return &recordingSink{
		approvalCh: make(chan ApprovalRequest, 1),
		linkCh:     make(chan struct{}, 1),
	}
}

func (sink *recordingSink) AssistantTextDelta(text string) error {
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
	approvalOutstanding := false
	for scanner.Scan() {
		var message map[string]any
		if err := json.Unmarshal(scanner.Bytes(), &message); err != nil {
			panic(err)
		}
		if approvalOutstanding && message["method"] == nil {
			delta := "approved"
			if mode == "permission" {
				assertFakePermissionApproval(message)
				delta = "permission approved"
			}
			if mode == "user-input" {
				assertFakeUserInputApproval(message)
				delta = "answers received"
			}
			writeFakeNotification("item/agentMessage/delta", map[string]any{
				"delta":    delta,
				"itemId":   "item_fake",
				"threadId": "thread_fake",
				"turnId":   "turn_fake",
			})
			writeFakeNotification("turn/completed", map[string]any{
				"threadId": "thread_fake",
				"turn":     map[string]any{"id": "turn_fake", "items": []any{}, "status": "completed"},
			})
			return
		}
		switch message["method"] {
		case "initialize":
			writeFakeResponse(message["id"], map[string]any{
				"codexHome":      "/tmp/codex",
				"platformFamily": "unix",
				"platformOs":     "test",
				"userAgent":      "fake",
			})
		case "thread/start", "thread/resume":
			writeFakeResponse(message["id"], map[string]any{
				"thread": map[string]any{"id": "thread_fake"},
			})
		case "turn/start":
			writeFakeResponse(message["id"], map[string]any{
				"turn": map[string]any{"id": "turn_fake", "items": []any{}, "status": "inProgress"},
			})
			switch mode {
			case "stream":
				writeFakeNotification("item/agentMessage/delta", map[string]any{
					"delta":    "hello ",
					"itemId":   "item_fake",
					"threadId": "thread_fake",
					"turnId":   "turn_fake",
				})
				writeFakeNotification("item/agentMessage/delta", map[string]any{
					"delta":    "from codex",
					"itemId":   "item_fake",
					"threadId": "thread_fake",
					"turnId":   "turn_fake",
				})
				writeFakeNotification("turn/completed", map[string]any{
					"threadId": "thread_fake",
					"turn":     map[string]any{"id": "turn_fake", "items": []any{}, "status": "completed"},
				})
				return
			case "approval":
				approvalOutstanding = true
				writeFakeServerRequest("approval-1", "item/commandExecution/requestApproval", map[string]any{
					"command":     "go test ./...",
					"itemId":      "item_fake",
					"startedAtMs": 0,
					"threadId":    "thread_fake",
					"turnId":      "turn_fake",
				})
			case "permission":
				approvalOutstanding = true
				writeFakeServerRequest("approval-1", "item/permissions/requestApproval", map[string]any{
					"cwd":         "/tmp/workspace",
					"itemId":      "item_fake",
					"permissions": map[string]any{"network": map[string]any{"enabled": true}},
					"reason":      "Need network access",
					"startedAtMs": 0,
					"threadId":    "thread_fake",
					"turnId":      "turn_fake",
				})
			case "user-input":
				approvalOutstanding = true
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
			case "malformed-approval":
				writeFakeServerRequest("approval-1", "item/commandExecution/requestApproval", map[string]any{
					"itemId":   "item_fake",
					"threadId": "thread_fake",
					"turnId":   "turn_fake",
				})
				time.Sleep(2 * time.Second)
				return
			case "malformed-delta":
				writeFakeNotification("item/agentMessage/delta", map[string]any{
					"delta":    12,
					"itemId":   "item_fake",
					"threadId": "thread_fake",
					"turnId":   "turn_fake",
				})
				time.Sleep(2 * time.Second)
				return
			}
		case "turn/interrupt":
			writeFakeResponse(message["id"], map[string]any{})
			writeFakeNotification("turn/completed", map[string]any{
				"threadId": "thread_fake",
				"turn":     map[string]any{"id": "turn_fake", "items": []any{}, "status": "interrupted"},
			})
			return
		}
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
