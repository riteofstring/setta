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
	"setta/internal/auth"
	"setta/internal/externalagentconfigs"
	"setta/internal/llmconfig"
	"setta/internal/mcpx"
	"setta/internal/projectstate"
	"setta/internal/settingsstate"
	"setta/internal/tools"

	toml "github.com/pelletier/go-toml/v2"
)

type codexExecutorFixture struct {
	root           string
	configID       string
	send           *SendService
	runtime        *Runtime
	runs           *agentruns.RunStore
	profiles       *agentprofiles.Store
	engineID       string
	settaToolNames []string
}

func newCodexExecutorFixture(t *testing.T, scenario string) codexExecutorFixture {
	t.Helper()
	return newCodexExecutorFixtureWithOptions(t, scenario, codexExecutorFixtureOptions{})
}

type codexExecutorFixtureOptions struct {
	toolDispatchTimeout  time.Duration
	toolResultTimeout    time.Duration
	watchdogPollInterval time.Duration
}

func newCodexExecutorFixtureWithOptions(t *testing.T, scenario string, options codexExecutorFixtureOptions) codexExecutorFixture {
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
	settaToolRegistry := newCodexTestToolRegistry(
		t,
		"create_top_level_section",
		"getProjectState",
		"set_agentic_context",
	)
	codexExecutor, err := NewCodexExecutor(CodexExecutorOptions{
		Runs:               runs,
		Runtime:            runtime,
		WorkspaceRoot:      root,
		SettaFilesRoot:     root,
		SettaToolRegistry:  settaToolRegistry,
		CurrentSession:     &auth.CurrentSession{Metadata: auth.SessionMetadata{ID: "session-1"}, Secret: []byte("fixture-secret")},
		AuthCookieBaseName: auth.DefaultAuthCookieName,
		ProcessEnv:         llmconfig.CurrentProcessEnv(),
		TimeNow: func() time.Time {
			return now
		},
		ToolDispatchTimeout:  options.toolDispatchTimeout,
		ToolResultTimeout:    options.toolResultTimeout,
		WatchdogPollInterval: options.watchdogPollInterval,
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
		root:     root,
		configID: configID,
		send:     send,
		runtime:  runtime,
		runs:     runs,
		profiles: profiles,
		engineID: engineID,
		settaToolNames: []string{
			"create_top_level_section",
			"getProjectState",
			"set_agentic_context",
		},
	}
}

func newCodexTestToolRegistry(t *testing.T, names ...string) *tools.Registry {
	t.Helper()

	registry := tools.NewRegistry()
	for _, name := range names {
		if _, err := registry.Register(tools.Spec{
			Name: name,
			Metadata: tools.Metadata{
				Kind: tools.KindDiscoverable,
			},
			Handler: func(context.Context, map[string]any) (any, error) {
				return nil, nil
			},
		}); err != nil {
			t.Fatalf("register codex test tool %q: %v", name, err)
		}
	}
	return registry
}

func readCodexRuntimeConfig(t *testing.T, root string, configID string, chatID string) map[string]any {
	t.Helper()

	configPath := filepath.Join(
		root,
		codexSettingsRootName,
		"codex",
		configID,
		"sessions",
		chatID,
		codexConfigFileName,
	)
	content, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read runtime codex config: %v", err)
	}
	runtimeConfig := map[string]any{}
	if err := toml.Unmarshal(content, &runtimeConfig); err != nil {
		t.Fatalf("decode runtime codex config: %v", err)
	}
	return runtimeConfig
}

func (f codexExecutorFixture) waitForTerminalRun(t *testing.T, runID string) agentruns.Run {
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

func (f codexExecutorFixture) waitForRunUsage(t *testing.T, runID string) map[string]any {
	t.Helper()

	deadline := time.Now().Add(executorFixtureEventTimeout)
	for time.Now().Before(deadline) {
		run, err := f.runs.Load(runID)
		if err != nil {
			t.Fatalf("load run %s while waiting for usage: %v", runID, err)
		}
		if usage, ok := run.Outputs["usage"].(map[string]any); ok && usage != nil {
			return usage
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for run %s usage payload", runID)
	return nil
}

func (f codexExecutorFixture) waitForPendingToolCall(t *testing.T, runID string, toolCallID string) {
	t.Helper()

	deadline := time.Now().Add(executorFixtureEventTimeout)
	for time.Now().Before(deadline) {
		liveState, err := f.runtime.GetLiveChatState(runID)
		if err != nil {
			t.Fatalf("get live state while waiting for pending tool call: %v", err)
		}
		if liveState != nil {
			if rawArguments := strings.TrimSpace(liveState.ToolCallArguments[toolCallID]); rawArguments != "" {
				return
			}
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for pending tool call %s on run %s", toolCallID, runID)
}

func writeCodexCompletionGuardSetting(t *testing.T, root string, enabled bool) {
	t.Helper()

	settingsStore, err := settingsstate.NewStore(filepath.Join(root, settingsstate.DefaultFileName), settingsstate.StoreOptions{})
	if err != nil {
		t.Fatalf("open settings store: %v", err)
	}
	document, err := settingsstate.DefaultDocument()
	if err != nil {
		t.Fatalf("new settings document: %v", err)
	}
	document["backend"].(map[string]any)["completionGuardEnabled"] = enabled
	if err := settingsStore.Save(context.Background(), document); err != nil {
		t.Fatalf("save settings document: %v", err)
	}
}

func stringSliceValue(raw any) []string {
	switch typed := raw.(type) {
	case []string:
		return append([]string(nil), typed...)
	case []any:
		values := make([]string, 0, len(typed))
		for _, entry := range typed {
			text, ok := entry.(string)
			if !ok {
				return nil
			}
			values = append(values, text)
		}
		return values
	default:
		return nil
	}
}

func equalStringSlices(left []string, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func (f codexExecutorFixture) waitForLiveStateCleanup(t *testing.T, runID string) {
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

func (f codexExecutorFixture) waitForPersistedExternalMCPStatusState(t *testing.T, runID string, expectedState mcpx.RuntimeState) mcpx.ServerRuntimeStatus {
	t.Helper()

	deadline := time.Now().Add(executorFixtureCleanupTimeout)
	for time.Now().Before(deadline) {
		run, err := f.runs.Load(runID)
		if err != nil {
			t.Fatalf("load run while waiting for MCP status snapshot: %v", err)
		}
		statuses := loadExternalMCPStatusSnapshot(run.Outputs)
		if len(statuses) == 1 && statuses[0].State == expectedState {
			return statuses[0]
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for run %s MCP snapshot state %q", runID, expectedState)
	return mcpx.ServerRuntimeStatus{}
}

func (f codexExecutorFixture) waitForApproval(t *testing.T, runID string, approvalID string) {
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
	fixture := &codexFixtureProcess{scenario: scenario, writer: writer}

	for reader.Scan() {
		done, err := fixture.handleLine(reader.Text())
		if err != nil {
			return err
		}
		if done {
			return nil
		}
	}
	return reader.Err()
}

type codexFixtureProcess struct {
	scenario           string
	writer             *bufio.Writer
	mcpStatusListCount int
}

func (f *codexFixtureProcess) handleLine(rawLine string) (bool, error) {
	line := strings.TrimSpace(rawLine)
	if line == "" {
		return false, nil
	}
	var payload map[string]any
	if err := json.Unmarshal([]byte(line), &payload); err != nil {
		return false, fmt.Errorf("decode fixture request: %w", err)
	}
	switch stringValue(payload["method"]) {
	case "initialize":
		return false, f.handleInitialize(payload)
	case "initialized":
		return false, nil
	case "config/mcpServer/reload":
		return false, f.emitResult(payload, map[string]any{})
	case "thread/start":
		return false, f.emitResult(payload, map[string]any{"threadId": "thread-" + f.scenario})
	case "thread/resume":
		return false, f.handleThreadResume(payload)
	case "turn/start":
		return f.handleTurnStart(payload)
	case "mcpServerStatus/list":
		return f.handleMCPServerStatusList(payload)
	case "thread/tokenUsage/read", "thread/read":
		return false, fmt.Errorf("unexpected undocumented codex usage read request: %#v", payload)
	default:
		return f.handleDefault(payload)
	}
}

func (f *codexFixtureProcess) emit(payload map[string]any) error {
	content, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if _, err := f.writer.Write(append(content, '\n')); err != nil {
		return err
	}
	return f.writer.Flush()
}

func (f *codexFixtureProcess) emitResult(payload map[string]any, result map[string]any) error {
	return f.emit(map[string]any{"id": payload["id"], "result": result})
}

func (f *codexFixtureProcess) handleInitialize(payload map[string]any) error {
	params, _ := mapValue(payload["params"])
	clientInfo, _ := mapValue(params["clientInfo"])
	if stringValue(clientInfo["name"]) != "setta" {
		return fmt.Errorf("expected initialize clientInfo.name setta, got %#v", clientInfo["name"])
	}
	version := stringValue(clientInfo["version"])
	if version == "" || strings.Contains(strings.ToLower(version), "rewrite") {
		return fmt.Errorf("expected initialize clientInfo.version to use the app version, got %#v", clientInfo["version"])
	}
	return f.emitResult(payload, map[string]any{})
}

func (f *codexFixtureProcess) handleThreadResume(payload map[string]any) error {
	params, _ := mapValue(payload["params"])
	threadID := stringValue(params["threadId"])
	if threadID == "" {
		threadID = "thread-" + f.scenario
	}
	return f.emitResult(payload, map[string]any{"threadId": threadID})
}

func (f *codexFixtureProcess) handleTurnStart(payload map[string]any) (bool, error) {
	if err := f.emitResult(payload, map[string]any{}); err != nil {
		return false, err
	}
	handler, ok := codexFixtureTurnStartHandlers[f.scenario]
	if !ok {
		return true, emitAssistantTurn(f.writer, "assistant-1", "Hello from Codex")
	}
	return handler(f)
}

var codexFixtureTurnStartHandlers = map[string]func(*codexFixtureProcess) (bool, error){
	"approval":              handleCodexFixtureApprovalTurn,
	"rich":                  func(*codexFixtureProcess) (bool, error) { return false, nil },
	"raw":                   handleCodexFixtureRawTurn,
	"env_handoff":           handleCodexFixtureEnvHandoffTurn,
	"usage_stream":          handleCodexFixtureUsageStreamTurn,
	"usage_live":            handleCodexFixtureUsageLiveTurn,
	"usage_missing":         handleCodexFixtureUsageMissingTurn,
	"stalled_tool_call":     handleCodexFixtureStalledToolCallTurn,
	"stalled_raw_tool_call": handleCodexFixtureStalledRawToolCallTurn,
	"slow_status":           handleCodexFixtureSlowStatusTurn,
	"delayed_status":        handleCodexFixtureDelayedStatusTurn,
	"late_status":           handleCodexFixtureLateStatusTurn,
}

func handleCodexFixtureApprovalTurn(f *codexFixtureProcess) (bool, error) {
	return false, f.emit(map[string]any{
		"id":     42,
		"method": "item/commandExecution/requestApproval",
		"params": map[string]any{
			"item": map[string]any{
				"type":    "commandExecution",
				"command": "echo approval",
			},
		},
	})
}

func handleCodexFixtureRawTurn(f *codexFixtureProcess) (bool, error) {
	return true, emitCodexRawTurn(f.writer)
}

func handleCodexFixtureEnvHandoffTurn(f *codexFixtureProcess) (bool, error) {
	codexHome := strings.TrimSpace(os.Getenv("CODEX_HOME"))
	if codexHome == "" {
		return false, fmt.Errorf("missing CODEX_HOME")
	}
	if _, err := os.Stat(filepath.Join(codexHome, codexConfigFileName)); err != nil {
		return false, fmt.Errorf("stat CODEX_HOME config: %w", err)
	}
	return true, emitAssistantTurn(f.writer, "assistant-env", codexHome)
}

func handleCodexFixtureUsageStreamTurn(f *codexFixtureProcess) (bool, error) {
	if err := emitCodexThreadTokenUsageUpdated(f.writer, map[string]any{
		"total": map[string]any{
			"inputTokens":  11,
			"outputTokens": 2,
			"totalTokens":  13,
		},
		"last": map[string]any{
			"contextUsedTokens": 11,
		},
		"modelContextWindow": 272000,
	}); err != nil {
		return false, err
	}
	return true, emitAssistantTurn(f.writer, "assistant-usage", "HELLO")
}

func handleCodexFixtureUsageLiveTurn(f *codexFixtureProcess) (bool, error) {
	if err := emitCodexThreadTokenUsageUpdated(f.writer, map[string]any{
		"total": map[string]any{
			"inputTokens":  23,
			"outputTokens": 5,
			"totalTokens":  28,
		},
		"last": map[string]any{
			"contextUsedTokens": 23,
		},
		"modelContextWindow": 400000,
	}); err != nil {
		return false, err
	}
	time.Sleep(200 * time.Millisecond)
	return true, emitAssistantTurn(f.writer, "assistant-usage-live", "HELLO")
}

func handleCodexFixtureUsageMissingTurn(f *codexFixtureProcess) (bool, error) {
	return true, emitAssistantTurn(f.writer, "assistant-usage", "HELLO")
}

func handleCodexFixtureStalledToolCallTurn(f *codexFixtureProcess) (bool, error) {
	return false, emitCodexStalledToolCall(f.writer)
}

func handleCodexFixtureStalledRawToolCallTurn(f *codexFixtureProcess) (bool, error) {
	return false, emitCodexStalledRawToolCall(f.writer)
}

func handleCodexFixtureSlowStatusTurn(f *codexFixtureProcess) (bool, error) {
	return false, emitAssistantTurn(f.writer, "assistant-slow-status", "Hello from Codex")
}

func handleCodexFixtureDelayedStatusTurn(f *codexFixtureProcess) (bool, error) {
	return false, emitAssistantTurn(f.writer, "assistant-delayed-status", "Hello from Codex")
}

func handleCodexFixtureLateStatusTurn(f *codexFixtureProcess) (bool, error) {
	return false, emitAssistantTurn(f.writer, "assistant-late-status", "Hello from Codex")
}

func (f *codexFixtureProcess) handleMCPServerStatusList(payload map[string]any) (bool, error) {
	f.mcpStatusListCount++
	switch {
	case f.scenario == "rich":
		return f.emitRichMCPStatus(payload)
	case f.scenario == "late_status" && f.mcpStatusListCount > 1:
		return false, f.emit(codexFixtureConnectedMCPStatus(payload["id"]))
	case f.scenario == "delayed_status":
		time.Sleep(2 * time.Second)
		return false, f.emit(codexFixtureConnectedMCPStatus(payload["id"]))
	case f.scenario == "slow_status":
		time.Sleep(4 * time.Second)
	}
	return false, f.emit(map[string]any{"id": payload["id"], "result": map[string]any{"servers": []any{}}})
}

func (f *codexFixtureProcess) emitRichMCPStatus(payload map[string]any) (bool, error) {
	if err := f.emit(codexFixtureConnectedMCPStatus(payload["id"])); err != nil {
		return false, err
	}
	return true, emitCodexRichTurn(f.writer)
}

func codexFixtureConnectedMCPStatus(id any) map[string]any {
	return map[string]any{
		"id": id,
		"result": map[string]any{
			"servers": []any{
				map[string]any{
					"id":        "setta",
					"connected": true,
					"transport": "streamable_http",
					"endpoint":  "http://127.0.0.1:8000/mcp",
					"toolCount": 4,
				},
			},
		},
	}
}

func (f *codexFixtureProcess) handleDefault(payload map[string]any) (bool, error) {
	if f.scenario != "approval" || payload["id"] != float64(42) {
		return false, nil
	}
	result, _ := mapValue(payload["result"])
	if stringValue(result["decision"]) != "accept" {
		return false, fmt.Errorf("unexpected approval decision: %#v", payload)
	}
	return true, emitAssistantTurn(f.writer, "assistant-approval", "Approval granted")
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

func emitCodexThreadTokenUsageUpdated(writer *bufio.Writer, tokenUsage map[string]any) error {
	payload := map[string]any{
		"method": "thread/tokenUsage/updated",
		"params": map[string]any{
			"threadId":   "thread-usage",
			"tokenUsage": tokenUsage,
		},
	}
	content, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if _, err := writer.Write(append(content, '\n')); err != nil {
		return err
	}
	return writer.Flush()
}

func emitCodexRichTurn(writer *bufio.Writer) error {
	payloads := []map[string]any{
		{
			"type": "response_item",
			"payload": map[string]any{
				"type":      "function_call",
				"name":      "mcp__setta__create_top_level_section",
				"arguments": "{\"projectConfigId\":\"project-alpha\",\"implType\":\"Code\"}",
				"call_id":   "call-create",
			},
		},
		{
			"type": "response_item",
			"payload": map[string]any{
				"type":    "function_call_output",
				"call_id": "call-create",
				"output":  "{\"sectionId\":\"section-6\"}",
			},
		},
		{
			"type": "response_item",
			"payload": map[string]any{
				"type": "message",
				"role": "assistant",
				"content": []any{
					map[string]any{
						"type":    "reasoning",
						"summary": []any{map[string]any{"text": "Plan"}},
						"content": []any{map[string]any{"text": "Evaluate the project structure first."}},
					},
					map[string]any{
						"type": "output_text",
						"text": "Created the top-level section.",
					},
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

func emitCodexStalledToolCall(writer *bufio.Writer) error {
	payload := map[string]any{
		"type": "response_item",
		"payload": map[string]any{
			"type":      "function_call",
			"name":      "mcp__setta__create_top_level_section",
			"arguments": "{\"projectConfigId\":\"project-alpha\",\"implType\":\"Callable\"}",
			"call_id":   "call-stalled",
		},
	}
	content, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if _, err := writer.Write(append(content, '\n')); err != nil {
		return err
	}
	return writer.Flush()
}

func emitCodexStalledRawToolCall(writer *bufio.Writer) error {
	payload := map[string]any{
		"method": "item/started",
		"params": map[string]any{
			"item": map[string]any{
				"id":        "call-stalled-raw",
				"type":      "mcpToolCall",
				"server":    "setta",
				"tool":      "create_top_level_section",
				"arguments": map[string]any{"projectConfigId": "project-alpha", "implType": "Callable"},
			},
		},
	}
	content, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	if _, err := writer.Write(append(content, '\n')); err != nil {
		return err
	}
	return writer.Flush()
}

func emitCodexRawTurn(writer *bufio.Writer) error {
	payloads := []map[string]any{
		{
			"method": "turn/started",
			"params": map[string]any{},
		},
		{
			"method": "item/started",
			"params": map[string]any{
				"item": map[string]any{
					"id":   "assistant-raw-1",
					"type": "assistantMessage",
					"role": "assistant",
				},
			},
		},
		{
			"method": "item/started",
			"params": map[string]any{
				"item": map[string]any{
					"id":      "cmd-raw-1",
					"type":    "commandExecution",
					"command": "ls",
				},
			},
		},
		{
			"method": "item.commandExecution.outputDelta",
			"params": map[string]any{
				"itemId": "cmd-raw-1",
				"delta":  "command output\n",
			},
		},
		{
			"method": "item/completed",
			"params": map[string]any{
				"item": map[string]any{
					"id":       "cmd-raw-1",
					"type":     "commandExecution",
					"command":  "ls",
					"status":   "completed",
					"exitCode": 0,
				},
			},
		},
		{
			"method": "item/started",
			"params": map[string]any{
				"item": map[string]any{
					"id":   "file-raw-1",
					"type": "fileChange",
					"path": "/tmp/file.txt",
				},
			},
		},
		{
			"method": "item.fileChange.outputDelta",
			"params": map[string]any{
				"itemId": "file-raw-1",
				"delta":  "--- a/file.txt\n+++ b/file.txt\n",
			},
		},
		{
			"method": "item/completed",
			"params": map[string]any{
				"item": map[string]any{
					"id":     "file-raw-1",
					"type":   "fileChange",
					"path":   "/tmp/file.txt",
					"status": "completed",
				},
			},
		},
		{
			"method": "item/started",
			"params": map[string]any{
				"item": map[string]any{
					"id":        "mcp-raw-1",
					"type":      "mcpToolCall",
					"server":    "setta",
					"tool":      "echo",
					"arguments": map[string]any{"text": "ping"},
				},
			},
		},
		{
			"method": "item/completed",
			"params": map[string]any{
				"item": map[string]any{
					"id":        "mcp-raw-1",
					"type":      "mcpToolCall",
					"server":    "setta",
					"tool":      "echo",
					"arguments": map[string]any{"text": "ping"},
					"result":    map[string]any{"text": "pong"},
					"status":    "completed",
				},
			},
		},
		{
			"method": "item/started",
			"params": map[string]any{
				"item": map[string]any{
					"id":    "web-raw-1",
					"type":  "webSearch",
					"input": map[string]any{"query": "site:setta"},
				},
			},
		},
		{
			"method": "item/completed",
			"params": map[string]any{
				"item": map[string]any{
					"id":     "web-raw-1",
					"type":   "webSearch",
					"input":  map[string]any{"query": "site:setta"},
					"output": map[string]any{"status": "ok"},
					"status": "completed",
				},
			},
		},
		{
			"method": "item/completed",
			"params": map[string]any{
				"item": map[string]any{
					"id":      "assistant-raw-1",
					"type":    "assistantMessage",
					"role":    "assistant",
					"content": []any{map[string]any{"text": "Raw tools finished."}},
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
