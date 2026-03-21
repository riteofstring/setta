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
	"runtime"
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
	scenario               string
	runMode                externalagentconfigs.RunMode
	baseURL                *string
	managedMCP             map[string]any
	completionGuardEnabled *bool
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
	err := applyOpenCodeRuntimeConfig(payload, externalagentconfigs.Config{
		ApprovalPolicy: stringPtr(`{"shell":"ask","edit":"deny"}`),
	}, map[string]any{}, nil, false, "", nil, true)
	if err != nil {
		t.Fatalf("apply opencode runtime config: %v", err)
	}

	permission, ok := mapValue(payload["permission"])
	if !ok {
		t.Fatalf("expected structured permission payload, got %#v", payload["permission"])
	}
	if stringValue(permission["shell"]) != "ask" || stringValue(permission["edit"]) != "deny" {
		t.Fatalf("expected parsed JSON permission payload, got %#v", permission)
	}
}

func TestResolveBundledNodeCommandPrefersExplicitPath(t *testing.T) {
	if got := resolveBundledNodeCommand("  /custom/node  "); got != "/custom/node" {
		t.Fatalf("expected explicit node path to win, got %q", got)
	}
}

func TestResolveBundledNodeCommandUsesBundledNodeWhenPresent(t *testing.T) {
	platformTag := resolveNodePlatformTag(runtime.GOOS, runtime.GOARCH)
	if platformTag == "" {
		t.Skipf("unsupported platform %s/%s", runtime.GOOS, runtime.GOARCH)
	}

	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve current file path")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(currentFile), "..", ".."))
	binaryName := "node"
	if runtime.GOOS == "windows" {
		binaryName = "node.exe"
	}
	expected := filepath.Join(repoRoot, "backend", "setta", "vendor", "node", platformTag, binaryName)

	if _, err := os.Stat(expected); err != nil {
		if !os.IsNotExist(err) {
			t.Fatalf("stat bundled node candidate: %v", err)
		}
		if err := os.MkdirAll(filepath.Dir(expected), 0o755); err != nil {
			t.Fatalf("mkdir bundled node dir: %v", err)
		}
		if err := os.WriteFile(expected, []byte("stub"), 0o755); err != nil {
			t.Fatalf("write bundled node fixture: %v", err)
		}
		t.Cleanup(func() {
			if err := os.Remove(expected); err != nil && !os.IsNotExist(err) {
				t.Fatalf("remove bundled node fixture: %v", err)
			}
		})
	}

	if got := resolveBundledNodeCommand(""); got != expected {
		t.Fatalf("expected bundled node %q, got %q", expected, got)
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

	if err := applyOpenCodeRuntimeConfig(payload, externalagentconfigs.Config{}, map[string]any{}, nil, false, "", nil, true); err != nil {
		t.Fatalf("apply opencode runtime config: %v", err)
	}

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

func TestApplyOpenCodeRuntimeConfigMergesToolAllowlistIntoPermission(t *testing.T) {
	t.Parallel()

	payload := map[string]any{}
	err := applyOpenCodeRuntimeConfig(
		payload,
		externalagentconfigs.Config{
			ApprovalPolicy: stringPtr("ask"),
		},
		map[string]any{},
		&agentprofiles.Profile{
			ToolAllowlist: []string{"setta__getProjectState"},
		},
		true,
		"",
		nil,
		true,
	)
	if err != nil {
		t.Fatalf("apply opencode runtime config: %v", err)
	}

	permission, ok := mapValue(payload["permission"])
	if !ok {
		t.Fatalf("expected merged permission payload, got %#v", payload["permission"])
	}
	if stringValue(permission["setta_*"]) != "deny" {
		t.Fatalf("expected setta wildcard deny, got %#v", permission)
	}
	if stringValue(permission["setta_getProjectState"]) != "ask" {
		t.Fatalf("expected allowlisted project-state tool to inherit ask, got %#v", permission)
	}
	if stringValue(permission["setta_set_agentic_context"]) != "ask" {
		t.Fatalf("expected required set_agentic_context tool to inherit ask, got %#v", permission)
	}
	if stringValue(permission["setta_report_completion_status"]) != "ask" {
		t.Fatalf("expected completion-report tool to inherit ask when guard is enabled, got %#v", permission)
	}
}

func TestApplyOpenCodeRuntimeConfigOmitsCompletionReportWhenGuardDisabled(t *testing.T) {
	t.Parallel()

	payload := map[string]any{}
	err := applyOpenCodeRuntimeConfig(
		payload,
		externalagentconfigs.Config{
			ApprovalPolicy: stringPtr("ask"),
		},
		map[string]any{},
		&agentprofiles.Profile{
			ToolAllowlist: []string{"setta__getProjectState"},
		},
		false,
		"",
		nil,
		true,
	)
	if err != nil {
		t.Fatalf("apply opencode runtime config: %v", err)
	}

	permission, ok := mapValue(payload["permission"])
	if !ok {
		t.Fatalf("expected merged permission payload, got %#v", payload["permission"])
	}
	if stringValue(permission["setta_*"]) != "deny" {
		t.Fatalf("expected setta wildcard deny, got %#v", permission)
	}
	if stringValue(permission["setta_getProjectState"]) != "ask" {
		t.Fatalf("expected allowlisted project-state tool to inherit ask, got %#v", permission)
	}
	if stringValue(permission["setta_set_agentic_context"]) != "ask" {
		t.Fatalf("expected required set_agentic_context tool to inherit ask, got %#v", permission)
	}
	if _, ok := permission["setta_report_completion_status"]; ok {
		t.Fatalf("expected completion-report tool to be omitted when guard is disabled, got %#v", permission)
	}
}

func TestApplyOpenCodeRuntimeConfigRejectsNonObjectPermissionWhenToolAllowlistIsScoped(t *testing.T) {
	t.Parallel()

	err := applyOpenCodeRuntimeConfig(
		map[string]any{},
		externalagentconfigs.Config{
			ApprovalPolicy: stringPtr(`[{"scope":"deny"}]`),
		},
		map[string]any{},
		&agentprofiles.Profile{
			ToolAllowlist: []string{"setta__getProjectState"},
		},
		true,
		"",
		nil,
		true,
	)
	if err == nil || !strings.Contains(err.Error(), "OpenCode permission must be a JSON object when toolAllowlist is set") {
		t.Fatalf("expected scoped allowlist to reject non-object permission payload, got %v", err)
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
			"frontendAffinityToken":     "frontend-alpha",
			"allowUnscoped":             true,
			"linkedChatInvocationDepth": float64(1),
			"linkedChatInvocationChainSectionIds": []any{
				"section-root",
				"section-mid",
			},
		},
	}
	executor := &OpenCodeExecutor{
		settaFilesRoot:     root,
		settaServerURL:     "http://127.0.0.1:8000/mcp",
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
	}, request.ChatID, request.Inputs, nil, false, headers)
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
	if got := stringValue(headerPayload[mcpx.AgenticContextLinkedChatDepthHeader]); got != "1" {
		t.Fatalf("expected linked-chat depth header, got %#v", headerPayload)
	}
	if got := stringValue(headerPayload[mcpx.AgenticContextLinkedChatChainHeader]); got != "section-root,section-mid" {
		t.Fatalf("expected linked-chat chain header, got %#v", headerPayload)
	}
}

func TestPrepareOpenCodeConfigExplicitPathReadOnlyPreservesBasePayloadAndWritesSessionCopy(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	baseConfigPath := filepath.Join(root, "opencode-base.json")
	baseConfig, err := json.MarshalIndent(map[string]any{
		"model":      "gpt-4o-mini",
		"permission": map[string]any{"run": "ask"},
		"mcp": map[string]any{
			"other": map[string]any{
				"url": "http://example.com",
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
	originalContent, err := os.ReadFile(baseConfigPath)
	if err != nil {
		t.Fatalf("read original opencode base config: %v", err)
	}

	executor := &OpenCodeExecutor{
		settaFilesRoot: root,
		settaServerURL: "http://127.0.0.1:8000/mcp",
	}
	configPath, err := executor.prepareOpenCodeConfig(externalagentconfigs.Config{
		ID:                      "opencode-explicit-read-only",
		ToolType:                externalagentconfigs.ToolTypeOpenCode,
		RunMode:                 externalagentconfigs.RunModeSDK,
		SettingsMode:            externalagentconfigs.SettingsModeExplicitPath,
		SettingsFilePath:        stringPtr(baseConfigPath),
		SettingsAllowSettaEdits: false,
	}, "chat-alpha", map[string]any{
		"model":          "gpt-5.2-chat-latest",
		"approvalPolicy": `{"shell":"allow"}`,
	}, nil, false, map[string]string{
		"Cookie": "setta_auth=value",
	})
	if err != nil {
		t.Fatalf("prepare read-only opencode config: %v", err)
	}

	expectedRuntimePath := filepath.Join(
		root,
		codexSettingsRootName,
		"opencode",
		"opencode-explicit-read-only",
		"sessions",
		"chat-alpha",
		openCodeConfigFileName,
	)
	if configPath != expectedRuntimePath {
		t.Fatalf("expected session-scoped runtime path %q, got %q", expectedRuntimePath, configPath)
	}
	runtimePayload := map[string]any{}
	content, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read runtime opencode config: %v", err)
	}
	if err := json.Unmarshal(content, &runtimePayload); err != nil {
		t.Fatalf("decode runtime opencode config: %v", err)
	}
	if got := stringValue(runtimePayload["model"]); got != "gpt-4o-mini" {
		t.Fatalf("expected base model to survive, got %#v", runtimePayload["model"])
	}
	if permission, ok := mapValue(runtimePayload["permission"]); !ok || stringValue(permission["run"]) != "ask" {
		t.Fatalf("expected base permission payload to survive, got %#v", runtimePayload["permission"])
	}
	mcpEntries, ok := mapValue(runtimePayload["mcp"])
	if !ok {
		t.Fatalf("expected runtime mcp payload, got %#v", runtimePayload["mcp"])
	}
	if otherEntry, ok := mapValue(mcpEntries["other"]); !ok || stringValue(otherEntry["url"]) != "http://example.com" {
		t.Fatalf("expected inherited other mcp entry, got %#v", mcpEntries["other"])
	}
	settaEntry, ok := mapValue(mcpEntries["setta"])
	if !ok {
		t.Fatalf("expected injected setta mcp entry, got %#v", mcpEntries["setta"])
	}
	if stringValue(settaEntry["url"]) != "http://127.0.0.1:8000/mcp" || stringValue(settaEntry["type"]) != "remote" || settaEntry["enabled"] != true {
		t.Fatalf("expected injected setta mcp payload, got %#v", settaEntry)
	}
	headers, ok := mapValue(settaEntry["headers"])
	if !ok || stringValue(headers["Cookie"]) != "setta_auth=value" {
		t.Fatalf("expected injected setta headers, got %#v", settaEntry["headers"])
	}
	currentContent, err := os.ReadFile(baseConfigPath)
	if err != nil {
		t.Fatalf("read final opencode base config: %v", err)
	}
	if string(currentContent) != string(originalContent) {
		t.Fatalf("expected explicit source config to remain unchanged")
	}
}

func TestPrepareOpenCodeConfigReadOnlyModeWritesSessionScopedArtifact(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	baseConfigPath := filepath.Join(root, codexSettingsRootName, "opencode", "opencode-read-only", openCodeConfigFileName)
	if err := os.MkdirAll(filepath.Dir(baseConfigPath), 0o755); err != nil {
		t.Fatalf("mkdir opencode canonical config dir: %v", err)
	}
	baseConfig, err := json.MarshalIndent(map[string]any{
		"model": "gpt-4o-mini",
	}, "", "  ")
	if err != nil {
		t.Fatalf("encode opencode canonical config: %v", err)
	}
	baseConfig = append(baseConfig, '\n')
	if err := os.WriteFile(baseConfigPath, baseConfig, 0o644); err != nil {
		t.Fatalf("write opencode canonical config: %v", err)
	}
	originalContent, err := os.ReadFile(baseConfigPath)
	if err != nil {
		t.Fatalf("read original opencode canonical config: %v", err)
	}

	executor := &OpenCodeExecutor{
		settaFilesRoot: root,
		settaServerURL: "http://127.0.0.1:8000/mcp",
	}
	configPath, err := executor.prepareOpenCodeConfig(externalagentconfigs.Config{
		ID:           "opencode-read-only",
		ToolType:     externalagentconfigs.ToolTypeOpenCode,
		RunMode:      externalagentconfigs.RunModeSDK,
		SettingsMode: externalagentconfigs.SettingsModeReadOnly,
	}, "chat-beta", map[string]any{}, nil, false, nil)
	if err != nil {
		t.Fatalf("prepare read-only opencode config: %v", err)
	}

	if configPath == baseConfigPath {
		t.Fatalf("expected read-only runtime config to use a session artifact, got base path %q", configPath)
	}
	runtimePayload := map[string]any{}
	content, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read runtime opencode config: %v", err)
	}
	if err := json.Unmarshal(content, &runtimePayload); err != nil {
		t.Fatalf("decode runtime opencode config: %v", err)
	}
	if got := stringValue(runtimePayload["model"]); got != "gpt-4o-mini" {
		t.Fatalf("expected base model to survive in session artifact, got %#v", runtimePayload["model"])
	}
	mcpEntries, ok := mapValue(runtimePayload["mcp"])
	if !ok {
		t.Fatalf("expected injected runtime mcp payload, got %#v", runtimePayload["mcp"])
	}
	settaEntry, ok := mapValue(mcpEntries["setta"])
	if !ok || stringValue(settaEntry["url"]) != "http://127.0.0.1:8000/mcp" {
		t.Fatalf("expected injected setta entry in read-only session artifact, got %#v", mcpEntries["setta"])
	}
	currentContent, err := os.ReadFile(baseConfigPath)
	if err != nil {
		t.Fatalf("read final opencode canonical config: %v", err)
	}
	if string(currentContent) != string(originalContent) {
		t.Fatalf("expected canonical read-only base config to remain unchanged")
	}
}

func TestPrepareOpenCodeConfigReadOnlyModeOmitsConfiguredPermission(t *testing.T) {
	t.Parallel()

	root := t.TempDir()
	executor := &OpenCodeExecutor{
		settaFilesRoot: root,
		settaServerURL: "http://127.0.0.1:8000/mcp",
	}
	configPath, err := executor.prepareOpenCodeConfig(externalagentconfigs.Config{
		ID:             "opencode-read-only-no-permission",
		ToolType:       externalagentconfigs.ToolTypeOpenCode,
		RunMode:        externalagentconfigs.RunModeSDK,
		ApprovalPolicy: stringPtr("ask"),
		SettingsMode:   externalagentconfigs.SettingsModeReadOnly,
	}, "chat-gamma", map[string]any{}, nil, false, nil)
	if err != nil {
		t.Fatalf("prepare read-only opencode config with approval policy: %v", err)
	}

	content, err := os.ReadFile(configPath)
	if err != nil {
		t.Fatalf("read read-only opencode config: %v", err)
	}
	payload := map[string]any{}
	if err := json.Unmarshal(content, &payload); err != nil {
		t.Fatalf("decode read-only opencode config: %v", err)
	}
	if _, ok := payload["permission"]; ok {
		t.Fatalf("expected read-only runtime config to omit permission, got %#v", payload["permission"])
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

func TestOpenCodeExecutorGuardEnabledSamePayloadToolResultPreventsFalseBlock(t *testing.T) {
	// With the completion guard enabled, a same-payload completion report with
	// passing checks should still let the final assistant completion text persist.
	fixture := newOpenCodeExecutorFixture(t, openCodeFixtureOptions{
		scenario:               "same_payload",
		completionGuardEnabled: boolPtr(true),
	})
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
		t.Fatalf("start opencode same-payload guard-enabled run: %v", err)
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
	for _, rawMessage := range messages {
		message, ok := rawMessage.(map[string]any)
		if !ok {
			continue
		}
		role, _ := messageRole(message)
		if role == "assistant" && extractMessageText(message) == "Task A is done." {
			assistantFound = true
			break
		}
	}
	if !assistantFound {
		t.Fatalf("expected passing same-payload report to keep assistant completion text, got %#v", messages)
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestOpenCodeExecutorGuardEnabledRewritesMissingReportOnFinalize(t *testing.T) {
	// With the completion guard enabled, a finalized assistant completion claim
	// without any completion report should be rewritten before persistence.
	fixture := newOpenCodeExecutorFixture(t, openCodeFixtureOptions{
		scenario:               "guard_missing_report",
		completionGuardEnabled: boolPtr(true),
	})
	result, err := fixture.send.StartChat(context.Background(), StartChatRequest{
		Message: map[string]any{
			"id":   "user-1",
			"role": "user",
			"content": []any{
				map[string]any{"type": "text", "text": "Implement task A."},
			},
		},
		EngineConfigID:  fixture.engineID,
		ProjectConfigID: "project-alpha",
		AllowUnscoped:   true,
		PermissionMode:  ChatPermissionModeMinimal,
		SearchEnabled:   false,
	})
	if err != nil {
		t.Fatalf("start opencode missing-report guard-enabled run: %v", err)
	}

	persisted := fixture.waitForTerminalRun(t, result.Run.ID)
	if persisted.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed status, got %#v", persisted)
	}
	messages, ok := persisted.Outputs["messages"].([]any)
	if !ok || len(messages) == 0 {
		t.Fatalf("expected persisted output messages, got %#v", persisted.Outputs)
	}
	lastMessage, ok := messages[len(messages)-1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message, got %#v", messages[len(messages)-1])
	}
	if got := extractMessageText(lastMessage); got != missingReportMessage {
		t.Fatalf("expected missing-report rewrite %q, got %#v", missingReportMessage, lastMessage)
	}

	fixture.waitForLiveStateCleanup(t, result.Run.ID)
}

func TestOpenCodeExecutorPersistsServerModeMCPStatusSnapshot(t *testing.T) {
	// Verify server-mode runs merge runtime-config seeding with fetched `/mcp`
	// status payloads, including the generated Setta entry, and persist the
	// resulting snapshot into run outputs.
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
	if len(statuses) != 2 {
		t.Fatalf("expected filesystem plus generated setta status rows, got %#v", statuses)
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
	if got := statuses[1].ServerID; got != mcpx.DefaultServerID {
		t.Fatalf("unexpected generated server id %q", got)
	}
	if statuses[1].Transport != mcpx.Transport("remote") {
		t.Fatalf("expected generated setta transport remote, got %#v", statuses[1])
	}
	if statuses[1].Endpoint != "http://127.0.0.1:8000/mcp" {
		t.Fatalf("expected generated setta endpoint %q, got %#v", "http://127.0.0.1:8000/mcp", statuses[1])
	}
	if statuses[1].State != mcpx.RuntimeStateUnknown {
		t.Fatalf("expected generated setta status to remain unknown, got %#v", statuses[1])
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
			ID:                      configID,
			Name:                    "OpenCode fixture",
			ToolType:                externalagentconfigs.ToolTypeOpenCode,
			RunMode:                 runMode,
			CommandPath:             &commandPath,
			BaseURL:                 stringPtr(derefOptionalString(options.baseURL)),
			WorkingDirStrategy:      externalagentconfigs.WorkingDirStrategyProjectRoot,
			SettingsAllowSettaEdits: true,
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
	if options.completionGuardEnabled != nil {
		writeCodexCompletionGuardSetting(t, root, *options.completionGuardEnabled)
	}
	openCodeExecutor, err := NewOpenCodeExecutor(OpenCodeExecutorOptions{
		Runs:               runs,
		Runtime:            runtime,
		WorkspaceRoot:      root,
		SettaFilesRoot:     root,
		SettaServerURL:     "http://127.0.0.1:8000/mcp",
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
		SettaFilesRoot: root,
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
			case "guard_missing_report":
				if err := emitOpenCodeAssistantTurn(emit, "session-missing-report", "assistant-missing-report", "part-missing-report-1", "Task A is done."); err != nil {
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
