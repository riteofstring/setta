package main

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"path/filepath"
	"testing"
	"time"

	"setta/internal/httpapi"
	"setta/internal/orchestrator"
	"setta/internal/runtime"
)

func TestWorkflowExecutionsResultCommandCompletesRunningAction(t *testing.T) {
	appDataDir := t.TempDir()
	workspaceRoot := t.TempDir()
	resultPath := filepath.Join(t.TempDir(), "result.json")
	deps := testDeps()
	deps.httpClient = &http.Client{Timeout: 5 * time.Second}

	serveDeps := deps
	serveDeps.stdout = io.Discard
	instance, err := startServe(context.Background(), serveOptions{
		AppDataDir:  appDataDir,
		ChatHarness: runtime.ChatHarnessScriptedWorkflow,
		Host:        "127.0.0.1",
		Port:        0,
	}, serveDeps)
	if err != nil {
		t.Fatalf("start serve: %v", err)
	}
	t.Cleanup(func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := instance.Shutdown(ctx); err != nil {
			t.Fatalf("shutdown serve: %v", err)
		}
	})

	opened := openWorkspaceForCLITest(t, deps.httpClient, appDataDir, instance.state.BaseURL, workspaceRoot)
	definition := createWorkflowDefinitionForCLITest(t, deps.httpClient, appDataDir, instance.state.BaseURL, httpapi.CreateWorkflowDefinitionRequest{
		WorkspaceID: opened.Workspace.ID,
		Name:        "Result Flow",
		Description: "CLI execution result test workflow",
		Graph:       cliTestRunningActionWorkflowGraph(),
	})

	var startStdout bytes.Buffer
	commandDeps := deps
	commandDeps.stdout = &startStdout
	if code := runWithDeps([]string{"workflow", "executions", "start", "--app-data-dir", appDataDir, definition.ID}, commandDeps); code != 0 {
		t.Fatalf("start exit code = %d, want 0", code)
	}
	var started orchestrator.WorkflowExecution
	if err := json.NewDecoder(&startStdout).Decode(&started); err != nil {
		t.Fatalf("decode workflow execution start output: %v\noutput:\n%s", err, startStdout.String())
	}
	work := cliTestLatestNodeExecution(t, started, "work")
	writeWorkflowExecutionResultInputForCLITest(t, resultPath, orchestrator.WorkflowExecutionResultInput{
		WorkspaceID:     opened.Workspace.ID,
		ExecutionID:     started.ID,
		NodeExecutionID: work.ID,
		Result: orchestrator.WorkflowActionResult{
			Status:    orchestrator.ActionCompletionCompleted,
			Signals:   []orchestrator.WorkflowActionSignal{{Name: "decision", Value: "exit"}},
			Output:    json.RawMessage(`{"summary":"reported through cli"}`),
			FilePaths: []string{"reports/result.md"},
		},
	})

	var resultStdout bytes.Buffer
	commandDeps.stdout = &resultStdout
	if code := runWithDeps([]string{"workflow", "executions", "result", "--app-data-dir", appDataDir, "--input", resultPath}, commandDeps); code != 0 {
		t.Fatalf("result exit code = %d, want 0", code)
	}
	var completed orchestrator.WorkflowExecution
	if err := json.NewDecoder(&resultStdout).Decode(&completed); err != nil {
		t.Fatalf("decode workflow execution result output: %v\noutput:\n%s", err, resultStdout.String())
	}
	if completed.Status != orchestrator.ExecutionStatusCompleted {
		t.Fatalf("completed execution status = %s, want completed", completed.Status)
	}
	work = cliTestLatestNodeExecution(t, completed, "work")
	if work.Result == nil || work.Result.Status != orchestrator.ActionCompletionCompleted {
		t.Fatalf("work result = %+v, want completed", work.Result)
	}
	if len(work.Result.Signals) != 1 || work.Result.Signals[0] != (orchestrator.WorkflowActionSignal{Name: "decision", Value: "exit"}) {
		t.Fatalf("signals = %+v, want decision=exit", work.Result.Signals)
	}
	var output map[string]string
	if err := json.Unmarshal(work.Result.Output, &output); err != nil {
		t.Fatalf("decode result output: %v", err)
	}
	if output["summary"] != "reported through cli" {
		t.Fatalf("output = %+v, want CLI summary", output)
	}
}
