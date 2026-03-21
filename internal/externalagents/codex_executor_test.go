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

	toml "github.com/pelletier/go-toml/v2"
	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/externalagentconfigs"
	"setta/internal/llmconfig"
	"setta/internal/mcpx"
	"setta/internal/projectstate"
)

func TestCodexExecutorCompletesRunAndPersistsAssistantOutput(t *testing.T) {
	// These tests launch nested subprocess fixtures, so keep them serial.
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

func TestCodexExecutorWritesSessionScopedRuntimeConfig(t *testing.T) {
	fixture := newCodexExecutorFixture(t, "complete")
	baseConfigPath := filepath.Join(
		fixture.root,
		codexSettingsRootName,
		"codex",
		fixture.configID,
		codexConfigFileName,
	)
	if err := os.MkdirAll(filepath.Dir(baseConfigPath), 0o755); err != nil {
		t.Fatalf("mkdir codex base config dir: %v", err)
	}
	baseConfig, err := toml.Marshal(map[string]any{
		"mcp_servers": map[string]any{
			"filesystem": map[string]any{
				"transport": "stdio",
				"command":   "npx @modelcontextprotocol/server-filesystem .",
			},
			"setta": map[string]any{
				"url": "http://127.0.0.1:8000/mcp",
			},
		},
	})
	if err != nil {
		t.Fatalf("encode codex base config: %v", err)
	}
	if err := os.WriteFile(baseConfigPath, baseConfig, 0o644); err != nil {
		t.Fatalf("write codex base config: %v", err)
	}

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

	configPath := filepath.Join(
		fixture.root,
		codexSettingsRootName,
		"codex",
		fixture.configID,
		"sessions",
		result.ChatID,
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
	if got := stringValue(runtimeConfig["approval_policy"]); got != "on-request" {
		t.Fatalf("expected runtime approval policy, got %#v", runtimeConfig["approval_policy"])
	}
	if got := stringValue(runtimeConfig["sandbox_mode"]); got != "workspace-write" {
		t.Fatalf("expected runtime sandbox mode, got %#v", runtimeConfig["sandbox_mode"])
	}
	if got := stringValue(runtimeConfig["model_reasoning_summary"]); got != "none" {
		t.Fatalf("expected runtime reasoning summary default, got %#v", runtimeConfig["model_reasoning_summary"])
	}
	mcpServers, ok := mapValue(runtimeConfig["mcp_servers"])
	if !ok {
		t.Fatalf("expected runtime mcp_servers map, got %#v", runtimeConfig["mcp_servers"])
	}
	if _, ok := mapValue(mcpServers["filesystem"]); !ok {
		t.Fatalf("expected inherited filesystem mcp server, got %#v", mcpServers)
	}
	settaServer, ok := mapValue(mcpServers["setta"])
	if !ok || stringValue(settaServer["url"]) != "http://127.0.0.1:8000/mcp" {
		t.Fatalf("expected runtime setta mcp url, got %#v", mcpServers["setta"])
	}
	if !containsText(stringValue(runtimeConfig["developer_instructions"]), "## Runtime execution settings") {
		t.Fatalf("expected runtime developer instructions to include execution settings, got %#v", runtimeConfig["developer_instructions"])
	}
	projects, ok := mapValue(runtimeConfig["projects"])
	if !ok {
		t.Fatalf("expected runtime projects map, got %#v", runtimeConfig["projects"])
	}
	projectEntry, ok := mapValue(projects[fixture.root])
	if !ok || stringValue(projectEntry["trust_level"]) != "trusted" {
		t.Fatalf("expected trusted runtime project entry, got %#v", runtimeConfig["projects"])
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestCodexExecutorPassesSessionScopedCODEXHOMEToProcessEnv(t *testing.T) {
	fixture := newCodexExecutorFixture(t, "env_handoff")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Report your runtime home"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start codex env-handoff run: %v", err)
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
	expectedHome := filepath.Join(
		fixture.root,
		codexSettingsRootName,
		"codex",
		fixture.configID,
		"sessions",
		result.ChatID,
	)
	if got := extractMessageText(lastMessage); got != expectedHome {
		t.Fatalf("expected assistant to report CODEX_HOME %q, got %q", expectedHome, got)
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestApplyCodexRuntimeConfigPrependsSystemPromptAheadOfExistingDeveloperInstructions(t *testing.T) {
	t.Parallel()

	payload := map[string]any{
		"developer_instructions": "Base developer instructions",
	}
	applyCodexRuntimeConfig(payload, externalagentconfigs.Config{}, "/tmp/workspace", map[string]any{
		"systemPrompt": "Runtime system prompt",
	})

	if got := stringValue(payload["developer_instructions"]); got != "Runtime system prompt\n\nBase developer instructions" {
		t.Fatalf("expected system prompt to prepend existing developer instructions, got %q", got)
	}
}

func TestCodexExecutorPrepareCodexHomePrefersExplicitBaseConfigPath(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	configID := "external-config"
	explicitConfigPath := filepath.Join(root, "custom", "codex.toml")
	if err := os.MkdirAll(filepath.Dir(explicitConfigPath), 0o755); err != nil {
		t.Fatalf("mkdir explicit config dir: %v", err)
	}
	explicitConfig, err := toml.Marshal(map[string]any{
		"mcp_servers": map[string]any{
			"explicit": map[string]any{
				"url": "http://explicit.example/mcp",
			},
		},
	})
	if err != nil {
		t.Fatalf("encode explicit codex config: %v", err)
	}
	if err := os.WriteFile(explicitConfigPath, explicitConfig, 0o644); err != nil {
		t.Fatalf("write explicit codex config: %v", err)
	}

	canonicalConfigPath := filepath.Join(root, codexSettingsRootName, "codex", configID, codexConfigFileName)
	if err := os.MkdirAll(filepath.Dir(canonicalConfigPath), 0o755); err != nil {
		t.Fatalf("mkdir canonical config dir: %v", err)
	}
	canonicalConfig, err := toml.Marshal(map[string]any{
		"mcp_servers": map[string]any{
			"canonical": map[string]any{
				"url": "http://canonical.example/mcp",
			},
		},
	})
	if err != nil {
		t.Fatalf("encode canonical codex config: %v", err)
	}
	if err := os.WriteFile(canonicalConfigPath, canonicalConfig, 0o644); err != nil {
		t.Fatalf("write canonical codex config: %v", err)
	}

	executor := &CodexExecutor{
		settaFilesRoot: root,
	}
	runtimeHome, err := executor.prepareCodexHome(externalagentconfigs.Config{
		ID:               configID,
		SettingsMode:     externalagentconfigs.SettingsModeExplicitPath,
		SettingsFilePath: stringPtr(explicitConfigPath),
	}, "chat-1", root, map[string]any{})
	if err != nil {
		t.Fatalf("prepare codex home: %v", err)
	}

	content, err := os.ReadFile(filepath.Join(runtimeHome, codexConfigFileName))
	if err != nil {
		t.Fatalf("read runtime codex config: %v", err)
	}
	runtimeConfig := map[string]any{}
	if err := toml.Unmarshal(content, &runtimeConfig); err != nil {
		t.Fatalf("decode runtime codex config: %v", err)
	}
	mcpServers, ok := mapValue(runtimeConfig["mcp_servers"])
	if !ok {
		t.Fatalf("expected runtime mcp_servers map, got %#v", runtimeConfig["mcp_servers"])
	}
	if _, ok := mapValue(mcpServers["explicit"]); !ok {
		t.Fatalf("expected explicit-path mcp server to be preserved, got %#v", mcpServers)
	}
	if _, ok := mcpServers["canonical"]; ok {
		t.Fatalf("expected canonical home config to be ignored when explicit path is set, got %#v", mcpServers)
	}
}

func TestCodexExecutorPrepareCodexHomeCopiesAuthFileIntoSessionHome(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	explicitConfigPath := filepath.Join(root, "custom", "codex.toml")
	if err := os.MkdirAll(filepath.Dir(explicitConfigPath), 0o755); err != nil {
		t.Fatalf("mkdir explicit config dir: %v", err)
	}
	if err := os.WriteFile(explicitConfigPath, []byte("model = \"gpt-5\"\n"), 0o644); err != nil {
		t.Fatalf("write explicit codex config: %v", err)
	}
	authPayload := []byte("{\"access_token\":\"secret\"}\n")
	if err := os.WriteFile(filepath.Join(filepath.Dir(explicitConfigPath), "auth.json"), authPayload, 0o600); err != nil {
		t.Fatalf("write explicit codex auth file: %v", err)
	}

	executor := &CodexExecutor{
		settaFilesRoot: root,
	}
	runtimeHome, err := executor.prepareCodexHome(externalagentconfigs.Config{
		ID:               "external-config",
		SettingsMode:     externalagentconfigs.SettingsModeExplicitPath,
		SettingsFilePath: stringPtr(explicitConfigPath),
	}, "chat-1", root, map[string]any{})
	if err != nil {
		t.Fatalf("prepare codex home: %v", err)
	}

	runtimeAuthPayload, err := os.ReadFile(filepath.Join(runtimeHome, "auth.json"))
	if err != nil {
		t.Fatalf("read runtime auth.json: %v", err)
	}
	if string(runtimeAuthPayload) != string(authPayload) {
		t.Fatalf("expected copied auth payload %q, got %q", string(authPayload), string(runtimeAuthPayload))
	}
}

func TestCodexExecutorPrepareCodexHomeLeavesExplicitSourceConfigUnchanged(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	explicitConfigPath := filepath.Join(root, "custom", "codex.toml")
	if err := os.MkdirAll(filepath.Dir(explicitConfigPath), 0o755); err != nil {
		t.Fatalf("mkdir explicit config dir: %v", err)
	}
	sourceConfig, err := toml.Marshal(map[string]any{
		"developer_instructions": "Base instructions",
		"mcp_servers": map[string]any{
			"explicit": map[string]any{
				"url": "http://explicit.example/mcp",
			},
		},
	})
	if err != nil {
		t.Fatalf("encode explicit codex config: %v", err)
	}
	if err := os.WriteFile(explicitConfigPath, sourceConfig, 0o644); err != nil {
		t.Fatalf("write explicit codex config: %v", err)
	}

	executor := &CodexExecutor{
		settaFilesRoot: root,
	}
	runtimeHome, err := executor.prepareCodexHome(externalagentconfigs.Config{
		ID:               "external-config",
		SettingsMode:     externalagentconfigs.SettingsModeExplicitPath,
		SettingsFilePath: stringPtr(explicitConfigPath),
	}, "chat-1", root, map[string]any{
		"systemPrompt": "Runtime prompt",
	})
	if err != nil {
		t.Fatalf("prepare codex home: %v", err)
	}

	runtimeConfigPayload, err := os.ReadFile(filepath.Join(runtimeHome, codexConfigFileName))
	if err != nil {
		t.Fatalf("read runtime codex config: %v", err)
	}
	runtimeConfig := map[string]any{}
	if err := toml.Unmarshal(runtimeConfigPayload, &runtimeConfig); err != nil {
		t.Fatalf("decode runtime codex config: %v", err)
	}
	if got := stringValue(runtimeConfig["developer_instructions"]); got != "Runtime prompt\n\nBase instructions" {
		t.Fatalf("expected merged developer instructions, got %q", got)
	}
	runtimeMCPServers, ok := mapValue(runtimeConfig["mcp_servers"])
	if !ok {
		t.Fatalf("expected runtime mcp_servers map, got %#v", runtimeConfig["mcp_servers"])
	}
	if _, ok := mapValue(runtimeMCPServers["explicit"]); !ok {
		t.Fatalf("expected explicit mcp server in runtime config, got %#v", runtimeMCPServers)
	}

	sourceConfigAfter, err := os.ReadFile(explicitConfigPath)
	if err != nil {
		t.Fatalf("read explicit codex config after prepare: %v", err)
	}
	if string(sourceConfigAfter) != string(sourceConfig) {
		t.Fatalf("expected explicit source config to stay unchanged, got %q", string(sourceConfigAfter))
	}
}

func TestCodexExecutorPrepareCodexHomeLeavesCanonicalConfigBytesUnchanged(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	configID := "external-config"
	canonicalConfigPath := filepath.Join(root, codexSettingsRootName, "codex", configID, codexConfigFileName)
	if err := os.MkdirAll(filepath.Dir(canonicalConfigPath), 0o755); err != nil {
		t.Fatalf("mkdir canonical config dir: %v", err)
	}
	canonicalConfig, err := toml.Marshal(map[string]any{
		"developer_instructions": "Canonical instructions",
		"model":                  "gpt-5",
	})
	if err != nil {
		t.Fatalf("encode canonical codex config: %v", err)
	}
	if err := os.WriteFile(canonicalConfigPath, canonicalConfig, 0o644); err != nil {
		t.Fatalf("write canonical codex config: %v", err)
	}

	executor := &CodexExecutor{
		settaFilesRoot: root,
	}
	_, err = executor.prepareCodexHome(externalagentconfigs.Config{
		ID:           configID,
		SettingsMode: externalagentconfigs.SettingsModeReadOnly,
	}, "chat-1", root, map[string]any{
		"systemPrompt": "Runtime prompt",
	})
	if err != nil {
		t.Fatalf("prepare codex home: %v", err)
	}

	canonicalConfigAfter, err := os.ReadFile(canonicalConfigPath)
	if err != nil {
		t.Fatalf("read canonical codex config after prepare: %v", err)
	}
	if string(canonicalConfigAfter) != string(canonicalConfig) {
		t.Fatalf("expected canonical config bytes to stay unchanged, got %q", string(canonicalConfigAfter))
	}
}

func TestCodexExecutorPrepareCodexHomeDoesNotCreateMissingCanonicalConfigInManagedLocalNoEditMode(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	configID := "external-config"
	canonicalConfigPath := filepath.Join(root, codexSettingsRootName, "codex", configID, codexConfigFileName)

	executor := &CodexExecutor{
		settaFilesRoot: root,
	}
	runtimeHome, err := executor.prepareCodexHome(externalagentconfigs.Config{
		ID:                      configID,
		SettingsMode:            externalagentconfigs.SettingsModeManagedLocal,
		SettingsAllowSettaEdits: false,
	}, "chat-1", root, map[string]any{})
	if err != nil {
		t.Fatalf("prepare codex home: %v", err)
	}

	if _, err := os.Stat(canonicalConfigPath); !os.IsNotExist(err) {
		t.Fatalf("expected canonical config to remain absent, stat err=%v", err)
	}
	if _, err := os.Stat(filepath.Join(runtimeHome, codexConfigFileName)); err != nil {
		t.Fatalf("expected session-scoped runtime config to exist, stat err=%v", err)
	}
}

func TestCodexExecutorEnsureCodexLoginUsesAPIKeyWhenSessionHomeLacksAuth(t *testing.T) {
	t.Parallel()

	runtimeHome := t.TempDir()
	recordPath := filepath.Join(t.TempDir(), "login-input.txt")
	commandPath := filepath.Join(t.TempDir(), "codex-login.sh")
	script := strings.Join([]string{
		"#!/bin/sh",
		"if [ \"$1\" != \"login\" ] || [ \"$2\" != \"--with-api-key\" ]; then",
		"  echo \"unexpected args: $@\" >&2",
		"  exit 1",
		"fi",
		"IFS= read -r api_key",
		"printf '%s' \"$api_key\" > \"$SETTA_CODEX_LOGIN_RECORD_PATH\"",
		"printf '{\"access_token\":\"from-login\"}\\n' > \"$CODEX_HOME/auth.json\"",
	}, "\n")
	if err := os.WriteFile(commandPath, []byte(script), 0o755); err != nil {
		t.Fatalf("write codex login fixture: %v", err)
	}

	executor := &CodexExecutor{}
	envMap := map[string]string{
		"CODEX_HOME":                    runtimeHome,
		"OPENAI_API_KEY":                "test-api-key",
		"SETTA_CODEX_LOGIN_RECORD_PATH": recordPath,
	}
	if err := executor.ensureCodexLogin(context.Background(), externalagentconfigs.Config{
		CommandPath: stringPtr(commandPath),
	}, t.TempDir(), envMap); err != nil {
		t.Fatalf("ensure codex login: %v", err)
	}

	recordedInput, err := os.ReadFile(recordPath)
	if err != nil {
		t.Fatalf("read recorded login input: %v", err)
	}
	if string(recordedInput) != "test-api-key" {
		t.Fatalf("expected login input to match api key, got %q", string(recordedInput))
	}
	authPayload, err := os.ReadFile(filepath.Join(runtimeHome, "auth.json"))
	if err != nil {
		t.Fatalf("read auth.json created by login: %v", err)
	}
	if string(authPayload) != "{\"access_token\":\"from-login\"}\n" {
		t.Fatalf("expected auth.json from login helper, got %q", string(authPayload))
	}
}

func TestCodexExecutorRoutesApprovalResponsesThroughRuntime(t *testing.T) {
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

func TestApplyCodexResponseItemAttachesFunctionCallToFollowUpMessage(t *testing.T) {
	t.Parallel()

	state := &ChatState{
		Messages:           []map[string]any{},
		ToolCallArguments:  map[string]string{},
		WaitingForResponse: true,
	}

	applied, toolResult, err := applyCodexResponseItem(state, map[string]any{
		"payload": map[string]any{
			"type":      "function_call",
			"call_id":   "call-buffer-1",
			"name":      "mcp__setta__create_top_level_section",
			"arguments": "{\"projectConfigId\":\"1\",\"implType\":\"Callable\"}",
		},
	})
	if err != nil {
		t.Fatalf("apply function_call response item: %v", err)
	}
	if !applied || toolResult != nil {
		t.Fatalf("unexpected function_call result applied=%v toolResult=%#v", applied, toolResult)
	}

	applied, toolResult, err = applyCodexResponseItem(state, map[string]any{
		"payload": map[string]any{
			"type": "message",
			"role": "assistant",
			"content": []any{
				map[string]any{"type": "output_text", "text": "Done"},
			},
		},
	})
	if err != nil {
		t.Fatalf("apply message response item: %v", err)
	}
	if !applied || toolResult != nil {
		t.Fatalf("unexpected message result applied=%v toolResult=%#v", applied, toolResult)
	}
	if len(state.Messages) != 1 {
		t.Fatalf("expected one assistant message, got %#v", state.Messages)
	}
	message := state.Messages[0]
	if extractMessageText(message) != "Done" {
		t.Fatalf("unexpected assistant text %#v", message)
	}
	rawToolCalls, ok := message["tool_calls"].([]any)
	if !ok || len(rawToolCalls) != 1 {
		t.Fatalf("expected one tool call on assistant message, got %#v", message)
	}
}

func TestApplyCodexResponseItemAppendsToolResultOnce(t *testing.T) {
	t.Parallel()

	state := &ChatState{
		Messages:           []map[string]any{},
		ToolCallArguments:  map[string]string{},
		WaitingForResponse: true,
	}
	if _, _, err := applyCodexResponseItem(state, map[string]any{
		"payload": map[string]any{
			"type":      "function_call",
			"call_id":   "call-2",
			"name":      "mcp__setta__create_top_level_section",
			"arguments": "{\"projectConfigId\":\"1\",\"implType\":\"Callable\"}",
		},
	}); err != nil {
		t.Fatalf("apply function_call response item: %v", err)
	}

	applied, toolResult, err := applyCodexResponseItem(state, map[string]any{
		"payload": map[string]any{
			"type":    "function_call_output",
			"call_id": "call-2",
			"output":  "{\"sectionId\":\"6\"}",
		},
	})
	if err != nil {
		t.Fatalf("apply function_call_output response item: %v", err)
	}
	if !applied || toolResult == nil {
		t.Fatalf("expected tool result metadata, got applied=%v metadata=%#v", applied, toolResult)
	}
	if toolResult.ToolCallID != "call-2" || toolResult.ToolName != "mcp__setta__create_top_level_section" {
		t.Fatalf("unexpected tool result metadata %#v", toolResult)
	}
	if len(state.Messages) != 2 {
		t.Fatalf("expected assistant message plus tool result, got %#v", state.Messages)
	}
	lastMessage := state.Messages[len(state.Messages)-1]
	if role, _ := messageRole(lastMessage); role != "tool" {
		t.Fatalf("expected tool message, got %#v", lastMessage)
	}
	result, ok := lastMessage["result"].(map[string]any)
	if !ok || stringValue(result["sectionId"]) != "6" {
		t.Fatalf("unexpected tool result payload %#v", lastMessage)
	}

	applied, toolResult, err = applyCodexResponseItem(state, map[string]any{
		"payload": map[string]any{
			"type":    "function_call_output",
			"call_id": "call-2",
			"output":  "{\"sectionId\":\"6\"}",
		},
	})
	if err != nil {
		t.Fatalf("reapply function_call_output response item: %v", err)
	}
	if applied || toolResult != nil {
		t.Fatalf("expected duplicate tool result to be ignored, got applied=%v metadata=%#v", applied, toolResult)
	}
}

func TestApplyCodexResponseItemPreservesReasoningAndText(t *testing.T) {
	t.Parallel()

	state := &ChatState{
		Messages:           []map[string]any{},
		ToolCallArguments:  map[string]string{},
		WaitingForResponse: true,
	}
	applied, toolResult, err := applyCodexResponseItem(state, map[string]any{
		"payload": map[string]any{
			"id":   "msg-response-with-reasoning",
			"type": "message",
			"role": "assistant",
			"content": []any{
				map[string]any{
					"type":    "reasoning",
					"summary": []any{map[string]any{"text": "Plan"}},
					"content": []any{map[string]any{"text": "Evaluate options."}},
				},
				map[string]any{
					"type": "output_text",
					"text": "Build the navigator first.",
				},
			},
		},
	})
	if err != nil {
		t.Fatalf("apply reasoning response item: %v", err)
	}
	if !applied || toolResult != nil {
		t.Fatalf("unexpected reasoning result applied=%v toolResult=%#v", applied, toolResult)
	}
	if len(state.Messages) != 1 {
		t.Fatalf("expected one assistant message, got %#v", state.Messages)
	}
	content, ok := state.Messages[0]["content"].([]any)
	if !ok || len(content) != 2 {
		t.Fatalf("expected reasoning plus text content, got %#v", state.Messages[0])
	}
	first, ok := content[0].(map[string]any)
	if !ok || stringValue(first["type"]) != "thinking" || stringValue(first["summary"]) != "Plan" || stringValue(first["thinking"]) != "Evaluate options." {
		t.Fatalf("unexpected thinking payload %#v", content[0])
	}
	second, ok := content[1].(map[string]any)
	if !ok || stringValue(second["type"]) != "text" || stringValue(second["text"]) != "Build the navigator first." {
		t.Fatalf("unexpected text payload %#v", content[1])
	}
}

func TestCodexExecutorPersistsRichResponseItemsAndMCPStatusSnapshot(t *testing.T) {
	fixture := newCodexExecutorFixture(t, "rich")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Create something with Codex tools"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start rich codex run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	rawSnapshot, ok := persisted.Outputs[externalMCPStatusSnapshotKey].([]any)
	if !ok || len(rawSnapshot) != 1 {
		t.Fatalf("expected one persisted external MCP status, got %#v", persisted.Outputs)
	}
	messages, ok := persisted.Outputs["messages"].([]any)
	if !ok || len(messages) < 2 {
		t.Fatalf("expected persisted output messages, got %#v", persisted.Outputs)
	}
	assistantFound := false
	toolResultFound := false
	for _, rawMessage := range messages {
		message, ok := rawMessage.(map[string]any)
		if !ok {
			continue
		}
		role, _ := messageRole(message)
		if role == "assistant" {
			if rawToolCalls, ok := message["tool_calls"].([]any); ok && len(rawToolCalls) > 0 && extractMessageText(message) == "Created the top-level section." {
				content, _ := message["content"].([]any)
				if len(content) > 0 {
					first, _ := content[0].(map[string]any)
					if stringValue(first["type"]) == "thinking" {
						assistantFound = true
					}
				}
			}
		}
		if role == "tool" && stringValue(message["tool_call_id"]) == "call-create" {
			toolResultFound = true
		}
	}
	if !assistantFound {
		t.Fatalf("expected persisted assistant message with tool call and reasoning, got %#v", messages)
	}
	if !toolResultFound {
		t.Fatalf("expected persisted tool result message, got %#v", messages)
	}
	toolResultEventFound := false
	for _, event := range persisted.Events {
		if event.Type == "tool_result" && stringValue(event.Payload["toolCallId"]) == "call-create" {
			toolResultEventFound = true
			break
		}
	}
	if !toolResultEventFound {
		t.Fatalf("expected persisted tool_result event, got %#v", persisted.Events)
	}

	statuses, err := fixture.runtime.ExternalRuntimeStatuses(stringPtr(result.ChatID), stringPtr(fixture.engineID))
	if err != nil {
		t.Fatalf("read external runtime statuses: %v", err)
	}
	if len(statuses) != 1 || statuses[0].ServerID != "setta" || statuses[0].State != mcpx.RuntimeStateConnected {
		t.Fatalf("unexpected external runtime statuses %#v", statuses)
	}
	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestCodexExecutorPersistsRawToolItemsAndBufferedOutput(t *testing.T) {
	fixture := newCodexExecutorFixture(t, "raw")
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Run raw Codex tools"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start raw codex run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	messages, ok := persisted.Outputs["messages"].([]any)
	if !ok || len(messages) < 5 {
		t.Fatalf("expected persisted output messages, got %#v", persisted.Outputs)
	}

	assistantFound := false
	commandResultFound := false
	fileResultFound := false
	mcpResultFound := false
	genericResultFound := false
	for _, rawMessage := range messages {
		message, ok := rawMessage.(map[string]any)
		if !ok {
			continue
		}
		role, _ := messageRole(message)
		switch role {
		case "assistant":
			if extractMessageText(message) != "Raw tools finished." {
				continue
			}
			rawToolCalls, ok := message["tool_calls"].([]any)
			if !ok || len(rawToolCalls) != 4 {
				t.Fatalf("expected four tool calls on raw assistant message, got %#v", message)
			}
			expectedNames := map[string]string{
				"cmd-raw-1":  codexCommandExecutionToolName,
				"file-raw-1": codexFileChangeToolName,
				"mcp-raw-1":  "mcp__setta__echo",
				"web-raw-1":  "webSearch",
			}
			for _, rawToolCall := range rawToolCalls {
				toolCall, ok := rawToolCall.(map[string]any)
				if !ok {
					continue
				}
				toolCallID := stringValue(toolCall["id"])
				function, _ := mapValue(toolCall["function"])
				if expectedNames[toolCallID] != stringValue(function["name"]) {
					t.Fatalf("unexpected raw tool call payload %#v", toolCall)
				}
			}
			assistantFound = true
		case "tool":
			switch stringValue(message["tool_call_id"]) {
			case "cmd-raw-1":
				resultPayload, _ := mapValue(message["result"])
				if stringValue(resultPayload["aggregated_output"]) != "command output\n" {
					t.Fatalf("expected buffered command output, got %#v", message)
				}
				commandResultFound = true
			case "file-raw-1":
				resultPayload, _ := mapValue(message["result"])
				if stringValue(resultPayload["diff"]) != "--- a/file.txt\n+++ b/file.txt\n" {
					t.Fatalf("expected buffered file diff, got %#v", message)
				}
				fileResultFound = true
			case "mcp-raw-1":
				if stringValue(message["tool_name"]) != "mcp__setta__echo" {
					t.Fatalf("expected normalized MCP tool name, got %#v", message)
				}
				mcpResultFound = true
			case "web-raw-1":
				if stringValue(message["tool_name"]) != "webSearch" {
					t.Fatalf("expected generic tool result, got %#v", message)
				}
				genericResultFound = true
			}
		}
	}
	if !assistantFound {
		t.Fatalf("expected assistant message with raw tool calls, got %#v", messages)
	}
	if !commandResultFound || !fileResultFound || !mcpResultFound || !genericResultFound {
		t.Fatalf("expected all raw tool result messages, got %#v", messages)
	}

	toolResultEventIDs := map[string]bool{}
	for _, event := range persisted.Events {
		if event.Type != "tool_result" {
			continue
		}
		toolResultEventIDs[stringValue(event.Payload["toolCallId"])] = true
	}
	for _, expectedID := range []string{"cmd-raw-1", "file-raw-1", "mcp-raw-1", "web-raw-1"} {
		if !toolResultEventIDs[expectedID] {
			t.Fatalf("expected raw tool_result event for %s, got %#v", expectedID, persisted.Events)
		}
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestApplyCodexStreamEventReusesSyntheticToolMessageForAssistantDelta(t *testing.T) {
	t.Parallel()

	state := &ChatState{
		Messages:           []map[string]any{},
		ToolCallArguments:  map[string]string{},
		WaitingForResponse: true,
	}
	eventState := newCodexEventState()

	applied, toolResult, err := applyCodexStreamEvent(state, eventState, map[string]any{
		"method": "item/started",
		"params": map[string]any{
			"item": map[string]any{
				"id":        "mcp-raw-attach",
				"type":      "mcpToolCall",
				"server":    "setta",
				"tool":      "echo",
				"arguments": map[string]any{"text": "ping"},
			},
		},
	})
	if err != nil {
		t.Fatalf("apply raw MCP start: %v", err)
	}
	if !applied || toolResult != nil {
		t.Fatalf("unexpected raw MCP start result applied=%v toolResult=%#v", applied, toolResult)
	}

	applied, toolResult, err = applyCodexStreamEvent(state, eventState, map[string]any{
		"method": "item/assistantMessage/delta",
		"params": map[string]any{
			"itemId": "assistant-real-1",
			"delta":  map[string]any{"text": "Attached text"},
		},
	})
	if err != nil {
		t.Fatalf("apply assistant delta after synthetic tool message: %v", err)
	}
	if !applied || toolResult != nil {
		t.Fatalf("unexpected assistant delta result applied=%v toolResult=%#v", applied, toolResult)
	}

	if len(state.Messages) != 1 {
		t.Fatalf("expected one merged assistant message, got %#v", state.Messages)
	}
	message := state.Messages[0]
	if stringValue(message["id"]) != "assistant-real-1" {
		t.Fatalf("expected synthetic message id to be adopted, got %#v", message)
	}
	if extractMessageText(message) != "Attached text" {
		t.Fatalf("expected assistant delta text to land on adopted message, got %#v", message)
	}
	rawToolCalls, ok := message["tool_calls"].([]any)
	if !ok || len(rawToolCalls) != 1 {
		t.Fatalf("expected adopted tool call on assistant message, got %#v", message)
	}
}

type codexExecutorFixture struct {
	root     string
	configID string
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
		root:     root,
		configID: configID,
		send:     send,
		runtime:  runtime,
		runs:     runs,
		engineID: engineID,
	}
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
			case "rich":
			case "raw":
				if err := emitCodexRawTurn(writer); err != nil {
					return err
				}
				return nil
			case "env_handoff":
				codexHome := strings.TrimSpace(os.Getenv("CODEX_HOME"))
				if codexHome == "" {
					return fmt.Errorf("missing CODEX_HOME")
				}
				if _, err := os.Stat(filepath.Join(codexHome, codexConfigFileName)); err != nil {
					return fmt.Errorf("stat CODEX_HOME config: %w", err)
				}
				if err := emitAssistantTurn(writer, "assistant-env", codexHome); err != nil {
					return err
				}
				return nil
			default:
				if err := emitAssistantTurn(writer, "assistant-1", "Hello from Codex"); err != nil {
					return err
				}
				return nil
			}
		case "mcpServerStatus/list":
			if scenario == "rich" {
				if err := emit(map[string]any{
					"id": payload["id"],
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
				}); err != nil {
					return err
				}
				if err := emitCodexRichTurn(writer); err != nil {
					return err
				}
				return nil
			}
			if err := emit(map[string]any{"id": payload["id"], "result": map[string]any{"servers": []any{}}}); err != nil {
				return err
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
