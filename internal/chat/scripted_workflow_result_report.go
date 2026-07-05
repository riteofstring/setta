package chat

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

type scriptedWorkflowSignal struct {
	Name  string `json:"name"`
	Value string `json:"value"`
}

type scriptedWorkflowResultReportInput struct {
	WorkspaceID     string                             `json:"workspaceId"`
	ExecutionID     string                             `json:"executionId"`
	NodeExecutionID string                             `json:"nodeExecutionId"`
	Result          scriptedWorkflowResultReportResult `json:"result"`
}

type scriptedWorkflowResultReportResult struct {
	Status    string                   `json:"status"`
	Signals   []scriptedWorkflowSignal `json:"signals"`
	Output    json.RawMessage          `json:"output"`
	FilePaths []string                 `json:"filePaths"`
	Error     string                   `json:"error,omitempty"`
}

func (harness *ScriptedWorkflowHarness) reportScriptedWorkflowTurnResult(ctx context.Context, request TurnRequest, completion TurnCompletion) error {
	if request.Conversation.Workflow == nil || scriptedWorkflowPromptMatches(chatInputText(request.Input), "phase4 consolidator workflow") {
		return nil
	}
	status := completion.Outcome
	if status == "" {
		status = TurnOutcomeFailed
	}
	payload, err := scriptedWorkflowResultPayload(request, status, completion.ErrorMessage, nil, nil)
	if err != nil {
		return err
	}
	return harness.reportScriptedWorkflowResultPayload(ctx, payload)
}

func (harness *ScriptedWorkflowHarness) reportScriptedWorkflowResult(ctx context.Context, request TurnRequest, status TurnOutcome, errorMessage string, signals []scriptedWorkflowSignal, output json.RawMessage) error {
	payload, err := scriptedWorkflowResultPayload(request, status, errorMessage, signals, output)
	if err != nil {
		return err
	}
	return harness.reportScriptedWorkflowResultPayload(ctx, payload)
}

func scriptedWorkflowResultPayload(request TurnRequest, status TurnOutcome, errorMessage string, signals []scriptedWorkflowSignal, output json.RawMessage) (json.RawMessage, error) {
	workflow := request.Conversation.Workflow
	if workflow == nil {
		return nil, fmt.Errorf("workflow metadata is required to report scripted workflow result for run %s", request.Run.ID)
	}
	input := scriptedWorkflowResultReportInput{
		WorkspaceID:     request.Workspace.ID,
		ExecutionID:     workflow.ExecutionID,
		NodeExecutionID: workflow.NodeExecutionID,
		Result: scriptedWorkflowResultReportResult{
			Error:     errorMessage,
			FilePaths: []string{},
			Signals:   append([]scriptedWorkflowSignal{}, signals...),
			Status:    string(status),
		},
	}
	if len(output) > 0 {
		input.Result.Output = append(json.RawMessage{}, output...)
	}
	payload, err := json.MarshalIndent(input, "", "  ")
	if err != nil {
		return nil, fmt.Errorf("encode scripted workflow result input: %w", err)
	}
	return payload, nil
}

func (harness *ScriptedWorkflowHarness) reportScriptedWorkflowResultPayload(ctx context.Context, payload json.RawMessage) error {
	if harness.appDataDir == "" {
		return errors.New("scripted workflow harness app data dir is required to report workflow result")
	}
	if reporter := harness.scriptedWorkflowResultReporter(); reporter != nil {
		return reporter(ctx, payload)
	}
	inputPath, cleanup, err := writeScriptedWorkflowResultInput(payload)
	if err != nil {
		return err
	}
	defer cleanup()
	return runSettaWorkflowResultCommand(ctx, harness.appDataDir, inputPath)
}

func (harness *ScriptedWorkflowHarness) scriptedWorkflowResultReporter() ScriptedWorkflowResultReporter {
	harness.mu.Lock()
	defer harness.mu.Unlock()
	reporter := harness.workflowResultReporter
	return reporter
}

func writeScriptedWorkflowResultInput(payload json.RawMessage) (string, func(), error) {
	file, err := os.CreateTemp("", "setta-workflow-result-*.json")
	if err != nil {
		return "", nil, fmt.Errorf("create scripted workflow result input: %w", err)
	}
	inputPath := file.Name()
	cleanup := func() { _ = os.Remove(inputPath) }
	_, writeErr := file.Write(append(payload, '\n'))
	closeErr := file.Close()
	if writeErr != nil {
		cleanup()
		return "", nil, fmt.Errorf("write scripted workflow result input %s: %w", inputPath, writeErr)
	}
	if closeErr != nil {
		cleanup()
		return "", nil, fmt.Errorf("close scripted workflow result input %s: %w", inputPath, closeErr)
	}
	return inputPath, cleanup, nil
}

func runSettaWorkflowResultCommand(ctx context.Context, appDataDir string, inputPath string) error {
	repoRoot, err := scriptedWorkflowRepoRoot()
	if err != nil {
		return err
	}
	command := exec.CommandContext(
		ctx,
		filepath.Join(repoRoot, "scripts", "go.sh"),
		"run",
		"./cmd/setta",
		"workflow",
		"executions",
		"result",
		"--app-data-dir",
		appDataDir,
		"--input",
		inputPath,
	)
	command.Dir = repoRoot
	command.Env = os.Environ()
	var outputBuffer bytes.Buffer
	command.Stdout = &outputBuffer
	command.Stderr = &outputBuffer
	if err := command.Run(); err != nil {
		message := strings.TrimSpace(outputBuffer.String())
		if message == "" {
			message = err.Error()
		}
		return fmt.Errorf("report scripted workflow result through setta CLI: %s", message)
	}
	return nil
}

func scriptedWorkflowRepoRoot() (string, error) {
	dir, err := os.Getwd()
	if err != nil {
		return "", fmt.Errorf("read current directory for scripted workflow result: %w", err)
	}
	for {
		if _, err := os.Stat(filepath.Join(dir, "scripts", "go.sh")); err == nil {
			if _, err := os.Stat(filepath.Join(dir, "cmd", "setta")); err == nil {
				return dir, nil
			}
		}
		parent := filepath.Dir(dir)
		if parent == dir {
			return "", errors.New("repository root with scripts/go.sh and cmd/setta was not found")
		}
		dir = parent
	}
}
