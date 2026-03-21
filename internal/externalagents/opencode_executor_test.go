package externalagents

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
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
)

func TestOpenCodeExecutorCompletesRunAndPersistsAssistantOutput(t *testing.T) {
	// These executor tests launch nested subprocess fixtures, so keep them serial.
	// Verify the real OpenCode executor persists session state, assistant output,
	// and the bounded runtime config file for an SDK-backed run.
	fixture := newOpenCodeExecutorFixture(t, openCodeFixtureOptions{scenario: "complete"})
	baseConfigPath := filepath.Join(
		fixture.root,
		codexSettingsRootName,
		"opencode",
		fixture.configID,
		openCodeConfigFileName,
	)
	if err := os.MkdirAll(filepath.Dir(baseConfigPath), 0o755); err != nil {
		t.Fatalf("mkdir opencode base config dir: %v", err)
	}
	baseConfig, err := json.MarshalIndent(map[string]any{
		"mcp": map[string]any{
			"filesystem": map[string]any{
				"type":    "stdio",
				"command": "npx @modelcontextprotocol/server-filesystem .",
			},
		},
	}, "", "  ")
	if err != nil {
		t.Fatalf("encode opencode base config: %v", err)
	}
	baseConfig = append(baseConfig, '\n')
	if err := os.WriteFile(baseConfigPath, baseConfig, 0o644); err != nil {
		t.Fatalf("write opencode base config: %v", err)
	}

	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Say hello from OpenCode"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start opencode run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	if got := resolveRunOutputString(persisted, "sessionId"); got != "session-complete" {
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
	if got := extractMessageText(lastMessage); got != "Hello from OpenCode" {
		t.Fatalf("unexpected assistant text %q", got)
	}

	configPath := filepath.Join(
		fixture.root,
		codexSettingsRootName,
		"opencode",
		fixture.configID,
		"sessions",
		result.ChatID,
		openCodeConfigFileName,
	)
	content, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read runtime opencode config: %v", err)
	}
	runtimeConfig := map[string]any{}
	if err := json.Unmarshal(content, &runtimeConfig); err != nil {
		t.Fatalf("decode runtime opencode config: %v", err)
	}
	if got := stringValue(runtimeConfig["model"]); got != fixture.managedModel {
		t.Fatalf("expected runtime model %q, got %#v", fixture.managedModel, runtimeConfig["model"])
	}
	permission, ok := mapValue(runtimeConfig["permission"])
	if !ok || stringValue(permission["shell"]) != "ask" {
		t.Fatalf("expected runtime permission payload, got %#v", runtimeConfig["permission"])
	}
	mcpEntries, ok := mapValue(runtimeConfig["mcp"])
	if !ok {
		t.Fatalf("expected runtime mcp payload, got %#v", runtimeConfig["mcp"])
	}
	if _, ok := mapValue(mcpEntries["filesystem"]); !ok {
		t.Fatalf("expected inherited filesystem mcp entry, got %#v", mcpEntries)
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestOpenCodeExecutorPassesSessionScopedConfigPathToProcessEnv(t *testing.T) {
	// Verify the OpenCode sidecar sees the generated session config through the
	// process env contract rather than rediscovering it out of band.
	fixture := newOpenCodeExecutorFixture(t, openCodeFixtureOptions{scenario: "env_handoff"})
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Report your runtime config path"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start opencode env-handoff run: %v", err)
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
	expectedConfigPath := filepath.Join(
		fixture.root,
		codexSettingsRootName,
		"opencode",
		fixture.configID,
		"sessions",
		result.ChatID,
		openCodeConfigFileName,
	)
	if got := extractMessageText(lastMessage); got != expectedConfigPath {
		t.Fatalf("expected assistant to report OPENCODE_CONFIG %q, got %q", expectedConfigPath, got)
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestOpenCodeExecutorRoutesQuestionResponsesThroughRuntime(t *testing.T) {
	// Verify the OpenCode executor registers a pending question, accepts the Go
	// runtime response, and persists both the tool result and assistant follow-up.
	fixture := newOpenCodeExecutorFixture(t, openCodeFixtureOptions{scenario: "question"})
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Ask me one question before replying"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start opencode question run: %v", err)
	}

	fixture.waitForQuestion(t, result.Run.ID, "question-1")
	if err := fixture.runtime.RespondToQuestion("question-1", map[string]string{"Language": "Go"}); err != nil {
		t.Fatalf("respond to opencode question: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	if got := resolveRunOutputString(persisted, "sessionId"); got != "session-question" {
		t.Fatalf("expected persisted session id, got %q", got)
	}
	messages, ok := persisted.Outputs["messages"].([]any)
	if !ok || len(messages) == 0 {
		t.Fatalf("expected persisted output messages, got %#v", persisted.Outputs)
	}
	questionResultFound := false
	assistantFound := false
	for _, rawMessage := range messages {
		message, ok := rawMessage.(map[string]any)
		if !ok {
			continue
		}
		role, _ := messageRole(message)
		if role == "tool" && stringValue(message["tool_name"]) == askUserQuestionToolName {
			resultPayload, ok := mapValue(message["result"])
			if !ok {
				t.Fatalf("expected question result payload, got %#v", message["result"])
			}
			answers, ok := mapValue(resultPayload["answers"])
			if !ok || stringValue(answers["Language"]) != "Go" {
				t.Fatalf("unexpected question answers %#v", resultPayload)
			}
			questionResultFound = true
		}
		if role == "assistant" && extractMessageText(message) == "Chosen: Go" {
			assistantFound = true
		}
	}
	if !questionResultFound {
		t.Fatalf("expected persisted question tool result, got %#v", messages)
	}
	if !assistantFound {
		t.Fatalf("expected persisted assistant follow-up, got %#v", messages)
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

type openCodeFixtureOptions struct {
	scenario   string
	runMode    externalagentconfigs.RunMode
	baseURL    *string
	managedMCP map[string]any
}

func TestBuildOpenCodeStartPayloadRewritesMCPToolNamespaceInSystemPrompt(t *testing.T) {
	t.Parallel()

	payload := buildOpenCodeStartPayload(
		StartRequest{
			Run: agentruns.NewRun(nil, map[string]any{
				"messages": []any{
					map[string]any{
						"id":   "user-1",
						"role": "user",
						"content": []any{
							map[string]any{"type": "text", "text": "Hello from OpenCode"},
						},
					},
				},
			}, time.Date(2026, 3, 9, 15, 0, 0, 0, time.UTC)),
			Inputs: map[string]any{
				"systemPrompt": "MCP tool names are always namespaced as `<serverId>__<toolName>`.",
			},
		},
		"/tmp/workspace",
		externalagentconfigs.Config{},
	)

	systemPrompt := stringValue(payload["systemPrompt"])
	if strings.Contains(systemPrompt, "<serverId>__<toolName>") {
		t.Fatalf("expected OpenCode system prompt to rewrite canonical MCP tool namespace, got %q", systemPrompt)
	}
	if !strings.Contains(systemPrompt, "<serverId>_<toolName>") {
		t.Fatalf("expected OpenCode system prompt to mention underscore namespace, got %q", systemPrompt)
	}
}

func TestApplyOpenCodeRuntimeConfigParsesJSONLiteralPermission(t *testing.T) {
	t.Parallel()

	payload := map[string]any{}
	applyOpenCodeRuntimeConfig(payload, externalagentconfigs.Config{
		ApprovalPolicy: stringPtr(`{"shell":"ask","edit":"deny"}`),
	}, map[string]any{}, nil)

	permission, ok := mapValue(payload["permission"])
	if !ok {
		t.Fatalf("expected structured permission payload, got %#v", payload["permission"])
	}
	if stringValue(permission["shell"]) != "ask" || stringValue(permission["edit"]) != "deny" {
		t.Fatalf("expected parsed JSON permission payload, got %#v", permission)
	}
}

func TestApplyOpenCodeRuntimeConfigForcesOpenAITextVerbosity(t *testing.T) {
	t.Parallel()

	payload := map[string]any{
		"provider": map[string]any{
			"openai": map[string]any{
				"models": map[string]any{
					"gpt-5.2-chat-latest": map[string]any{
						"options": map[string]any{
							"text": map[string]any{
								"verbosity": "low",
							},
						},
					},
				},
			},
		},
	}

	applyOpenCodeRuntimeConfig(payload, externalagentconfigs.Config{}, map[string]any{}, nil)

	provider, ok := mapValue(payload["provider"])
	if !ok {
		t.Fatalf("expected provider payload, got %#v", payload["provider"])
	}
	openAI, ok := mapValue(provider["openai"])
	if !ok {
		t.Fatalf("expected openai payload, got %#v", provider["openai"])
	}
	models, ok := mapValue(openAI["models"])
	if !ok {
		t.Fatalf("expected models payload, got %#v", openAI["models"])
	}
	modelEntry, ok := mapValue(models["gpt-5.2-chat-latest"])
	if !ok {
		t.Fatalf("expected gpt-5.2-chat-latest model entry, got %#v", models)
	}
	options, ok := mapValue(modelEntry["options"])
	if !ok {
		t.Fatalf("expected model options payload, got %#v", modelEntry["options"])
	}
	if stringValue(options["textVerbosity"]) != "medium" {
		t.Fatalf("expected textVerbosity override, got %#v", options)
	}
	if _, ok := mapValue(options["text"]); ok {
		t.Fatalf("expected legacy text.verbosity payload to be removed, got %#v", options["text"])
	}
}

func TestPrepareOpenCodeConfigInjectsAuthAndAgenticHeaders(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	configID := "opencode-config"
	baseConfigPath := filepath.Join(root, codexSettingsRootName, "opencode", configID, openCodeConfigFileName)
	if err := os.MkdirAll(filepath.Dir(baseConfigPath), 0o755); err != nil {
		t.Fatalf("mkdir opencode base config dir: %v", err)
	}
	baseConfig, err := json.MarshalIndent(map[string]any{
		"mcp": map[string]any{
			"setta": map[string]any{
				"url": "http://127.0.0.1:8000/mcp",
			},
		},
	}, "", "  ")
	if err != nil {
		t.Fatalf("encode opencode base config: %v", err)
	}
	baseConfig = append(baseConfig, '\n')
	if err := os.WriteFile(baseConfigPath, baseConfig, 0o644); err != nil {
		t.Fatalf("write opencode base config: %v", err)
	}

	now := time.Date(2026, 3, 19, 18, 30, 0, 0, time.UTC)
	sectionID := "section-alpha"
	request := StartRequest{
		Run:             agentruns.Run{ID: "run-alpha"},
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
		SectionID:       &sectionID,
		Inputs: map[string]any{
			"frontendAffinityToken": "frontend-alpha",
			"allowUnscoped":         true,
		},
	}
	executor := &OpenCodeExecutor{
		settaFilesRoot:     root,
		currentSession:     &auth.CurrentSession{Metadata: auth.SessionMetadata{ID: "session-1"}, Secret: []byte("session-secret")},
		authCookieBaseName: auth.DefaultAuthCookieName,
		timeNow: func() time.Time {
			return now
		},
	}
	headers, err := executor.buildOpenCodeMCPHeaders(request)
	if err != nil {
		t.Fatalf("build opencode mcp headers: %v", err)
	}

	configPath, err := executor.prepareOpenCodeConfig(externalagentconfigs.Config{
		ID:           configID,
		ToolType:     externalagentconfigs.ToolTypeOpenCode,
		RunMode:      externalagentconfigs.RunModeSDK,
		SettingsMode: externalagentconfigs.SettingsModeManagedLocal,
	}, request.ChatID, request.Inputs, headers)
	if err != nil {
		t.Fatalf("prepare opencode config: %v", err)
	}

	content, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read runtime opencode config: %v", err)
	}
	payload := map[string]any{}
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode runtime opencode config: %v", err)
	}
	mcpEntries, ok := mapValue(payload["mcp"])
	if !ok {
		t.Fatalf("expected runtime mcp payload, got %#v", payload["mcp"])
	}
	settaEntry, ok := mapValue(mcpEntries["setta"])
	if !ok || stringValue(settaEntry["url"]) != "http://127.0.0.1:8000/mcp" {
		t.Fatalf("expected runtime setta mcp url, got %#v", mcpEntries["setta"])
	}
	headerPayload, ok := mapValue(settaEntry["headers"])
	if !ok {
		t.Fatalf("expected runtime setta headers, got %#v", settaEntry["headers"])
	}
	cookieName, err := auth.CookieName(auth.DefaultAuthCookieName, "session-1")
	if err != nil {
		t.Fatalf("resolve auth cookie name: %v", err)
	}
	cookie := strings.TrimSpace(stringValue(headerPayload["Cookie"]))
	if !strings.HasPrefix(cookie, cookieName+"=") {
		t.Fatalf("expected runtime auth cookie header to start with %q, got %q", cookieName+"=", cookie)
	}
	if got := stringValue(headerPayload[mcpx.AgenticContextProjectConfigIDHeader]); got != "project-alpha" {
		t.Fatalf("expected project-config header, got %#v", headerPayload)
	}
	if got := stringValue(headerPayload[mcpx.AgenticContextChatIDHeader]); got != "chat-alpha" {
		t.Fatalf("expected chat header, got %#v", headerPayload)
	}
	if got := stringValue(headerPayload[mcpx.AgenticContextRunIDHeader]); got != "run-alpha" {
		t.Fatalf("expected run header, got %#v", headerPayload)
	}
	if got := stringValue(headerPayload[mcpx.AgenticContextSectionIDHeader]); got != "section-alpha" {
		t.Fatalf("expected section header, got %#v", headerPayload)
	}
	if got := stringValue(headerPayload[mcpx.AgenticContextFrontendAffinityHeader]); got != "frontend-alpha" {
		t.Fatalf("expected frontend-affinity header, got %#v", headerPayload)
	}
	if got := stringValue(headerPayload[mcpx.AgenticContextAllowUnscopedHeader]); got != "true" {
		t.Fatalf("expected allow-unscoped header, got %#v", headerPayload)
	}
}

func TestOpenCodeExecutorPersistsToolResultFromCompletedToolPart(t *testing.T) {
	// Verify completed tool-part state becomes a persisted tool result plus a
	// summarized run event through the Go-owned OpenCode executor path.
	fixture := newOpenCodeExecutorFixture(t, openCodeFixtureOptions{scenario: "tool_result_part"})
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Report task completion"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start opencode rich run: %v", err)
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
	for _, rawMessage := range messages {
		message, ok := rawMessage.(map[string]any)
		if !ok {
			continue
		}
		role, _ := messageRole(message)
		if role != "tool" || stringValue(message["tool_call_id"]) != "tool-report-part" {
			continue
		}
		if got := stringValue(message["tool_name"]); got != "setta__report_completion_status" {
			t.Fatalf("unexpected tool result name %q", got)
		}
		resultPayload, ok := mapValue(message["result"])
		if !ok {
			t.Fatalf("expected tool result payload, got %#v", message["result"])
		}
		structured, ok := mapValue(resultPayload["structuredContent"])
		if !ok || !boolValue(structured["completionIntent"]) {
			t.Fatalf("unexpected structured tool result %#v", resultPayload)
		}
		toolResultFound = true
	}
	if !toolResultFound {
		t.Fatalf("expected persisted tool result message, got %#v", messages)
	}
	eventFound := false
	for _, event := range persisted.Events {
		if event.Type == "tool_result" && stringValue(event.Payload["toolCallId"]) == "tool-report-part" {
			eventFound = true
			break
		}
	}
	if !eventFound {
		t.Fatalf("expected persisted tool_result event, got %#v", persisted.Events)
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestOpenCodeExecutorPreservesSamePayloadAssistantTextAndToolResult(t *testing.T) {
	// Verify a single OpenCode payload can persist assistant text, tool-call
	// metadata, and the matching tool result without dropping the assistant text.
	fixture := newOpenCodeExecutorFixture(t, openCodeFixtureOptions{scenario: "same_payload"})
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Finish the task and report completion"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start opencode same-payload run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	messages, ok := persisted.Outputs["messages"].([]any)
	if !ok || len(messages) == 0 {
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
		if role == "assistant" && extractMessageText(message) == "Task A is done." {
			rawToolCalls, ok := message["tool_calls"].([]any)
			if !ok || len(rawToolCalls) != 1 {
				t.Fatalf("expected assistant tool call payload, got %#v", message)
			}
			assistantFound = true
		}
		if role == "tool" && stringValue(message["tool_call_id"]) == "tool-report-same" {
			if got := stringValue(message["tool_name"]); got != "setta__report_completion_status" {
				t.Fatalf("unexpected tool result name %q", got)
			}
			toolResultFound = true
		}
	}
	if !assistantFound {
		t.Fatalf("expected persisted assistant text from same payload, got %#v", messages)
	}
	if !toolResultFound {
		t.Fatalf("expected persisted same-payload tool result, got %#v", messages)
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestOpenCodeExecutorPersistsServerModeMCPStatusSnapshot(t *testing.T) {
	// Verify server-mode runs merge runtime-config seeding with fetched `/mcp`
	// status payloads and persist the resulting snapshot into run outputs.
	statusServer := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"servers":[{"id":"filesystem","connected":true,"transport":"stdio","command":"npx @modelcontextprotocol/server-filesystem .","toolCount":3}]}`))
	}))
	defer statusServer.Close()

	fixture := newOpenCodeExecutorFixture(t, openCodeFixtureOptions{
		scenario: "complete",
		runMode:  externalagentconfigs.RunModeServer,
		baseURL:  stringPtr(statusServer.URL),
		managedMCP: map[string]any{
			"filesystem": map[string]any{
				"transport": "stdio",
				"command":   "npx @modelcontextprotocol/server-filesystem .",
			},
		},
	})
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Say hello from OpenCode server mode"},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start opencode server-mode run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	fixture.waitForLiveStateCleanup(t, result.Run.ID)

	statuses, err := fixture.runtime.ExternalRuntimeStatuses(&result.ChatID, &fixture.engineID)
	if err != nil {
		t.Fatalf("read persisted external runtime statuses: %v", err)
	}
	if len(statuses) != 1 {
		t.Fatalf("expected one persisted status row, got %#v", statuses)
	}
	if got := statuses[0].ServerID; got != "filesystem" {
		t.Fatalf("unexpected server id %q", got)
	}
	if statuses[0].State != mcpx.RuntimeStateConnected {
		t.Fatalf("expected connected runtime state, got %#v", statuses[0])
	}
	if statuses[0].ToolCount != 3 {
		t.Fatalf("expected fetched tool count, got %#v", statuses[0])
	}
}

type openCodeExecutorFixture struct {
	root         string
	configID     string
	managedModel string
	send         *SendService
	runtime      *Runtime
	runs         *agentruns.RunStore
	engineID     string
}

func newOpenCodeExecutorFixture(t *testing.T, options openCodeFixtureOptions) openCodeExecutorFixture {
	t.Helper()

	root := t.TempDir()
	commandPath := writeOpenCodeFixtureCommand(t, options.scenario)
	runMode := options.runMode
	if runMode == "" {
		runMode = externalagentconfigs.RunModeSDK
	}

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
	managedModel := "openai/gpt-4.1"
	if err := configs.Write([]externalagentconfigs.Config{
		{
			ID:                 configID,
			Name:               "OpenCode fixture",
			ToolType:           externalagentconfigs.ToolTypeOpenCode,
			RunMode:            runMode,
			CommandPath:        &commandPath,
			BaseURL:            stringPtr(derefOptionalString(options.baseURL)),
			WorkingDirStrategy: externalagentconfigs.WorkingDirStrategyProjectRoot,
			SettingsManagedBlock: &externalagentconfigs.SettingsManagedBlock{
				OpenCode: &externalagentconfigs.OpenCodeSettingsBlock{
					Model:      &managedModel,
					Permission: map[string]any{"shell": "ask"},
					MCP:        cloneAnyMap(options.managedMCP),
				},
			},
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

	now := time.Date(2026, 3, 9, 10, 30, 0, 0, time.UTC)
	runtime, err := NewRuntime(RuntimeOptions{
		Runs: runs,
		TimeNow: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	openCodeExecutor, err := NewOpenCodeExecutor(OpenCodeExecutorOptions{
		Runs:               runs,
		Runtime:            runtime,
		WorkspaceRoot:      root,
		SettaFilesRoot:     root,
		CurrentSession:     &auth.CurrentSession{Metadata: auth.SessionMetadata{ID: "session-1"}, Secret: []byte("fixture-secret")},
		AuthCookieBaseName: auth.DefaultAuthCookieName,
		ProcessEnv:         llmconfig.CurrentProcessEnv(),
		TimeNow: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new opencode executor: %v", err)
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
				Name:      "OpenCode fixture",
				ToolType:  externalagentconfigs.ToolTypeOpenCode,
				RunMode:   runMode,
				Supported: true,
				Available: true,
				Issues:    []string{},
			},
		},
		Executor: NewMultiExecutor(MultiExecutorOptions{
			OpenCode: openCodeExecutor,
		}),
		TimeNow: func() time.Time {
			return now
		},
	})
	if err != nil {
		t.Fatalf("new send service: %v", err)
	}

	return openCodeExecutorFixture{
		root:         root,
		configID:     configID,
		managedModel: managedModel,
		send:         send,
		runtime:      runtime,
		runs:         runs,
		engineID:     engineID,
	}
}

func (f openCodeExecutorFixture) waitForTerminalRun(t *testing.T, runID string) agentruns.Run {
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

func (f openCodeExecutorFixture) waitForLiveStateCleanup(t *testing.T, runID string) {
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

func (f openCodeExecutorFixture) waitForQuestion(t *testing.T, runID string, toolCallID string) {
	t.Helper()

	deadline := time.Now().Add(executorFixtureEventTimeout)
	for time.Now().Before(deadline) {
		run, err := f.runs.Load(runID)
		if err != nil {
			t.Fatalf("load run while waiting for question: %v", err)
		}
		if questionToolCallPresent(run, toolCallID) {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("timed out waiting for question %s", toolCallID)
}

func writeOpenCodeFixtureCommand(t *testing.T, scenario string) string {
	t.Helper()

	commandPath := filepath.Join(t.TempDir(), "opencode-fixture.sh")
	content := fmt.Sprintf("#!/bin/sh\nSETTA_OPENCODE_FIXTURE=1 SETTA_OPENCODE_FIXTURE_SCENARIO=%s exec %q -test.run '^TestOpenCodeFixtureProcess$' -- \"$@\"\n", scenario, os.Args[0])
	if err := os.WriteFile(commandPath, []byte(content), 0o755); err != nil {
		t.Fatalf("write opencode fixture command: %v", err)
	}
	return commandPath
}

func TestOpenCodeFixtureProcess(t *testing.T) {
	if os.Getenv("SETTA_OPENCODE_FIXTURE") != "1" {
		return
	}
	if err := runOpenCodeFixtureProcess(os.Getenv("SETTA_OPENCODE_FIXTURE_SCENARIO")); err != nil {
		fmt.Fprintln(os.Stderr, err.Error())
		os.Exit(1)
	}
	os.Exit(0)
}

func runOpenCodeFixtureProcess(scenario string) error {
	reader := bufio.NewScanner(os.Stdin)
	reader.Buffer(make([]byte, 0, 16*1024), openCodeStdoutBufferSize)
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
		payload := map[string]any{}
		if err := json.Unmarshal([]byte(line), &payload); err != nil {
			return fmt.Errorf("decode opencode fixture payload: %w", err)
		}

		if _, isStart := payload["prompt"]; isStart {
			switch scenario {
			case "complete":
				if err := emitOpenCodeAssistantTurn(emit, "session-complete", "assistant-1", "part-1", "Hello from OpenCode"); err != nil {
					return err
				}
				return nil
			case "question":
				if err := emit(map[string]any{
					"type": "session.updated",
					"properties": map[string]any{
						"info": map[string]any{
							"id": "session-question",
						},
					},
				}); err != nil {
					return err
				}
				if err := emit(map[string]any{
					"type": "message.updated",
					"properties": map[string]any{
						"info": map[string]any{
							"id":   "assistant-question",
							"role": "assistant",
						},
					},
				}); err != nil {
					return err
				}
				if err := emit(map[string]any{
					"type": "message.part.updated",
					"properties": map[string]any{
						"part": map[string]any{
							"id":        "part-question-1",
							"messageID": "assistant-question",
							"type":      "tool",
							"tool":      "question",
							"callID":    "question-1",
							"state": map[string]any{
								"input": map[string]any{
									"questions": []any{
										map[string]any{
											"question": "Language",
											"options":  []any{"Go", "Python"},
										},
									},
								},
							},
						},
					},
				}); err != nil {
					return err
				}
				continue
			case "tool_result_part":
				if err := emit(map[string]any{
					"type": "session.updated",
					"properties": map[string]any{
						"info": map[string]any{
							"id": "session-tool-result-part",
						},
					},
				}); err != nil {
					return err
				}
				if err := emit(map[string]any{
					"type": "message.updated",
					"properties": map[string]any{
						"info": map[string]any{
							"id":   "assistant-tool-part",
							"role": "assistant",
						},
					},
				}); err != nil {
					return err
				}
				for _, rawPart := range []map[string]any{
					{
						"id":        "part-tool-result-1",
						"messageID": "assistant-tool-part",
						"type":      "tool",
						"tool":      "setta_report_completion_status",
						"callID":    "tool-report-part",
						"state": map[string]any{
							"status": "pending",
							"input": map[string]any{
								"completionIntent": true,
							},
						},
					},
					{
						"id":        "part-tool-result-1",
						"messageID": "assistant-tool-part",
						"type":      "tool",
						"tool":      "setta_report_completion_status",
						"callID":    "tool-report-part",
						"state": map[string]any{
							"status": "completed",
							"input": map[string]any{
								"completionIntent": true,
							},
							"output": map[string]any{
								"structuredContent": map[string]any{
									"completionIntent":     true,
									"requiresVerification": false,
								},
							},
						},
					},
				} {
					if err := emit(map[string]any{
						"type": "message.part.updated",
						"properties": map[string]any{
							"part": rawPart,
						},
					}); err != nil {
						return err
					}
				}
				if err := emitOpenCodeAssistantTurn(emit, "session-tool-result-part", "assistant-tool-result-summary", "part-tool-result-summary", "Tool result persisted"); err != nil {
					return err
				}
				return nil
			case "same_payload":
				if err := emit(map[string]any{
					"type": "session.updated",
					"properties": map[string]any{
						"info": map[string]any{
							"id": "session-same-payload",
						},
					},
				}); err != nil {
					return err
				}
				if err := emit(map[string]any{
					"id":   "assistant-same-payload",
					"text": "Task A is done.",
					"tool_call": map[string]any{
						"id":        "tool-report-same",
						"name":      "setta_report_completion_status",
						"arguments": `{"completionIntent":true}`,
					},
					"tool_call_id": "tool-report-same",
					"tool_name":    "setta_report_completion_status",
					"result": map[string]any{
						"structuredContent": map[string]any{
							"completionIntent":     true,
							"requiresVerification": true,
							"checkResults": []any{
								map[string]any{
									"checkName": "pytest",
									"required":  true,
									"status":    "passed",
								},
							},
						},
					},
				}); err != nil {
					return err
				}
				return nil
			case "env_handoff":
				configPath := strings.TrimSpace(os.Getenv("OPENCODE_CONFIG"))
				if configPath == "" {
					return fmt.Errorf("missing OPENCODE_CONFIG")
				}
				if _, err := os.Stat(configPath); err != nil {
					return fmt.Errorf("stat OPENCODE_CONFIG: %w", err)
				}
				if err := emitOpenCodeAssistantTurn(emit, "session-env-handoff", "assistant-env", "part-env-1", configPath); err != nil {
					return err
				}
				return nil
			default:
				return fmt.Errorf("unsupported opencode fixture scenario %q", scenario)
			}
		}

		if scenario == "question" && stringValue(payload["type"]) == "question_response" {
			if got := stringValue(payload["toolCallId"]); got != "question-1" {
				return fmt.Errorf("unexpected question toolCallId %q", got)
			}
			answers, ok := mapValue(payload["answers"])
			if !ok || stringValue(answers["Language"]) != "Go" {
				return fmt.Errorf("unexpected question answers %#v", payload["answers"])
			}
			if err := emitOpenCodeAssistantTurn(emit, "session-question", "assistant-answer", "part-answer-1", "Chosen: Go"); err != nil {
				return err
			}
			return nil
		}
	}
	return reader.Err()
}

func emitOpenCodeAssistantTurn(
	emit func(map[string]any) error,
	sessionID string,
	messageID string,
	partID string,
	text string,
) error {
	payloads := []map[string]any{
		{
			"type": "session.updated",
			"properties": map[string]any{
				"info": map[string]any{
					"id": sessionID,
				},
			},
		},
		{
			"type": "message.updated",
			"properties": map[string]any{
				"info": map[string]any{
					"id":   messageID,
					"role": "assistant",
				},
			},
		},
		{
			"type": "message.part.updated",
			"properties": map[string]any{
				"part": map[string]any{
					"id":        partID,
					"messageID": messageID,
					"type":      "text",
					"text":      text,
				},
				"delta": text,
			},
		},
	}
	for _, payload := range payloads {
		if err := emit(payload); err != nil {
			return err
		}
	}
	return nil
}

func questionToolCallPresent(run agentruns.Run, toolCallID string) bool {
	rawMessages, ok := run.Outputs["messages"].([]any)
	if !ok {
		return false
	}
	for _, rawMessage := range rawMessages {
		message, ok := rawMessage.(map[string]any)
		if !ok {
			continue
		}
		rawToolCalls, ok := message["tool_calls"].([]any)
		if !ok {
			continue
		}
		for _, rawToolCall := range rawToolCalls {
			toolCall, ok := rawToolCall.(map[string]any)
			if !ok {
				continue
			}
			if strings.TrimSpace(stringValue(toolCall["id"])) == toolCallID {
				return true
			}
		}
	}
	return false
}
