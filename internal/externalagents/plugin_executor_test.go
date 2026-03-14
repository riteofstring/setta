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

func TestPluginExecutorCompletesRunAndPersistsAssistantOutput(t *testing.T) {
	fixture := newPluginExecutorFixture(t, "complete")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Say hello from plugin"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start plugin run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	if got := resolveRunOutputString(persisted, "sessionId"); got != "session-plugin-complete" {
		t.Fatalf("expected persisted session id, got %q", got)
	}
	messages, ok := persisted.Outputs["messages"].([]any)
	if !ok || len(messages) < 2 {
		t.Fatalf("expected persisted output messages, got %#v", persisted.Outputs)
	}
	lastMessage, ok := messages[len(messages)-1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message, got %#v", messages[len(messages)-1])
	}
	if got := extractMessageText(lastMessage); got != "fixture external adapter reply" {
		t.Fatalf("unexpected assistant text %q", got)
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestPluginExecutorPlainTextFallbackPreservesBlankLines(t *testing.T) {
	fixture := newPluginExecutorFixture(t, "plain_text")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "stream plain text"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start plugin plain-text run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	messages, ok := persisted.Outputs["messages"].([]any)
	if !ok || len(messages) < 2 {
		t.Fatalf("expected persisted output messages, got %#v", persisted.Outputs)
	}
	lastMessage, ok := messages[len(messages)-1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message, got %#v", messages[len(messages)-1])
	}
	if got := extractMessageText(lastMessage); got != "step one\n\nstep two" {
		t.Fatalf("unexpected plain-text assistant text %q", got)
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestPluginExecutorRoutesApprovalResponsesThroughRuntime(t *testing.T) {
	fixture := newPluginExecutorFixture(t, "approval")
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
		t.Fatalf("start plugin approval run: %v", err)
	}

	fixture.waitForApproval(t, result.Run.ID, "approval-1")
	if err := fixture.runtime.RespondToApproval("approval-1", true); err != nil {
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
		if role == "assistant" && extractMessageText(message) == "approval accepted" {
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

type pluginExecutorFixture struct {
	root     string
	send     *SendService
	runtime  *Runtime
	runs     *agentruns.RunStore
	engineID string
}

type stubPluginAdapterProvider struct {
	adapters []externalagentconfigs.PluginExternalAgentAdapter
}

func (s stubPluginAdapterProvider) RegisteredExternalAgentAdapters() ([]externalagentconfigs.PluginExternalAgentAdapter, error) {
	return append([]externalagentconfigs.PluginExternalAgentAdapter(nil), s.adapters...), nil
}

func newPluginExecutorFixture(t *testing.T, scenario string) pluginExecutorFixture {
	t.Helper()

	root := t.TempDir()
	commandPath := writePluginFixtureCommand(t, scenario)

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
	pluginAdapterID := "fixture-plugin:adapter"
	if err := configs.Write([]externalagentconfigs.Config{
		{
			ID:                 configID,
			Name:               "Plugin fixture",
			ToolType:           externalagentconfigs.ToolTypePlugin,
			PluginAdapterID:    &pluginAdapterID,
			RunMode:            externalagentconfigs.RunModeSDK,
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

	now := time.Date(2026, 3, 14, 10, 30, 0, 0, time.UTC)
	runtime, err := NewRuntime(RuntimeOptions{
		Runs: runs,
		TimeNow: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	pluginExecutor, err := NewPluginExecutor(PluginExecutorOptions{
		Runs:          runs,
		Runtime:       runtime,
		WorkspaceRoot: root,
		ProcessEnv:    llmconfig.CurrentProcessEnv(),
		PluginAdapterProvider: stubPluginAdapterProvider{
			adapters: []externalagentconfigs.PluginExternalAgentAdapter{
				{
					AdapterID:    pluginAdapterID,
					PluginID:     "fixture-plugin",
					Name:         "Fixture External Agent",
					RunModes:     []string{"sdk"},
					Command:      commandPath,
					DefaultModel: stringPtr("fixture-model"),
				},
			},
		},
		TimeNow: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new plugin executor: %v", err)
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
				Name:      "Plugin fixture",
				ToolType:  externalagentconfigs.ToolTypePlugin,
				RunMode:   externalagentconfigs.RunModeSDK,
				Supported: true,
				Available: true,
				Issues:    []string{},
			},
		},
		Executor: NewMultiExecutor(MultiExecutorOptions{
			Plugin: pluginExecutor,
		}),
		TimeNow: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new send service: %v", err)
	}

	return pluginExecutorFixture{
		root:     root,
		send:     send,
		runtime:  runtime,
		runs:     runs,
		engineID: engineID,
	}
}

func (f pluginExecutorFixture) waitForTerminalRun(t *testing.T, runID string) agentruns.Run {
	t.Helper()

	deadline := time.Now().Add(executorFixtureTerminalTimeout)
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

func (f pluginExecutorFixture) waitForLiveStateCleanup(t *testing.T, runID string) {
	t.Helper()

	deadline := time.Now().Add(executorFixtureCleanupTimeout)
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

func (f pluginExecutorFixture) waitForApproval(t *testing.T, runID string, approvalID string) {
	t.Helper()

	deadline := time.Now().Add(executorFixtureEventTimeout)
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

func writePluginFixtureCommand(t *testing.T, scenario string) string {
	t.Helper()

	commandPath := filepath.Join(t.TempDir(), "plugin-fixture.sh")
	content := fmt.Sprintf("#!/bin/sh\nSETTA_PLUGIN_FIXTURE=1 SETTA_PLUGIN_FIXTURE_SCENARIO=%s exec %q -test.run '^TestPluginFixtureProcess$' -- \"$@\"\n", scenario, os.Args[0])
	if err := os.WriteFile(commandPath, []byte(content), 0o755); err != nil {
		t.Fatalf("write plugin fixture command: %v", err)
	}
	return commandPath
}

func TestPluginFixtureProcess(t *testing.T) {
	if os.Getenv("SETTA_PLUGIN_FIXTURE") != "1" {
		return
	}
	if err := runPluginFixtureProcess(os.Getenv("SETTA_PLUGIN_FIXTURE_SCENARIO")); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}
	os.Exit(0)
}

func runPluginFixtureProcess(scenario string) error {
	reader := bufio.NewScanner(os.Stdin)
	reader.Buffer(make([]byte, 0, 16*1024), pluginStdoutBufferSize)
	writer := bufio.NewWriter(os.Stdout)
	defer writer.Flush()

	readPayload := func() (map[string]any, error) {
		for reader.Scan() {
			line := strings.TrimSpace(reader.Text())
			if line == "" {
				continue
			}
			payload := map[string]any{}
			if err := json.Unmarshal([]byte(line), &payload); err != nil {
				return nil, fmt.Errorf("decode plugin fixture payload: %w", err)
			}
			return payload, nil
		}
		if err := reader.Err(); err != nil {
			return nil, err
		}
		return nil, fmt.Errorf("plugin fixture did not receive start payload")
	}

	emitJSON := func(payload map[string]any) error {
		content, err := json.Marshal(payload)
		if err != nil {
			return err
		}
		if _, err := writer.Write(append(content, '\n')); err != nil {
			return err
		}
		return writer.Flush()
	}

	emitPlain := func(line string) error {
		if _, err := writer.WriteString(line + "\n"); err != nil {
			return err
		}
		return writer.Flush()
	}

	startPayload, err := readPayload()
	if err != nil {
		return err
	}
	if strings.TrimSpace(stringValue(startPayload["type"])) != "setta_external_agent_start" {
		return fmt.Errorf("expected setta_external_agent_start payload, got %#v", startPayload)
	}
	if strings.TrimSpace(stringValue(startPayload["adapterId"])) != "fixture-plugin:adapter" {
		return fmt.Errorf("unexpected adapter id %#v", startPayload["adapterId"])
	}
	if strings.TrimSpace(stringValue(startPayload["model"])) != "fixture-model" {
		return fmt.Errorf("expected adapter default model in start payload, got %#v", startPayload["model"])
	}

	switch scenario {
	case "approval":
		if err := emitJSON(map[string]any{
			"type":       "approval_request",
			"approvalId": "approval-1",
			"tool":       map[string]any{"name": "shell"},
			"input":      map[string]any{"command": "echo approval"},
		}); err != nil {
			return err
		}
		payload, err := readPayload()
		if err != nil {
			return err
		}
		if strings.TrimSpace(stringValue(payload["type"])) != "approval_response" {
			return fmt.Errorf("expected approval_response, got %#v", payload)
		}
		if strings.TrimSpace(stringValue(payload["approvalId"])) != "approval-1" || payload["approved"] != true {
			return fmt.Errorf("unexpected approval response %#v", payload)
		}
		if err := emitJSON(map[string]any{
			"type": "message",
			"text": "approval accepted",
		}); err != nil {
			return err
		}
		if err := emitJSON(map[string]any{
			"type":      "session",
			"sessionId": "session-plugin-approval",
		}); err != nil {
			return err
		}
		return emitJSON(map[string]any{
			"type":       "done",
			"returnCode": 0,
		})
	case "plain_text":
		if err := emitPlain("step one"); err != nil {
			return err
		}
		if err := emitPlain(""); err != nil {
			return err
		}
		if err := emitPlain("step two"); err != nil {
			return err
		}
		return emitJSON(map[string]any{
			"type":      "done",
			"sessionId": "session-plugin-plain",
		})
	default:
		if err := emitJSON(map[string]any{
			"type": "message",
			"text": "fixture external adapter reply",
		}); err != nil {
			return err
		}
		if err := emitJSON(map[string]any{
			"type":      "session",
			"sessionId": "session-plugin-complete",
		}); err != nil {
			return err
		}
		return emitJSON(map[string]any{
			"type":       "done",
			"returnCode": 0,
		})
	}
}
