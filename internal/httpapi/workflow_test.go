package httpapi

import (
	"bufio"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/appstate"
	"setta/internal/chat"
	"setta/internal/orchestrator"
	"setta/internal/workspace"
	"setta/internal/workspacesession"
)

func TestWorkflowEndpointsCreateValidateStartCancelAndReadEvents(t *testing.T) {
	handler := newChatHandler(t, nil)
	workspaceRoot := t.TempDir()
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: workspaceRoot}, http.StatusOK)
	graph := httpWorkflowActionGraph()

	validation := postJSON[orchestrator.WorkflowValidationResult](t, handler, "/workflows/definitions/validate", ValidateWorkflowDefinitionRequest{
		WorkspaceID: opened.Workspace.ID,
		Graph:       graph,
	}, http.StatusOK)
	if !validation.Valid {
		t.Fatalf("validation diagnostics = %+v, want valid graph", validation.Diagnostics)
	}

	definition := postJSON[orchestrator.WorkflowDefinition](t, handler, "/workflows/definitions/create", CreateWorkflowDefinitionRequest{
		WorkspaceID: opened.Workspace.ID,
		Name:        "HTTP workflow",
		Graph:       graph,
	}, http.StatusOK)
	if definition.ID == "" {
		t.Fatalf("definition missing ids: %+v", definition)
	}
	list := postJSON[ListWorkflowDefinitionsResponse](t, handler, "/workflows/definitions/list", ListWorkflowDefinitionsRequest{
		WorkspaceID: opened.Workspace.ID,
	}, http.StatusOK)
	if len(list.Definitions) != 1 || list.Definitions[0].ID != definition.ID {
		t.Fatalf("definitions = %+v, want created definition", list.Definitions)
	}

	execution := postJSON[orchestrator.WorkflowExecution](t, handler, "/workflows/executions/start", StartWorkflowExecutionRequest{
		WorkspaceID:  opened.Workspace.ID,
		DefinitionID: definition.ID,
	}, http.StatusOK)
	if execution.Status != orchestrator.ExecutionStatusRunning {
		t.Fatalf("execution status = %s, want running", execution.Status)
	}
	page := postJSON[orchestrator.WorkflowExecutionEventPage](t, handler, "/workflows/executions/events", GetWorkflowExecutionEventsRequest{
		WorkspaceID: opened.Workspace.ID,
		ExecutionID: execution.ID,
		Limit:       20,
	}, http.StatusOK)
	if len(page.Events) == 0 {
		t.Fatalf("workflow event page is empty")
	}

	cancelled := postJSON[orchestrator.WorkflowExecution](t, handler, "/workflows/executions/cancel", CancelWorkflowExecutionRequest{
		WorkspaceID: opened.Workspace.ID,
		ExecutionID: execution.ID,
	}, http.StatusOK)
	if cancelled.Status != orchestrator.ExecutionStatusCancelled {
		t.Fatalf("cancelled execution status = %s, want cancelled", cancelled.Status)
	}
	read := postJSON[orchestrator.WorkflowExecution](t, handler, "/workflows/executions/read", ReadWorkflowExecutionRequest{
		WorkspaceID: opened.Workspace.ID,
		ExecutionID: execution.ID,
	}, http.StatusOK)
	if read.Status != orchestrator.ExecutionStatusCancelled {
		t.Fatalf("read execution status = %s, want cancelled", read.Status)
	}
	projection := postJSON[ReadWorkflowGraphProjectionResponse](t, handler, "/workflows/graph/read", ReadWorkflowGraphProjectionRequest{
		WorkspaceID: opened.Workspace.ID,
		ExecutionID: execution.ID,
	}, http.StatusOK)
	if projection.Projection == nil {
		t.Fatal("workflow graph projection was nil")
	}
	if projection.Projection.ExecutionID != execution.ID {
		t.Fatalf("projection execution id = %s, want %s", projection.Projection.ExecutionID, execution.ID)
	}
	if got := projectedHTTPNodeStatus(projection.Projection, "work"); got != orchestrator.GraphNodeStatusCancelled {
		t.Fatalf("projected work status = %s, want cancelled", got)
	}
}

func TestWorkflowEndpointCancelReturnsCompletedExecutionWithoutFailure(t *testing.T) {
	handler := newChatHandler(t, nil)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	definition := postJSON[orchestrator.WorkflowDefinition](t, handler, "/workflows/definitions/create", CreateWorkflowDefinitionRequest{
		WorkspaceID: opened.Workspace.ID,
		Name:        "Completed before cancel",
		Graph:       httpWorkflowStartEndGraph(),
	}, http.StatusOK)
	completed := postJSON[orchestrator.WorkflowExecution](t, handler, "/workflows/executions/start", StartWorkflowExecutionRequest{
		WorkspaceID:  opened.Workspace.ID,
		DefinitionID: definition.ID,
	}, http.StatusOK)
	if completed.Status != orchestrator.ExecutionStatusCompleted {
		t.Fatalf("execution status = %s, want completed before cancel", completed.Status)
	}

	returned := postJSON[orchestrator.WorkflowExecution](t, handler, "/workflows/executions/cancel", CancelWorkflowExecutionRequest{
		WorkspaceID: opened.Workspace.ID,
		ExecutionID: completed.ID,
	}, http.StatusOK)
	if returned.Status != orchestrator.ExecutionStatusCompleted {
		t.Fatalf("cancel returned status = %s, want completed", returned.Status)
	}
}

func TestWorkflowEndpointStartExecutionConflictIncludesActiveExecution(t *testing.T) {
	handler := newChatHandler(t, nil)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	definition := postJSON[orchestrator.WorkflowDefinition](t, handler, "/workflows/definitions/create", CreateWorkflowDefinitionRequest{
		WorkspaceID: opened.Workspace.ID,
		Name:        "Active conflict",
		Graph:       httpWorkflowActionGraph(),
	}, http.StatusOK)
	active := postJSON[orchestrator.WorkflowExecution](t, handler, "/workflows/executions/start", StartWorkflowExecutionRequest{
		WorkspaceID:  opened.Workspace.ID,
		DefinitionID: definition.ID,
	}, http.StatusOK)

	conflict := postJSON[ErrorResponse](t, handler, "/workflows/executions/start", StartWorkflowExecutionRequest{
		WorkspaceID:  opened.Workspace.ID,
		DefinitionID: definition.ID,
	}, http.StatusConflict)
	if conflict.Error.Code != orchestrator.WorkflowExecutionAlreadyRunningCode {
		t.Fatalf("error code = %q, want %s", conflict.Error.Code, orchestrator.WorkflowExecutionAlreadyRunningCode)
	}
	if conflict.Error.ActiveExecution == nil {
		t.Fatal("active execution payload was nil")
	}
	if conflict.Error.ActiveExecution.ID != active.ID || conflict.Error.ActiveExecution.Status != orchestrator.ExecutionStatusRunning {
		t.Fatalf("active execution payload = %+v, want running %s", conflict.Error.ActiveExecution, active.ID)
	}
	if conflict.Error.ActiveExecution.DefinitionVersionNumber != 1 {
		t.Fatalf("active version number = %d, want 1", conflict.Error.ActiveExecution.DefinitionVersionNumber)
	}
}

func TestWorkflowEndpointListExecutionsReturnsDefinitionSummaries(t *testing.T) {
	handler := newChatHandler(t, nil)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	definition := postJSON[orchestrator.WorkflowDefinition](t, handler, "/workflows/definitions/create", CreateWorkflowDefinitionRequest{
		WorkspaceID: opened.Workspace.ID,
		Name:        "Run summaries",
		Graph:       httpWorkflowActionGraph(),
	}, http.StatusOK)
	otherDefinition := postJSON[orchestrator.WorkflowDefinition](t, handler, "/workflows/definitions/create", CreateWorkflowDefinitionRequest{
		WorkspaceID: opened.Workspace.ID,
		Name:        "Other summaries",
		Graph:       httpWorkflowActionGraph(),
	}, http.StatusOK)
	first := postJSON[orchestrator.WorkflowExecution](t, handler, "/workflows/executions/start", StartWorkflowExecutionRequest{
		WorkspaceID:  opened.Workspace.ID,
		DefinitionID: definition.ID,
	}, http.StatusOK)
	cancelled := postJSON[orchestrator.WorkflowExecution](t, handler, "/workflows/executions/cancel", CancelWorkflowExecutionRequest{
		WorkspaceID: opened.Workspace.ID,
		ExecutionID: first.ID,
	}, http.StatusOK)
	other := postJSON[orchestrator.WorkflowExecution](t, handler, "/workflows/executions/start", StartWorkflowExecutionRequest{
		WorkspaceID:  opened.Workspace.ID,
		DefinitionID: otherDefinition.ID,
	}, http.StatusOK)
	active := postJSON[orchestrator.WorkflowExecution](t, handler, "/workflows/executions/start", StartWorkflowExecutionRequest{
		WorkspaceID:  opened.Workspace.ID,
		DefinitionID: definition.ID,
	}, http.StatusOK)

	list := postJSON[ListWorkflowExecutionsResponse](t, handler, "/workflows/executions/list", ListWorkflowExecutionsRequest{
		WorkspaceID:  opened.Workspace.ID,
		DefinitionID: definition.ID,
	}, http.StatusOK)
	if len(list.Executions) != 2 {
		t.Fatalf("listed executions = %+v, want active and cancelled summaries", list.Executions)
	}
	summariesByID := map[string]orchestrator.WorkflowExecutionSummary{}
	for _, summary := range list.Executions {
		summariesByID[summary.ID] = summary
		if summary.DefinitionID != definition.ID || summary.WorkspaceID != opened.Workspace.ID {
			t.Fatalf("summary ownership = %+v, want workspace %s definition %s", summary, opened.Workspace.ID, definition.ID)
		}
		if summary.ID == other.ID {
			t.Fatalf("list included execution from other definition: %+v", summary)
		}
	}
	activeSummary, ok := summariesByID[active.ID]
	if !ok || activeSummary.Status != orchestrator.ExecutionStatusRunning || activeSummary.DefinitionVersionNumber != 2 {
		t.Fatalf("active summary = %+v present %v, want running version 2", activeSummary, ok)
	}
	cancelledSummary, ok := summariesByID[cancelled.ID]
	if !ok || cancelledSummary.Status != orchestrator.ExecutionStatusCancelled || cancelledSummary.DefinitionVersionNumber != 1 {
		t.Fatalf("cancelled summary = %+v present %v, want cancelled version 1", cancelledSummary, ok)
	}

	limited := postJSON[ListWorkflowExecutionsResponse](t, handler, "/workflows/executions/list", ListWorkflowExecutionsRequest{
		WorkspaceID:  opened.Workspace.ID,
		DefinitionID: definition.ID,
		Limit:        1,
	}, http.StatusOK)
	if len(limited.Executions) != 1 {
		t.Fatalf("limited executions = %+v, want one summary", limited.Executions)
	}

	raw, err := json.Marshal(list)
	if err != nil {
		t.Fatalf("marshal list response: %v", err)
	}
	for _, forbidden := range []string{"nodeExecutions", "tokens", "loopIterations", "graph", "events", "runnerRefs"} {
		if strings.Contains(string(raw), forbidden) {
			t.Fatalf("list response contains full payload field %q: %s", forbidden, raw)
		}
	}
}

func TestWorkflowEndpointsSubmitWorkflowApproval(t *testing.T) {
	handler := newScriptedWorkflowHandler(t)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	definition := postJSON[orchestrator.WorkflowDefinition](t, handler, "/workflows/definitions/create", CreateWorkflowDefinitionRequest{
		WorkspaceID: opened.Workspace.ID,
		Name:        "Approval workflow",
		Graph:       httpWorkflowApprovalGraph(),
	}, http.StatusOK)

	started := postJSON[orchestrator.WorkflowExecution](t, handler, "/workflows/executions/start", StartWorkflowExecutionRequest{
		WorkspaceID:  opened.Workspace.ID,
		DefinitionID: definition.ID,
	}, http.StatusOK)
	waiting := waitForHTTPWorkflowNodeStatus(t, handler, opened.Workspace.ID, started.ID, "work", orchestrator.NodeExecutionStatusWaitingApproval)
	work := latestHTTPNodeExecution(t, waiting, "work")
	if work.Result == nil || work.Result.PendingApproval == nil {
		t.Fatalf("work result = %+v, want pending workflow approval", work.Result)
	}
	pending := work.Result.PendingApproval
	projection := postJSON[ReadWorkflowGraphProjectionResponse](t, handler, "/workflows/graph/read", ReadWorkflowGraphProjectionRequest{
		WorkspaceID:  opened.Workspace.ID,
		ExecutionID:  started.ID,
		DefinitionID: definition.ID,
		VersionID:    started.DefinitionVersionID,
	}, http.StatusOK)
	if projection.Projection == nil {
		t.Fatal("workflow graph projection was nil")
	}
	projectedWork := projectedHTTPNode(t, projection.Projection, "work")
	if projectedWork.PendingApproval == nil || projectedWork.PendingApproval.ApprovalID != pending.ApprovalID {
		t.Fatalf("projected pending approval = %+v, want %s", projectedWork.PendingApproval, pending.ApprovalID)
	}

	submitted := postJSON[orchestrator.WorkflowExecution](t, handler, "/workflows/approvals/submit", SubmitWorkflowApprovalRequest{
		WorkspaceID:     opened.Workspace.ID,
		ExecutionID:     started.ID,
		NodeExecutionID: work.ID,
		ApprovalID:      pending.ApprovalID,
		Approved:        true,
	}, http.StatusOK)
	if submitted.ID != started.ID {
		t.Fatalf("submitted execution id = %s, want %s", submitted.ID, started.ID)
	}
	completed := waitForHTTPWorkflowStatus(t, handler, opened.Workspace.ID, started.ID, orchestrator.ExecutionStatusCompleted)
	completedWork := latestHTTPNodeExecution(t, completed, "work")
	if completedWork.Result == nil || completedWork.Result.PendingApproval != nil {
		t.Fatalf("completed work result = %+v, want no pending approval", completedWork.Result)
	}
}

func TestWorkflowNodeTrajectoryEndpointReturnsScopedApprovalTrajectory(t *testing.T) {
	handler := newScriptedWorkflowHandler(t)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	definition := postJSON[orchestrator.WorkflowDefinition](t, handler, "/workflows/definitions/create", CreateWorkflowDefinitionRequest{
		WorkspaceID: opened.Workspace.ID,
		Name:        "Trajectory approval workflow",
		Graph:       httpWorkflowApprovalGraph(),
	}, http.StatusOK)
	started := postJSON[orchestrator.WorkflowExecution](t, handler, "/workflows/executions/start", StartWorkflowExecutionRequest{
		WorkspaceID:  opened.Workspace.ID,
		DefinitionID: definition.ID,
	}, http.StatusOK)
	waiting := waitForHTTPWorkflowNodeStatus(t, handler, opened.Workspace.ID, started.ID, "work", orchestrator.NodeExecutionStatusWaitingApproval)
	work := latestHTTPNodeExecution(t, waiting, "work")
	pending := work.Result.PendingApproval

	page := postJSON[orchestrator.WorkflowAgentTrajectoryPage](t, handler, "/workflows/nodes/trajectory", ReadWorkflowNodeTrajectoryRequest{
		WorkspaceID:     opened.Workspace.ID,
		ExecutionID:     started.ID,
		NodeExecutionID: work.ID,
		TranscriptLimit: 20,
		OutputLimit:     5,
	}, http.StatusOK)
	if page.Scope.WorkspaceID != opened.Workspace.ID ||
		page.Scope.ExecutionID != started.ID ||
		page.Scope.NodeExecutionID != work.ID ||
		page.Scope.Attempt != work.Attempt {
		t.Fatalf("trajectory scope = %+v, want workspace/execution/node scope", page.Scope)
	}
	if page.PendingApproval == nil || page.PendingApproval.ApprovalID != pending.ApprovalID {
		t.Fatalf("trajectory pending approval = %+v, want %s", page.PendingApproval, pending.ApprovalID)
	}
	if page.ActiveRun == nil || page.ActiveRun.ID != page.RunID {
		t.Fatalf("trajectory active run = %+v, want %s", page.ActiveRun, page.RunID)
	}
	if page.ActiveRunLiveness == nil || page.ActiveRunLiveness.RunID != page.RunID {
		t.Fatalf("trajectory liveness = %+v, want run %s", page.ActiveRunLiveness, page.RunID)
	}
	if len(page.Blocks) == 0 {
		t.Fatal("trajectory blocks were empty")
	}
	for _, block := range page.Blocks {
		if block.RunID != page.RunID {
			t.Fatalf("trajectory block = %+v, want run %s only", block, page.RunID)
		}
	}
	if page.OutputPages == nil || page.Outputs == nil {
		t.Fatalf("trajectory output arrays must be non-nil: %+v", page)
	}
	if !page.Capabilities.CanSubmitApproval || !page.Capabilities.CanLoadRunItemOutput || !page.Capabilities.CanStopRun {
		t.Fatalf("trajectory capabilities = %+v, want approval, stop, and output loading", page.Capabilities)
	}
}

func TestWorkflowEndpointStopsNodeScopedRun(t *testing.T) {
	handler := newScriptedWorkflowHandler(t)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	definition := postJSON[orchestrator.WorkflowDefinition](t, handler, "/workflows/definitions/create", CreateWorkflowDefinitionRequest{
		WorkspaceID: opened.Workspace.ID,
		Name:        "Stopped trajectory workflow",
		Graph:       httpWorkflowHoldGraph(),
	}, http.StatusOK)
	started := postJSON[orchestrator.WorkflowExecution](t, handler, "/workflows/executions/start", StartWorkflowExecutionRequest{
		WorkspaceID:  opened.Workspace.ID,
		DefinitionID: definition.ID,
	}, http.StatusOK)
	work := latestHTTPNodeExecution(t, started, "work")

	page := postJSON[orchestrator.WorkflowAgentTrajectoryPage](t, handler, "/workflows/nodes/trajectory", ReadWorkflowNodeTrajectoryRequest{
		WorkspaceID:     opened.Workspace.ID,
		ExecutionID:     started.ID,
		NodeExecutionID: work.ID,
		TranscriptLimit: 20,
		OutputLimit:     5,
	}, http.StatusOK)
	if !page.Capabilities.CanStopRun {
		t.Fatalf("running trajectory capabilities = %+v, want stop", page.Capabilities)
	}

	stopped := postJSON[orchestrator.WorkflowExecution](t, handler, "/workflows/nodes/runs/stop", StopWorkflowNodeRunRequest{
		WorkspaceID:     opened.Workspace.ID,
		ExecutionID:     started.ID,
		NodeExecutionID: work.ID,
	}, http.StatusOK)
	if stopped.Status != orchestrator.ExecutionStatusCancelled {
		t.Fatalf("stopped execution status = %s, want cancelled", stopped.Status)
	}
	stoppedWork := latestHTTPNodeExecution(t, stopped, "work")
	if stoppedWork.Status != orchestrator.NodeExecutionStatusCancelled {
		t.Fatalf("stopped node status = %s, want cancelled", stoppedWork.Status)
	}

	terminalPage := postJSON[orchestrator.WorkflowAgentTrajectoryPage](t, handler, "/workflows/nodes/trajectory", ReadWorkflowNodeTrajectoryRequest{
		WorkspaceID:     opened.Workspace.ID,
		ExecutionID:     stopped.ID,
		NodeExecutionID: stoppedWork.ID,
		TranscriptLimit: 20,
		OutputLimit:     5,
	}, http.StatusOK)
	if terminalPage.ActiveRun != nil || terminalPage.Capabilities.CanStopRun {
		t.Fatalf("terminal trajectory = active %+v capabilities %+v, want no active stop", terminalPage.ActiveRun, terminalPage.Capabilities)
	}
}

func TestWorkflowEndpointSteersNodeScopedRun(t *testing.T) {
	handler := newScriptedWorkflowHandler(t)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	definition := postJSON[orchestrator.WorkflowDefinition](t, handler, "/workflows/definitions/create", CreateWorkflowDefinitionRequest{
		WorkspaceID: opened.Workspace.ID,
		Name:        "Steered trajectory workflow",
		Graph:       httpWorkflowHoldGraph(),
	}, http.StatusOK)
	started := postJSON[orchestrator.WorkflowExecution](t, handler, "/workflows/executions/start", StartWorkflowExecutionRequest{
		WorkspaceID:  opened.Workspace.ID,
		DefinitionID: definition.ID,
	}, http.StatusOK)
	work := latestHTTPNodeExecution(t, started, "work")

	page := waitForHTTPWorkflowNodeTrajectory(t, handler, opened.Workspace.ID, started.ID, work.ID, func(page orchestrator.WorkflowAgentTrajectoryPage) bool {
		return page.Capabilities.CanSteer
	})
	steered := postJSON[chat.SteerMessageResult](t, handler, "/workflows/nodes/runs/steer", SteerWorkflowNodeRunRequest{
		WorkspaceID:     opened.Workspace.ID,
		ExecutionID:     started.ID,
		NodeExecutionID: work.ID,
		Input:           chat.TextChatInput("finish HTTP node steering"),
	}, http.StatusOK)
	if steered.Run.ID != page.RunID || steered.UserMessage.RunID != page.RunID || steered.UserMessage.Delivery != chat.MessageDeliverySteering {
		t.Fatalf("steering result = %+v, want steering for run %s", steered, page.RunID)
	}
	completed := waitForHTTPWorkflowStatus(t, handler, opened.Workspace.ID, started.ID, orchestrator.ExecutionStatusCompleted)
	completedWork := latestHTTPNodeExecution(t, completed, "work")
	if completedWork.ID != work.ID || completedWork.Status != orchestrator.NodeExecutionStatusSucceeded {
		t.Fatalf("completed node = %+v, want succeeded node %s", completedWork, work.ID)
	}
	terminalPage := postJSON[orchestrator.WorkflowAgentTrajectoryPage](t, handler, "/workflows/nodes/trajectory", ReadWorkflowNodeTrajectoryRequest{
		WorkspaceID:     opened.Workspace.ID,
		ExecutionID:     completed.ID,
		NodeExecutionID: completedWork.ID,
		TranscriptLimit: 20,
		OutputLimit:     5,
	}, http.StatusOK)
	if terminalPage.ActiveRun != nil || terminalPage.Capabilities.CanSteer {
		t.Fatalf("terminal trajectory = active %+v capabilities %+v, want no active steering", terminalPage.ActiveRun, terminalPage.Capabilities)
	}
	if !httpTrajectoryBlocksContainAssistantText(terminalPage.Blocks, "Steered with finish HTTP node steering.") {
		t.Fatalf("terminal trajectory blocks = %+v, want steered assistant text", terminalPage.Blocks)
	}
}

func TestWorkflowEndpointRetriesNodeRunLiveness(t *testing.T) {
	handler := newScriptedWorkflowHandler(t)
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: t.TempDir()}, http.StatusOK)
	definition := postJSON[orchestrator.WorkflowDefinition](t, handler, "/workflows/definitions/create", CreateWorkflowDefinitionRequest{
		WorkspaceID: opened.Workspace.ID,
		Name:        "Retry trajectory workflow",
		Graph:       httpWorkflowHoldGraph(),
	}, http.StatusOK)
	started := postJSON[orchestrator.WorkflowExecution](t, handler, "/workflows/executions/start", StartWorkflowExecutionRequest{
		WorkspaceID:  opened.Workspace.ID,
		DefinitionID: definition.ID,
	}, http.StatusOK)
	work := latestHTTPNodeExecution(t, started, "work")

	page := waitForHTTPWorkflowNodeTrajectory(t, handler, opened.Workspace.ID, started.ID, work.ID, func(page orchestrator.WorkflowAgentTrajectoryPage) bool {
		return page.ActiveRunLiveness != nil && page.ActiveRunLiveness.Status == chat.RunLivenessAttached
	})
	reconciled := postJSON[ReconcileChatRunsResponse](t, handler, "/chat/runs/reconcile", ReconcileChatRunsRequest{
		WorkspaceID:    opened.Workspace.ID,
		ConversationID: page.ConversationID,
		Reason:         chat.RunLivenessReasonStreamResync,
	}, http.StatusOK)
	if len(reconciled.Result.Runs) != 1 || reconciled.Result.Runs[0].RunID != page.RunID || reconciled.Result.Runs[0].Reason != chat.RunLivenessReasonStreamResync {
		t.Fatalf("stream reconcile = %+v, want stream resync for %s", reconciled.Result.Runs, page.RunID)
	}
	retryablePage := postJSON[orchestrator.WorkflowAgentTrajectoryPage](t, handler, "/workflows/nodes/trajectory", ReadWorkflowNodeTrajectoryRequest{
		WorkspaceID:     opened.Workspace.ID,
		ExecutionID:     started.ID,
		NodeExecutionID: work.ID,
		TranscriptLimit: 20,
		OutputLimit:     5,
	}, http.StatusOK)
	if !retryablePage.Capabilities.CanRetryLiveness {
		t.Fatalf("retryable trajectory capabilities = %+v, want retry liveness", retryablePage.Capabilities)
	}

	retried := postJSON[chat.RunLivenessReconciliationResult](t, handler, "/workflows/nodes/runs/retry-liveness", RetryWorkflowNodeRunLivenessRequest{
		WorkspaceID:     opened.Workspace.ID,
		ExecutionID:     started.ID,
		NodeExecutionID: work.ID,
	}, http.StatusOK)
	if len(retried.Runs) != 1 || retried.Runs[0].RunID != page.RunID || retried.Runs[0].Reason != chat.RunLivenessReasonUserRetry {
		t.Fatalf("retried liveness = %+v, want user retry for %s", retried.Runs, page.RunID)
	}

	stopped := postJSON[orchestrator.WorkflowExecution](t, handler, "/workflows/nodes/runs/stop", StopWorkflowNodeRunRequest{
		WorkspaceID:     opened.Workspace.ID,
		ExecutionID:     started.ID,
		NodeExecutionID: work.ID,
	}, http.StatusOK)
	if stopped.Status != orchestrator.ExecutionStatusCancelled {
		t.Fatalf("stopped execution status = %s, want cancelled", stopped.Status)
	}
}

func TestWorkflowEventStreamPushesWorkflowEvents(t *testing.T) {
	handler := newChatHandler(t, nil)
	server := httptest.NewServer(handler)
	defer server.Close()

	workspaceRoot := t.TempDir()
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: workspaceRoot}, http.StatusOK)
	definition := postJSON[orchestrator.WorkflowDefinition](t, handler, "/workflows/definitions/create", CreateWorkflowDefinitionRequest{
		WorkspaceID: opened.Workspace.ID,
		Name:        "Stream workflow",
		Graph:       httpWorkflowActionGraph(),
	}, http.StatusOK)

	response, err := http.Get(server.URL + "/workflows/events")
	if err != nil {
		t.Fatalf("open workflow event stream: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("event stream status = %d, want 200", response.StatusCode)
	}

	started := postJSON[orchestrator.WorkflowExecution](t, handler, "/workflows/executions/start", StartWorkflowExecutionRequest{
		WorkspaceID:  opened.Workspace.ID,
		DefinitionID: definition.ID,
	}, http.StatusOK)
	event := readServerSentWorkflowEvent(t, bufio.NewReader(response.Body))
	if event.ExecutionID != started.ID {
		t.Fatalf("event execution id = %s, want %s", event.ExecutionID, started.ID)
	}
	if event.Type != orchestrator.EventExecutionStarted {
		t.Fatalf("event type = %s, want %s", event.Type, orchestrator.EventExecutionStarted)
	}
}

func TestWorkflowEventStreamReplaysFromLastEventID(t *testing.T) {
	handler := newChatHandler(t, nil)
	server := httptest.NewServer(handler)
	defer server.Close()

	workspaceRoot := t.TempDir()
	opened := postJSON[OpenWorkspaceResponse](t, handler, "/workspaces/open", OpenWorkspaceRequest{RootPath: workspaceRoot}, http.StatusOK)
	definition := postJSON[orchestrator.WorkflowDefinition](t, handler, "/workflows/definitions/create", CreateWorkflowDefinitionRequest{
		WorkspaceID: opened.Workspace.ID,
		Name:        "Replay workflow",
		Graph:       httpWorkflowActionGraph(),
	}, http.StatusOK)
	started := postJSON[orchestrator.WorkflowExecution](t, handler, "/workflows/executions/start", StartWorkflowExecutionRequest{
		WorkspaceID:  opened.Workspace.ID,
		DefinitionID: definition.ID,
	}, http.StatusOK)

	response, err := http.Get(server.URL + "/workflows/events?lastEventId=workflow_events:1")
	if err != nil {
		t.Fatalf("open workflow event replay stream: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		t.Fatalf("event stream status = %d, want 200", response.StatusCode)
	}

	event := readServerSentWorkflowEvent(t, bufio.NewReader(response.Body))
	if event.ExecutionID != started.ID {
		t.Fatalf("replayed event execution id = %s, want %s", event.ExecutionID, started.ID)
	}
	if event.Ordinal != 2 || event.Type != orchestrator.EventNodeScheduled {
		t.Fatalf("replayed event ordinal/type = %d/%s, want 2/%s", event.Ordinal, event.Type, orchestrator.EventNodeScheduled)
	}
}

func httpWorkflowActionGraph() orchestrator.WorkflowGraph {
	return orchestrator.WorkflowGraph{
		Nodes: []orchestrator.WorkflowNode{
			{ID: "start", Kind: orchestrator.NodeKindStart},
			{
				ID:   "work",
				Kind: orchestrator.NodeKindAction,
				Action: &orchestrator.WorkflowActionConfig{
					Kind:  orchestrator.ActionKindAgentCodex,
					Codex: &orchestrator.WorkflowCodexActionConfig{Prompt: "review the workspace"},
				},
			},
			{ID: "end", Kind: orchestrator.NodeKindEnd},
		},
		Edges: []orchestrator.WorkflowEdge{
			{ID: "start_work", FromNodeID: "start", ToNodeID: "work", Kind: orchestrator.EdgeKindNormal},
			{ID: "work_end", FromNodeID: "work", ToNodeID: "end", Kind: orchestrator.EdgeKindNormal},
		},
	}
}

func httpWorkflowStartEndGraph() orchestrator.WorkflowGraph {
	return orchestrator.WorkflowGraph{
		Nodes: []orchestrator.WorkflowNode{
			{ID: "start", Kind: orchestrator.NodeKindStart},
			{ID: "end", Kind: orchestrator.NodeKindEnd},
		},
		Edges: []orchestrator.WorkflowEdge{
			{ID: "start_end", FromNodeID: "start", ToNodeID: "end", Kind: orchestrator.EdgeKindNormal},
		},
	}
}

func httpWorkflowApprovalGraph() orchestrator.WorkflowGraph {
	graph := httpWorkflowActionGraph()
	for index := range graph.Nodes {
		if graph.Nodes[index].ID != "work" {
			continue
		}
		graph.Nodes[index].Action.Codex.Prompt = "command approval workflow"
	}
	return graph
}

func httpWorkflowHoldGraph() orchestrator.WorkflowGraph {
	graph := httpWorkflowActionGraph()
	for index := range graph.Nodes {
		if graph.Nodes[index].ID != "work" {
			continue
		}
		graph.Nodes[index].Action.Codex.Prompt = "workflow hold for queue and steering"
		graph.Nodes[index].Action.Codex.FreshConversation = true
	}
	return graph
}

func newScriptedWorkflowHandler(t *testing.T) http.Handler {
	t.Helper()
	appDataDir := t.TempDir()
	store, err := appstate.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new app store: %v", err)
	}
	manager, err := workspace.NewManager(
		filepath.Dir(store.Path()),
		workspace.WithClock(func() time.Time {
			return mustTime(t, "2026-05-29T20:00:00Z")
		}),
	)
	if err != nil {
		t.Fatalf("new workspace manager: %v", err)
	}
	workspaceService, err := workspacesession.NewService(store, manager)
	if err != nil {
		t.Fatalf("new workspace service: %v", err)
	}
	chatStore, err := chat.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new chat store: %v", err)
	}
	chatService, err := chat.NewService(chatStore, workspaceService, chat.NewScriptedWorkflowHarness())
	if err != nil {
		t.Fatalf("new chat service: %v", err)
	}
	workflowStore, err := orchestrator.NewStore(appDataDir)
	if err != nil {
		t.Fatalf("new workflow store: %v", err)
	}
	t.Cleanup(func() {
		if err := workflowStore.Close(); err != nil {
			t.Fatalf("close workflow store: %v", err)
		}
	})
	workflowService, err := orchestrator.NewService(workflowStore, workspaceService, orchestrator.WithCodexChatService(chatService))
	if err != nil {
		t.Fatalf("new workflow service: %v", err)
	}
	t.Cleanup(workflowService.CloseEvents)
	return NewHandler(HandlerConfig{
		ChatService:      chatService,
		Metadata:         BackendMetadata{Name: BackendName, Version: "test"},
		WorkspaceService: workspaceService,
		WorkflowService:  workflowService,
	})
}

func waitForHTTPWorkflowNodeStatus(t *testing.T, handler http.Handler, workspaceID string, executionID string, nodeID string, status orchestrator.WorkflowNodeExecutionStatus) orchestrator.WorkflowExecution {
	t.Helper()
	return waitForHTTPWorkflow(t, handler, workspaceID, executionID, func(execution orchestrator.WorkflowExecution) bool {
		nodeExecution := latestHTTPNodeExecution(t, execution, nodeID)
		return nodeExecution.Status == status
	})
}

func waitForHTTPWorkflowStatus(t *testing.T, handler http.Handler, workspaceID string, executionID string, status orchestrator.WorkflowExecutionStatus) orchestrator.WorkflowExecution {
	t.Helper()
	return waitForHTTPWorkflow(t, handler, workspaceID, executionID, func(execution orchestrator.WorkflowExecution) bool {
		return execution.Status == status
	})
}

func waitForHTTPWorkflow(t *testing.T, handler http.Handler, workspaceID string, executionID string, matches func(orchestrator.WorkflowExecution) bool) orchestrator.WorkflowExecution {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	var execution orchestrator.WorkflowExecution
	for time.Now().Before(deadline) {
		execution = postJSON[orchestrator.WorkflowExecution](t, handler, "/workflows/executions/read", ReadWorkflowExecutionRequest{
			WorkspaceID: workspaceID,
			ExecutionID: executionID,
		}, http.StatusOK)
		if matches(execution) {
			return execution
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for workflow execution %s, last state %+v", executionID, execution)
	return orchestrator.WorkflowExecution{}
}

func waitForHTTPWorkflowNodeTrajectory(t *testing.T, handler http.Handler, workspaceID string, executionID string, nodeExecutionID string, matches func(orchestrator.WorkflowAgentTrajectoryPage) bool) orchestrator.WorkflowAgentTrajectoryPage {
	t.Helper()
	deadline := time.Now().Add(2 * time.Second)
	var page orchestrator.WorkflowAgentTrajectoryPage
	for time.Now().Before(deadline) {
		page = postJSON[orchestrator.WorkflowAgentTrajectoryPage](t, handler, "/workflows/nodes/trajectory", ReadWorkflowNodeTrajectoryRequest{
			WorkspaceID:     workspaceID,
			ExecutionID:     executionID,
			NodeExecutionID: nodeExecutionID,
			TranscriptLimit: 20,
			OutputLimit:     5,
		}, http.StatusOK)
		if matches(page) {
			return page
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for workflow node trajectory %s, last state %+v", nodeExecutionID, page)
	return orchestrator.WorkflowAgentTrajectoryPage{}
}

func latestHTTPNodeExecution(t *testing.T, execution orchestrator.WorkflowExecution, nodeID string) orchestrator.WorkflowNodeExecution {
	t.Helper()
	for index := len(execution.NodeExecutions) - 1; index >= 0; index-- {
		if execution.NodeExecutions[index].NodeID == nodeID {
			return execution.NodeExecutions[index]
		}
	}
	t.Fatalf("node execution for %s was not found in %+v", nodeID, execution.NodeExecutions)
	return orchestrator.WorkflowNodeExecution{}
}

func httpTrajectoryBlocksContainAssistantText(blocks []chat.TranscriptBlock, text string) bool {
	for _, block := range blocks {
		if block.AssistantText != nil && strings.Contains(block.AssistantText.Text, text) {
			return true
		}
	}
	return false
}

func projectedHTTPNode(t *testing.T, projection *orchestrator.WorkflowGraphProjection, nodeID string) orchestrator.WorkflowGraphNode {
	t.Helper()
	for _, node := range projection.Nodes {
		if node.ID == nodeID {
			return node
		}
	}
	t.Fatalf("projected node %s was not found in %+v", nodeID, projection.Nodes)
	return orchestrator.WorkflowGraphNode{}
}

func readServerSentWorkflowEvent(t *testing.T, reader *bufio.Reader) orchestrator.WorkflowEvent {
	t.Helper()
	var data string
	for {
		line, err := reader.ReadString('\n')
		if err != nil {
			t.Fatalf("read workflow event stream line: %v", err)
		}
		line = strings.TrimRight(line, "\r\n")
		if line == "" {
			if data == "" {
				continue
			}
			var event orchestrator.WorkflowEvent
			if err := json.Unmarshal([]byte(data), &event); err != nil {
				t.Fatalf("decode workflow event stream data: %v", err)
			}
			return event
		}
		if strings.HasPrefix(line, "data: ") {
			data = strings.TrimPrefix(line, "data: ")
		}
	}
}

func projectedHTTPNodeStatus(projection *orchestrator.WorkflowGraphProjection, nodeID string) orchestrator.WorkflowGraphNodeStatus {
	for _, node := range projection.Nodes {
		if node.ID == nodeID {
			return node.Status
		}
	}
	return ""
}
