package director

import (
	"context"
	"strings"
	"testing"

	"setta/internal/conversation"
)

// The rest of the Setta tool catalog, tested the way the user meets it: the
// Director is told something, it calls a tool, and the app either did the thing
// or said specifically why it would not. Nothing here asserts a schema or a
// decision the user never made.

// settaToolOutcome is what one scripted tool call reported: the receipt the
// Director received, and whether Setta carried the call out. A refusal is a
// receipt too, which is what keeps recovery inside the conversation.
type settaToolOutcome struct {
	receipt   SettaToolReceipt
	succeeded bool
}

func callSettaTool(
	t *testing.T,
	harness *registryHarness,
	registry *Registry,
	execution WorkstreamExecution,
	call scriptedDirectorToolCall,
) settaToolOutcome {
	t.Helper()
	provider := &scriptedDirectorProvider{reply: "Done.", calls: []scriptedDirectorToolCall{call}}
	thread := newDirectorThreadForTest(
		t,
		harness,
		registry,
		provider,
		execution,
		newDirectorConversationStoreForTest(),
	)
	receipt, err := thread.Submit(context.Background(), directorTurnIntent("do that for me"))
	if err != nil {
		t.Fatalf("Submit %s: %v", call.tool, err)
	}
	if len(receipt.ToolCalls) != 1 || len(provider.receipts) != 1 {
		t.Fatalf("director tool calls = %+v", receipt.ToolCalls)
	}
	return settaToolOutcome{receipt: provider.receipts[0], succeeded: receipt.ToolCalls[0].Succeeded}
}

// TestDirectorReadsActivityFromDurableState proves "what is happening?" is
// answered from the same durable state the rails render, and that the ids the
// blocker tools need come back with it rather than being invented.
func TestDirectorReadsActivityFromDurableState(t *testing.T) {
	harness := newRegistryHarness(t)
	workspaceID := registryTestWorkspaceID
	running := harness.createConversation("conversation-migrate", "Migration", &workspaceID)
	harness.startTurn("conversation-migrate", "turn-migrate-1")
	harness.requestApproval("conversation-migrate", "turn-migrate-1", "approval-migrate")
	registry := harness.start()

	outcome := callSettaTool(t, harness, registry, &recordedExecution{}, scriptedDirectorToolCall{
		tool:      "read_activity",
		arguments: map[string]any{},
	})

	if !outcome.succeeded {
		t.Fatalf("read_activity was refused: %q", outcome.receipt.Summary)
	}
	if outcome.receipt.Aggregates == nil ||
		outcome.receipt.Aggregates.WorkstreamCount != 1 ||
		outcome.receipt.Aggregates.AwaitingApprovalCount != 1 {
		t.Fatalf("activity aggregates = %+v", outcome.receipt.Aggregates)
	}
	if len(outcome.receipt.Approvals) != 1 {
		t.Fatalf("activity approvals = %+v", outcome.receipt.Approvals)
	}
	approval := outcome.receipt.Approvals[0]
	if approval.ApprovalID != "approval-migrate" ||
		approval.WorkstreamID != running ||
		approval.Summary != "Run the migration" ||
		approval.Secret {
		t.Fatalf("reported approval = %+v", approval)
	}
	if len(outcome.receipt.Workstreams) != 1 || !outcome.receipt.Workstreams[0].HasActiveRun {
		t.Fatalf("activity workstreams = %+v", outcome.receipt.Workstreams)
	}
}

// TestDirectorStopsTheRunAWorkstreamIsCarrying proves a cancel names the run
// trusted state says is in flight. The Director never sees a run id, so asking
// it for one would be asking it to invent app state.
func TestDirectorStopsTheRunAWorkstreamIsCarrying(t *testing.T) {
	harness := newRegistryHarness(t)
	workspaceID := registryTestWorkspaceID
	running := harness.createConversation("conversation-migrate", "Migration", &workspaceID)
	harness.startTurn("conversation-migrate", "turn-migrate-1")
	registry := harness.start()
	execution := &recordedExecution{}

	outcome := callSettaTool(t, harness, registry, execution, scriptedDirectorToolCall{
		tool:      "cancel_run",
		arguments: map[string]any{"workstreamId": running},
	})

	if !outcome.succeeded {
		t.Fatalf("cancel_run was refused: %q", outcome.receipt.Summary)
	}
	if !strings.Contains(outcome.receipt.Summary, "Migration") {
		t.Fatalf("cancel receipt does not name the workstream: %q", outcome.receipt.Summary)
	}
	if len(execution.cancels) != 1 {
		t.Fatalf("execution cancels = %+v", execution.cancels)
	}
	stopped := execution.cancels[0]
	if stopped.ConversationID != "conversation-migrate" ||
		stopped.WorkspaceID != workspaceID ||
		stopped.RunID != "turn-migrate-1" {
		t.Fatalf("cancelled run = %+v", stopped)
	}
}

// TestDirectorCannotStopWorkThatIsNotRunning proves an idle workstream refuses
// the call instead of the app stopping whatever ran last.
func TestDirectorCannotStopWorkThatIsNotRunning(t *testing.T) {
	harness := newRegistryHarness(t)
	workspaceID := registryTestWorkspaceID
	idle := harness.createConversation("conversation-idle", "Parser rewrite", &workspaceID)
	registry := harness.start()
	execution := &recordedExecution{}

	outcome := callSettaTool(t, harness, registry, execution, scriptedDirectorToolCall{
		tool:      "cancel_run",
		arguments: map[string]any{"workstreamId": idle},
	})

	if outcome.succeeded {
		t.Fatalf("cancelling an idle workstream succeeded: %+v", outcome.receipt)
	}
	if !strings.Contains(outcome.receipt.Summary, "no run in flight") {
		t.Fatalf("refusal does not say what was wrong: %q", outcome.receipt.Summary)
	}
	if len(execution.cancels) != 0 {
		t.Fatalf("a refused cancel reached the execution port: %+v", execution.cancels)
	}
}

// TestDirectorAnswersAnApproval proves the Director can unblock a run through
// the same execution port the user's own answer travels.
func TestDirectorAnswersAnApproval(t *testing.T) {
	harness := newRegistryHarness(t)
	workspaceID := registryTestWorkspaceID
	blocked := harness.createConversation("conversation-migrate", "Migration", &workspaceID)
	harness.startTurn("conversation-migrate", "turn-migrate-1")
	harness.requestApproval("conversation-migrate", "turn-migrate-1", "approval-migrate")
	registry := harness.start()
	execution := &recordedExecution{}

	outcome := callSettaTool(t, harness, registry, execution, scriptedDirectorToolCall{
		tool: "resolve_approval",
		arguments: map[string]any{
			"approvalId": "approval-migrate",
			"decision":   string(conversation.TrajectoryApprovalDecisionApproved),
			"answers":    nil,
		},
	})

	if !outcome.succeeded {
		t.Fatalf("resolve_approval was refused: %q", outcome.receipt.Summary)
	}
	if outcome.receipt.WorkstreamID == nil || *outcome.receipt.WorkstreamID != blocked {
		t.Fatalf("approval receipt workstream = %v", outcome.receipt.WorkstreamID)
	}
	if len(execution.approvals) != 1 {
		t.Fatalf("execution approvals = %+v", execution.approvals)
	}
	answered := execution.approvals[0]
	if answered.ApprovalID != "approval-migrate" ||
		answered.RunID != "turn-migrate-1" ||
		answered.Decision != conversation.TrajectoryApprovalDecisionApproved ||
		len(answered.Answers) != 0 {
		t.Fatalf("answered approval = %+v", answered)
	}
}

// TestDirectorRefusesToAnswerASecretApproval proves the one answer that is not
// the Director's to give. A secret answer is a credential the user supplies, so
// a model authoring one would be inventing it on their behalf.
func TestDirectorRefusesToAnswerASecretApproval(t *testing.T) {
	harness := newRegistryHarness(t)
	workspaceID := registryTestWorkspaceID
	harness.createConversation("conversation-deploy", "Deploy", &workspaceID)
	harness.startTurn("conversation-deploy", "turn-deploy-1")
	harness.requestStructuredApproval("conversation-deploy", "turn-deploy-1", "approval-token")
	registry := harness.start()
	execution := &recordedExecution{}

	outcome := callSettaTool(t, harness, registry, execution, scriptedDirectorToolCall{
		tool: "resolve_approval",
		arguments: map[string]any{
			"approvalId": "approval-token",
			"decision":   string(conversation.TrajectoryApprovalDecisionAnswered),
			"answers": []any{map[string]any{
				"questionId": "question-token",
				"answers":    []any{"guessed-token"},
			}},
		},
	})

	if outcome.succeeded {
		t.Fatalf("the director answered a secret approval: %+v", outcome.receipt)
	}
	if !strings.Contains(outcome.receipt.Summary, "secret") {
		t.Fatalf("refusal does not say why: %q", outcome.receipt.Summary)
	}
	if len(execution.approvals) != 0 {
		t.Fatalf("a secret answer reached the execution port: %+v", execution.approvals)
	}
}

// TestDirectorAttachesTheFolderBlockedWorkIsWaitingFor proves the whole blocked
// path: work that cannot start says what it needs, the Director supplies a
// folder the app offered, and the receipt says the work still has to be sent.
func TestDirectorAttachesTheFolderBlockedWorkIsWaitingFor(t *testing.T) {
	harness := newRegistryHarness(t)
	folderless := harness.createConversation("conversation-folderless", "Run the tests", nil)
	registry := harness.start()
	execution := &recordedExecution{}

	blocked := callSettaTool(t, harness, registry, execution, scriptedDirectorToolCall{
		tool:      "submit_work",
		arguments: map[string]any{"workstreamId": folderless, "input": "run the tests"},
	})
	if !blocked.succeeded || blocked.receipt.ResourceRequestID == nil {
		t.Fatalf("work in a folderless workstream did not open a resource request: %+v", blocked.receipt)
	}

	attached := callSettaTool(t, harness, registry, execution, scriptedDirectorToolCall{
		tool: "resolve_resource_request",
		arguments: map[string]any{
			"requestId":   *blocked.receipt.ResourceRequestID,
			"workspaceId": registryTestWorkspaceID,
		},
	})

	if !attached.succeeded {
		t.Fatalf("resolve_resource_request was refused: %q", attached.receipt.Summary)
	}
	if !strings.Contains(attached.receipt.Summary, "alpha") ||
		!strings.Contains(attached.receipt.Summary, "send it again") {
		t.Fatalf("resource receipt = %q", attached.receipt.Summary)
	}
	if len(execution.bindings) != 1 ||
		execution.bindings[0].ConversationID != "conversation-folderless" ||
		execution.bindings[0].WorkspaceID != registryTestWorkspaceID {
		t.Fatalf("execution bindings = %+v", execution.bindings)
	}
}

// TestDirectorRefusesAFolderTheAppIsNotOffering proves a folder is named by an
// id the app handed over, never by one the Director produced.
func TestDirectorRefusesAFolderTheAppIsNotOffering(t *testing.T) {
	harness := newRegistryHarness(t)
	folderless := harness.createConversation("conversation-folderless", "Run the tests", nil)
	registry := harness.start()
	execution := &recordedExecution{}

	blocked := callSettaTool(t, harness, registry, execution, scriptedDirectorToolCall{
		tool:      "submit_work",
		arguments: map[string]any{"workstreamId": folderless, "input": "run the tests"},
	})
	if blocked.receipt.ResourceRequestID == nil {
		t.Fatalf("work in a folderless workstream did not open a resource request: %+v", blocked.receipt)
	}

	refused := callSettaTool(t, harness, registry, execution, scriptedDirectorToolCall{
		tool: "resolve_resource_request",
		arguments: map[string]any{
			"requestId":   *blocked.receipt.ResourceRequestID,
			"workspaceId": "workspace-invented",
		},
	})

	if refused.succeeded {
		t.Fatalf("an invented workspace was bound: %+v", refused.receipt)
	}
	if !strings.Contains(refused.receipt.Summary, "workspace-invented") {
		t.Fatalf("refusal does not name the workspace: %q", refused.receipt.Summary)
	}
	if len(execution.bindings) != 0 {
		t.Fatalf("a refused binding reached the execution port: %+v", execution.bindings)
	}
}

// TestDirectorRenamesAWorkstream proves the title the user reads is changed
// where every other title comes from: the durable conversation record.
func TestDirectorRenamesAWorkstream(t *testing.T) {
	harness := newRegistryHarness(t)
	workspaceID := registryTestWorkspaceID
	workstreamID := harness.createConversation("conversation-parser", "Untitled", &workspaceID)
	registry := harness.start()
	execution := &recordedExecution{}

	outcome := callSettaTool(t, harness, registry, execution, scriptedDirectorToolCall{
		tool:      "rename_workstream",
		arguments: map[string]any{"workstreamId": workstreamID, "title": "Parser rewrite"},
	})

	if !outcome.succeeded {
		t.Fatalf("rename_workstream was refused: %q", outcome.receipt.Summary)
	}
	if !strings.Contains(outcome.receipt.Summary, "Parser rewrite") {
		t.Fatalf("rename receipt = %q", outcome.receipt.Summary)
	}
	if len(execution.renames) != 1 ||
		execution.renames[0].ConversationID != "conversation-parser" ||
		execution.renames[0].Title != "Parser rewrite" {
		t.Fatalf("execution renames = %+v", execution.renames)
	}
}

// TestDirectorArchivesOnlySettledWork proves archiving is refused while
// anything is still outstanding — the archived record carries no open work, so
// letting the call through would leave the app asserting a state it cannot hold
// — and that it goes through once the workstream has settled.
func TestDirectorArchivesOnlySettledWork(t *testing.T) {
	harness := newRegistryHarness(t)
	workspaceID := registryTestWorkspaceID
	busy := harness.createConversation("conversation-migrate", "Migration", &workspaceID)
	settled := harness.createConversation("conversation-parser", "Parser rewrite", &workspaceID)
	harness.startTurn("conversation-migrate", "turn-migrate-1")
	registry := harness.start()
	execution := &recordedExecution{}

	refused := callSettaTool(t, harness, registry, execution, scriptedDirectorToolCall{
		tool:      "archive_workstream",
		arguments: map[string]any{"workstreamId": busy},
	})
	if refused.succeeded {
		t.Fatalf("a workstream with a run in flight was archived: %+v", refused.receipt)
	}
	if !strings.Contains(refused.receipt.Summary, "a run in flight") {
		t.Fatalf("refusal does not say what is outstanding: %q", refused.receipt.Summary)
	}

	archived := callSettaTool(t, harness, registry, execution, scriptedDirectorToolCall{
		tool:      "archive_workstream",
		arguments: map[string]any{"workstreamId": settled},
	})
	if !archived.succeeded {
		t.Fatalf("archive_workstream was refused: %q", archived.receipt.Summary)
	}
	if !strings.Contains(archived.receipt.Summary, "Parser rewrite") {
		t.Fatalf("archive receipt = %q", archived.receipt.Summary)
	}
	if len(execution.archives) != 1 || execution.archives[0].ConversationID != "conversation-parser" {
		t.Fatalf("execution archives = %+v", execution.archives)
	}
}
