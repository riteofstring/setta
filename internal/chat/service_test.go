package chat

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestServicePersistsConversationMessagesAndRunsAcrossRestart(t *testing.T) {
	appDataDir := t.TempDir()
	resolver := testResolver(t)
	harness := NewFakeHarness(nil)
	service := newTestService(t, appDataDir, resolver, harness)

	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "Explain Phase 3")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	run := waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)
	if run.Error != "" {
		t.Fatalf("completed run error = %q, want empty", run.Error)
	}

	restarted := newTestService(t, appDataDir, resolver, NewFakeHarness(nil))
	list, err := restarted.ListConversations("workspace_api")
	if err != nil {
		t.Fatalf("list conversations after restart: %v", err)
	}
	if len(list.Conversations) != 1 {
		t.Fatalf("conversation count = %d, want 1", len(list.Conversations))
	}
	if list.Conversations[0].MessageCount != 2 {
		t.Fatalf("message count = %d, want 2", list.Conversations[0].MessageCount)
	}

	latest, err := restarted.LoadMessagePage("workspace_api", conversation.ID, 0, 1)
	if err != nil {
		t.Fatalf("load latest page: %v", err)
	}
	if len(latest.Messages) != 1 || latest.Messages[0].Role != RoleAssistant {
		t.Fatalf("latest messages = %+v, want assistant only", latest.Messages)
	}
	if !strings.Contains(latest.Messages[0].Parts[0].Text, "Explain Phase 3") {
		t.Fatalf("assistant text = %q, want streamed fake response", latest.Messages[0].Parts[0].Text)
	}
	if latest.HasMoreOlder {
		t.Fatal("latest page hasMoreOlder = true, want false because transcript includes the complete turn")
	}
	if got, want := transcriptMessageTexts(latest.Transcript), []string{"Explain Phase 3", latest.Messages[0].Parts[0].Text}; !equalStrings(got, want) {
		t.Fatalf("latest transcript = %+v, want complete turn %+v", got, want)
	}
}

func TestServiceRoutesMasterChatThroughSharedHarnessTask(t *testing.T) {
	harness := NewFakeHarness(nil)
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "shared task")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)

	tasks := harness.TaskRequests()
	if len(tasks) != 1 {
		t.Fatalf("harness tasks = %+v, want one task", tasks)
	}
	if tasks[0].Surface != HarnessSurfaceMasterChat ||
		tasks[0].TurnMode != HarnessTurnInteractiveConversation ||
		tasks[0].OutputContract.Kind != HarnessOutputFreeTextEvents {
		t.Fatalf("master chat harness task = %+v, want interactive free-text master chat", tasks[0])
	}
}

func TestServiceRoutesWorkflowAgentThroughSharedHarnessTask(t *testing.T) {
	harness := NewFakeHarness(nil)
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	result, err := service.SendWorkflowAgentTurn("workspace_api", WorkflowAgentTurnRequest{
		DefinitionID:        "definition_shared_task",
		DefinitionVersionID: "version_shared_task",
		ExecutionID:         "execution_shared_task",
		NodeID:              "node_shared_task",
		NodeExecutionID:     "node_execution_shared_task",
		Prompt:              "workflow shared task",
	})
	if err != nil {
		t.Fatalf("send workflow agent turn: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", result.Conversation.ID, result.Run.ID, RunStatusCompleted)

	tasks := harness.TaskRequests()
	if len(tasks) != 1 {
		t.Fatalf("harness tasks = %+v, want one task", tasks)
	}
	if tasks[0].Surface != HarnessSurfaceWorkflowAgent ||
		tasks[0].TurnMode != HarnessTurnInteractiveConversation ||
		tasks[0].OutputContract.Kind != HarnessOutputFreeTextEvents {
		t.Fatalf("workflow harness task = %+v, want interactive free-text workflow agent", tasks[0])
	}
}

func TestServicePinsConversationAtTop(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness(nil))
	first, err := service.CreateConversation("workspace_api", "First")
	if err != nil {
		t.Fatalf("create first conversation: %v", err)
	}
	second, err := service.CreateConversation("workspace_api", "Second")
	if err != nil {
		t.Fatalf("create second conversation: %v", err)
	}

	pinned, err := service.SetConversationPinned("workspace_api", first.ID, true)
	if err != nil {
		t.Fatalf("pin conversation: %v", err)
	}
	if pinned.PinnedAt == "" {
		t.Fatal("pinnedAt is empty after pin")
	}
	list, err := service.ListConversations("workspace_api")
	if err != nil {
		t.Fatalf("list conversations: %v", err)
	}
	if got := conversationIDs(list.Conversations); !equalStrings(got, []string{first.ID, second.ID}) {
		t.Fatalf("conversation order = %+v, want pinned first", got)
	}

	unpinned, err := service.SetConversationPinned("workspace_api", first.ID, false)
	if err != nil {
		t.Fatalf("unpin conversation: %v", err)
	}
	if unpinned.PinnedAt != "" {
		t.Fatalf("pinnedAt = %q, want empty after unpin", unpinned.PinnedAt)
	}
}

func TestServiceDeletesCompletedConversation(t *testing.T) {
	appDataDir := t.TempDir()
	service := newTestService(t, appDataDir, testResolver(t), NewFakeHarness(nil))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "delete me")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)
	if _, err := service.SetConversationPinned("workspace_api", conversation.ID, true); err != nil {
		t.Fatalf("pin conversation before delete: %v", err)
	}

	list, err := service.DeleteConversation("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("delete conversation: %v", err)
	}
	if len(list.Conversations) != 0 {
		t.Fatalf("conversations = %+v, want empty after delete", list.Conversations)
	}
	if _, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 20); err == nil {
		t.Fatal("load deleted conversation succeeded")
	}
	if _, err := os.Stat(filepath.Join(appDataDir, "workspaces", "workspace_api", "conversations", conversation.ID)); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("conversation directory stat error = %v, want not exist", err)
	}
	if _, err := os.Stat(filepath.Join(appDataDir, "workspaces", "workspace_api", "runs", result.Run.ID+".json")); !errors.Is(err, os.ErrNotExist) {
		t.Fatalf("run file stat error = %v, want not exist", err)
	}
}

func TestServiceRejectsDeletingActiveConversation(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventWaitForCancel},
	}))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	if _, err := service.SendUserMessage("workspace_api", conversation.ID, "still running"); err != nil {
		t.Fatalf("send message: %v", err)
	}

	_, err = service.DeleteConversation("workspace_api", conversation.ID)
	if err == nil || !strings.Contains(err.Error(), "active run") {
		t.Fatalf("delete active conversation error = %v, want active run error", err)
	}
	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel active run: %v", err)
	}
}

func TestServiceKeepsUserMessageWhenHarnessFails(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{{Type: FakeEventError, Error: "codex app-server failed to start"}})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "Will this persist?")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}

	run := waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusFailed)
	if !strings.Contains(run.Error, "codex app-server failed") {
		t.Fatalf("run error = %q, want harness failure", run.Error)
	}
	page, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 20)
	if err != nil {
		t.Fatalf("load page: %v", err)
	}
	if len(page.Messages) != 2 {
		t.Fatalf("message count = %d, want user and assistant placeholder", len(page.Messages))
	}
	if page.Messages[0].Role != RoleUser || page.Messages[0].Parts[0].Text != "Will this persist?" {
		t.Fatalf("user message = %+v, want persisted prompt", page.Messages[0])
	}
	if page.Messages[1].Status != MessageStatusError {
		t.Fatalf("assistant status = %q, want error", page.Messages[1].Status)
	}
}

func TestServiceLoadsUnpersistedActiveAssistantDeltas(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventAssistantDelta, Text: "first"},
		{Type: FakeEventAssistantDelta, Text: "second"},
		{Type: FakeEventWaitForCancel},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "stream")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}

	page := waitForAssistantText(t, service, "workspace_api", conversation.ID, "firstsecond")
	if page.Messages[1].Parts[0].Text != "firstsecond" {
		t.Fatalf("assistant text = %q, want latest in-memory deltas", page.Messages[1].Parts[0].Text)
	}
	storedPage, err := service.store.LoadMessagePage("workspace_api", conversation.ID, 0, 20)
	if err != nil {
		t.Fatalf("load stored page: %v", err)
	}
	if storedPage.Messages[1].Parts[0].Text == page.Messages[1].Parts[0].Text {
		t.Fatal("stored page already includes all deltas; test did not observe in-memory overlay")
	}
	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel active run %s: %v", result.Run.ID, err)
	}
}

func TestServiceCancelsActiveRunThroughHarness(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventAssistantDelta, Text: "partial"},
		{Type: FakeEventWaitForCancel},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "stop")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}

	run, err := service.CancelActiveRun("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("cancel run: %v", err)
	}
	if run.ID != result.Run.ID || run.Status != RunStatusCancelled {
		t.Fatalf("cancelled run = %+v, want %s cancelled", run, result.Run.ID)
	}
	cancelled := harness.CancelledRequests()
	if len(cancelled) != 1 || cancelled[0].RunID != result.Run.ID {
		t.Fatalf("cancelled requests = %+v, want run %s", cancelled, result.Run.ID)
	}
	page, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 20)
	if err != nil {
		t.Fatalf("load page: %v", err)
	}
	if page.Messages[1].Status != MessageStatusCancelled {
		t.Fatalf("assistant status = %q, want cancelled", page.Messages[1].Status)
	}
}

func TestServicePersistsProviderCancelledTurn(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventAssistantDelta, Text: "partial"},
		{Type: FakeEventCancelled},
	}))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "provider stop")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}

	run := waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCancelled)
	if run.Error != "turn cancelled by provider" {
		t.Fatalf("run error = %q, want provider cancellation", run.Error)
	}
	page, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 20)
	if err != nil {
		t.Fatalf("load page: %v", err)
	}
	if page.Messages[1].Status != MessageStatusCancelled {
		t.Fatalf("assistant status = %q, want cancelled", page.Messages[1].Status)
	}
}

func TestServiceSurfacesAndResolvesApprovalRequests(t *testing.T) {
	approval := ApprovalRequest{
		Kind:       ApprovalKindCommand,
		Title:      "Run command",
		Body:       "Codex wants to run a command",
		Command:    "go test ./...",
		Options:    []string{},
		FilePath:   "",
		Permission: "",
		Question:   "",
	}
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventApproval, Approval: approval, WaitForApproval: true},
		{Type: FakeEventAssistantDelta, Text: "approved"},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "needs approval")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	run := waitForPendingApproval(t, service, "workspace_api", conversation.ID)
	if run.PendingApproval.Command != "go test ./..." {
		t.Fatalf("approval command = %q, want go test", run.PendingApproval.Command)
	}

	if _, err := service.SubmitApproval("workspace_api", conversation.ID, run.PendingApproval.ID, true, "", nil, false); err != nil {
		t.Fatalf("submit approval: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)
	responses := harness.ApprovalResponses()
	if len(responses) != 1 || !responses[0].Approved {
		t.Fatalf("approval responses = %+v, want approved response", responses)
	}
	page, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 20)
	if err != nil {
		t.Fatalf("load page: %v", err)
	}
	if page.Messages[1].Parts[0].Text != "approved" {
		t.Fatalf("assistant text = %q, want approved", page.Messages[1].Parts[0].Text)
	}
}

func TestServiceLinksApprovalToProviderRunItem(t *testing.T) {
	approval := ApprovalRequest{
		Kind:           ApprovalKindCommand,
		Title:          "Run command",
		Command:        "go test ./...",
		ProviderItemID: "command_fake",
		Options:        []string{},
	}
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventRunItem, ProviderItemID: "command_fake", RunItem: RunItem{
			ProviderItemID: "command_fake",
			Type:           RunItemTypeCommandExecution,
			Status:         RunItemStatusPending,
			Command:        "go test ./...",
		}},
		{Type: FakeEventApproval, Approval: approval, WaitForApproval: true},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "needs approval")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	run := waitForPendingApproval(t, service, "workspace_api", conversation.ID)
	if run.PendingApproval.ProviderItemID != "command_fake" || run.PendingApproval.RunItemID == "" {
		t.Fatalf("approval link = provider %q item %q, want command_fake and run item id", run.PendingApproval.ProviderItemID, run.PendingApproval.RunItemID)
	}
	item, exists, err := service.store.FindRunItemByProviderID("workspace_api", run.ID, "command_fake")
	if err != nil || !exists {
		t.Fatalf("find command run item: exists=%v err=%v", exists, err)
	}
	if run.PendingApproval.RunItemID != item.ID {
		t.Fatalf("approval runItemId = %q, want %q", run.PendingApproval.RunItemID, item.ID)
	}
	if _, err := service.SubmitApproval("workspace_api", conversation.ID, run.PendingApproval.ID, true, "", nil, false); err != nil {
		t.Fatalf("submit approval: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)
}

func TestServiceSubmitApprovalToleratesTurnCompletionBeforeLocalClear(t *testing.T) {
	harness := newApprovalCompletesBeforeSubmitReturnsHarness()
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	harness.service = service
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "approval race")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	run := waitForPendingApproval(t, service, "workspace_api", conversation.ID)

	submitted, err := service.SubmitApproval("workspace_api", conversation.ID, run.PendingApproval.ID, true, "", nil, false)
	if err != nil {
		t.Fatalf("submit approval: %v", err)
	}
	if submitted.ID != result.Run.ID || submitted.Status != RunStatusCompleted {
		t.Fatalf("submitted run = %+v, want completed %s", submitted, result.Run.ID)
	}
}

func TestServiceKeepsApprovalPendingWhenHarnessRejectsResponse(t *testing.T) {
	approval := ApprovalRequest{
		Kind:    ApprovalKindCommand,
		Title:   "Run command",
		Command: "go test ./...",
	}
	harness := failingApprovalHarness{FakeHarness: NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventApproval, Approval: approval, WaitForApproval: true},
	})}
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	if _, err := service.SendUserMessage("workspace_api", conversation.ID, "needs approval"); err != nil {
		t.Fatalf("send message: %v", err)
	}
	run := waitForPendingApproval(t, service, "workspace_api", conversation.ID)

	if _, err := service.SubmitApproval("workspace_api", conversation.ID, run.PendingApproval.ID, true, "", nil, false); err == nil {
		t.Fatal("submit approval succeeded, want harness error")
	}
	run, ok, err := service.ActiveRun("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("active run after failed approval: %v", err)
	}
	if !ok || run.PendingApproval == nil {
		t.Fatalf("active run = %+v ok=%v, want approval still pending", run, ok)
	}
	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel cleanup: %v", err)
	}
}

func TestServiceMarksHarnessRefUnavailableWhenResumeFails(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), unavailableRefHarness{})
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	conversation.HarnessRefs = []HarnessThreadRef{{
		CreatedAt:     "2026-05-29T20:00:00Z",
		Harness:       HarnessCodex,
		LastResumedAt: "2026-05-29T20:00:00Z",
		Status:        HarnessRefLinked,
		ThreadID:      "thread_missing",
	}}
	if err := service.store.SaveConversation(conversation); err != nil {
		t.Fatalf("save conversation with ref: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "resume")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusFailed)

	updated, err := service.store.LoadConversation("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("load updated conversation: %v", err)
	}
	if updated.HarnessRefs[0].Status != HarnessRefMissing {
		t.Fatalf("harness ref status = %q, want missing", updated.HarnessRefs[0].Status)
	}
	if updated.HarnessRefs[0].UnavailableMsg == "" {
		t.Fatal("harness ref unavailable message is empty")
	}
}

func TestServiceSupervisorRecordsDiagnosticWhenCompleteTransitionFails(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_fake", SessionID: "session_fake", TurnID: "turn_fake"},
		{Type: FakeEventWaitForSteer},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "break completion")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_fake")

	service.mu.Lock()
	active := service.active[activeKey("workspace_api", conversation.ID)]
	active.assistantMessage.Role = RoleUser
	service.active[activeKey("workspace_api", conversation.ID)] = active
	service.mu.Unlock()

	steerWhenReady(t, service, "workspace_api", conversation.ID, "finish")
	diagnostic := waitForDiagnostic(t, service, "complete_turn_transition_failed")
	if diagnostic.Severity != DiagnosticSeverityCritical || diagnostic.Source != DiagnosticSourceChat {
		t.Fatalf("diagnostic = %+v, want critical chat diagnostic", diagnostic)
	}
	if diagnostic.RunID != result.Run.ID || diagnostic.ConversationID != conversation.ID {
		t.Fatalf("diagnostic scope = %+v, want run %s conversation %s", diagnostic, result.Run.ID, conversation.ID)
	}
	run, err := service.store.LoadRun("workspace_api", result.Run.ID)
	if err != nil {
		t.Fatalf("load run: %v", err)
	}
	if run.Status != RunStatusRunning {
		t.Fatalf("run status = %s, want running after failed terminal transition", run.Status)
	}
	service.mu.Lock()
	_, activeStillPresent := service.active[activeKey("workspace_api", conversation.ID)]
	service.mu.Unlock()
	if !activeStillPresent {
		t.Fatal("active turn was removed before durable terminal state was saved")
	}
}

func TestServiceSupervisorDoesNotRecordDiagnosticsForSuccessfulTurn(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness(nil))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "clean")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)
	diagnostics, err := service.store.ListDiagnostics()
	if err != nil {
		t.Fatalf("list diagnostics: %v", err)
	}
	if len(diagnostics) != 0 {
		t.Fatalf("diagnostics = %+v, want none", diagnostics)
	}
}

func TestServiceStartIDFailureLeavesNoMisleadingActiveTurn(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness(nil))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	service.newID = func(prefix string) (string, error) {
		if prefix == "run" {
			return "", errors.New("run id failed")
		}
		return prefix + "_after_failure", nil
	}

	if _, err := service.SendUserMessage("workspace_api", conversation.ID, "will fail"); err == nil {
		t.Fatal("send message succeeded, want run id failure")
	}
	service.mu.Lock()
	activeCount := len(service.active)
	service.mu.Unlock()
	if activeCount != 0 {
		t.Fatalf("active turns = %d, want none after start failure", activeCount)
	}
	if _, ok, err := service.ActiveRun("workspace_api", conversation.ID); err != nil || ok {
		t.Fatalf("active run = ok %v err %v, want none", ok, err)
	}
}

func TestServiceCancelsBeforeHarnessTurnIDsAreAvailable(t *testing.T) {
	harness := newPreStartCancelHarness()
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "stop immediately")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	harness.waitForStart(t)

	run, err := service.CancelActiveRun("workspace_api", conversation.ID)
	if err != nil {
		t.Fatalf("cancel active run: %v", err)
	}
	if run.ID != result.Run.ID || run.Status != RunStatusCancelled {
		t.Fatalf("run = %+v, want cancelled %s", run, result.Run.ID)
	}
	page, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 20)
	if err != nil {
		t.Fatalf("load page: %v", err)
	}
	if page.Messages[1].Status != MessageStatusCancelled {
		t.Fatalf("assistant status = %q, want cancelled", page.Messages[1].Status)
	}
}

func TestServiceQueuesActiveMessagesAndPromotesOneAtATime(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_fake", SessionID: "session_fake", TurnID: "turn_fake"},
		{Type: FakeEventWaitForSteer},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	first, err := service.SendUserMessage("workspace_api", conversation.ID, "A1")
	if err != nil {
		t.Fatalf("send first: %v", err)
	}
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_fake")
	q1, err := service.QueueUserMessage("workspace_api", conversation.ID, "Q1")
	if err != nil {
		t.Fatalf("queue q1: %v", err)
	}
	q2, err := service.QueueUserMessage("workspace_api", conversation.ID, "Q2")
	if err != nil {
		t.Fatalf("queue q2: %v", err)
	}
	if q1.Run.Status != RunStatusQueued || q2.Run.Status != RunStatusQueued {
		t.Fatalf("queued statuses = %s %s, want queued", q1.Run.Status, q2.Run.Status)
	}

	steerWhenReady(t, service, "workspace_api", conversation.ID, "finish A1")
	waitForRunStatus(t, service, "workspace_api", conversation.ID, first.Run.ID, RunStatusCompleted)
	runQ1 := waitForRunStatus(t, service, "workspace_api", conversation.ID, q1.Run.ID, RunStatusRunning)
	if runQ1.Status != RunStatusRunning {
		t.Fatalf("q1 status = %s, want running", runQ1.Status)
	}
	runQ2, err := service.store.LoadRun("workspace_api", q2.Run.ID)
	if err != nil {
		t.Fatalf("load q2: %v", err)
	}
	if runQ2.Status != RunStatusQueued {
		t.Fatalf("q2 status = %s, want queued while q1 runs", runQ2.Status)
	}

	steerWhenReady(t, service, "workspace_api", conversation.ID, "finish Q1")
	waitForRunStatus(t, service, "workspace_api", conversation.ID, q1.Run.ID, RunStatusCompleted)
	waitForRunStatus(t, service, "workspace_api", conversation.ID, q2.Run.ID, RunStatusRunning)
	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel q2 cleanup: %v", err)
	}
}

func TestServiceCancelDoesNotDrainQueuedRuns(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{{Type: FakeEventWaitForCancel}})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	active, err := service.SendUserMessage("workspace_api", conversation.ID, "A1")
	if err != nil {
		t.Fatalf("send active: %v", err)
	}
	queued, err := service.QueueUserMessage("workspace_api", conversation.ID, "Q1")
	if err != nil {
		t.Fatalf("queue q1: %v", err)
	}
	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel active: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, active.Run.ID, RunStatusCancelled)
	run, err := service.store.LoadRun("workspace_api", queued.Run.ID)
	if err != nil {
		t.Fatalf("load queued: %v", err)
	}
	if run.Status != RunStatusQueued {
		t.Fatalf("queued run status = %s, want queued", run.Status)
	}
	if _, ok, err := service.ActiveRun("workspace_api", conversation.ID); err != nil || ok {
		t.Fatalf("active after cancel = ok %v err %v, want none", ok, err)
	}
}

func TestServiceFailureDoesNotDrainQueuedRuns(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_fake", SessionID: "session_fake", TurnID: "turn_fake"},
		{Type: FakeEventWaitForSteer},
		{Type: FakeEventFailed, Error: "provider failed"},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	active, err := service.SendUserMessage("workspace_api", conversation.ID, "A1")
	if err != nil {
		t.Fatalf("send active: %v", err)
	}
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_fake")
	queued, err := service.QueueUserMessage("workspace_api", conversation.ID, "Q1")
	if err != nil {
		t.Fatalf("queue q1: %v", err)
	}
	if _, err := service.SteerActiveRun("workspace_api", conversation.ID, "fail active"); err != nil {
		t.Fatalf("steer active: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, active.Run.ID, RunStatusFailed)
	run, err := service.store.LoadRun("workspace_api", queued.Run.ID)
	if err != nil {
		t.Fatalf("load queued: %v", err)
	}
	if run.Status != RunStatusQueued {
		t.Fatalf("queued run status = %s, want queued", run.Status)
	}
	if _, ok, err := service.ActiveRun("workspace_api", conversation.ID); err != nil || ok {
		t.Fatalf("active after failure = ok %v err %v, want none", ok, err)
	}
}

func TestServiceSteeringPersistsMessageAndCallsHarness(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_fake", SessionID: "session_fake", TurnID: "turn_fake"},
		{Type: FakeEventWaitForSteer},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	if _, err := service.SendUserMessage("workspace_api", conversation.ID, "A1"); err != nil {
		t.Fatalf("send active: %v", err)
	}
	waitForHarnessRef(t, service, "workspace_api", conversation.ID, "turn_fake")

	result, err := service.SteerActiveRun("workspace_api", conversation.ID, "S1")
	if err != nil {
		t.Fatalf("steer active: %v", err)
	}
	if result.UserMessage.Delivery != MessageDeliverySteering || result.UserMessage.Status != MessageStatusPending {
		t.Fatalf("steering message = %+v, want pending steering", result.UserMessage)
	}
	requests := harness.SteeringRequests()
	if len(requests) != 1 || requests[0].Text != "S1" || requests[0].TurnID != "turn_fake" {
		t.Fatalf("steering requests = %+v, want S1 for active turn", requests)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)
	committed, err := service.store.LoadMessageByID("workspace_api", conversation.ID, result.UserMessage.ID)
	if err != nil {
		t.Fatalf("load steering message: %v", err)
	}
	if committed.Status != MessageStatusComplete {
		t.Fatalf("committed steering status = %s, want complete", committed.Status)
	}
}

func TestServiceSteeringRequiresStartedTurn(t *testing.T) {
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness([]FakeHarnessEvent{{Type: FakeEventWaitForCancel}}))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	if _, err := service.SendUserMessage("workspace_api", conversation.ID, "A1"); err != nil {
		t.Fatalf("send active: %v", err)
	}

	_, err = service.SteerActiveRun("workspace_api", conversation.ID, "S1")
	if !errors.Is(err, ErrTurnNotStarted) {
		t.Fatalf("steer error = %v, want ErrTurnNotStarted", err)
	}
	if _, err := service.CancelActiveRun("workspace_api", conversation.ID); err != nil {
		t.Fatalf("cancel cleanup: %v", err)
	}
}

func TestServicePersistsRunActivityAndOutputChunks(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventThreadLinked, ThreadID: "thread_fake", SessionID: "session_fake", TurnID: "turn_fake"},
		{Type: FakeEventRunItem, ProviderItemID: "command_fake", RunItem: RunItem{
			ProviderItemID: "command_fake",
			Type:           RunItemTypeCommandExecution,
			Status:         RunItemStatusRunning,
			Command:        "go test ./...",
			Cwd:            "/tmp/workspace",
		}},
		{Type: FakeEventRunItemOutput, ProviderItemID: "command_fake", Stream: "stdout", Text: "ok\n"},
		{Type: FakeEventAssistantDelta, ProviderItemID: "message_fake", Text: "done"},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "activity")
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)

	page, err := service.LoadRunActivityPage("workspace_api", result.Run.ID, 20)
	if err != nil {
		t.Fatalf("load activity: %v", err)
	}
	if len(page.Items) < 2 {
		t.Fatalf("items = %+v, want command and assistant items", page.Items)
	}
	if page.Output[0].Text != "ok\n" || page.Output[0].Ordinal != 1 {
		t.Fatalf("output = %+v, want first chunk", page.Output)
	}
}

func TestServiceEmbedsCappedRunOutputAndLoadsFullActivityPage(t *testing.T) {
	events := []FakeHarnessEvent{
		{Type: FakeEventRunItem, ProviderItemID: "command_fake", RunItem: RunItem{
			ProviderItemID: "command_fake",
			Type:           RunItemTypeCommandExecution,
			Status:         RunItemStatusRunning,
			Command:        "printf output",
		}},
	}
	for index := 0; index < embeddedRunOutputLimit+5; index++ {
		events = append(events, FakeHarnessEvent{
			Type:           FakeEventRunItemOutput,
			ProviderItemID: "command_fake",
			Stream:         "stdout",
			Text:           "line\n",
		})
	}
	service := newTestService(t, t.TempDir(), testResolver(t), NewFakeHarness(events))
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "run with output")
	if err != nil {
		t.Fatalf("send message: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)

	page, err := service.LoadMessagePage("workspace_api", conversation.ID, 0, 20)
	if err != nil {
		t.Fatalf("load message page: %v", err)
	}
	if len(page.RunItemOutputs) != embeddedRunOutputLimit {
		t.Fatalf("embedded output count = %d, want %d", len(page.RunItemOutputs), embeddedRunOutputLimit)
	}
	activity, err := service.LoadRunActivityPage("workspace_api", result.Run.ID, embeddedRunOutputLimit+10)
	if err != nil {
		t.Fatalf("load activity page: %v", err)
	}
	if len(activity.Output) != embeddedRunOutputLimit+5 {
		t.Fatalf("activity output count = %d, want full preview output", len(activity.Output))
	}
}

func TestServiceLoadsRunItemOutputWithItemScopedCursor(t *testing.T) {
	harness := NewFakeHarness([]FakeHarnessEvent{
		{Type: FakeEventRunItem, ProviderItemID: "command_a", RunItem: RunItem{
			ProviderItemID: "command_a",
			Type:           RunItemTypeCommandExecution,
			Status:         RunItemStatusRunning,
			Command:        "echo a",
		}},
		{Type: FakeEventRunItemOutput, ProviderItemID: "command_a", Stream: "stdout", Text: "a1\n"},
		{Type: FakeEventRunItem, ProviderItemID: "command_b", RunItem: RunItem{
			ProviderItemID: "command_b",
			Type:           RunItemTypeCommandExecution,
			Status:         RunItemStatusRunning,
			Command:        "echo b",
		}},
		{Type: FakeEventRunItemOutput, ProviderItemID: "command_b", Stream: "stdout", Text: "b1\n"},
		{Type: FakeEventRunItemOutput, ProviderItemID: "command_b", Stream: "stdout", Text: "b2\n"},
	})
	service := newTestService(t, t.TempDir(), testResolver(t), harness)
	conversation, err := service.CreateConversation("workspace_api", "")
	if err != nil {
		t.Fatalf("create conversation: %v", err)
	}
	result, err := service.SendUserMessage("workspace_api", conversation.ID, "activity")
	if err != nil {
		t.Fatalf("send: %v", err)
	}
	waitForRunStatus(t, service, "workspace_api", conversation.ID, result.Run.ID, RunStatusCompleted)
	itemA, exists, err := service.store.FindRunItemByProviderID("workspace_api", result.Run.ID, "command_a")
	if err != nil || !exists {
		t.Fatalf("find item A: exists=%v err=%v", exists, err)
	}
	itemB, exists, err := service.store.FindRunItemByProviderID("workspace_api", result.Run.ID, "command_b")
	if err != nil || !exists {
		t.Fatalf("find item B: exists=%v err=%v", exists, err)
	}

	pageA, err := service.LoadRunItemOutputPage("workspace_api", result.Run.ID, itemA.ID, 0, 20)
	if err != nil {
		t.Fatalf("load item A output: %v", err)
	}
	pageB, err := service.LoadRunItemOutputPage("workspace_api", result.Run.ID, itemB.ID, 0, 20)
	if err != nil {
		t.Fatalf("load item B output: %v", err)
	}
	if len(pageA.Output) != 1 || pageA.Output[0].Text != "a1\n" || pageA.Output[0].Ordinal != 1 {
		t.Fatalf("item A output = %+v, want only A ordinal 1", pageA.Output)
	}
	if len(pageB.Output) != 2 || pageB.Output[0].Text != "b1\n" || pageB.Output[0].Ordinal != 1 {
		t.Fatalf("item B output = %+v, want B output starting at ordinal 1", pageB.Output)
	}
	pageBAfterA, err := service.LoadRunItemOutputPage("workspace_api", result.Run.ID, itemB.ID, pageA.Output[0].Ordinal, 20)
	if err != nil {
		t.Fatalf("load item B after item A cursor: %v", err)
	}
	if len(pageBAfterA.Output) != 1 || pageBAfterA.Output[0].Text != "b2\n" {
		t.Fatalf("item B after ordinal 1 = %+v, want B second output only", pageBAfterA.Output)
	}
}

func TestServiceRecoveryLeavesQueuedRunsQueued(t *testing.T) {
	appDataDir := t.TempDir()
	store := mustStore(t, appDataDir)
	conversation := Conversation{
		SchemaVersion: SchemaVersion,
		ID:            "conversation_api",
		WorkspaceID:   "workspace_api",
		Title:         "API",
		CreatedAt:     "2026-05-29T20:00:00Z",
		UpdatedAt:     "2026-05-29T20:00:00Z",
		HarnessRefs:   []HarnessThreadRef{},
	}
	if err := store.SaveConversation(conversation); err != nil {
		t.Fatalf("save conversation: %v", err)
	}
	if err := store.SaveMessage("workspace_api", ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             "message_queue",
		ConversationID: conversation.ID,
		RunID:          "run_queue",
		Role:           RoleUser,
		Delivery:       MessageDeliveryQueued,
		Ordinal:        1,
		CreatedAt:      "2026-05-29T20:00:00Z",
		UpdatedAt:      "2026-05-29T20:00:00Z",
		Status:         MessageStatusPending,
		Parts: []MessagePart{{
			Format: TextFormatPlain,
			ID:     "part_queue",
			Text:   "queued",
			Type:   MessagePartText,
		}},
	}); err != nil {
		t.Fatalf("save queued message: %v", err)
	}
	if err := store.SaveRun(Run{
		SchemaVersion:    SchemaVersion,
		ID:               "run_queue",
		WorkspaceID:      "workspace_api",
		ConversationID:   conversation.ID,
		TriggerMessageID: "message_queue",
		Harness:          HarnessCodex,
		Status:           RunStatusQueued,
		PromptSummary:    "queued",
	}); err != nil {
		t.Fatalf("save queued run: %v", err)
	}

	restarted := newTestService(t, appDataDir, testResolver(t), NewFakeHarness(nil))
	run, err := restarted.store.LoadRun("workspace_api", "run_queue")
	if err != nil {
		t.Fatalf("load queued run: %v", err)
	}
	if run.Status != RunStatusQueued {
		t.Fatalf("queued run status = %s, want queued", run.Status)
	}
}

func TestStoreIgnoresTemporaryJSONFiles(t *testing.T) {
	store := mustStore(t, t.TempDir())
	conversation := Conversation{
		SchemaVersion: SchemaVersion,
		ID:            "conversation_api",
		WorkspaceID:   "workspace_api",
		Title:         "API",
		CreatedAt:     "2026-05-29T20:00:00Z",
		UpdatedAt:     "2026-05-29T20:00:00Z",
		HarnessRefs:   []HarnessThreadRef{},
	}
	if err := store.SaveConversation(conversation); err != nil {
		t.Fatalf("save conversation: %v", err)
	}
	if err := os.MkdirAll(store.messagesDir("workspace_api", conversation.ID), 0o755); err != nil {
		t.Fatalf("create messages dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(store.messagesDir("workspace_api", conversation.ID), ".tmp-message.json"), []byte("{"), 0o644); err != nil {
		t.Fatalf("write temp message: %v", err)
	}
	if err := store.SaveMessage("workspace_api", ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             "message_api",
		ConversationID: conversation.ID,
		Role:           RoleUser,
		Delivery:       MessageDeliveryNormal,
		Ordinal:        1,
		CreatedAt:      "2026-05-29T20:00:00Z",
		UpdatedAt:      "2026-05-29T20:00:00Z",
		Status:         MessageStatusComplete,
		Parts: []MessagePart{{
			Format: TextFormatPlain,
			ID:     "part_api",
			Text:   "hello",
			Type:   MessagePartText,
		}},
	}); err != nil {
		t.Fatalf("save message: %v", err)
	}
	if err := os.MkdirAll(store.runsDir("workspace_api"), 0o755); err != nil {
		t.Fatalf("create runs dir: %v", err)
	}
	if err := os.WriteFile(filepath.Join(store.runsDir("workspace_api"), ".tmp-run.json"), []byte("{"), 0o644); err != nil {
		t.Fatalf("write temp run: %v", err)
	}

	page, err := store.LoadMessagePage("workspace_api", conversation.ID, 0, 20)
	if err != nil {
		t.Fatalf("load page: %v", err)
	}
	if len(page.Messages) != 1 {
		t.Fatalf("message count = %d, want 1", len(page.Messages))
	}
	if _, ok, err := store.ActiveRun("workspace_api", conversation.ID); err != nil || ok {
		t.Fatalf("active run = ok %v err %v, want none and no temp-file error", ok, err)
	}
}

func TestApprovalRequestMarshalsEmptySlicesAsArrays(t *testing.T) {
	data, err := json.Marshal(ApprovalRequest{})
	if err != nil {
		t.Fatalf("marshal approval request: %v", err)
	}
	text := string(data)
	if !strings.Contains(text, `"options":[]`) {
		t.Fatalf("marshaled approval request = %s, want empty options array", text)
	}
	if !strings.Contains(text, `"questions":[]`) {
		t.Fatalf("marshaled approval request = %s, want empty questions array", text)
	}
}

func TestValidateRunRejectsPendingApprovalOnNonRunningRun(t *testing.T) {
	approval := ApprovalRequest{
		ID:        "approval_stale",
		RunID:     "run_api",
		Kind:      ApprovalKindPermission,
		Title:     "Permission",
		Status:    ApprovalStatusPending,
		CreatedAt: "2026-05-29T20:00:00Z",
	}
	run := Run{
		SchemaVersion:    SchemaVersion,
		ID:               "run_api",
		WorkspaceID:      "workspace_api",
		ConversationID:   "conversation_api",
		TriggerMessageID: "message_user",
		Harness:          HarnessCodex,
		Status:           RunStatusQueued,
		StartedAt:        "2026-05-29T20:00:00Z",
		PromptSummary:    "prompt",
		PendingApproval:  &approval,
	}

	err := validateRun(run)
	if err == nil {
		t.Fatal("validate run succeeded, want corrupt pending approval state")
	}
	if !strings.Contains(err.Error(), "has pendingApproval while status is queued") {
		t.Fatalf("error = %q, want pending approval status diagnostic", err)
	}
}

func TestStoreRejectsMalformedConversationState(t *testing.T) {
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	conversationPath := store.conversationPath("workspace_api", "conversation_bad")
	if err := os.MkdirAll(filepath.Dir(conversationPath), 0o755); err != nil {
		t.Fatalf("create conversation dir: %v", err)
	}
	if err := os.WriteFile(conversationPath, []byte(`{"schemaVersion":1,"id":"conversation_bad","workspaceId":"workspace_api","title":"Bad","createdAt":"2026-05-29T20:00:00Z","updatedAt":"2026-05-29T20:00:00Z","archivedAt":"","harnessRefs":[],"extra":true}`), 0o644); err != nil {
		t.Fatalf("write malformed conversation: %v", err)
	}

	_, err = store.LoadConversation("workspace_api", "conversation_bad")
	if err == nil {
		t.Fatal("load conversation succeeded, want malformed state error")
	}
	if !strings.Contains(err.Error(), `unknown field "extra"`) {
		t.Fatalf("error = %q, want unknown field", err)
	}
	if !IsCorruptStateError(err) {
		t.Fatalf("error = %T %v, want corrupt state", err, err)
	}
}

func TestStoreRecognizesConversationDirectoryRemovedDuringScan(t *testing.T) {
	store, err := NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new store: %v", err)
	}
	dir := store.conversationDir("workspace_api", "conversation_gone")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		t.Fatalf("create conversation dir: %v", err)
	}
	if err := os.RemoveAll(dir); err != nil {
		t.Fatalf("remove conversation dir: %v", err)
	}
	_, loadErr := store.LoadConversation("workspace_api", "conversation_gone")
	if loadErr == nil {
		t.Fatal("load removed conversation succeeded, want missing file error")
	}
	vanished, err := store.conversationDirDisappearedDuringScan("workspace_api", "conversation_gone", loadErr)
	if err != nil {
		t.Fatalf("check vanished conversation: %v", err)
	}
	if !vanished {
		t.Fatal("vanished = false, want true for removed conversation dir")
	}

	stillMissingFileDir := store.conversationDir("workspace_api", "conversation_missing_file")
	if err := os.MkdirAll(stillMissingFileDir, 0o755); err != nil {
		t.Fatalf("create missing-file conversation dir: %v", err)
	}
	_, loadErr = store.LoadConversation("workspace_api", "conversation_missing_file")
	if loadErr == nil {
		t.Fatal("load missing-file conversation succeeded, want error")
	}
	vanished, err = store.conversationDirDisappearedDuringScan("workspace_api", "conversation_missing_file", loadErr)
	if err != nil {
		t.Fatalf("check missing-file conversation: %v", err)
	}
	if vanished {
		t.Fatal("vanished = true, want false while conversation directory still exists")
	}
}

func TestServiceListConversationsReturnsValidItemsWithMalformedConversationState(t *testing.T) {
	appDataDir := t.TempDir()
	store := mustStore(t, appDataDir)
	goodConversation := Conversation{
		SchemaVersion: SchemaVersion,
		ID:            "conversation_good",
		WorkspaceID:   "workspace_api",
		Title:         "Good",
		CreatedAt:     "2026-05-29T20:00:00Z",
		UpdatedAt:     "2026-05-29T20:00:00Z",
		HarnessRefs:   []HarnessThreadRef{},
	}
	if err := store.SaveConversation(goodConversation); err != nil {
		t.Fatalf("save good conversation: %v", err)
	}
	conversationPath := store.conversationPath("workspace_api", "conversation_bad")
	if err := os.MkdirAll(filepath.Dir(conversationPath), 0o755); err != nil {
		t.Fatalf("create bad conversation dir: %v", err)
	}
	if err := os.WriteFile(conversationPath, []byte(`{"schemaVersion":1,"id":"conversation_bad","workspaceId":"workspace_api","title":"Bad","createdAt":"2026-05-29T20:00:00Z","updatedAt":"2026-05-29T20:00:00Z","archivedAt":"","harnessRefs":[],"extra":true}`), 0o644); err != nil {
		t.Fatalf("write malformed conversation: %v", err)
	}
	service := newTestService(t, appDataDir, testResolver(t), NewFakeHarness(nil))

	list, err := service.ListConversations("workspace_api")
	if err != nil {
		t.Fatalf("list conversations: %v", err)
	}
	if len(list.Conversations) != 1 || list.Conversations[0].Conversation.ID != goodConversation.ID {
		t.Fatalf("conversations = %+v, want good conversation only", list.Conversations)
	}
	if !list.Corruption.HasCorruption || list.Corruption.Total != 1 {
		t.Fatalf("corruption summary = %+v, want one corrupt record", list.Corruption)
	}
	if len(list.Diagnostics) != 1 || !strings.Contains(list.Diagnostics[0].Message, `unknown field "extra"`) {
		t.Fatalf("diagnostics = %+v, want unknown field", list.Diagnostics)
	}
	diagnostic := waitForDiagnostic(t, service, "corrupt_chat_state")
	if !strings.Contains(diagnostic.Message, `unknown field "extra"`) {
		t.Fatalf("diagnostic = %q, want unknown field", diagnostic.Message)
	}
}

func TestServiceMarksRunningRunsFailedAfterRestart(t *testing.T) {
	appDataDir := t.TempDir()
	store := mustStore(t, appDataDir)
	conversation := Conversation{
		SchemaVersion: SchemaVersion,
		ID:            "conversation_api",
		WorkspaceID:   "workspace_api",
		Title:         "API",
		CreatedAt:     "2026-05-29T20:00:00Z",
		UpdatedAt:     "2026-05-29T20:00:00Z",
		HarnessRefs:   []HarnessThreadRef{},
	}
	if err := store.SaveConversation(conversation); err != nil {
		t.Fatalf("save conversation: %v", err)
	}
	if err := store.SaveMessage("workspace_api", ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             "message_user",
		ConversationID: conversation.ID,
		RunID:          "run_api",
		Role:           RoleUser,
		Delivery:       MessageDeliveryNormal,
		Ordinal:        1,
		CreatedAt:      "2026-05-29T20:00:00Z",
		UpdatedAt:      "2026-05-29T20:00:00Z",
		Status:         MessageStatusComplete,
		Parts: []MessagePart{{
			Format: TextFormatPlain,
			ID:     "part_user",
			Text:   "prompt",
			Type:   MessagePartText,
		}},
	}); err != nil {
		t.Fatalf("save user message: %v", err)
	}
	if err := store.SaveMessage("workspace_api", ChatMessage{
		SchemaVersion:  SchemaVersion,
		ID:             "message_assistant",
		ConversationID: conversation.ID,
		RunID:          "run_api",
		Role:           RoleAssistant,
		Delivery:       MessageDeliveryNormal,
		Ordinal:        2,
		CreatedAt:      "2026-05-29T20:00:00Z",
		UpdatedAt:      "2026-05-29T20:00:00Z",
		Status:         MessageStatusStreaming,
		Parts: []MessagePart{{
			Format: TextFormatMarkdown,
			ID:     "part_assistant",
			Text:   "partial",
			Type:   MessagePartText,
		}},
	}); err != nil {
		t.Fatalf("save message: %v", err)
	}
	if err := store.SaveRun(Run{
		SchemaVersion:      SchemaVersion,
		ID:                 "run_api",
		WorkspaceID:        "workspace_api",
		ConversationID:     conversation.ID,
		TriggerMessageID:   "message_user",
		AssistantMessageID: "message_assistant",
		Harness:            HarnessCodex,
		Status:             RunStatusRunning,
		StartedAt:          "2026-05-29T20:00:00Z",
		PromptSummary:      "prompt",
	}); err != nil {
		t.Fatalf("save run: %v", err)
	}

	restarted := newTestService(t, appDataDir, testResolver(t), NewFakeHarness(nil))
	run, err := restarted.store.LoadRun("workspace_api", "run_api")
	if err != nil {
		t.Fatalf("load recovered run: %v", err)
	}
	if run.Status != RunStatusFailed || run.Error != "run interrupted by backend restart" {
		t.Fatalf("recovered run = %+v, want failed restart error", run)
	}
	page, err := restarted.LoadMessagePage("workspace_api", conversation.ID, 0, 20)
	if err != nil {
		t.Fatalf("load recovered page: %v", err)
	}
	if len(page.Messages) != 2 {
		t.Fatalf("message count = %d, want 2", len(page.Messages))
	}
	if page.Messages[0].ID != "message_user" || page.Messages[0].Status != MessageStatusComplete {
		t.Fatalf("user message = %+v, want complete user message", page.Messages[0])
	}
	if page.Messages[1].ID != "message_assistant" || page.Messages[1].Status != MessageStatusError {
		t.Fatalf("assistant message = %+v, want error assistant message", page.Messages[1])
	}
}
