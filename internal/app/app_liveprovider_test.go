//go:build liveprovider

package app

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net"
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
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/llmconfig"
	"setta/internal/mcpx"
	"setta/internal/observability"
	"setta/internal/projectstate"
)

func TestAppServesManagedChatSendThroughOpenAILiveProvider(t *testing.T) {
	runAppManagedChatLiveProviderTest(t, appManagedLiveProviderTestCase{
		provider:  "openai",
		model:     "gpt-4o-mini",
		apiKeyEnv: "OPENAI_API_KEY",
		host:      "api.openai.com:443",
		otherParams: map[string]any{
			"temperature": 0,
		},
	})
}

func TestAppServesManagedChatSendThroughAnthropicLiveProvider(t *testing.T) {
	runAppManagedChatLiveProviderTest(t, appManagedLiveProviderTestCase{
		provider:  "anthropic",
		model:     "claude-sonnet-4-5-20250929",
		apiKeyEnv: "ANTHROPIC_API_KEY",
		host:      "api.anthropic.com:443",
		otherParams: map[string]any{
			"max_tokens": 64,
		},
	})
}

func TestAppServesManagedChatToolCallThroughOpenAILiveProvider(t *testing.T) {
	runAppManagedChatLiveProviderToolCallTest(t, appManagedLiveProviderTestCase{
		provider:  "openai",
		model:     "gpt-4o-mini",
		apiKeyEnv: "OPENAI_API_KEY",
		host:      "api.openai.com:443",
		otherParams: map[string]any{
			"temperature": 0,
		},
	})
}

func TestAppServesManagedChatToolCallThroughAnthropicLiveProvider(t *testing.T) {
	runAppManagedChatLiveProviderToolCallTest(t, appManagedLiveProviderTestCase{
		provider:  "anthropic",
		model:     "claude-sonnet-4-5-20250929",
		apiKeyEnv: "ANTHROPIC_API_KEY",
		host:      "api.anthropic.com:443",
		otherParams: map[string]any{
			"temperature": 0,
			"max_tokens":  256,
		},
	})
}

type appManagedLiveProviderTestCase struct {
	provider    string
	model       string
	apiKeyEnv   string
	host        string
	otherParams map[string]any
	thinking    bool
}

func runAppManagedChatLiveProviderTest(t *testing.T, testCase appManagedLiveProviderTestCase) {
	t.Helper()

	apiKey := requireAppLiveProviderAPIKey(t, testCase.apiKeyEnv, testCase.host)

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)
	t.Setenv(testCase.apiKeyEnv, apiKey)

	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"primary": {
				ID:          "primary",
				Model:       testCase.model,
				Provider:    testCase.provider,
				APIKeyEnv:   testCase.apiKeyEnv,
				OtherParams: testCase.otherParams,
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("save llm config: %v", err)
	}

	engineStore, err := agentruns.NewEngineStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	managedConfigID := "primary"
	if err := engineStore.Write([]agentruns.EngineConfig{
		{
			ID:               "engine-managed",
			Name:             "Managed Live Provider Engine",
			EngineType:       agentruns.EngineTypeSettaLLM,
			SettaLLMConfigID: &managedConfigID,
		},
	}); err != nil {
		t.Fatalf("write engine config: %v", err)
	}

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if _, err := app.ProjectStates().Main().MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed app project: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)
	request, err := http.NewRequest(
		http.MethodPost,
		server.URL+"/api"+httpapi.RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Reply with exactly HELLO and nothing else."}]},
			"engineConfigId":"engine-managed",
			"agentProfileId":null,
			"thinking":false,
			"projectConfigId":"project-alpha",
			"sectionId":null,
			"allowUnscoped":true,
			"permissionMode":"minimal",
			"searchEnabled":false
		}`),
	)
	if err != nil {
		t.Fatalf("new send request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("send managed chat: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var chatID string
	if err := json.NewDecoder(response.Body).Decode(&chatID); err != nil {
		t.Fatalf("decode send chat id: %v", err)
	}
	if strings.TrimSpace(chatID) == "" {
		t.Fatal("expected managed chat id")
	}

	type hydratePayload struct {
		Messages           []map[string]any `json:"messages"`
		WaitingForResponse bool             `json:"waitingForResponse"`
		LLMConfig          *struct {
			ID string `json:"id"`
		} `json:"llmConfig"`
	}
	var hydrated hydratePayload
	waitForAppCondition(t, 90*time.Second, func() bool {
		hydrateRequest, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+httpapi.RouteGetLLMChat,
			strings.NewReader(`{"chatId":"`+chatID+`","projectConfigId":"project-alpha"}`),
		)
		if err != nil {
			t.Fatalf("new hydrate request: %v", err)
		}
		hydrateRequest.Header.Set("Content-Type", "application/json")
		hydrateRequest.AddCookie(authCookie)

		hydrateResponse, err := http.DefaultClient.Do(hydrateRequest)
		if err != nil {
			t.Fatalf("hydrate managed chat: %v", err)
		}
		defer hydrateResponse.Body.Close()
		if hydrateResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(hydrateResponse.Body)
			t.Fatalf("expected hydrate 200, got %d with body %q", hydrateResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(hydrateResponse.Body).Decode(&hydrated); err != nil {
			t.Fatalf("decode hydrate payload: %v", err)
		}
		return !hydrated.WaitingForResponse && len(hydrated.Messages) == 2
	})

	if hydrated.LLMConfig == nil || hydrated.LLMConfig.ID != "primary" {
		t.Fatalf("expected hydrated llm config primary, got %#v", hydrated.LLMConfig)
	}
	if text := strings.TrimSpace(appTestMessageText(hydrated.Messages[1])); text != "HELLO" {
		t.Fatalf("unexpected hydrated assistant reply %q", text)
	}

	runStore, err := agentruns.NewRunStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	runType := "llm_chat"
	projectID := "project-alpha"
	completedRunID := ""
	waitForAppCondition(t, 90*time.Second, func() bool {
		runs, err := runStore.ListByMetadata(agentruns.RunFilter{
			RunType:         &runType,
			ChatID:          &chatID,
			ProjectConfigID: &projectID,
		})
		if err != nil {
			t.Fatalf("list managed runs: %v", err)
		}
		for _, run := range runs {
			if run.Status == agentruns.RunStatusCompleted {
				completedRunID = run.ID
				return true
			}
		}
		return false
	})
	if strings.TrimSpace(completedRunID) == "" {
		t.Fatal("expected completed managed run id")
	}

	waitCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	completedRun, err := app.ManagedAgentRuntime().WaitForRun(waitCtx, completedRunID)
	if err != nil {
		t.Fatalf("wait for managed runtime completion: %v", err)
	}
	if completedRun.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed run, got %#v", completedRun)
	}

	outputMessages, ok := completedRun.Outputs["messages"].([]any)
	if !ok || len(outputMessages) != 2 {
		t.Fatalf("expected persisted user and assistant messages, got %#v", completedRun.Outputs["messages"])
	}
	assistant, ok := outputMessages[1].(map[string]any)
	if !ok {
		t.Fatalf("expected assistant message map, got %#v", outputMessages[1])
	}
	if text := strings.TrimSpace(appTestMessageText(assistant)); text != "HELLO" {
		t.Fatalf("unexpected persisted assistant reply %q", text)
	}

	usage, ok := completedRun.Outputs["usage"].(map[string]any)
	if !ok {
		t.Fatalf("expected usage payload, got %#v", completedRun.Outputs["usage"])
	}
	assertAppPositiveUsageField(t, usage, "prompt_tokens")
	assertAppPositiveUsageField(t, usage, "completion_tokens")
	assertAppPositiveUsageField(t, usage, "total_tokens")
}

func runAppManagedChatLiveProviderToolCallTest(t *testing.T, testCase appManagedLiveProviderTestCase) {
	t.Helper()

	apiKey := requireAppLiveProviderAPIKey(t, testCase.apiKeyEnv, testCase.host)
	// Keep the live tool-call coverage read-only and low-volume so the
	// provider only sees a harmless metadata lookup, not a mutation tool.
	safeToolName := mcpx.BuildNamespacedToolName(mcpx.DefaultServerID, "getProjectConfigNamesAndIds")
	profileID := "profile-managed-live-provider-tools"
	systemPrompt := "Call the tool " + safeToolName + " exactly once before responding. Do not call any other tool. After the tool result, reply with exactly TOOL_OK and nothing else."
	userPrompt := "Call the tool " + safeToolName + " exactly once, then reply with exactly TOOL_OK and nothing else."

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	cfg.Server.Host = "127.0.0.1"
	prepareAppCurrentSession(t, cfg)
	t.Setenv(testCase.apiKeyEnv, apiKey)

	listener, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("listen: %v", err)
	}
	cfg.Server.Port = listener.Addr().(*net.TCPAddr).Port
	serverURL := "http://" + listener.Addr().String()

	if err := llmconfig.Save(llmconfig.Path(cfg.Paths.SettaFilesRoot), llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"primary": {
				ID:           "primary",
				Model:        testCase.model,
				Provider:     testCase.provider,
				APIKeyEnv:    testCase.apiKeyEnv,
				OtherParams:  testCase.otherParams,
				MCPServerIDs: []string{mcpx.DefaultServerID},
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{
			mcpx.DefaultServerID: {
				Transport: "sse",
				URL:       serverURL + "/mcp",
			},
		},
	}); err != nil {
		t.Fatalf("save llm config: %v", err)
	}

	engineStore, err := agentruns.NewEngineStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	managedConfigID := "primary"
	if err := engineStore.Write([]agentruns.EngineConfig{
		{
			ID:               "engine-managed",
			Name:             "Managed Live Provider Tool Engine",
			EngineType:       agentruns.EngineTypeSettaLLM,
			SettaLLMConfigID: &managedConfigID,
		},
	}); err != nil {
		t.Fatalf("write engine config: %v", err)
	}

	saveAppAgentProfiles(t, cfg, []agentprofiles.Profile{
		{
			ID:            profileID,
			Name:          "Managed Live Provider Tools",
			SystemPrompt:  systemPrompt,
			ToolAllowlist: []string{safeToolName},
		},
	})

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	setAppCompletionGuardEnabled(t, app, false)

	server := &http.Server{Handler: app.Handler()}
	serverErrors := make(chan error, 1)
	go func() {
		serverErrors <- server.Serve(listener)
	}()

	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
		shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil && !errors.Is(err, http.ErrServerClosed) {
			t.Fatalf("shutdown http server: %v", err)
		}
		err := <-serverErrors
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			t.Fatalf("serve app: %v", err)
		}
	})

	waitForAppMCPClientState(t, app, mcpx.RuntimeStateConnected)

	if _, err := app.ProjectStates().Main().MutateAndSave(context.Background(), func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = projectstate.Project{
			ID:   "project-alpha",
			Name: "Alpha",
		}
		return document, nil
	}); err != nil {
		t.Fatalf("seed app project: %v", err)
	}

	authCookie := newAppTestAuthCookie(t, app)
	requestBody, err := json.Marshal(map[string]any{
		"chatId": nil,
		"message": map[string]any{
			"id":   "user-managed-tools",
			"role": "user",
			"content": []any{
				map[string]any{
					"type": "text",
					"text": userPrompt,
				},
			},
		},
		"engineConfigId":  "engine-managed",
		"agentProfileId":  profileID,
		"thinking":        testCase.thinking,
		"projectConfigId": "project-alpha",
		"sectionId":       nil,
		"allowUnscoped":   true,
		"permissionMode":  "minimal",
		"searchEnabled":   false,
	})
	if err != nil {
		t.Fatalf("marshal send request: %v", err)
	}
	request, err := http.NewRequest(
		http.MethodPost,
		serverURL+"/api"+httpapi.RouteGetLLMResponse,
		bytes.NewReader(requestBody),
	)
	if err != nil {
		t.Fatalf("new send request: %v", err)
	}
	request.Header.Set("Content-Type", "application/json")
	request.AddCookie(authCookie)

	response, err := http.DefaultClient.Do(request)
	if err != nil {
		t.Fatalf("send managed chat: %v", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(response.Body)
		t.Fatalf("expected 200, got %d with body %q", response.StatusCode, string(body))
	}

	var chatID string
	if err := json.NewDecoder(response.Body).Decode(&chatID); err != nil {
		t.Fatalf("decode send chat id: %v", err)
	}
	if strings.TrimSpace(chatID) == "" {
		t.Fatal("expected managed chat id")
	}

	type hydratePayload struct {
		Messages           []map[string]any `json:"messages"`
		WaitingForResponse bool             `json:"waitingForResponse"`
		LLMConfig          *struct {
			ID string `json:"id"`
		} `json:"llmConfig"`
	}
	var hydrated hydratePayload
	runStore, err := agentruns.NewRunStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	runType := "llm_chat"
	projectID := "project-alpha"
	var terminalRun *agentruns.Run
	deadline := time.Now().Add(120 * time.Second)
	for time.Now().Before(deadline) {
		hydrateBody, err := json.Marshal(map[string]any{
			"chatId":          chatID,
			"projectConfigId": "project-alpha",
		})
		if err != nil {
			t.Fatalf("marshal hydrate request: %v", err)
		}
		hydrateRequest, err := http.NewRequest(
			http.MethodPost,
			serverURL+"/api"+httpapi.RouteGetLLMChat,
			bytes.NewReader(hydrateBody),
		)
		if err != nil {
			t.Fatalf("new hydrate request: %v", err)
		}
		hydrateRequest.Header.Set("Content-Type", "application/json")
		hydrateRequest.AddCookie(authCookie)

		hydrateResponse, err := http.DefaultClient.Do(hydrateRequest)
		if err != nil {
			t.Fatalf("hydrate managed chat: %v", err)
		}
		defer hydrateResponse.Body.Close()
		if hydrateResponse.StatusCode != http.StatusOK {
			body, _ := io.ReadAll(hydrateResponse.Body)
			t.Fatalf("expected hydrate 200, got %d with body %q", hydrateResponse.StatusCode, string(body))
		}
		if err := json.NewDecoder(hydrateResponse.Body).Decode(&hydrated); err != nil {
			t.Fatalf("decode hydrate payload: %v", err)
		}
		runs, err := runStore.ListByMetadata(agentruns.RunFilter{
			RunType:         &runType,
			ChatID:          &chatID,
			ProjectConfigID: &projectID,
		})
		if err != nil {
			t.Fatalf("list managed runs: %v", err)
		}
		terminalRun = nil
		for index := range runs {
			run := runs[index]
			if run.Status == agentruns.RunStatusCompleted || run.Status == agentruns.RunStatusFailed || run.Status == agentruns.RunStatusCancelled {
				terminalRun = &run
			}
		}
		if !hydrated.WaitingForResponse || terminalRun != nil {
			break
		}
		time.Sleep(50 * time.Millisecond)
	}
	if hydrated.WaitingForResponse && terminalRun == nil {
		t.Fatalf("timed out waiting for managed tool-call chat to finish; latest hydrated %#v", hydrated)
	}
	if terminalRun != nil && terminalRun.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed managed tool-call run, got status=%q outputs=%#v events=%#v hydrated=%#v", terminalRun.Status, terminalRun.Outputs, terminalRun.Events, hydrated)
	}
	if hydrated.WaitingForResponse {
		t.Fatalf("expected hydrated chat to stop waiting, got %#v", hydrated)
	}

	if hydrated.LLMConfig == nil || hydrated.LLMConfig.ID != "primary" {
		t.Fatalf("expected hydrated llm config primary, got %#v", hydrated.LLMConfig)
	}
	lastHydratedMessage := hydrated.Messages[len(hydrated.Messages)-1]
	if text := strings.TrimSpace(appTestMessageText(lastHydratedMessage)); text != "TOOL_OK" {
		t.Fatalf("unexpected hydrated assistant reply %q", text)
	}
	if !appLiveProviderHasToolMessage(hydrated.Messages, safeToolName) {
		t.Fatalf("expected hydrated tool message for %q, got %#v", safeToolName, hydrated.Messages)
	}

	completedRunID := ""
	if terminalRun != nil {
		completedRunID = terminalRun.ID
	} else {
		waitForAppCondition(t, 30*time.Second, func() bool {
			runs, err := runStore.ListByMetadata(agentruns.RunFilter{
				RunType:         &runType,
				ChatID:          &chatID,
				ProjectConfigID: &projectID,
			})
			if err != nil {
				t.Fatalf("list managed runs: %v", err)
			}
			for _, run := range runs {
				if run.Status == agentruns.RunStatusCompleted {
					completedRunID = run.ID
					return true
				}
			}
			return false
		})
	}
	if strings.TrimSpace(completedRunID) == "" {
		t.Fatal("expected completed managed run id")
	}

	waitCtx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	completedRun, err := app.ManagedAgentRuntime().WaitForRun(waitCtx, completedRunID)
	if err != nil {
		t.Fatalf("wait for managed runtime completion: %v", err)
	}
	if completedRun.Status != agentruns.RunStatusCompleted {
		t.Fatalf("expected completed run, got %#v", completedRun)
	}

	outputMessages, ok := completedRun.Outputs["messages"].([]any)
	if !ok || len(outputMessages) < 4 {
		t.Fatalf("expected user, tool-call assistant, tool, and final assistant messages, got %#v", completedRun.Outputs["messages"])
	}
	lastOutputMessage, ok := outputMessages[len(outputMessages)-1].(map[string]any)
	if !ok {
		t.Fatalf("expected final assistant message map, got %#v", outputMessages[len(outputMessages)-1])
	}
	if text := strings.TrimSpace(appTestMessageText(lastOutputMessage)); text != "TOOL_OK" {
		t.Fatalf("unexpected persisted assistant reply %q", text)
	}
	if !appLiveProviderHasAnyToolMessage(outputMessages, safeToolName) {
		t.Fatalf("expected persisted tool message for %q, got %#v", safeToolName, outputMessages)
	}
	if !appLiveProviderHasToolCall(completedRun.ToolCalls, safeToolName) {
		t.Fatalf("expected persisted tool call for %q, got %#v", safeToolName, completedRun.ToolCalls)
	}

	usage, ok := completedRun.Outputs["usage"].(map[string]any)
	if !ok {
		t.Fatalf("expected usage payload, got %#v", completedRun.Outputs["usage"])
	}
	assertAppPositiveUsageField(t, usage, "prompt_tokens")
	assertAppPositiveUsageField(t, usage, "completion_tokens")
	assertAppPositiveUsageField(t, usage, "total_tokens")
}

func requireAppLiveProviderAPIKey(t *testing.T, key string, host string) string {
	t.Helper()

	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		value = strings.TrimSpace(loadAppRepoDotEnvValue(t, key))
	}
	if value == "" {
		t.Skipf("%s not set in env or repo .env", key)
	}
	t.Setenv(key, value)

	conn, err := net.DialTimeout("tcp", host, 3*time.Second)
	if err != nil {
		t.Skipf("cannot reach %s: %v", host, err)
	}
	if closeErr := conn.Close(); closeErr != nil {
		t.Fatalf("close reachability probe: %v", closeErr)
	}

	return value
}

func loadAppRepoDotEnvValue(t *testing.T, key string) string {
	t.Helper()

	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatalf("locate current file")
	}
	repoRoot := filepath.Clean(filepath.Join(filepath.Dir(currentFile), "..", ".."))
	values, err := llmconfig.ReadEnvFile(filepath.Join(repoRoot, ".env"))
	if err != nil {
		t.Fatalf("read repo .env: %v", err)
	}
	return strings.TrimSpace(values[key])
}

func assertAppPositiveUsageField(t *testing.T, usage map[string]any, field string) {
	t.Helper()

	switch value := usage[field].(type) {
	case float64:
		if value > 0 {
			return
		}
	case int:
		if value > 0 {
			return
		}
	case int64:
		if value > 0 {
			return
		}
	}
	t.Fatalf("expected positive %s in usage payload, got %#v", field, usage[field])
}

func appLiveProviderHasToolMessage(messages []map[string]any, toolName string) bool {
	for _, message := range messages {
		role, _ := message["role"].(string)
		currentToolName, _ := message["tool_name"].(string)
		if role == "tool" && currentToolName == toolName {
			return true
		}
	}
	return false
}

func appLiveProviderHasAnyToolMessage(messages []any, toolName string) bool {
	for _, rawMessage := range messages {
		message, ok := rawMessage.(map[string]any)
		if !ok {
			continue
		}
		role, _ := message["role"].(string)
		currentToolName, _ := message["tool_name"].(string)
		if role == "tool" && currentToolName == toolName {
			return true
		}
	}
	return false
}

func appLiveProviderHasToolCall(toolCalls []map[string]any, toolName string) bool {
	for _, call := range toolCalls {
		function, ok := call["function"].(map[string]any)
		if !ok {
			continue
		}
		name, _ := function["name"].(string)
		if name == toolName {
			return true
		}
	}
	return false
}
