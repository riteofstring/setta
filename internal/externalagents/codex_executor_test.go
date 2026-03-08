package externalagents

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/externalagentconfigs"
	"setta/internal/llmconfig"
	"setta/internal/projectstate"
)

func TestCodexExecutorCompletesRunAndPersistsAssistantOutput(t *testing.T) {
	t.Parallel()

	fixture := newCodexExecutorFixture(t, "complete")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Say hello from Codex"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start codex run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	if got := resolveRunOutputString(persisted, "threadId"); got != "thread-complete" {
		t.Fatalf("expected persisted thread id, got %q", got)
	}
	messages, ok := persisted.Outputs["messages"].([]any)
	if !ok || len(messages) < 2 {
		t.Fatalf("expected persisted output messages, got %#v", persisted.Outputs)
	}
	lastMessage, ok := messages[len(messages)-1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message, got %#v", messages[len(messages)-1])
	}
	if got := extractMessageText(lastMessage); got != "Hello from Codex" {
		t.Fatalf("unexpected assistant text %q", got)
	}
	liveState, err := fixture.runtime.GetLiveChatState(result.Run.ID)
	if err != nil {
		t.Fatalf("get live chat state after completion: %v", err)
	}
	if liveState != nil {
		fixture.waitForLiveStateCleanup(t, result.Run.ID)
	}
}

func TestCodexExecutorRoutesApprovalResponsesThroughRuntime(t *testing.T) {
	t.Parallel()

	fixture := newCodexExecutorFixture(t, "approval")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Request approval before replying"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start codex approval run: %v", err)
	}

	fixture.waitForApproval(t, result.Run.ID, "42")
	if err := fixture.runtime.RespondToApproval("42", true); err != nil {
		t.Fatalf("respond to approval: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	messages, ok := persisted.Outputs["messages"].([]any)
	if !ok || len(messages) == 0 {
		t.Fatalf("expected persisted output messages, got %#v", persisted.Outputs)
	}
	toolResultFound := false
	assistantFound := false
	for _, rawMessage := range messages {
		message, ok := rawMessage.(map[string]any)
		if !ok {
			continue
		}
		role, _ := messageRole(message)
		if role == "tool" && stringValue(message["tool_name"]) == codexApprovalToolName {
			toolResultFound = true
		}
		if role == "assistant" && extractMessageText(message) == "Approval granted" {
			assistantFound = true
		}
	}
	if !toolResultFound {
		t.Fatalf("expected persisted approval tool result, got %#v", messages)
	}
	if !assistantFound {
		t.Fatalf("expected persisted assistant follow-up, got %#v", messages)
	}
	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

type codexExecutorFixture struct {
	send     *SendService
	runtime  *Runtime
	runs     *agentruns.RunStore
	engineID string
}

func newCodexExecutorFixture(t *testing.T, scenario string) codexExecutorFixture {
	t.Helper()

	root := t.TempDir()
	commandPath := writeCodexFixtureCommand(t, scenario)

	engines, err := agentruns.NewEngineStore(root)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	configs, err := externalagentconfigs.NewStore(root)
	if err != nil {
		t.Fatalf("new external config store: %v", err)
	}
	runs, err := agentruns.NewRunStore(root)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	profiles, err := agentprofiles.NewStore(root)
	if err != nil {
		t.Fatalf("new agent profile store: %v", err)
	}
	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": {ID: "project-alpha", Name: "Alpha"},
		},
	})
	if err != nil {
		t.Fatalf("open project runtime: %v", err)
	}

	configID := "external-config"
	if err := configs.Write([]externalagentconfigs.Config{
		{
			ID:                 configID,
			Name:               "Codex fixture",
			ToolType:           externalagentconfigs.ToolTypeCodex,
			RunMode:            externalagentconfigs.RunModeAppServer,
			CommandPath:        &commandPath,
			WorkingDirStrategy: externalagentconfigs.WorkingDirStrategyProjectRoot,
		},
	}); err != nil {
		t.Fatalf("write external configs: %v", err)
	}
	engineID := "engine-external"
	if err := engines.Write([]agentruns.EngineConfig{
		{
			ID:                    engineID,
			Name:                  "External Engine",
			EngineType:            agentruns.EngineTypeExternalAgent,
			ExternalAgentConfigID: &configID,
		},
	}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}

	now := time.Date(2026, 3, 9, 10, 0, 0, 0, time.UTC)
	runtime, err := NewRuntime(RuntimeOptions{
		Runs: runs,
		TimeNow: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	codexExecutor, err := NewCodexExecutor(CodexExecutorOptions{
		Runs:           runs,
		Runtime:        runtime,
		WorkspaceRoot:  root,
		SettaFilesRoot: root,
		ProcessEnv:     llmconfig.CurrentProcessEnv(),
		TimeNow: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new codex executor: %v", err)
	}
	send, err := NewSendService(SendServiceOptions{
		ProjectState: projectRuntime,
		Engines:      engines,
		Runs:         runs,
		Profiles:     profiles,
		Configs:      configs,
		Runtime:      runtime,
		Preflight: stubPreflightChecker{
			status: externalagentconfigs.Status{
				ConfigID:  configID,
				Name:      "Codex fixture",
				ToolType:  externalagentconfigs.ToolTypeCodex,
				RunMode:   externalagentconfigs.RunModeAppServer,
				Supported: true,
				Available: true,
				Issues:    []string{},
			},
		},
		Executor: NewMultiExecutor(MultiExecutorOptions{
			Codex: codexExecutor,
		}),
		TimeNow: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new send service: %v", err)
	}

	return codexExecutorFixture{
		send:     send,
		runtime:  runtime,
		runs:     runs,
		engineID: engineID,
	}
}

func (f codexExecutorFixture) waitForTerminalRun(t *testing.T, runID string) agentruns.Run {
	t.Helper()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		run, err := f.runs.Load(runID)
		if err != nil {
			t.Fatalf("load run %s: %v", runID, err)
		}
		if run.Status == agentruns.RunStatusCompleted || run.Status == agentruns.RunStatusFailed || run.Status == agentruns.RunStatusCancelled {
			return run
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for run %s to reach a terminal state", runID)
	return agentruns.Run{}
}

func (f codexExecutorFixture) waitForLiveStateCleanup(t *testing.T, runID string) {
	t.Helper()

	deadline := time.Now().Add(2 * time.Second)
	for time.Now().Before(deadline) {
		liveState, err := f.runtime.GetLiveChatState(runID)
		if err != nil {
			t.Fatalf("get live state during cleanup wait: %v", err)
		}
		if liveState == nil {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for live state cleanup on %s", runID)
}

func (f codexExecutorFixture) waitForApproval(t *testing.T, runID string, approvalID string) {
	t.Helper()

	deadline := time.Now().Add(5 * time.Second)
	for time.Now().Before(deadline) {
		run, err := f.runs.Load(runID)
		if err != nil {
			t.Fatalf("load run while waiting for approval: %v", err)
		}
		if approvalMessagePresent(run, approvalID) {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for approval %s", approvalID)
}

func writeCodexFixtureCommand(t *testing.T, scenario string) string {
	t.Helper()

	commandPath := filepath.Join(t.TempDir(), "codex-fixture.sh")
	content := fmt.Sprintf("#!/bin/sh\nSETTA_CODEX_FIXTURE=1 SETTA_CODEX_FIXTURE_SCENARIO=%s exec %q -test.run '^TestCodexFixtureProcess$' -- \"$@\"\n", scenario, os.Args[0])
	if err := os.WriteFile(commandPath, []byte(content), 0o755); err != nil {
		t.Fatalf("write codex fixture command: %v", err)
	}
	return commandPath
}

func TestCodexFixtureProcess(t *testing.T) {
	if os.Getenv("SETTA_CODEX_FIXTURE") != "1" {
		return
	}
	if err := runCodexFixtureProcess(os.Getenv("SETTA_CODEX_FIXTURE_SCENARIO")); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}
	os.Exit(0)
}

func runCodexFixtureProcess(scenario string) error {
	reader := bufio.NewScanner(os.Stdin)
	reader.Buffer(make([]byte, 0, 16*1024), codexStdoutBufferSize)
	writer := bufio.NewWriter(os.Stdout)
	defer writer.Flush()

	emit := func(payload map[string]any) error {
		content, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		if _, err := writer.Write(append(content, '\n')); err != nil {
			return err
		}
		return writer.Flush()
	}

	for reader.Scan() {
		line := strings.TrimSpace(reader.Text())
		if line == "" {
			continue
		}
		var payload map[string]any
		if err := json.Unmarshal([]byte(line), &payload); err != nil {
			return fmt.Errorf("decode fixture request: %w", err)
		}
		method := stringValue(payload["method"])
		switch method {
		case "initialize":
			if err := emit(map[string]any{"id": payload["id"], "result": map[string]any{}}); err != nil {
				return err
			}
		case "initialized":
		case "config/mcpServer/reload":
			if err := emit(map[string]any{"id": payload["id"], "result": map[string]any{}}); err != nil {
				return err
			}
		case "thread/start":
			threadID := "thread-" + scenario
			if err := emit(map[string]any{"id": payload["id"], "result": map[string]any{"threadId": threadID}}); err != nil {
				return err
			}
		case "thread/resume":
			params, _ := mapValue(payload["params"])
			threadID := stringValue(params["threadId"])
			if threadID == "" {
				threadID = "thread-" + scenario
			}
			if err := emit(map[string]any{"id": payload["id"], "result": map[string]any{"threadId": threadID}}); err != nil {
				return err
			}
		case "turn/start":
			if err := emit(map[string]any{"id": payload["id"], "result": map[string]any{}}); err != nil {
				return err
			}
			switch scenario {
			case "approval":
				if err := emit(map[string]any{
					"id":     42,
					"method": "item/commandExecution/requestApproval",
					"params": map[string]any{
						"item": map[string]any{
							"type":    "commandExecution",
							"command": "echo approval",
						},
					},
				}); err != nil {
					return err
				}
			default:
				if err := emitAssistantTurn(writer, "assistant-1", "Hello from Codex"); err != nil {
					return err
				}
				return nil
			}
		default:
			if scenario == "approval" && payload["id"] == float64(42) {
				result, _ := mapValue(payload["result"])
				if stringValue(result["decision"]) != "accept" {
					return fmt.Errorf("unexpected approval decision: %#v", payload)
				}
				if err := emitAssistantTurn(writer, "assistant-approval", "Approval granted"); err != nil {
					return err
				}
				return nil
			}
		}
	}
	return reader.Err()
}

func emitAssistantTurn(writer *bufio.Writer, messageID string, text string) error {
	payloads := []map[string]any{
		{
			"method": "item/assistantMessage/delta",
			"params": map[string]any{
				"itemId": messageID,
				"delta":  map[string]any{"text": text},
			},
		},
		{
			"method": "item/completed",
			"params": map[string]any{
				"item": map[string]any{
					"id":      messageID,
					"type":    "assistantMessage",
					"role":    "assistant",
					"content": []any{map[string]any{"text": text}},
				},
			},
		},
		{
			"method": "turn/completed",
			"params": map[string]any{
				"status": "completed",
				"turn":   map[string]any{"status": "completed"},
			},
		},
	}
	for _, payload := range payloads {
		content, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		if _, err := writer.Write(append(content, '\n')); err != nil {
			return err
		}
		if err := writer.Flush(); err != nil {
			return err
		}
	}
	return nil
}

func approvalMessagePresent(run agentruns.Run, approvalID string) bool {
	rawMessages, ok := run.Outputs["messages"].([]any)
	if !ok {
		return false
	}
	for _, rawMessage := range rawMessages {
		message, ok := rawMessage.(map[string]any)
		if !ok {
			continue
		}
		if strings.TrimSpace(stringValue(message["id"])) != approvalID {
			continue
		}
		rawToolCalls, ok := message["tool_calls"].([]any)
		if !ok || len(rawToolCalls) == 0 {
			continue
		}
		return true
	}
	return false
}
