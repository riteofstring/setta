//go:build liveprovider

package app

import (
	"context"
	"encoding/json"
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

	"setta/internal/agentruns"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/llmconfig"
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

type appManagedLiveProviderTestCase struct {
	provider    string
	model       string
	apiKeyEnv   string
	host        string
	otherParams map[string]any
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
