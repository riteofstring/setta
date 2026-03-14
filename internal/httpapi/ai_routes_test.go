package httpapi

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/coder/websocket"
	"github.com/go-chi/chi/v5"
	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/externalagentconfigs"
	"setta/internal/externalagents"
	"setta/internal/llmconfig"
	"setta/internal/managedchat"
	"setta/internal/managedllm"
	"setta/internal/mcpx"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/realtime"
	"setta/internal/tools"
	"setta/internal/transcriptionprofiles"
	"setta/internal/transcriptionsessions"
)

type aiRouteStubController struct {
	cancelCalls   int
	approvalCalls []aiRouteApprovalCall
	toolCalls     []aiRouteToolCall
}

type aiRouteApprovalCall struct {
	ApprovalID string
	Approved   bool
}

type aiRouteToolCall struct {
	ToolCallID string
	Payload    map[string]any
}

type aiRouteStubExecutor struct {
	last     *externalagents.StartRequest
	response externalagents.StartResponse
	err      error
}

func (s *aiRouteStubExecutor) Start(_ context.Context, request externalagents.StartRequest) (externalagents.StartResponse, error) {
	cloned := request
	cloned.Inputs = cloneRouteAnyMap(request.Inputs)
	s.last = &cloned
	if s.err != nil {
		return externalagents.StartResponse{}, s.err
	}
	return s.response, nil
}

type aiRouteStubManagedStarter struct {
	lastProfile *agentprofiles.Profile
	lastInputs  map[string]any
	run         agentruns.Run
	err         error
	disabled    bool
}

func (s *aiRouteStubManagedStarter) Disabled() bool {
	return s == nil || s.disabled
}

func (s *aiRouteStubManagedStarter) StartRun(profile agentprofiles.Profile, inputs map[string]any) (agentruns.Run, error) {
	s.lastProfile = cloneAIRouteProfile(&profile)
	s.lastInputs = cloneRouteAnyMap(inputs)
	if s.err != nil {
		return agentruns.Run{}, s.err
	}
	if strings.TrimSpace(s.run.ID) != "" {
		cloned := s.run.Clone()
		cloned.Inputs = cloneRouteAnyMap(s.run.Inputs)
		return cloned, nil
	}
	profileID := strings.TrimSpace(profile.ID)
	var runProfileID *string
	if profileID != "" {
		runProfileID = &profileID
	}
	return agentruns.NewRun(runProfileID, inputs, time.Date(2026, 3, 9, 9, 0, 0, 0, time.UTC)), nil
}

type aiRouteStubPreflightChecker struct {
	status externalagentconfigs.Status
	err    error
}

type aiRouteStaticFollowToolProvider struct{}

type aiRouteStaticSessionProvider struct {
	current *auth.CurrentSession
}

func (p aiRouteStaticSessionProvider) CurrentSession() (*auth.CurrentSession, bool) {
	if p.current == nil {
		return nil, false
	}
	return p.current, true
}

func (aiRouteStaticFollowToolProvider) ToolDescriptorsForServers(serverIDs map[string]struct{}) map[string]mcpx.ToolDescriptor {
	if len(serverIDs) != 0 {
		if _, ok := serverIDs[mcpx.DefaultServerID]; !ok {
			return map[string]mcpx.ToolDescriptor{}
		}
	}
	toolName := mcpx.BuildNamespacedToolName(mcpx.DefaultServerID, "setSectionSize")
	return map[string]mcpx.ToolDescriptor{
		toolName: {
			ServerID:       mcpx.DefaultServerID,
			NamespacedName: toolName,
			Metadata: &tools.Metadata{
				IDPathsByType: map[tools.IDType][]string{
					tools.IDTypeSection: {"sectionId"},
				},
			},
		},
	}
}

func (s aiRouteStubPreflightChecker) Check(config externalagentconfigs.Config) (externalagentconfigs.Status, error) {
	if s.err != nil {
		return externalagentconfigs.Status{}, s.err
	}
	status := s.status
	if status.ConfigID == "" {
		status.ConfigID = config.ID
		status.Name = config.Name
		status.ToolType = config.ToolType
		status.RunMode = config.RunMode
		status.Supported = true
		status.Available = true
		status.Issues = []string{}
	}
	return status, nil
}

func (s *aiRouteStubController) Cancel() error {
	s.cancelCalls++
	return nil
}

func (s *aiRouteStubController) SendApprovalResponse(approvalID string, approved bool) error {
	s.approvalCalls = append(s.approvalCalls, aiRouteApprovalCall{
		ApprovalID: approvalID,
		Approved:   approved,
	})
	return nil
}

func (s *aiRouteStubController) SendToolResponse(toolCallID string, payload map[string]any) error {
	s.toolCalls = append(s.toolCalls, aiRouteToolCall{
		ToolCallID: toolCallID,
		Payload:    cloneRouteAnyMap(payload),
	})
	return nil
}

func TestRegisterAIRoutesStartsExternalAgentChat(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-1","role":"user","content":[{"type":"text","text":"Create a new section."}]},
			"engineConfigId":"engine-external",
			"agentProfileId":null,
			"thinking":false,
			"projectConfigId":"project-alpha",
			"sectionId":null,
			"frontendAffinityToken":"  frontend-external  ",
			"allowUnscoped":true,
			"permissionMode":"minimal",
			"searchEnabled":false
		}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var chatID string
	if err := json.Unmarshal(response.Body.Bytes(), &chatID); err != nil {
		t.Fatalf("decode chat id: %v", err)
	}
	if chatID == "" {
		t.Fatal("expected chat id")
	}
	if fixture.managedStarter.lastInputs != nil {
		t.Fatalf("expected external send to bypass managed starter, got %#v", fixture.managedStarter.lastInputs)
	}
	runs, err := fixture.store.List()
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 1 {
		t.Fatalf("expected one persisted run, got %#v", runs)
	}
	if got := runs[0].Inputs["frontendAffinityToken"]; got != "frontend-external" {
		t.Fatalf("unexpected frontendAffinityToken %#v", got)
	}
	state, err := fixture.runtime.GetLiveChatState(runs[0].ID)
	if err != nil {
		t.Fatalf("get live chat state: %v", err)
	}
	if state == nil || !state.WaitingForResponse {
		t.Fatalf("expected active waiting state, got %#v", state)
	}
}

func TestRegisterAIRoutesStartsManagedChat(t *testing.T) {
	t.Parallel()

	managedStarter := &aiRouteStubManagedStarter{}
	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{managedStarter: managedStarter})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Create a managed project."}]},
			"engineConfigId":"engine-managed",
			"agentProfileId":null,
			"thinking":false,
			"projectConfigId":"project-alpha",
			"sectionId":null,
			"frontendAffinityToken":"  frontend-managed  ",
			"allowUnscoped":true,
			"permissionMode":"minimal",
			"searchEnabled":false
		}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var chatID string
	if err := json.Unmarshal(response.Body.Bytes(), &chatID); err != nil {
		t.Fatalf("decode managed chat id: %v", err)
	}
	if chatID == "" {
		t.Fatal("expected managed chat id")
	}
	if fixture.managedStarter.lastInputs == nil {
		t.Fatal("expected managed starter to receive inputs")
	}
	if fixture.managedStarter.lastInputs["chatId"] != chatID {
		t.Fatalf("expected managed chat id %q in starter inputs, got %#v", chatID, fixture.managedStarter.lastInputs["chatId"])
	}
	if fixture.managedStarter.lastInputs["runType"] != managedchat.RunTypeManagedChat {
		t.Fatalf("expected managed run type, got %#v", fixture.managedStarter.lastInputs["runType"])
	}
	rawMessages, ok := fixture.managedStarter.lastInputs["messages"].([]any)
	if !ok || len(rawMessages) != 1 {
		t.Fatalf("expected managed message payload, got %#v", fixture.managedStarter.lastInputs["messages"])
	}
	if message, ok := rawMessages[0].(map[string]any); !ok || message["id"] != "user-managed" {
		t.Fatalf("expected managed message in starter inputs, got %#v", rawMessages[0])
	}
	runs, err := fixture.store.List()
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 0 {
		t.Fatalf("expected managed route test not to persist external runs through the stubbed starter, got %#v", runs)
	}
}

func TestRegisterAIRoutesRejectsWhitespaceFrontendAffinityTokenForExternalSend(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-1","role":"user","content":[{"type":"text","text":"Create a new section."}]},
			"engineConfigId":"engine-external",
			"thinking":false,
			"projectConfigId":"project-alpha",
			"sectionId":null,
			"frontendAffinityToken":"   ",
			"allowUnscoped":true,
			"permissionMode":"minimal",
			"searchEnabled":false
		}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "frontend_affinity_token_invalid" {
		t.Fatalf("expected frontend affinity token error, got %#v", payload)
	}
}

func TestRegisterAIRoutesReturnsUnavailableForManagedChatWhenStarterDisabled(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Create a managed project."}]},
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
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "agent_runner_unavailable" {
		t.Fatalf("expected agent_runner_unavailable, got %#v", payload)
	}
}

func TestRegisterAIRoutesReturnsBadRequestForManagedThinkingUnsupported(t *testing.T) {
	t.Parallel()

	managedStarter := &aiRouteStubManagedStarter{err: managedllm.ErrReasoningUnsupported}
	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{managedStarter: managedStarter})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Think through this."}]},
			"engineConfigId":"engine-managed",
			"agentProfileId":null,
			"thinking":true,
			"projectConfigId":"project-alpha",
			"sectionId":null,
			"allowUnscoped":true,
			"permissionMode":"minimal",
			"searchEnabled":false
		}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "thinking_unsupported" {
		t.Fatalf("expected thinking_unsupported, got %#v", payload)
	}
}

func TestRegisterAIRoutesReturnsBadRequestForManagedProviderUnsupported(t *testing.T) {
	t.Parallel()

	managedStarter := &aiRouteStubManagedStarter{
		err: fmt.Errorf("%w: %q", managedllm.ErrProviderUnsupported, "mistral"),
	}
	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{managedStarter: managedStarter})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Use Mistral."}]},
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
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "provider_unsupported" {
		t.Fatalf("expected provider_unsupported, got %#v", payload)
	}
}

func TestRegisterAIRoutesReturnsBadRequestForManagedProviderConfigInvalid(t *testing.T) {
	t.Parallel()

	managedStarter := &aiRouteStubManagedStarter{
		err: fmt.Errorf("%w: azure provider requires explicit api_version", managedllm.ErrProviderConfigInvalid),
	}
	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{managedStarter: managedStarter})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Use Azure OpenAI."}]},
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
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "provider_config_invalid" {
		t.Fatalf("expected provider_config_invalid, got %#v", payload)
	}
}

func TestRegisterAIRoutesRejectsInvalidAppGenerationModeForExternalSend(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-1","role":"user","content":[{"type":"text","text":"Create a new app."}]},
			"engineConfigId":"engine-external",
			"thinking":false,
			"projectConfigId":"project-alpha",
			"sectionId":null,
			"allowUnscoped":true,
			"permissionMode":"minimal",
			"searchEnabled":false,
			"appGenerationMode":"unknown_mode"
		}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "app_generation_mode_invalid" {
		t.Fatalf("expected invalid app-generation mode error, got %#v", payload)
	}
}

func TestRegisterAIRoutesRejectsOversizedReferenceImageURLForExternalSend(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	body, err := json.Marshal(map[string]any{
		"chatId":                         nil,
		"message":                        map[string]any{"id": "user-1", "role": "user", "content": []any{map[string]any{"type": "text", "text": "Create a new app."}}},
		"engineConfigId":                 "engine-external",
		"thinking":                       false,
		"projectConfigId":                "project-alpha",
		"sectionId":                      nil,
		"allowUnscoped":                  true,
		"permissionMode":                 "minimal",
		"searchEnabled":                  false,
		"appGenerationMode":              "json_render_with_image",
		"appGenerationReferenceImageUrl": strings.Repeat("x", 4097),
	})
	if err != nil {
		t.Fatalf("encode request body: %v", err)
	}
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetLLMResponse, strings.NewReader(string(body)))
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "app_generation_reference_image_url_too_large" {
		t.Fatalf("expected oversized reference image URL error, got %#v", payload)
	}
}

func TestRegisterAIRoutesReturnsConflictForExternalChatEngineMismatch(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         externalagents.RunTypeManagedChat,
		"chatId":          "chat-conflict",
		"projectConfigId": "project-alpha",
		"messages":        []any{},
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	if err := fixture.store.Save(run); err != nil {
		t.Fatalf("save managed run: %v", err)
	}

	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":"chat-conflict",
			"message":{"id":"user-1","role":"user","content":[{"type":"text","text":"Hello"}]},
			"engineConfigId":"engine-external",
			"thinking":false,
			"projectConfigId":"project-alpha",
			"sectionId":null,
			"allowUnscoped":true,
			"permissionMode":"minimal",
			"searchEnabled":true
		}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusConflict {
		t.Fatalf("expected 409, got %d with body %q", response.Code, response.Body.String())
	}
}

func TestRegisterAIRoutesBlocksExternalSendOnPreflightFailure(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{
		preflightStatus: &externalagentconfigs.Status{
			ConfigID:  "external-config",
			Name:      "Codex app-server",
			ToolType:  externalagentconfigs.ToolTypeCodex,
			RunMode:   externalagentconfigs.RunModeAppServer,
			Supported: true,
			Available: false,
			Issues:    []string{"Missing env vars: OPENAI_API_KEY"},
		},
	})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-1","role":"user","content":[{"type":"text","text":"Create a new section."}]},
			"engineConfigId":"engine-external",
			"thinking":false,
			"projectConfigId":"project-alpha",
			"sectionId":null,
			"allowUnscoped":true,
			"permissionMode":"minimal",
			"searchEnabled":false
		}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusServiceUnavailable {
		t.Fatalf("expected 503, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "external_agent_preflight_failed" {
		t.Fatalf("expected preflight failure code, got %#v", payload)
	}
}

func TestRegisterAIRoutesHydratesExternalAgentChat(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	fixture.seedHydrationRun(t)
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetExternalAgentChat,
		strings.NewReader(`{"chatId":"chat-external","projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}

	var payload GetExternalAgentChatResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(payload.Messages) != 2 {
		t.Fatalf("expected 2 messages, got %d", len(payload.Messages))
	}
	if !payload.WaitingForResponse {
		t.Fatal("expected waitingForResponse to be true")
	}
	if payload.ContextUsage != nil {
		t.Fatalf("expected no context usage, got %#v", payload.ContextUsage)
	}
}

func TestRegisterAIRoutesReturnsExternalAIFollowSnapshot(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	run := fixture.seedRun("run-follow", agentruns.RunStatusRunning)
	if err := fixture.runtime.ActivateRun(run.ID, &aiRouteStubController{}); err != nil {
		t.Fatalf("activate run: %v", err)
	}
	if err := fixture.runtime.SetLiveChatState(run.ID, externalagents.ChatState{
		Messages: []map[string]any{
			{
				"id":      "assistant-1",
				"role":    "assistant",
				"content": []any{},
				"tool_calls": []any{
					map[string]any{
						"id": "tool-call-1",
						"function": map[string]any{
							"name": mcpx.BuildNamespacedToolName(mcpx.DefaultServerID, "setSectionSize"),
							"arguments": map[string]any{
								"sectionId": "section-alpha",
							},
						},
					},
				},
			},
		},
		ToolCallArguments: map[string]string{
			"tool-call-1": `{"sectionId":"section-alpha"}`,
		},
		WaitingForResponse: true,
	}); err != nil {
		t.Fatalf("set live follow state: %v", err)
	}
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime, fixture.follow)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetAIFollowSnapshot,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var payload []realtime.AIFollowToolArgumentsUpdateContent
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode snapshot response: %v", err)
	}
	if len(payload) != 1 {
		t.Fatalf("expected one snapshot entry, got %#v", payload)
	}
	if payload[0].ProjectConfigID != "project-alpha" || payload[0].ChatID != "chat-alpha" {
		t.Fatalf("unexpected snapshot identity %#v", payload[0])
	}
	if len(payload[0].IDsByType["section"]) != 1 || payload[0].IDsByType["section"][0] != "section-alpha" {
		t.Fatalf("unexpected follow ids %#v", payload[0].IDsByType)
	}
}

func TestRegisterAIRoutesRejectsMissingProjectIDForAIFollowSnapshot(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime, fixture.follow)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetAIFollowSnapshot,
		strings.NewReader(`{"projectConfigId":"   "}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode follow snapshot error payload: %v", err)
	}
	if payload.Error.Code != "project_config_id_required" {
		t.Fatalf("expected project_config_id_required, got %#v", payload)
	}
}

func TestRegisterAIRoutesReturnsContextUsage(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         externalagents.RunTypeExternalAgent,
		"chatId":          "chat-usage",
		"projectConfigId": "project-alpha",
		"messages":        []any{},
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	run.Status = agentruns.RunStatusCompleted
	run.Outputs = map[string]any{
		"messages": []any{},
		"usage": map[string]any{
			"promptTokens": 99,
		},
	}
	if err := fixture.store.Save(run); err != nil {
		t.Fatalf("save run: %v", err)
	}
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetExternalAgentChat,
		strings.NewReader(`{"chatId":"chat-usage","projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var payload GetExternalAgentChatResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.ContextUsage == nil || payload.ContextUsage.ContextUsedTokens == nil || *payload.ContextUsage.ContextUsedTokens != 99 {
		t.Fatalf("unexpected context usage %#v", payload.ContextUsage)
	}
	if !payload.ContextUsage.Estimated {
		t.Fatalf("expected prompt-only usage to be estimated, got %#v", payload.ContextUsage)
	}
}

func TestRegisterAIRoutesRunsFileModeTranscriptionSession(t *testing.T) {
	t.Parallel()

	type providerRequest struct {
		Path          string
		Authorization string
		Model         string
		Language      string
		FileSize      int
	}
	providerRequests := make(chan providerRequest, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if err := r.ParseMultipartForm(2 << 20); err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		file, _, err := r.FormFile("file")
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		defer file.Close()
		fileBytes, err := io.ReadAll(file)
		if err != nil {
			http.Error(w, err.Error(), http.StatusBadRequest)
			return
		}
		providerRequests <- providerRequest{
			Path:          r.URL.Path,
			Authorization: r.Header.Get("Authorization"),
			Model:         r.FormValue("model"),
			Language:      r.FormValue("language"),
			FileSize:      len(fileBytes),
		}
		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(map[string]string{"text": "hello from route"})
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-file": {
				ID:        "openai-file",
				Model:     "whisper-1",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                       "profile-file",
			Name:                     "File",
			TranscriptionLLMConfigID: "openai-file",
			TransportMode:            transcriptionprofiles.TransportModeFile,
			ChunkMs:                  1200,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	startRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-file","language":"en"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()

	handler.ServeHTTP(startResponse, startRequest)

	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}
	if started.ResolvedTransportMode != transcriptionsessions.ResolvedTransportModeFile || started.ChunkMs != 0 {
		t.Fatalf("unexpected start payload %#v", started)
	}

	appendRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	appendRequest.Header.Set("Content-Type", "application/json")
	appendResponse := httptest.NewRecorder()

	handler.ServeHTTP(appendResponse, appendRequest)

	if appendResponse.Code != http.StatusOK {
		t.Fatalf("expected append 200, got %d with body %q", appendResponse.Code, appendResponse.Body.String())
	}
	var appendPayload TranscriptionSessionDeltaResponse
	if err := json.Unmarshal(appendResponse.Body.Bytes(), &appendPayload); err != nil {
		t.Fatalf("decode append response: %v", err)
	}
	if appendPayload.AppendText != "" || appendPayload.IsFinal {
		t.Fatalf("unexpected append payload %#v", appendPayload)
	}

	stopRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStopTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`"}`),
	)
	stopRequest.Header.Set("Content-Type", "application/json")
	stopResponse := httptest.NewRecorder()

	handler.ServeHTTP(stopResponse, stopRequest)

	if stopResponse.Code != http.StatusOK {
		t.Fatalf("expected stop 200, got %d with body %q", stopResponse.Code, stopResponse.Body.String())
	}
	var stopPayload TranscriptionSessionDeltaResponse
	if err := json.Unmarshal(stopResponse.Body.Bytes(), &stopPayload); err != nil {
		t.Fatalf("decode stop response: %v", err)
	}
	if !stopPayload.IsFinal || stopPayload.FullText != "hello from route" || stopPayload.AppendText != "hello from route" {
		t.Fatalf("unexpected stop payload %#v", stopPayload)
	}

	select {
	case captured := <-providerRequests:
		if captured.Path != "/v1/audio/transcriptions" {
			t.Fatalf("unexpected provider path %q", captured.Path)
		}
		if captured.Authorization != "Bearer route-secret" {
			t.Fatalf("unexpected authorization %q", captured.Authorization)
		}
		if captured.Model != "whisper-1" {
			t.Fatalf("unexpected model %q", captured.Model)
		}
		if captured.Language != "en" {
			t.Fatalf("unexpected language %q", captured.Language)
		}
		if captured.FileSize <= 44 {
			t.Fatalf("expected wav payload larger than header, got %d bytes", captured.FileSize)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for provider request")
	}
}

func TestRegisterAIRoutesRunsRealtimeTranscriptionSession(t *testing.T) {
	t.Parallel()

	type providerHandshake struct {
		Path          string
		Query         string
		Authorization string
		OpenAIBeta    string
	}

	handshakes := make(chan providerHandshake, 1)
	updates := make(chan map[string]any, 1)
	appends := make(chan map[string]any, 1)
	commits := make(chan map[string]any, 1)
	closed := make(chan error, 1)
	emitFinal := make(chan struct{})

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		handshakes <- providerHandshake{
			Path:          r.URL.Path,
			Query:         r.URL.RawQuery,
			Authorization: r.Header.Get("Authorization"),
			OpenAIBeta:    r.Header.Get("OpenAI-Beta"),
		}
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		update, err := readAIRouteRealtimeProviderMessage(context.Background(), conn)
		if err != nil {
			return
		}
		updates <- update
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}

		appendPayload, err := readAIRouteRealtimeProviderMessage(context.Background(), conn)
		if err != nil {
			return
		}
		appends <- appendPayload

		commitPayload, err := readAIRouteRealtimeProviderMessage(context.Background(), conn)
		if err != nil {
			return
		}
		commits <- commitPayload

		// The route-level caller should see additive delta output during append and final completion on stop.
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.delta","event_id":"evt-1","item_id":"item-1","delta":"hel"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.delta","event_id":"evt-2","item_id":"item-1","delta":"lo"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-3","item_id":"item-1","transcript":"hello"}`)); err != nil {
			return
		}
		<-emitFinal
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-4","item_id":"item-2","transcript":"world"}`)); err != nil {
			return
		}
		_, _, err = conn.Read(context.Background())
		closed <- err
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	startRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime","language":"en"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()

	handler.ServeHTTP(startResponse, startRequest)

	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}
	if started.ResolvedTransportMode != transcriptionsessions.ResolvedTransportModeRealtime || started.ChunkMs != 1200 {
		t.Fatalf("unexpected start payload %#v", started)
	}

	select {
	case captured := <-handshakes:
		if captured.Path != "/v1/realtime" {
			t.Fatalf("unexpected provider path %q", captured.Path)
		}
		if captured.Query != "model=gpt-4o-mini-transcribe" {
			t.Fatalf("unexpected provider query %q", captured.Query)
		}
		if captured.Authorization != "Bearer route-secret" {
			t.Fatalf("unexpected authorization %q", captured.Authorization)
		}
		if captured.OpenAIBeta != "realtime=v1" {
			t.Fatalf("unexpected OpenAI-Beta header %q", captured.OpenAIBeta)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime provider handshake")
	}

	select {
	case payload := <-updates:
		if payload["type"] != "session.update" {
			t.Fatalf("unexpected session update payload %#v", payload)
		}
		sessionPayload, ok := payload["session"].(map[string]any)
		if !ok {
			t.Fatalf("expected session payload, got %#v", payload)
		}
		audioPayload, ok := sessionPayload["audio"].(map[string]any)
		if !ok {
			t.Fatalf("expected audio payload, got %#v", sessionPayload)
		}
		inputPayload, ok := audioPayload["input"].(map[string]any)
		if !ok {
			t.Fatalf("expected audio input payload, got %#v", audioPayload)
		}
		formatPayload, ok := inputPayload["format"].(map[string]any)
		if !ok {
			t.Fatalf("expected audio input format payload, got %#v", inputPayload)
		}
		if formatPayload["type"] != "audio/pcm" || formatPayload["rate"] != float64(24000) {
			t.Fatalf("unexpected audio input format %#v", formatPayload)
		}
		transcriptionPayload, ok := inputPayload["transcription"].(map[string]any)
		if !ok {
			t.Fatalf("expected transcription payload, got %#v", inputPayload)
		}
		if transcriptionPayload["model"] != "gpt-4o-mini-transcribe" || transcriptionPayload["language"] != "en" {
			t.Fatalf("unexpected transcription payload %#v", transcriptionPayload)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime session update")
	}

	appendRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	appendRequest.Header.Set("Content-Type", "application/json")
	appendResponse := httptest.NewRecorder()

	handler.ServeHTTP(appendResponse, appendRequest)

	if appendResponse.Code != http.StatusOK {
		t.Fatalf("expected append 200, got %d with body %q", appendResponse.Code, appendResponse.Body.String())
	}
	var appendPayload TranscriptionSessionDeltaResponse
	if err := json.Unmarshal(appendResponse.Body.Bytes(), &appendPayload); err != nil {
		t.Fatalf("decode append response: %v", err)
	}
	if appendPayload.IsFinal || appendPayload.AppendText != "hello" || appendPayload.FullText != "hello" {
		t.Fatalf("unexpected append payload %#v", appendPayload)
	}

	select {
	case payload := <-appends:
		if payload["type"] != "input_audio_buffer.append" {
			t.Fatalf("unexpected append payload %#v", payload)
		}
		audio, _ := payload["audio"].(string)
		decoded, err := base64.StdEncoding.DecodeString(audio)
		if err != nil {
			t.Fatalf("decode appended audio: %v", err)
		}
		if string(decoded) != string([]byte{0x00, 0x00, 0x01, 0x00}) {
			t.Fatalf("unexpected appended audio %#v", decoded)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime append payload")
	}

	select {
	case payload := <-commits:
		if payload["type"] != "input_audio_buffer.commit" {
			t.Fatalf("unexpected commit payload %#v", payload)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime commit payload")
	}

	close(emitFinal)
	stopRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStopTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`"}`),
	)
	stopRequest.Header.Set("Content-Type", "application/json")
	stopResponse := httptest.NewRecorder()

	handler.ServeHTTP(stopResponse, stopRequest)

	if stopResponse.Code != http.StatusOK {
		t.Fatalf("expected stop 200, got %d with body %q", stopResponse.Code, stopResponse.Body.String())
	}
	var stopPayload TranscriptionSessionDeltaResponse
	if err := json.Unmarshal(stopResponse.Body.Bytes(), &stopPayload); err != nil {
		t.Fatalf("decode stop response: %v", err)
	}
	if !stopPayload.IsFinal || stopPayload.AppendText != " world" || stopPayload.FullText != "hello world" {
		t.Fatalf("unexpected stop payload %#v", stopPayload)
	}

	select {
	case err := <-closed:
		if websocket.CloseStatus(err) != websocket.StatusNormalClosure {
			t.Fatalf("expected normal websocket close, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime websocket close")
	}
}

func TestRegisterAIRoutesAcceptsTranscriptionSessionUpdatedAck(t *testing.T) {
	t.Parallel()

	closed := make(chan error, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"transcription_session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		_, _, err = conn.Read(context.Background())
		closed <- err
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	startRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()

	handler.ServeHTTP(startResponse, startRequest)

	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}
	if started.ResolvedTransportMode != transcriptionsessions.ResolvedTransportModeRealtime || started.ChunkMs != 1200 {
		t.Fatalf("unexpected start payload %#v", started)
	}

	cancelRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCancelTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`"}`),
	)
	cancelRequest.Header.Set("Content-Type", "application/json")
	cancelResponse := httptest.NewRecorder()

	handler.ServeHTTP(cancelResponse, cancelRequest)

	if cancelResponse.Code != http.StatusOK {
		t.Fatalf("expected cancel 200, got %d with body %q", cancelResponse.Code, cancelResponse.Body.String())
	}
	var payload CancelTranscriptionSessionResponse
	if err := json.Unmarshal(cancelResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode cancel response: %v", err)
	}
	if !payload.OK {
		t.Fatalf("expected ok cancel response, got %#v", payload)
	}

	select {
	case err := <-closed:
		if websocket.CloseStatus(err) != websocket.StatusNormalClosure {
			t.Fatalf("expected normal websocket close, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime cancel close")
	}
}

func TestRegisterAIRoutesUsesCommittedOrderingForOutOfOrderRealtimeTurns(t *testing.T) {
	t.Parallel()

	emitFinal := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"input_audio_buffer.committed","event_id":"evt-1","item_id":"item-1"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"input_audio_buffer.committed","event_id":"evt-2","item_id":"item-2","previous_item_id":"item-1"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-3","item_id":"item-2","transcript":"world"}`)); err != nil {
			return
		}
		<-emitFinal
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-4","item_id":"item-1","transcript":"hello"}`)); err != nil {
			return
		}
		_ = conn.Close(websocket.StatusNormalClosure, "")
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	startRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()

	handler.ServeHTTP(startResponse, startRequest)

	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}

	appendRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	appendRequest.Header.Set("Content-Type", "application/json")
	appendResponse := httptest.NewRecorder()

	handler.ServeHTTP(appendResponse, appendRequest)

	if appendResponse.Code != http.StatusOK {
		t.Fatalf("expected append 200, got %d with body %q", appendResponse.Code, appendResponse.Body.String())
	}
	var appendPayload TranscriptionSessionDeltaResponse
	if err := json.Unmarshal(appendResponse.Body.Bytes(), &appendPayload); err != nil {
		t.Fatalf("decode append response: %v", err)
	}
	if appendPayload.IsFinal || appendPayload.AppendText != "world" || appendPayload.FullText != "world" {
		t.Fatalf("unexpected append payload %#v", appendPayload)
	}

	close(emitFinal)
	stopRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStopTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`"}`),
	)
	stopRequest.Header.Set("Content-Type", "application/json")
	stopResponse := httptest.NewRecorder()

	handler.ServeHTTP(stopResponse, stopRequest)

	if stopResponse.Code != http.StatusOK {
		t.Fatalf("expected stop 200, got %d with body %q", stopResponse.Code, stopResponse.Body.String())
	}
	var stopPayload TranscriptionSessionDeltaResponse
	if err := json.Unmarshal(stopResponse.Body.Bytes(), &stopPayload); err != nil {
		t.Fatalf("decode stop response: %v", err)
	}
	if !stopPayload.IsFinal || stopPayload.AppendText != "" || stopPayload.FullText != "hello world" {
		t.Fatalf("unexpected stop payload %#v", stopPayload)
	}
}

func TestRegisterAIRoutesReturnsTypedRealtimeProviderFailureFromAppend(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.failed","event_id":"evt-failed","error":{"message":"Realtime transcription chunk failed."}}`)); err != nil {
			return
		}
		_ = conn.Close(websocket.StatusNormalClosure, "")
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	startRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()

	handler.ServeHTTP(startResponse, startRequest)

	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}

	appendRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	appendRequest.Header.Set("Content-Type", "application/json")
	appendResponse := httptest.NewRecorder()

	handler.ServeHTTP(appendResponse, appendRequest)

	if appendResponse.Code != http.StatusBadGateway {
		t.Fatalf("expected append 502, got %d with body %q", appendResponse.Code, appendResponse.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(appendResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode append error response: %v", err)
	}
	if payload.Error.Code != "provider_failure" {
		t.Fatalf("expected provider_failure, got %#v", payload)
	}
	if payload.Error.Message != "Realtime transcription chunk failed." {
		t.Fatalf("unexpected provider failure payload %#v", payload)
	}
}

func TestRegisterAIRoutesReturnsTypedRealtimeProviderFailureFromStop(t *testing.T) {
	t.Parallel()

	emitStopFailure := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-1","item_id":"item-1","transcript":"hello"}`)); err != nil {
			return
		}
		<-emitStopFailure
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.failed","event_id":"evt-failed","error":{"message":"Realtime transcription finalization failed."}}`)); err != nil {
			return
		}
		_ = conn.Close(websocket.StatusNormalClosure, "")
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	startRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()

	handler.ServeHTTP(startResponse, startRequest)

	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}

	appendRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	appendRequest.Header.Set("Content-Type", "application/json")
	appendResponse := httptest.NewRecorder()

	handler.ServeHTTP(appendResponse, appendRequest)

	if appendResponse.Code != http.StatusOK {
		t.Fatalf("expected append 200, got %d with body %q", appendResponse.Code, appendResponse.Body.String())
	}

	close(emitStopFailure)
	stopRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStopTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`"}`),
	)
	stopRequest.Header.Set("Content-Type", "application/json")
	stopResponse := httptest.NewRecorder()

	handler.ServeHTTP(stopResponse, stopRequest)

	if stopResponse.Code != http.StatusBadGateway {
		t.Fatalf("expected stop 502, got %d with body %q", stopResponse.Code, stopResponse.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(stopResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode stop error response: %v", err)
	}
	if payload.Error.Code != "provider_failure" {
		t.Fatalf("expected provider_failure, got %#v", payload)
	}
	if payload.Error.Message != "Realtime transcription finalization failed." {
		t.Fatalf("unexpected provider failure payload %#v", payload)
	}
}

func TestRegisterAIRoutesReturnsTypedRealtimeProviderFailureFromAppendCloseReason(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		_ = conn.Close(websocket.StatusPolicyViolation, "Realtime append rejected by websocket close.")
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	startRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()

	handler.ServeHTTP(startResponse, startRequest)

	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}

	appendRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	appendRequest.Header.Set("Content-Type", "application/json")
	appendResponse := httptest.NewRecorder()

	handler.ServeHTTP(appendResponse, appendRequest)

	if appendResponse.Code != http.StatusBadGateway {
		t.Fatalf("expected append 502, got %d with body %q", appendResponse.Code, appendResponse.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(appendResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode append error response: %v", err)
	}
	if payload.Error.Code != "provider_failure" {
		t.Fatalf("expected provider_failure, got %#v", payload)
	}
	if payload.Error.Message != "Realtime append rejected by websocket close." {
		t.Fatalf("unexpected provider failure payload %#v", payload)
	}
}

func TestRegisterAIRoutesReturnsTypedRealtimeProviderFailureFromStopCloseReason(t *testing.T) {
	t.Parallel()

	emitStopFailure := make(chan struct{})
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-1","item_id":"item-1","transcript":"hello"}`)); err != nil {
			return
		}
		<-emitStopFailure
		_ = conn.Close(websocket.StatusPolicyViolation, "Realtime finalization rejected by websocket close.")
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	startRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()

	handler.ServeHTTP(startResponse, startRequest)

	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}

	appendRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	appendRequest.Header.Set("Content-Type", "application/json")
	appendResponse := httptest.NewRecorder()

	handler.ServeHTTP(appendResponse, appendRequest)

	if appendResponse.Code != http.StatusOK {
		t.Fatalf("expected append 200, got %d with body %q", appendResponse.Code, appendResponse.Body.String())
	}

	close(emitStopFailure)
	stopRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStopTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`"}`),
	)
	stopRequest.Header.Set("Content-Type", "application/json")
	stopResponse := httptest.NewRecorder()

	handler.ServeHTTP(stopResponse, stopRequest)

	if stopResponse.Code != http.StatusBadGateway {
		t.Fatalf("expected stop 502, got %d with body %q", stopResponse.Code, stopResponse.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(stopResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode stop error response: %v", err)
	}
	if payload.Error.Code != "provider_failure" {
		t.Fatalf("expected provider_failure, got %#v", payload)
	}
	if payload.Error.Message != "Realtime finalization rejected by websocket close." {
		t.Fatalf("unexpected provider failure payload %#v", payload)
	}
}

func TestRegisterAIRoutesCancelsRealtimeTranscriptionSession(t *testing.T) {
	t.Parallel()

	closed := make(chan error, 1)
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"session.updated","event_id":"evt-ready"}`)); err != nil {
			return
		}
		_, _, err = conn.Read(context.Background())
		closed <- err
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	startRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()

	handler.ServeHTTP(startResponse, startRequest)

	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected start 200, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}

	cancelRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCancelTranscriptionSession,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`"}`),
	)
	cancelRequest.Header.Set("Content-Type", "application/json")
	cancelResponse := httptest.NewRecorder()

	handler.ServeHTTP(cancelResponse, cancelRequest)

	if cancelResponse.Code != http.StatusOK {
		t.Fatalf("expected cancel 200, got %d with body %q", cancelResponse.Code, cancelResponse.Body.String())
	}
	var payload CancelTranscriptionSessionResponse
	if err := json.Unmarshal(cancelResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode cancel response: %v", err)
	}
	if !payload.OK {
		t.Fatalf("expected ok cancel response, got %#v", payload)
	}

	select {
	case err := <-closed:
		if websocket.CloseStatus(err) != websocket.StatusNormalClosure {
			t.Fatalf("expected normal websocket close, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime cancel close")
	}
}

func TestRegisterAIRoutesCancelTranscriptionSessionReturnsOKWhenSessionMissing(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)

	cancelRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCancelTranscriptionSession,
		strings.NewReader(`{"sessionId":"missing-session"}`),
	)
	cancelRequest.Header.Set("Content-Type", "application/json")
	cancelResponse := httptest.NewRecorder()

	handler.ServeHTTP(cancelResponse, cancelRequest)

	if cancelResponse.Code != http.StatusOK {
		t.Fatalf("expected cancel 200, got %d with body %q", cancelResponse.Code, cancelResponse.Body.String())
	}
	var payload CancelTranscriptionSessionResponse
	if err := json.Unmarshal(cancelResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode cancel response: %v", err)
	}
	if !payload.OK {
		t.Fatalf("expected ok cancel response, got %#v", payload)
	}
}

func TestRegisterAIRoutesReturnsTypedUnsupportedRealtimeTranscriptionModel(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-undocumented": {
				ID:        "openai-undocumented",
				Model:     "gpt-realtime",
				Provider:  "openai",
				BaseURL:   "https://example.com/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                       "profile-realtime",
			Name:                     "Realtime",
			TranscriptionLLMConfigID: "openai-undocumented",
			TransportMode:            transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                  1200,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "unsupported_model" {
		t.Fatalf("expected unsupported_model, got %#v", payload)
	}
}

func TestRegisterAIRoutesReturnsTypedMissingAPIKeyForRealtimeTranscriptionStart(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   "https://example.com/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "missing_api_key" {
		t.Fatalf("expected missing_api_key, got %#v", payload)
	}
	if payload.Error.Message != "Missing API key for 'OPENAI_API_KEY'. Configure it in LLM API Keys." {
		t.Fatalf("unexpected error payload %#v", payload)
	}
}

func TestRegisterAIRoutesReturnsTypedRealtimeProviderFailureFromStart(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/plain; charset=utf-8")
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte("Realtime setup forbidden by provider."))
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "provider_failure" {
		t.Fatalf("expected provider_failure, got %#v", payload)
	}
	if payload.Error.Message != "Realtime setup forbidden by provider." {
		t.Fatalf("unexpected error payload %#v", payload)
	}
}

func TestRegisterAIRoutesReturnsTypedRealtimeProviderFailureFromStartCloseReason(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		conn, err := websocket.Accept(w, r, nil)
		if err != nil {
			return
		}
		defer conn.Close(websocket.StatusNormalClosure, "")

		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		_ = conn.Close(websocket.StatusPolicyViolation, "Realtime setup rejected by websocket close.")
	}))
	defer server.Close()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-realtime": {
				ID:        "openai-realtime",
				Model:     "gpt-4o-mini-transcribe",
				Provider:  "openai",
				BaseURL:   server.URL + "/v1",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	}); err != nil {
		t.Fatalf("update llm config: %v", err)
	}
	fixture.llm.UpdateAPIKeys(map[string]string{
		"OPENAI_API_KEY": "route-secret",
	})
	if err := fixture.transcriptionStore.Write([]transcriptionprofiles.Profile{
		{
			ID:                            "profile-realtime",
			Name:                          "Realtime",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeRealtime,
			ChunkMs:                       1200,
			SupportsRealtimeTranscription: true,
		},
	}); err != nil {
		t.Fatalf("write transcription profile: %v", err)
	}

	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"profile-realtime"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadGateway {
		t.Fatalf("expected 502, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "provider_failure" {
		t.Fatalf("expected provider_failure, got %#v", payload)
	}
	if payload.Error.Message != "Realtime setup rejected by websocket close." {
		t.Fatalf("unexpected error payload %#v", payload)
	}
}

func TestRegisterAIRoutesReturnsTypedTranscriptionSessionNotFound(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"missing-session","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "session_not_found" {
		t.Fatalf("expected session_not_found, got %#v", payload)
	}
}

func readAIRouteRealtimeProviderMessage(ctx context.Context, conn *websocket.Conn) (map[string]any, error) {
	_, payload, err := conn.Read(ctx)
	if err != nil {
		return nil, err
	}
	decoded := map[string]any{}
	if err := json.Unmarshal(payload, &decoded); err != nil {
		return nil, err
	}
	return decoded, nil
}

func TestRegisterAIRoutesRejectsOversizedTranscriptionPCMBeforeDecode(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandlerWithTranscription(
		t,
		config.ModeIDE,
		fixture.managed,
		fixture.send,
		fixture.service,
		fixture.runtime,
		fixture.transcriptionProfiles,
		fixture.transcriptionSessions,
		fixture.sessions,
		fixture.follow,
	)
	oversizedBase64 := strings.Repeat("A", ((transcriptionsessions.DefaultAppendPCMMaxBytes+1)*4)/3+8)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"session-1","audioPcm16Base64":"`+oversizedBase64+`","sampleRateHz":24000,"channels":1}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusRequestEntityTooLarge {
		t.Fatalf("expected 413, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "audio_payload_too_large" {
		t.Fatalf("expected audio_payload_too_large, got %#v", payload)
	}
}

func TestRegisterAIRoutesReturnsTypedNotFound(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetExternalAgentChat,
		strings.NewReader(`{"chatId":"missing-chat","projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "chat_not_found" {
		t.Fatalf("expected chat_not_found error code, got %#v", payload)
	}
}

func TestRegisterAIRoutesRejectsMissingChatID(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	fixture.seedHydrationRun(t)
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetExternalAgentChat,
		strings.NewReader(`{"chatId":"   ","projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "chat_id_required" {
		t.Fatalf("expected chat_id_required, got %#v", payload)
	}
}

func TestRegisterAIRoutesBlocksShareMode(t *testing.T) {
	t.Parallel()

	handler := newAIRouteTestHandler(t, config.ModeShare, nil, nil, nil, nil)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetExternalAgentChat,
		strings.NewReader(`{"chatId":"chat-external","projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
}

func TestRegisterAIRoutesStopsExternalAgentRun(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	run := fixture.seedRun("run-stop", agentruns.RunStatusRunning)
	controller := &aiRouteStubController{}
	if err := fixture.runtime.ActivateRun(run.ID, controller); err != nil {
		t.Fatalf("activate run: %v", err)
	}

	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStopExternalAgentRun,
		strings.NewReader(`{"runId":"run-stop"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if controller.cancelCalls != 1 {
		t.Fatalf("expected one cancel call, got %d", controller.cancelCalls)
	}
	var payload agentruns.Run
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode stop response: %v", err)
	}
	if payload.Status != agentruns.RunStatusCancelled {
		t.Fatalf("expected cancelled status, got %q", payload.Status)
	}
}

func TestRegisterAIRoutesReturnsNotFoundForMissingExternalRunStop(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStopExternalAgentRun,
		strings.NewReader(`{"runId":"missing-run"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
}

func TestRegisterAIRoutesRespondsToExternalAgentApproval(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	run := fixture.seedRun("run-approval", agentruns.RunStatusRunning)
	controller := &aiRouteStubController{}
	if err := fixture.runtime.ActivateRun(run.ID, controller); err != nil {
		t.Fatalf("activate run: %v", err)
	}
	if err := fixture.runtime.RegisterApproval(externalagents.ApprovalState{
		ApprovalID:      "approval-1",
		RunID:           run.ID,
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
	}); err != nil {
		t.Fatalf("register approval: %v", err)
	}

	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteRespondExternalAgentApproval,
		strings.NewReader(`{"approvalId":"approval-1","approved":true}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if len(controller.approvalCalls) != 1 {
		t.Fatalf("expected one approval call, got %#v", controller.approvalCalls)
	}
	if controller.approvalCalls[0].ApprovalID != "approval-1" || !controller.approvalCalls[0].Approved {
		t.Fatalf("unexpected approval call %#v", controller.approvalCalls[0])
	}
}

func TestRegisterAIRoutesReturnsNotFoundForMissingApproval(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteRespondExternalAgentApproval,
		strings.NewReader(`{"approvalId":"missing-approval","approved":true}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode approval error payload: %v", err)
	}
	if payload.Error.Code != "approval_not_found" {
		t.Fatalf("expected approval_not_found, got %#v", payload)
	}
}

func TestRegisterAIRoutesRespondsToExternalAgentQuestion(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	run := fixture.seedRun("run-question", agentruns.RunStatusRunning)
	controller := &aiRouteStubController{}
	if err := fixture.runtime.ActivateRun(run.ID, controller); err != nil {
		t.Fatalf("activate run: %v", err)
	}
	if err := fixture.runtime.RegisterQuestion(externalagents.QuestionState{
		ToolCallID:      "question-1",
		RunID:           run.ID,
		ProjectConfigID: "project-alpha",
		ChatID:          "chat-alpha",
	}); err != nil {
		t.Fatalf("register question: %v", err)
	}

	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteRespondExternalAgentQuestion,
		strings.NewReader(`{"toolCallId":"question-1","answers":{"Language":"Go"}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if len(controller.toolCalls) != 1 {
		t.Fatalf("expected one tool response call, got %#v", controller.toolCalls)
	}
	if controller.toolCalls[0].ToolCallID != "question-1" {
		t.Fatalf("unexpected tool response call %#v", controller.toolCalls[0])
	}
}

func TestRegisterAIRoutesReturnsNotFoundForMissingQuestion(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteRespondExternalAgentQuestion,
		strings.NewReader(`{"toolCallId":"missing-question","answers":{"Language":"Go"}}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode question error payload: %v", err)
	}
	if payload.Error.Code != "question_not_found" {
		t.Fatalf("expected question_not_found, got %#v", payload)
	}
}

// The managed chat hydrate route should return Go-owned persisted chat state
// without routing through the external-agent branch.
func TestRegisterAIRoutesGetsManagedChat(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	fixture.seedManagedHydrationRun(t)
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLLMChat,
		strings.NewReader(`{"chatId":"chat-managed","projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var payload managedchat.HydratedChat
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode managed chat response: %v", err)
	}
	if len(payload.Messages) != 2 {
		t.Fatalf("expected managed chat messages, got %#v", payload.Messages)
	}
	if payload.LLMConfig == nil || payload.LLMConfig.ID != "primary" {
		t.Fatalf("expected primary llm config, got %#v", payload.LLMConfig)
	}
	if payload.ContextUsage == nil || payload.ContextUsage.ContextUsedTokens == nil || *payload.ContextUsage.ContextUsedTokens != 21 {
		t.Fatalf("expected managed context usage payload, got %#v", payload.ContextUsage)
	}
}

// The managed chat hydrate route should map the new Go owner directly into the
// frontend's existing payload shape, including llmConfig/contextUsage fields.
func TestRegisterAIRoutesReturnsNotFoundForMissingManagedChat(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLLMChat,
		strings.NewReader(`{"chatId":"missing-managed","projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode managed chat error: %v", err)
	}
	if payload.Error.Code != "chat_not_found" {
		t.Fatalf("expected chat_not_found, got %#v", payload)
	}
}

// The stop route should cancel the latest running managed chat through the
// managed runtime even though send/executor work is still deferred.
func TestRegisterAIRoutesStopsManagedChat(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	run := fixture.seedManagedRunningRun(t)
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStopLLMChat,
		strings.NewReader(`{"chatId":"chat-managed-stop"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var payload managedchat.StopResult
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode stop managed chat response: %v", err)
	}
	if payload.AlreadyStopped {
		t.Fatalf("expected active stop result, got %#v", payload)
	}
	if payload.StoppedRunID == nil || *payload.StoppedRunID != run.ID {
		t.Fatalf("expected stopped run id %q, got %#v", run.ID, payload.StoppedRunID)
	}
	persisted, err := fixture.store.Load(run.ID)
	if err != nil {
		t.Fatalf("load stopped run: %v", err)
	}
	if persisted.Status != agentruns.RunStatusCancelled {
		t.Fatalf("expected cancelled managed run, got %#v", persisted.Status)
	}
}

func newAIRouteTestHandler(t *testing.T, mode config.Mode, managed *managedchat.Service, send *externalagents.SendService, service *externalagents.Service, runtime *externalagents.Runtime, follows ...*externalagents.FollowService) http.Handler {
	t.Helper()

	support := newAIRouteFallbackTranscriptionSupport(t)
	return newAIRouteTestHandlerWithTranscription(
		t,
		mode,
		managed,
		send,
		service,
		runtime,
		support.profiles,
		support.sessions,
		support.sessionProvider,
		follows...,
	)
}

func newAIRouteTestHandlerWithTranscription(
	t *testing.T,
	mode config.Mode,
	managed *managedchat.Service,
	send *externalagents.SendService,
	service *externalagents.Service,
	runtime *externalagents.Runtime,
	profiles *transcriptionprofiles.Service,
	sessions *transcriptionsessions.Service,
	sessionProvider aiRouteStaticSessionProvider,
	follows ...*externalagents.FollowService,
) http.Handler {
	t.Helper()

	var follow *externalagents.FollowService
	if len(follows) != 0 {
		follow = follows[0]
	}
	if mode == config.ModeIDE && follow == nil {
		var err error
		follow, err = externalagents.NewFollowService(externalagents.FollowServiceOptions{
			Tools: aiRouteStaticFollowToolProvider{},
		})
		if err != nil {
			t.Fatalf("new fallback follow service: %v", err)
		}
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterAIRoutes(r, AIRouteDependencies{
				ModePolicy:            modes.NewPolicy(mode),
				ManagedChats:          managed,
				ExternalAgentSend:     send,
				ExternalAgentChats:    service,
				ExternalAgentFollow:   follow,
				ExternalAgentRuns:     runtime,
				TranscriptionProfiles: profiles,
				TranscriptionSessions: sessions,
				Sessions:              sessionProvider,
			}); err != nil {
				t.Fatalf("register ai routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}

type aiRouteFixture struct {
	store                 *agentruns.RunStore
	llm                   *llmconfig.Runtime
	transcriptionStore    *transcriptionprofiles.Store
	transcriptionProfiles *transcriptionprofiles.Service
	transcriptionSessions *transcriptionsessions.Service
	sessions              aiRouteStaticSessionProvider
	managed               *managedchat.Service
	managedStarter        *aiRouteStubManagedStarter
	runtime               *externalagents.Runtime
	service               *externalagents.Service
	send                  *externalagents.SendService
	follow                *externalagents.FollowService
}

type aiRouteFixtureOptions struct {
	executorErr     error
	preflightStatus *externalagentconfigs.Status
	managedStarter  *aiRouteStubManagedStarter
}

func newAIRouteFixture(t *testing.T, options aiRouteFixtureOptions) aiRouteFixture {
	t.Helper()

	root := t.TempDir()
	store, err := agentruns.NewRunStore(root)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	engineStore, err := agentruns.NewEngineStore(root)
	if err != nil {
		t.Fatalf("new engine store: %v", err)
	}
	externalConfigStore, err := externalagentconfigs.NewStore(root)
	if err != nil {
		t.Fatalf("new external config store: %v", err)
	}
	agentProfileStore, err := agentprofiles.NewStore(root)
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
	llmRuntime, err := llmconfig.NewRuntime(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"primary": {
				ID:        "primary",
				Model:     "gpt-4o-mini",
				Provider:  "openai",
				APIKeyEnv: "OPENAI_API_KEY",
			},
		},
		MCPServers: map[string]llmconfig.ServerConfig{},
	})
	if err != nil {
		t.Fatalf("new llm runtime: %v", err)
	}
	transcriptionStore, err := transcriptionprofiles.NewStore(root)
	if err != nil {
		t.Fatalf("new transcription store: %v", err)
	}
	transcriptionProfileService, err := transcriptionprofiles.NewService(transcriptionprofiles.ServiceOptions{
		Profiles: transcriptionStore,
		LLM:      llmRuntime,
	})
	if err != nil {
		t.Fatalf("new transcription profile service: %v", err)
	}
	transcriptionSessionService, err := transcriptionsessions.NewService(transcriptionsessions.ServiceOptions{
		LLM: llmRuntime,
	})
	if err != nil {
		t.Fatalf("new transcription session service: %v", err)
	}
	sessionProvider := aiRouteStaticSessionProvider{
		current: &auth.CurrentSession{
			Metadata: auth.SessionMetadata{
				ID: "session-route",
			},
		},
	}
	commandPath := "/usr/local/bin/codex"
	configID := "external-config"
	if err := externalConfigStore.Write([]externalagentconfigs.Config{
		{
			ID:                 configID,
			Name:               "Codex app-server",
			ToolType:           externalagentconfigs.ToolTypeCodex,
			RunMode:            externalagentconfigs.RunModeAppServer,
			CommandPath:        &commandPath,
			WorkingDirStrategy: externalagentconfigs.WorkingDirStrategyProjectRoot,
		},
	}); err != nil {
		t.Fatalf("write external configs: %v", err)
	}
	engineID := "engine-external"
	if err := engineStore.Write([]agentruns.EngineConfig{
		{
			ID:               "engine-managed",
			Name:             "Managed Engine",
			EngineType:       agentruns.EngineTypeSettaLLM,
			SettaLLMConfigID: stringPtr("primary"),
		},
		{
			ID:                    engineID,
			Name:                  "External Engine",
			EngineType:            agentruns.EngineTypeExternalAgent,
			ExternalAgentConfigID: &configID,
		},
	}); err != nil {
		t.Fatalf("write engine configs: %v", err)
	}
	if err := agentProfileStore.Write([]agentprofiles.Profile{
		{
			ID:             "profile-alpha",
			Name:           "Alpha",
			EngineConfigID: &engineID,
		},
	}); err != nil {
		t.Fatalf("write profiles: %v", err)
	}
	follow, err := externalagents.NewFollowService(externalagents.FollowServiceOptions{
		Tools: aiRouteStaticFollowToolProvider{},
	})
	if err != nil {
		t.Fatalf("new follow service: %v", err)
	}
	managedRunService, err := agentruns.NewService(agentruns.ServiceOptions{
		ProjectState: projectRuntime,
		Engines:      engineStore,
		Runs:         store,
		LLM:          llmRuntime,
		TimeNow: func() time.Time {
			return time.Date(2026, 3, 9, 9, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new managed run service: %v", err)
	}
	managedRunRuntime, err := agentruns.NewRuntime(agentruns.RuntimeOptions{
		Service: managedRunService,
	})
	if err != nil {
		t.Fatalf("new managed runtime: %v", err)
	}
	managedStarter := options.managedStarter
	if managedStarter == nil {
		managedStarter = &aiRouteStubManagedStarter{disabled: true}
	}
	managedService, err := managedchat.NewService(managedchat.ServiceOptions{
		ProjectState: projectRuntime,
		Runs:         store,
		Engines:      engineStore,
		LLM:          llmRuntime,
		Profiles:     agentProfileStore,
		Starter:      managedStarter,
		Stopper:      managedRunRuntime,
	})
	if err != nil {
		t.Fatalf("new managed chat service: %v", err)
	}
	runtime, err := externalagents.NewRuntime(externalagents.RuntimeOptions{
		Runs:   store,
		Follow: follow,
		TimeNow: func() time.Time {
			return time.Date(2026, 3, 9, 9, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	service, err := externalagents.NewService(externalagents.ServiceOptions{
		Runs: store,
		Live: runtime,
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	preflightStatus := options.preflightStatus
	if preflightStatus == nil {
		preflightStatus = &externalagentconfigs.Status{
			ConfigID:  configID,
			Name:      "Codex app-server",
			ToolType:  externalagentconfigs.ToolTypeCodex,
			RunMode:   externalagentconfigs.RunModeAppServer,
			Supported: true,
			Available: true,
			Issues:    []string{},
		}
	}
	send, err := externalagents.NewSendService(externalagents.SendServiceOptions{
		ProjectState: projectRuntime,
		Engines:      engineStore,
		Runs:         store,
		Profiles:     agentProfileStore,
		Configs:      externalConfigStore,
		Runtime:      runtime,
		Preflight: aiRouteStubPreflightChecker{
			status: *preflightStatus,
		},
		Executor: &aiRouteStubExecutor{
			response: externalagents.StartResponse{Controller: &aiRouteStubController{}},
			err:      options.executorErr,
		},
		TimeNow: func() time.Time {
			return time.Date(2026, 3, 9, 9, 0, 0, 0, time.UTC)
		},
	})
	if err != nil {
		t.Fatalf("new send service: %v", err)
	}
	return aiRouteFixture{
		store:                 store,
		llm:                   llmRuntime,
		transcriptionStore:    transcriptionStore,
		transcriptionProfiles: transcriptionProfileService,
		transcriptionSessions: transcriptionSessionService,
		sessions:              sessionProvider,
		managed:               managedService,
		managedStarter:        managedStarter,
		runtime:               runtime,
		service:               service,
		send:                  send,
		follow:                follow,
	}
}

type aiRouteFallbackTranscriptionSupport struct {
	profiles        *transcriptionprofiles.Service
	sessions        *transcriptionsessions.Service
	sessionProvider aiRouteStaticSessionProvider
}

func newAIRouteFallbackTranscriptionSupport(t *testing.T) aiRouteFallbackTranscriptionSupport {
	t.Helper()

	root := t.TempDir()
	llmRuntime, err := llmconfig.NewRuntime(llmconfig.AllConfigs{
		Configs:    map[string]llmconfig.Config{},
		MCPServers: map[string]llmconfig.ServerConfig{},
	})
	if err != nil {
		t.Fatalf("new fallback llm runtime: %v", err)
	}
	store, err := transcriptionprofiles.NewStore(root)
	if err != nil {
		t.Fatalf("new fallback transcription store: %v", err)
	}
	profiles, err := transcriptionprofiles.NewService(transcriptionprofiles.ServiceOptions{
		Profiles: store,
		LLM:      llmRuntime,
	})
	if err != nil {
		t.Fatalf("new fallback transcription profiles: %v", err)
	}
	sessions, err := transcriptionsessions.NewService(transcriptionsessions.ServiceOptions{
		LLM: llmRuntime,
	})
	if err != nil {
		t.Fatalf("new fallback transcription sessions: %v", err)
	}
	return aiRouteFallbackTranscriptionSupport{
		profiles: profiles,
		sessions: sessions,
		sessionProvider: aiRouteStaticSessionProvider{
			current: &auth.CurrentSession{
				Metadata: auth.SessionMetadata{
					ID: "session-route",
				},
			},
		},
	}
}

func (f aiRouteFixture) seedHydrationRun(t *testing.T) {
	t.Helper()

	run := agentruns.NewRun(nil, map[string]any{
		"runType":         externalagents.RunTypeExternalAgent,
		"chatId":          "chat-external",
		"projectConfigId": "project-alpha",
		"messages": []any{
			map[string]any{
				"id":   "user-1",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Hello external"},
				},
				"attachments": []any{},
			},
		},
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	run.Status = agentruns.RunStatusRunning
	run.Outputs = map[string]any{
		"messages": []any{
			map[string]any{
				"id":   "user-1",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Hello external"},
				},
				"attachments": []any{},
			},
			map[string]any{
				"id":   "assistant-1",
				"role": "assistant",
				"content": []any{
					map[string]any{"type": "text", "text": "Hi"},
				},
				"attachments": []any{},
				"tool_calls":  nil,
			},
		},
	}
	if err := f.store.Save(run); err != nil {
		t.Fatalf("save run: %v", err)
	}
}

func (f aiRouteFixture) seedManagedHydrationRun(t *testing.T) {
	t.Helper()

	run := agentruns.NewRun(nil, map[string]any{
		"runType":         managedchat.RunTypeManagedChat,
		"chatId":          "chat-managed",
		"projectConfigId": "project-alpha",
		"engineConfigId":  "engine-managed",
		"messages": []any{
			map[string]any{
				"id":   "user-managed",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Hello managed"},
				},
				"attachments": []any{},
			},
		},
	}, time.Date(2026, 3, 8, 11, 0, 0, 0, time.UTC))
	run.Status = agentruns.RunStatusCompleted
	finishedAt := time.Date(2026, 3, 8, 11, 0, 5, 0, time.UTC)
	run.FinishedAt = &finishedAt
	run.Outputs = map[string]any{
		"messages": []any{
			map[string]any{
				"id":   "user-managed",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Hello managed"},
				},
				"attachments": []any{},
			},
			map[string]any{
				"id":   "assistant-managed",
				"role": "assistant",
				"content": []any{
					map[string]any{"type": "text", "text": "Managed reply"},
				},
				"attachments": []any{},
				"tool_calls":  nil,
			},
		},
		"usage": map[string]any{
			"promptTokens":     21,
			"completionTokens": 3,
			"totalTokens":      24,
		},
	}
	if err := f.store.Save(run); err != nil {
		t.Fatalf("save managed run: %v", err)
	}
}

func (f aiRouteFixture) seedManagedRunningRun(t *testing.T) agentruns.Run {
	t.Helper()

	run := agentruns.NewRun(nil, map[string]any{
		"runType":         managedchat.RunTypeManagedChat,
		"chatId":          "chat-managed-stop",
		"projectConfigId": "project-alpha",
		"engineConfigId":  "engine-managed",
		"messages": []any{
			map[string]any{
				"id":   "user-stop",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Stop this"},
				},
				"attachments": []any{},
			},
		},
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	run.Status = agentruns.RunStatusRunning
	run.Outputs = map[string]any{
		"messages": []any{
			map[string]any{
				"id":   "user-stop",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Stop this"},
				},
				"attachments": []any{},
			},
			map[string]any{
				"id":   "assistant-stop",
				"role": "assistant",
				"content": []any{
					map[string]any{"type": "text", "text": "Partial reply"},
				},
				"attachments": []any{},
				"tool_calls":  nil,
			},
		},
	}
	if err := f.store.Save(run); err != nil {
		t.Fatalf("save managed running run: %v", err)
	}
	return run
}

func (f aiRouteFixture) seedRun(runID string, status agentruns.RunStatus) agentruns.Run {
	run := agentruns.NewRun(nil, map[string]any{
		"runType":         externalagents.RunTypeExternalAgent,
		"chatId":          "chat-alpha",
		"projectConfigId": "project-alpha",
		"engineConfigId":  "engine-alpha",
		"messages":        []any{},
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	run.ID = runID
	run.Status = status
	if err := f.store.Save(run); err != nil {
		panic(err)
	}
	return run
}

func cloneRouteAnyMap(input map[string]any) map[string]any {
	if input == nil {
		return nil
	}
	cloned := make(map[string]any, len(input))
	for key, value := range input {
		cloned[key] = cloneRouteAnyValue(value)
	}
	return cloned
}

func cloneRouteAnyValue(value any) any {
	switch typed := value.(type) {
	case nil:
		return nil
	case map[string]any:
		return cloneRouteAnyMap(typed)
	case []any:
		cloned := make([]any, 0, len(typed))
		for _, entry := range typed {
			cloned = append(cloned, cloneRouteAnyValue(entry))
		}
		return cloned
	default:
		return typed
	}
}

func cloneAIRouteProfile(profile *agentprofiles.Profile) *agentprofiles.Profile {
	if profile == nil {
		return nil
	}
	cloned := *profile
	if profile.EngineConfigID != nil {
		engineConfigID := *profile.EngineConfigID
		cloned.EngineConfigID = &engineConfigID
	}
	if profile.MemoryScope != nil {
		memoryScope := *profile.MemoryScope
		cloned.MemoryScope = &memoryScope
	}
	if profile.ToolAllowlist != nil {
		cloned.ToolAllowlist = append([]string(nil), profile.ToolAllowlist...)
	}
	return &cloned
}

func stringPtr(value string) *string {
	return &value
}
