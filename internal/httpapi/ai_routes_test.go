package httpapi

import (
	"bytes"
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
	"setta/internal/deployments"
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
			"searchEnabled":false,
			"appGenerationByMessageId":{"user-1":"mcp_server"}
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
	appGenerationByMessageID, ok := runs[0].Inputs["appGenerationByMessageId"].(map[string]any)
	if !ok || appGenerationByMessageID["user-1"] != agentruns.ChatAppGenerationMessageModePlainChat {
		t.Fatalf("expected persisted app-generation provenance, got %#v", runs[0].Inputs["appGenerationByMessageId"])
	}
	state, err := fixture.runtime.GetLiveChatState(runs[0].ID)
	if err != nil {
		t.Fatalf("get live chat state: %v", err)
	}
	if state == nil || !state.WaitingForResponse {
		t.Fatalf("expected active waiting state, got %#v", state)
	}
}

func TestRegisterAIRoutesOverridesSubmittedTurnProvenanceWithRequestedMode(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-1","role":"user","content":[{"type":"text","text":"Build the app."}]},
			"engineConfigId":"engine-external",
			"agentProfileId":null,
			"thinking":false,
			"projectConfigId":"project-alpha",
			"sectionId":null,
			"allowUnscoped":true,
			"permissionMode":"minimal",
			"searchEnabled":false,
			"appGenerationMode":"mcp_server",
			"appGenerationByMessageId":{"user-1":"plain_chat"}
		}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	runs, err := fixture.store.List()
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 1 {
		t.Fatalf("expected one persisted run, got %#v", runs)
	}
	appGenerationByMessageID, ok := runs[0].Inputs["appGenerationByMessageId"].(map[string]any)
	if !ok {
		t.Fatalf("expected persisted app-generation provenance, got %#v", runs[0].Inputs["appGenerationByMessageId"])
	}
	if appGenerationByMessageID["user-1"] != agentruns.ChatAppGenerationMessageModeMCPServer {
		t.Fatalf("expected submitted turn to use requested mode, got %#v", appGenerationByMessageID)
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
			"searchEnabled":false,
			"appGenerationByMessageId":{"user-managed":"plain_chat"}
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
	appGenerationByMessageID, ok := fixture.managedStarter.lastInputs["appGenerationByMessageId"].(map[string]string)
	if !ok || appGenerationByMessageID["user-managed"] != agentruns.ChatAppGenerationMessageModePlainChat {
		t.Fatalf("expected managed app-generation provenance, got %#v", fixture.managedStarter.lastInputs["appGenerationByMessageId"])
	}
	runs, err := fixture.store.List()
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 0 {
		t.Fatalf("expected managed route test not to persist external runs through the stubbed starter, got %#v", runs)
	}
}

func TestRegisterAIRoutesNormalizesSubmittedTurnToPlainChatWhenModeUnset(t *testing.T) {
	t.Parallel()

	managedStarter := &aiRouteStubManagedStarter{}
	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{managedStarter: managedStarter})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Just answer plainly."}]},
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

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	appGenerationByMessageID, ok := fixture.managedStarter.lastInputs["appGenerationByMessageId"].(map[string]string)
	if !ok {
		t.Fatalf("expected managed app-generation provenance, got %#v", fixture.managedStarter.lastInputs["appGenerationByMessageId"])
	}
	if appGenerationByMessageID["user-managed"] != agentruns.ChatAppGenerationMessageModePlainChat {
		t.Fatalf("expected submitted turn to normalize to plain_chat, got %#v", appGenerationByMessageID)
	}
}

func TestRegisterAIRoutesStartsManagedBranchEditWithFilteredAppGenerationProvenance(t *testing.T) {
	t.Parallel()

	managedStarter := &aiRouteStubManagedStarter{}
	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{managedStarter: managedStarter})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)

	parentRun := agentruns.NewRun(nil, map[string]any{
		"runType":         managedchat.RunTypeManagedChat,
		"chatId":          "chat-parent-branch",
		"projectConfigId": "project-alpha",
		"engineConfigId":  "engine-managed",
		"messages": []any{
			map[string]any{
				"id":   "source-user",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Original prompt"},
				},
				"attachments": []any{},
			},
		},
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	parentRun.Status = agentruns.RunStatusCompleted
	finishedAt := time.Date(2026, 3, 8, 12, 0, 5, 0, time.UTC)
	parentRun.FinishedAt = &finishedAt
	parentRun.Outputs = map[string]any{
		"messages": []any{
			map[string]any{
				"id":   "source-user",
				"role": "user",
				"content": []any{
					map[string]any{"type": "text", "text": "Original prompt"},
				},
				"attachments": []any{},
			},
			map[string]any{
				"id":   "assistant-parent",
				"role": "assistant",
				"content": []any{
					map[string]any{"type": "text", "text": "Original reply"},
				},
				"attachments": []any{},
				"tool_calls":  nil,
			},
		},
	}
	if err := fixture.store.Save(parentRun); err != nil {
		t.Fatalf("save parent managed run: %v", err)
	}

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"edited-user","role":"user","content":[{"type":"text","text":"Edited prompt"}]},
			"engineConfigId":"engine-managed",
			"agentProfileId":null,
			"thinking":false,
			"projectConfigId":"project-alpha",
			"sectionId":null,
			"allowUnscoped":true,
			"branchParentChatId":"chat-parent-branch",
			"branchFromMessageId":"source-user",
			"appGenerationMode":"prompt_builder",
			"appGenerationByMessageId":{"source-user":"prompt_builder"},
			"permissionMode":"minimal",
			"searchEnabled":true
		}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	if fixture.managedStarter.lastInputs == nil {
		t.Fatal("expected managed starter to receive branch-edit inputs")
	}
	if got := fixture.managedStarter.lastInputs["branchParentChatId"]; got != "chat-parent-branch" {
		t.Fatalf("expected branchParentChatId to persist, got %#v", got)
	}
	if got := fixture.managedStarter.lastInputs["branchFromMessageId"]; got != "source-user" {
		t.Fatalf("expected branchFromMessageId to persist, got %#v", got)
	}
	if got := fixture.managedStarter.lastInputs["branchRootChatId"]; got != "chat-parent-branch" {
		t.Fatalf("expected branchRootChatId to resolve from parent chat, got %#v", got)
	}
	if got := fixture.managedStarter.lastInputs["branchCreatedAt"]; got == nil {
		t.Fatal("expected branchCreatedAt to persist")
	}
	appGenerationByMessageID, ok := fixture.managedStarter.lastInputs["appGenerationByMessageId"].(map[string]string)
	if !ok || len(appGenerationByMessageID) != 1 || appGenerationByMessageID["source-user"] != agentruns.ChatAppGenerationMessageModePromptBuilder {
		t.Fatalf("expected filtered branch-edit app-generation provenance, got %#v", fixture.managedStarter.lastInputs["appGenerationByMessageId"])
	}
	rawMessages, ok := fixture.managedStarter.lastInputs["messages"].([]any)
	if !ok || len(rawMessages) != 1 {
		t.Fatalf("expected one edited branch message, got %#v", fixture.managedStarter.lastInputs["messages"])
	}
	editedMessage, ok := rawMessages[0].(map[string]any)
	if !ok {
		t.Fatalf("expected branch message object, got %#v", rawMessages[0])
	}
	if editedMessage["id"] != "source-user" {
		t.Fatalf("expected edited branch message to reuse source id, got %#v", editedMessage["id"])
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

func TestRegisterAIRoutesReturnsManagedValidationErrors(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)

	testCases := []struct {
		name      string
		body      string
		wantCode  int
		wantError string
	}{
		{
			name: "missing permission mode",
			body: `{
				"chatId":null,
				"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Missing permission mode"}]},
				"engineConfigId":"engine-managed",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"searchEnabled":true
			}`,
			wantCode:  http.StatusBadRequest,
			wantError: "permission_mode_invalid",
		},
		{
			name: "missing search enabled",
			body: `{
				"chatId":null,
				"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Missing search enabled"}]},
				"engineConfigId":"engine-managed",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"permissionMode":"minimal"
			}`,
			wantCode:  http.StatusBadRequest,
			wantError: "invalid_json",
		},
		{
			name: "missing scoped section id",
			body: `{
				"chatId":null,
				"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Scoped send"}]},
				"engineConfigId":"engine-managed",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":false,
				"permissionMode":"minimal",
				"searchEnabled":true
			}`,
			wantCode:  http.StatusBadRequest,
			wantError: "section_id_required",
		},
		{
			name: "allow unscoped conflicts with section id",
			body: `{
				"chatId":null,
				"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Conflicting scope"}]},
				"engineConfigId":"engine-managed",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":"section-alpha",
				"allowUnscoped":true,
				"permissionMode":"minimal",
				"searchEnabled":true
			}`,
			wantCode:  http.StatusBadRequest,
			wantError: "allow_unscoped_conflict",
		},
		{
			name: "continue conflicts with explicit chat id",
			body: `{
				"chatId":"chat-managed",
				"continueFromChatId":"chat-source",
				"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Conflicting continue"}]},
				"engineConfigId":"engine-managed",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"permissionMode":"minimal",
				"searchEnabled":true
			}`,
			wantCode:  http.StatusBadRequest,
			wantError: "continue_from_chat_conflict",
		},
		{
			name: "branch edits require both fields",
			body: `{
				"chatId":null,
				"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Branch edit"}]},
				"engineConfigId":"engine-managed",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"branchParentChatId":"chat-parent",
				"permissionMode":"minimal",
				"searchEnabled":true
			}`,
			wantCode:  http.StatusBadRequest,
			wantError: "branch_fields_required",
		},
		{
			name: "continue conflicts with branch edits",
			body: `{
				"chatId":null,
				"continueFromChatId":"chat-source",
				"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Branch continue conflict"}]},
				"engineConfigId":"engine-managed",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"branchParentChatId":"chat-parent",
				"branchFromMessageId":"msg-1",
				"permissionMode":"minimal",
				"searchEnabled":true
			}`,
			wantCode:  http.StatusBadRequest,
			wantError: "continue_from_chat_with_branch_edits",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteGetLLMResponse,
				strings.NewReader(testCase.body),
			)
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != testCase.wantCode {
				t.Fatalf("expected %d, got %d with body %q", testCase.wantCode, response.Code, response.Body.String())
			}
			var payload errorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode error payload: %v", err)
			}
			if payload.Error.Code != testCase.wantError {
				t.Fatalf("expected error %q, got %#v", testCase.wantError, payload)
			}
		})
	}
}

func TestRegisterAIRoutesReturnsManagedChatIdentityMismatchErrors(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)

	externalRun := agentruns.NewRun(nil, map[string]any{
		"runType":         externalagents.RunTypeExternalAgent,
		"chatId":          "chat-managed-conflict",
		"projectConfigId": "project-alpha",
		"messages":        []any{},
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	if err := fixture.store.Save(externalRun); err != nil {
		t.Fatalf("save external conflict run: %v", err)
	}
	managedRun := agentruns.NewRun(nil, map[string]any{
		"runType":         managedchat.RunTypeManagedChat,
		"chatId":          "chat-managed-project-mismatch",
		"projectConfigId": "project-beta",
		"engineConfigId":  "engine-managed",
		"messages":        []any{},
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	if err := fixture.store.Save(managedRun); err != nil {
		t.Fatalf("save managed mismatch run: %v", err)
	}

	testCases := []struct {
		name      string
		body      string
		wantError string
	}{
		{
			name: "engine mismatch",
			body: `{
				"chatId":"chat-managed-conflict",
				"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Reuse chat"}]},
				"engineConfigId":"engine-managed",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"permissionMode":"minimal",
				"searchEnabled":true
			}`,
			wantError: "chat_engine_mismatch",
		},
		{
			name: "project mismatch",
			body: `{
				"chatId":"chat-managed-project-mismatch",
				"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Reuse chat"}]},
				"engineConfigId":"engine-managed",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"permissionMode":"minimal",
				"searchEnabled":true
			}`,
			wantError: "chat_project_config_mismatch",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetLLMResponse, strings.NewReader(testCase.body))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != http.StatusConflict {
				t.Fatalf("expected 409, got %d with body %q", response.Code, response.Body.String())
			}
			var payload errorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode error payload: %v", err)
			}
			if payload.Error.Code != testCase.wantError {
				t.Fatalf("expected error %q, got %#v", testCase.wantError, payload)
			}
		})
	}
}

func TestRegisterAIRoutesReturnsExternalValidationErrors(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)

	testCases := []struct {
		name      string
		body      string
		wantCode  int
		wantError string
	}{
		{
			name: "missing permission mode",
			body: `{
				"chatId":null,
				"message":{"id":"user-external","role":"user","content":[{"type":"text","text":"Missing permission mode"}]},
				"engineConfigId":"engine-external",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"searchEnabled":true
			}`,
			wantCode:  http.StatusBadRequest,
			wantError: "permission_mode_invalid",
		},
		{
			name: "missing search enabled",
			body: `{
				"chatId":null,
				"message":{"id":"user-external","role":"user","content":[{"type":"text","text":"Missing search enabled"}]},
				"engineConfigId":"engine-external",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"permissionMode":"minimal"
			}`,
			wantCode:  http.StatusBadRequest,
			wantError: "invalid_json",
		},
		{
			name: "missing scoped section id",
			body: `{
				"chatId":null,
				"message":{"id":"user-external","role":"user","content":[{"type":"text","text":"Scoped send"}]},
				"engineConfigId":"engine-external",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":false,
				"permissionMode":"minimal",
				"searchEnabled":true
			}`,
			wantCode:  http.StatusBadRequest,
			wantError: "section_id_required",
		},
		{
			name: "allow unscoped conflicts with section id",
			body: `{
				"chatId":null,
				"message":{"id":"user-external","role":"user","content":[{"type":"text","text":"Conflicting scope"}]},
				"engineConfigId":"engine-external",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":"section-alpha",
				"allowUnscoped":true,
				"permissionMode":"minimal",
				"searchEnabled":true
			}`,
			wantCode:  http.StatusBadRequest,
			wantError: "allow_unscoped_conflict",
		},
		{
			name: "continue conflicts with explicit chat id",
			body: `{
				"chatId":"chat-external",
				"continueFromChatId":"chat-source",
				"message":{"id":"user-external","role":"user","content":[{"type":"text","text":"Conflicting continue"}]},
				"engineConfigId":"engine-external",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"permissionMode":"minimal",
				"searchEnabled":true
			}`,
			wantCode:  http.StatusBadRequest,
			wantError: "continue_from_chat_conflict",
		},
		{
			name: "missing continuation source",
			body: `{
				"chatId":null,
				"continueFromChatId":"missing-chat",
				"message":{"id":"user-external","role":"user","content":[{"type":"text","text":"Continue missing"}]},
				"engineConfigId":"engine-external",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"permissionMode":"minimal",
				"searchEnabled":true
			}`,
			wantCode:  http.StatusNotFound,
			wantError: "source_chat_not_found",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteGetLLMResponse,
				strings.NewReader(testCase.body),
			)
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != testCase.wantCode {
				t.Fatalf("expected %d, got %d with body %q", testCase.wantCode, response.Code, response.Body.String())
			}
			var payload errorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode error payload: %v", err)
			}
			if payload.Error.Code != testCase.wantError {
				t.Fatalf("expected error %q, got %#v", testCase.wantError, payload)
			}
		})
	}
}

func TestRegisterAIRoutesRejectsStrictUnknownFieldsOnGetLLMResponse(t *testing.T) {
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
			"thinking":false,
			"projectConfigId":"project-alpha",
			"sectionId":null,
			"allowUnscoped":true,
			"permissionMode":"minimal",
			"searchEnabled":false,
			"unexpectedField":true
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
	if payload.Error.Code != "invalid_json" {
		t.Fatalf("expected invalid_json, got %#v", payload)
	}
}

func TestRegisterAIRoutesRejectsMissingThinkingFieldOnGetLLMResponse(t *testing.T) {
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
	if payload.Error.Code != "invalid_json" {
		t.Fatalf("expected invalid_json, got %#v", payload)
	}
}

func TestRegisterAIRoutesReturnsExternalChatProjectMismatch(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)

	run := agentruns.NewRun(nil, map[string]any{
		"runType":         externalagents.RunTypeExternalAgent,
		"chatId":          "chat-external-project-mismatch",
		"projectConfigId": "project-beta",
		"engineConfigId":  "engine-external",
		"messages":        []any{},
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	if err := fixture.store.Save(run); err != nil {
		t.Fatalf("save external mismatch run: %v", err)
	}

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":"chat-external-project-mismatch",
			"message":{"id":"user-external","role":"user","content":[{"type":"text","text":"Reuse chat"}]},
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
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "chat_project_config_mismatch" {
		t.Fatalf("expected chat_project_config_mismatch, got %#v", payload)
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

func TestRegisterAIRoutesRejectsImageModeWithoutAttachmentForManagedSend(t *testing.T) {
	t.Parallel()

	managedStarter := &aiRouteStubManagedStarter{}
	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{managedStarter: managedStarter})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Match this reference image."}],"attachments":[]},
			"engineConfigId":"engine-managed",
			"thinking":false,
			"projectConfigId":"project-alpha",
			"sectionId":null,
			"allowUnscoped":true,
			"permissionMode":"minimal",
			"searchEnabled":false,
			"appGenerationMode":"json_render_with_image",
			"appGenerationByMessageId":{"user-managed":"json_render_with_image"}
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
	if payload.Error.Code != "app_generation_image_attachment_required" {
		t.Fatalf("expected image attachment requirement error, got %#v", payload)
	}
	if fixture.managedStarter.lastInputs != nil {
		t.Fatalf("expected managed starter not to run, got %#v", fixture.managedStarter.lastInputs)
	}
}

func TestRegisterAIRoutesRejectsImageModeWithoutAttachmentForExternalSend(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"message":{"id":"user-external","role":"user","content":[{"type":"text","text":"Match this reference image."}],"attachments":[]},
			"engineConfigId":"engine-external",
			"thinking":false,
			"projectConfigId":"project-alpha",
			"sectionId":null,
			"allowUnscoped":true,
			"permissionMode":"minimal",
			"searchEnabled":false,
			"appGenerationMode":"json_render_with_image",
			"appGenerationByMessageId":{"user-external":"json_render_with_image"}
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
	if payload.Error.Code != "app_generation_image_attachment_required" {
		t.Fatalf("expected image attachment requirement error, got %#v", payload)
	}
	runs, err := fixture.store.List()
	if err != nil {
		t.Fatalf("list runs: %v", err)
	}
	if len(runs) != 0 {
		t.Fatalf("expected external send not to persist a run, got %#v", runs)
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
	if payload.AppGenerationByMessageID["user-1"] != agentruns.ChatAppGenerationMessageModeMCPServer {
		t.Fatalf("expected external app-generation provenance, got %#v", payload.AppGenerationByMessageID)
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

func TestRegisterAIRoutesReturnsManagedAndExternalAIFollowSnapshot(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	managedRun := agentruns.NewRun(nil, map[string]any{
		"runType":         managedchat.RunTypeManagedChat,
		"chatId":          "chat-managed",
		"projectConfigId": "project-alpha",
		"engineConfigId":  "engine-managed",
		"messages":        []any{},
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	managedRun.ID = "run-managed-follow"
	fixture.managedLive.ActivateRun(managedRun)
	if err := fixture.managedLive.ApplyChunk(context.Background(), managedchat.StreamChunkParams{
		RunID:           managedRun.ID,
		ChatID:          "chat-managed",
		ProjectConfigID: stringPtr("project-alpha"),
		Chunk: realtime.ToolArgumentPreviewDeltaEvent{
			Type:            realtime.StreamingEventTypeToolArgumentPreview,
			MessageID:       "assistant-managed",
			ToolCallID:      "tool-call-managed",
			ToolName:        mcpx.BuildNamespacedToolName(mcpx.DefaultServerID, "setSectionSize"),
			ArgumentsDelta:  `{"sectionId":"section-managed"}`,
			PreviewKind:     "paramValue",
			TargetIDsByType: map[string][]string{"section": {"section-managed", "section-managed"}},
		},
	}); err != nil {
		t.Fatalf("apply managed preview chunk: %v", err)
	}

	run := fixture.seedRun("run-follow", agentruns.RunStatusRunning)
	if err := fixture.runtime.ActivateRun(run.ID, &aiRouteStubController{}); err != nil {
		t.Fatalf("activate external run: %v", err)
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
		t.Fatalf("set external live follow state: %v", err)
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
	if len(payload) != 2 {
		t.Fatalf("expected two snapshot entries, got %#v", payload)
	}
	if payload[0].ProjectConfigID != "project-alpha" || payload[0].ChatID != "chat-managed" {
		t.Fatalf("unexpected managed snapshot identity %#v", payload[0])
	}
	if len(payload[0].IDsByType["section"]) != 1 || payload[0].IDsByType["section"][0] != "section-managed" {
		t.Fatalf("unexpected managed follow ids %#v", payload[0].IDsByType)
	}
	if payload[1].ProjectConfigID != "project-alpha" || payload[1].ChatID != "chat-alpha" {
		t.Fatalf("unexpected external snapshot identity %#v", payload[1])
	}
	if len(payload[1].IDsByType["section"]) != 1 || payload[1].IDsByType["section"][0] != "section-alpha" {
		t.Fatalf("unexpected external follow ids %#v", payload[1].IDsByType)
	}
}

func TestRegisterAIRoutesAllowDeploymentAIFollowSnapshotWhenLLMAccessEnabled(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	managedRun := agentruns.NewRun(nil, map[string]any{
		"runType":         managedchat.RunTypeManagedChat,
		"chatId":          "chat-managed",
		"projectConfigId": "project-alpha",
		"engineConfigId":  "engine-managed",
		"messages":        []any{},
	}, time.Date(2026, 3, 8, 12, 0, 0, 0, time.UTC))
	managedRun.ID = "run-managed-follow"
	fixture.managedLive.ActivateRun(managedRun)
	if err := fixture.managedLive.ApplyChunk(context.Background(), managedchat.StreamChunkParams{
		RunID:           managedRun.ID,
		ChatID:          "chat-managed",
		ProjectConfigID: stringPtr("project-alpha"),
		Chunk: realtime.ToolArgumentPreviewDeltaEvent{
			Type:            realtime.StreamingEventTypeToolArgumentPreview,
			MessageID:       "assistant-managed",
			ToolCallID:      "tool-call-managed",
			ToolName:        mcpx.BuildNamespacedToolName(mcpx.DefaultServerID, "setSectionSize"),
			ArgumentsDelta:  `{"sectionId":"section-managed"}`,
			PreviewKind:     "paramValue",
			TargetIDsByType: map[string][]string{"section": {"section-managed"}},
		},
	}); err != nil {
		t.Fatalf("apply managed preview chunk: %v", err)
	}

	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Policy: map[string]any{"allowLLM": true},
	})
	handler := newAIRouteTestHandlerWithTranscriptionDeployment(
		t,
		config.ModeShare,
		deploymentRuntime,
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
	if payload[0].ProjectConfigID != "project-alpha" || payload[0].ChatID != "chat-managed" {
		t.Fatalf("unexpected managed snapshot identity %#v", payload[0])
	}
	if len(payload[0].IDsByType["section"]) != 1 || payload[0].IDsByType["section"][0] != "section-managed" {
		t.Fatalf("unexpected managed follow ids %#v", payload[0].IDsByType)
	}
}

func TestRegisterAIRoutesBlockDeploymentAIFollowSnapshotWhenLLMAccessDisabled(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Policy: map[string]any{"allowLLM": false},
	})
	handler := newAIRouteTestHandlerWithTranscriptionDeployment(
		t,
		config.ModeShare,
		deploymentRuntime,
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
		"/api"+RouteGetAIFollowSnapshot,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "llm_access_forbidden" {
		t.Fatalf("expected llm_access_forbidden, got %#v", payload)
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
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000}`),
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

func TestRegisterAIRoutesReturnsTypedInvalidRequestForFileSampleRateChange(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-file": {
				ID:        "openai-file",
				Model:     "whisper-1",
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
		strings.NewReader(`{"transcriptionProfileId":"profile-file"}`),
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

	firstAppendRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00})+`","sampleRateHz":24000,"channels":1}`),
	)
	firstAppendRequest.Header.Set("Content-Type", "application/json")
	firstAppendResponse := httptest.NewRecorder()

	handler.ServeHTTP(firstAppendResponse, firstAppendRequest)

	if firstAppendResponse.Code != http.StatusOK {
		t.Fatalf("expected first append 200, got %d with body %q", firstAppendResponse.Code, firstAppendResponse.Body.String())
	}

	// The route must preserve the file-session sample-rate lock once the first chunk establishes it.
	secondAppendRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x01, 0x00})+`","sampleRateHz":16000,"channels":1}`),
	)
	secondAppendRequest.Header.Set("Content-Type", "application/json")
	secondAppendResponse := httptest.NewRecorder()

	handler.ServeHTTP(secondAppendResponse, secondAppendRequest)

	if secondAppendResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", secondAppendResponse.Code, secondAppendResponse.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(secondAppendResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "invalid_request" {
		t.Fatalf("expected invalid_request, got %#v", payload)
	}
	if payload.Error.Message != "sampleRateHz cannot change within a transcription session." {
		t.Fatalf("unexpected error payload %#v", payload)
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
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"transcription_session.updated","event_id":"evt-ready"}`)); err != nil {
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
		if captured.Query != "intent=transcription" {
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
		if payload["type"] != "transcription_session.update" {
			t.Fatalf("unexpected session update payload %#v", payload)
		}
		if payload["input_audio_format"] != "pcm16" {
			t.Fatalf("unexpected audio input format %#v", payload)
		}
		transcriptionPayload, ok := payload["input_audio_transcription"].(map[string]any)
		if !ok {
			t.Fatalf("expected transcription payload, got %#v", payload)
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

func TestRegisterAIRoutesReturnsTypedInvalidRequestForRealtimeStereoAudio(t *testing.T) {
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

	// The route should surface the runtime's mono-only realtime constraint as a typed invalid request.
	appendRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString([]byte{0x00, 0x00, 0x01, 0x00})+`","sampleRateHz":24000,"channels":2}`),
	)
	appendRequest.Header.Set("Content-Type", "application/json")
	appendResponse := httptest.NewRecorder()

	handler.ServeHTTP(appendResponse, appendRequest)

	if appendResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", appendResponse.Code, appendResponse.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(appendResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "invalid_request" {
		t.Fatalf("expected invalid_request, got %#v", payload)
	}
	if payload.Error.Message != "Realtime transcription requires mono PCM16 audio." {
		t.Fatalf("unexpected error payload %#v", payload)
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

	select {
	case err := <-closed:
		if websocket.CloseStatus(err) != websocket.StatusNormalClosure {
			t.Fatalf("expected normal websocket close, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for realtime close")
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

func TestRegisterAIRoutesRecomputesAppendDeltaWhenCommitOrderingArrivesAfterTranscript(t *testing.T) {
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
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-1","item_id":"item-2","transcript":"world"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-2","item_id":"item-1","transcript":"hello"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"input_audio_buffer.committed","event_id":"evt-3","item_id":"item-1"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"input_audio_buffer.committed","event_id":"evt-4","item_id":"item-2","previous_item_id":"item-1"}`)); err != nil {
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
	if appendPayload.IsFinal || appendPayload.AppendText != "hello world" || appendPayload.FullText != "hello world" {
		t.Fatalf("unexpected append payload %#v", appendPayload)
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

func TestRegisterAIRoutesUsesKnownPreviousItemOrderingWithoutParentCommit(t *testing.T) {
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
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if _, err := readAIRouteRealtimeProviderMessage(context.Background(), conn); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-1","item_id":"item-2","transcript":"world"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"conversation.item.input_audio_transcription.completed","event_id":"evt-2","item_id":"item-1","transcript":"hello"}`)); err != nil {
			return
		}
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":"input_audio_buffer.committed","event_id":"evt-3","item_id":"item-2","previous_item_id":"item-1"}`)); err != nil {
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
	if appendPayload.IsFinal || appendPayload.AppendText != "hello world" || appendPayload.FullText != "hello world" {
		t.Fatalf("unexpected append payload %#v", appendPayload)
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

func TestRegisterAIRoutesReturnsTypedRealtimeProviderFailureFromAppendMalformedEvent(t *testing.T) {
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
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":`)); err != nil {
			return
		}
		_, _, _ = conn.Read(context.Background())
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
	if payload.Error.Message != "Realtime transcription failed." {
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

func TestRegisterAIRoutesReturnsTypedRealtimeProviderFailureFromStopMalformedEvent(t *testing.T) {
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
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":`)); err != nil {
			return
		}
		_, _, _ = conn.Read(context.Background())
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
	if payload.Error.Message != "Realtime transcription failed." {
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

func TestRegisterAIRoutesAllowDeploymentTranscriptionWhenLLMAccessEnabled(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-file": {
				ID:        "openai-file",
				Model:     "whisper-1",
				Provider:  "openai",
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
	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Policy: map[string]any{"allowLLM": true},
	})
	handler := newAIRouteTestHandlerWithTranscriptionDeployment(
		t,
		config.ModeShare,
		deploymentRuntime,
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
		strings.NewReader(`{"transcriptionProfileId":"profile-file"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(response.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}
	if started.ResolvedTransportMode != transcriptionsessions.ResolvedTransportModeFile {
		t.Fatalf("expected file-mode start payload, got %#v", started)
	}
}

func TestRegisterAIRoutesBlockDeploymentTranscriptionWhenLLMAccessDisabled(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Policy: map[string]any{"allowLLM": false},
	})
	handler := newAIRouteTestHandlerWithTranscriptionDeployment(
		t,
		config.ModeShare,
		deploymentRuntime,
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
		strings.NewReader(`{"transcriptionProfileId":"profile-file"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "llm_access_forbidden" {
		t.Fatalf("expected llm_access_forbidden, got %#v", payload)
	}
}

func TestRegisterAIRoutesAllowLauncherTranscriptionWhenLLMAccessImplicitlyAllowed(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-file": {
				ID:        "openai-file",
				Model:     "whisper-1",
				Provider:  "openai",
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
		config.ModeLauncher,
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
		strings.NewReader(`{"transcriptionProfileId":"profile-file"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(response.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start response: %v", err)
	}
	if started.ResolvedTransportMode != transcriptionsessions.ResolvedTransportModeFile {
		t.Fatalf("expected file-mode start payload, got %#v", started)
	}
}

func TestRegisterAIRoutesTranscriptionRoutesRejectInvalidJSONWithValidationEnvelope(t *testing.T) {
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

	testCases := []struct {
		name string
		path string
	}{
		{name: "start", path: RouteStartTranscriptionSession},
		{name: "append", path: RouteAppendTranscriptionAudio},
		{name: "stop", path: RouteStopTranscriptionSession},
		{name: "cancel", path: RouteCancelTranscriptionSession},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/api"+tc.path, strings.NewReader(`{"`))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != http.StatusUnprocessableEntity {
				t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
			}
			var payload validationErrorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode validation envelope: %v", err)
			}
			if payload.StatusCode != 10422 {
				t.Fatalf("expected validation status code 10422, got %#v", payload)
			}
			if payload.Message == "" {
				t.Fatalf("expected validation message, got %#v", payload)
			}
			if payload.Data != nil {
				t.Fatalf("expected nil validation data, got %#v", payload.Data)
			}
		})
	}
}

func TestRegisterAIRoutesTranscriptionRoutesRejectMissingRequiredFieldsWithValidationEnvelope(t *testing.T) {
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

	testCases := []struct {
		name            string
		path            string
		body            string
		expectedMessage string
	}{
		{
			name:            "start missing transcriptionProfileId",
			path:            RouteStartTranscriptionSession,
			body:            `{}`,
			expectedMessage: "transcriptionProfileId: Field required",
		},
		{
			name:            "append missing sessionId",
			path:            RouteAppendTranscriptionAudio,
			body:            `{"audioPcm16Base64":"AA==","sampleRateHz":24000}`,
			expectedMessage: "sessionId: Field required",
		},
		{
			name:            "append missing audioPcm16Base64",
			path:            RouteAppendTranscriptionAudio,
			body:            `{"sessionId":"session-1","sampleRateHz":24000}`,
			expectedMessage: "audioPcm16Base64: Field required",
		},
		{
			name:            "append missing sampleRateHz",
			path:            RouteAppendTranscriptionAudio,
			body:            `{"sessionId":"session-1","audioPcm16Base64":"AA=="}`,
			expectedMessage: "sampleRateHz: Field required",
		},
		{
			name:            "stop missing sessionId",
			path:            RouteStopTranscriptionSession,
			body:            `{}`,
			expectedMessage: "sessionId: Field required",
		},
		{
			name:            "cancel missing sessionId",
			path:            RouteCancelTranscriptionSession,
			body:            `{}`,
			expectedMessage: "sessionId: Field required",
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/api"+tc.path, strings.NewReader(tc.body))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != http.StatusUnprocessableEntity {
				t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
			}
			var payload validationErrorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode validation envelope: %v", err)
			}
			if payload.StatusCode != 10422 {
				t.Fatalf("expected validation status code 10422, got %#v", payload)
			}
			if payload.Message != tc.expectedMessage {
				t.Fatalf("expected validation message %q, got %#v", tc.expectedMessage, payload)
			}
			if payload.Data != nil {
				t.Fatalf("expected nil validation data, got %#v", payload.Data)
			}
		})
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
	if payload.Error.Message != "Realtime transcription is unavailable for this provider/model." {
		t.Fatalf("unexpected error payload %#v", payload)
	}
}

func TestRegisterAIRoutesReturnsTypedMissingTranscriptionProfile(t *testing.T) {
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
		"/api"+RouteStartTranscriptionSession,
		strings.NewReader(`{"transcriptionProfileId":"missing-profile"}`),
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
	if payload.Error.Code != "profile_not_found" {
		t.Fatalf("expected profile_not_found, got %#v", payload)
	}
	if payload.Error.Message != "Transcription profile missing-profile not found." {
		t.Fatalf("unexpected error payload %#v", payload)
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

func TestRegisterAIRoutesAutoTranscriptionResolvesToRealtime(t *testing.T) {
	t.Parallel()

	type providerHandshake struct {
		Path          string
		Query         string
		Authorization string
		OpenAIBeta    string
	}

	handshakes := make(chan providerHandshake, 1)
	closed := make(chan error, 1)
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
			ID:                            "profile-auto",
			Name:                          "Auto",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeAuto,
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
		strings.NewReader(`{"transcriptionProfileId":"profile-auto"}`),
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
		t.Fatalf("unexpected auto start payload %#v", started)
	}

	select {
	case captured := <-handshakes:
		if captured.Path != "/v1/realtime" {
			t.Fatalf("unexpected provider path %q", captured.Path)
		}
		if captured.Query != "intent=transcription" {
			t.Fatalf("unexpected provider query %q", captured.Query)
		}
		if captured.Authorization != "Bearer route-secret" {
			t.Fatalf("unexpected authorization %q", captured.Authorization)
		}
		if captured.OpenAIBeta != "realtime=v1" {
			t.Fatalf("unexpected OpenAI-Beta header %q", captured.OpenAIBeta)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for auto realtime handshake")
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

	select {
	case err := <-closed:
		if websocket.CloseStatus(err) != websocket.StatusNormalClosure {
			t.Fatalf("expected normal websocket close, got %v", err)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for auto realtime cancel close")
	}
}

func TestRegisterAIRoutesAutoTranscriptionReturnsTypedMissingAPIKeyWithoutFallback(t *testing.T) {
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
			ID:                            "profile-auto",
			Name:                          "Auto",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeAuto,
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
		strings.NewReader(`{"transcriptionProfileId":"profile-auto"}`),
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

func TestRegisterAIRoutesAutoTranscriptionFallsBackToFileOnRealtimeCapabilitySetupFailure(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"message":"input_audio_transcription is not supported for this model."}}`))
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
			ID:                            "profile-auto",
			Name:                          "Auto",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeAuto,
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
		strings.NewReader(`{"transcriptionProfileId":"profile-auto"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var payload StartTranscriptionSessionResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode start response: %v", err)
	}
	if payload.ResolvedTransportMode != transcriptionsessions.ResolvedTransportModeFile {
		t.Fatalf("expected file-mode fallback payload, got %#v", payload)
	}
	if payload.ChunkMs != 0 {
		t.Fatalf("expected zero chunkMs for file-mode fallback, got %#v", payload)
	}
}

func TestRegisterAIRoutesAutoTranscriptionFallsBackToFileForCapabilitySetupStatus(t *testing.T) {
	t.Parallel()

	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadRequest)
		_, _ = w.Write([]byte(`{"error":{"message":"Realtime session setup failed."}}`))
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
			ID:                            "profile-auto",
			Name:                          "Auto",
			TranscriptionLLMConfigID:      "openai-realtime",
			TransportMode:                 transcriptionprofiles.TransportModeAuto,
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
		strings.NewReader(`{"transcriptionProfileId":"profile-auto"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var payload StartTranscriptionSessionResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode start response: %v", err)
	}
	if payload.ResolvedTransportMode != transcriptionsessions.ResolvedTransportModeFile {
		t.Fatalf("expected file-mode fallback, got %#v", payload)
	}
	if payload.ChunkMs != 0 {
		t.Fatalf("expected file-mode chunkMs 0 after fallback, got %#v", payload)
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

func TestRegisterAIRoutesReturnsTypedRealtimeProviderFailureFromStartMalformedEvent(t *testing.T) {
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
		if err := conn.Write(context.Background(), websocket.MessageText, []byte(`{"type":`)); err != nil {
			return
		}
		_, _, _ = conn.Read(context.Background())
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
	if payload.Error.Message != "Realtime transcription failed." {
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
	if payload.Error.Message != "Transcription session missing-session not found." {
		t.Fatalf("unexpected error payload %#v", payload)
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

func TestRegisterAIRoutesAcceptsLargeJSONTranscriptionAudioPayload(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	if err := fixture.llm.UpdateConfig(llmconfig.AllConfigs{
		Configs: map[string]llmconfig.Config{
			"openai-file": {
				ID:        "openai-file",
				Model:     "whisper-1",
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
		strings.NewReader(`{"transcriptionProfileId":"profile-file"}`),
	)
	startRequest.Header.Set("Content-Type", "application/json")
	startResponse := httptest.NewRecorder()
	handler.ServeHTTP(startResponse, startRequest)
	if startResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 start, got %d with body %q", startResponse.Code, startResponse.Body.String())
	}
	var started StartTranscriptionSessionResponse
	if err := json.Unmarshal(startResponse.Body.Bytes(), &started); err != nil {
		t.Fatalf("decode start payload: %v", err)
	}

	audioPCM16 := bytes.Repeat([]byte{0x00}, transcriptionsessions.DefaultAppendPCMMaxBytes-2)
	appendRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteAppendTranscriptionAudio,
		strings.NewReader(`{"sessionId":"`+started.SessionID+`","audioPcm16Base64":"`+base64.StdEncoding.EncodeToString(audioPCM16)+`","sampleRateHz":24000,"channels":1}`),
	)
	appendRequest.Header.Set("Content-Type", "application/json")
	appendResponse := httptest.NewRecorder()
	handler.ServeHTTP(appendResponse, appendRequest)

	if appendResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 append, got %d with body %q", appendResponse.Code, appendResponse.Body.String())
	}
	var payload TranscriptionSessionDeltaResponse
	if err := json.Unmarshal(appendResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode append payload: %v", err)
	}
	if payload.AppendText != "" || payload.FullText != "" || payload.IsFinal {
		t.Fatalf("unexpected append payload %#v", payload)
	}
}

func TestRegisterAIRoutesRejectsTranscriptionAppendBeforeDecodeWhenLLMAccessDisabled(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
		Policy: map[string]any{"allowLLM": false},
	})
	handler := newAIRouteTestHandlerWithTranscriptionDeployment(
		t,
		config.ModeShare,
		deploymentRuntime,
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
		strings.NewReader(`{"sessionId":"session-1","audioPcm16Base64":"%%%","sampleRateHz":24000,"channels":1}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "llm_access_forbidden" {
		t.Fatalf("expected llm_access_forbidden, got %#v", payload)
	}
	if payload.Error.Message != "Deployment policy disallows LLM access." {
		t.Fatalf("unexpected error payload %#v", payload)
	}
}

func TestRegisterAIRoutesRejectInvalidTranscriptionAppendPayloads(t *testing.T) {
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

	validAudio := base64.StdEncoding.EncodeToString([]byte{0x00, 0x00})
	oddAudio := base64.StdEncoding.EncodeToString([]byte{0x00})
	for _, testCase := range []struct {
		name            string
		body            string
		expectedMessage string
	}{
		{
			name:            "sample rate zero",
			body:            `{"sessionId":"session-1","audioPcm16Base64":"` + validAudio + `","sampleRateHz":0,"channels":1}`,
			expectedMessage: "sampleRateHz must be greater than 0.",
		},
		{
			name:            "channels zero",
			body:            `{"sessionId":"session-1","audioPcm16Base64":"` + validAudio + `","sampleRateHz":24000,"channels":0}`,
			expectedMessage: "channels must be greater than 0.",
		},
		{
			name:            "invalid base64",
			body:            `{"sessionId":"session-1","audioPcm16Base64":"%%%","sampleRateHz":24000,"channels":1}`,
			expectedMessage: "Audio payload is not valid base64.",
		},
		{
			name:            "empty audio payload",
			body:            `{"sessionId":"session-1","audioPcm16Base64":"   ","sampleRateHz":24000,"channels":1}`,
			expectedMessage: "Audio payload is empty.",
		},
		{
			name:            "odd byte pcm16 payload",
			body:            `{"sessionId":"session-1","audioPcm16Base64":"` + oddAudio + `","sampleRateHz":24000,"channels":1}`,
			expectedMessage: "Audio payload must be PCM16 with an even byte length.",
		},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteAppendTranscriptionAudio,
				strings.NewReader(testCase.body),
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
			if payload.Error.Code != "invalid_request" {
				t.Fatalf("expected invalid_request, got %#v", payload)
			}
			if payload.Error.Message != testCase.expectedMessage {
				t.Fatalf("expected %q, got %#v", testCase.expectedMessage, payload)
			}
		})
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

func TestRegisterAIRoutesRejectsOmittedProjectConfigIDFieldOnChatHydration(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)

	testCases := []struct {
		name  string
		route string
		body  string
	}{
		{
			name:  "managed chat hydration",
			route: RouteGetLLMChat,
			body:  `{"chatId":"chat-managed"}`,
		},
		{
			name:  "external chat hydration",
			route: RouteGetExternalAgentChat,
			body:  `{"chatId":"chat-external"}`,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+testCase.route,
				strings.NewReader(testCase.body),
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
			if payload.Error.Code != "project_config_id_required" {
				t.Fatalf("expected project_config_id_required, got %#v", payload)
			}
		})
	}
}

func TestRegisterAIRoutesAllowsExplicitNullProjectConfigIDOnChatHydration(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	fixture.seedManagedHydrationRun(t)
	fixture.seedHydrationRun(t)
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)

	testCases := []struct {
		name  string
		route string
		body  string
	}{
		{
			name:  "managed chat hydration",
			route: RouteGetLLMChat,
			body:  `{"chatId":"chat-managed","projectConfigId":null}`,
		},
		{
			name:  "external chat hydration",
			route: RouteGetExternalAgentChat,
			body:  `{"chatId":"chat-external","projectConfigId":null}`,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+testCase.route,
				strings.NewReader(testCase.body),
			)
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != http.StatusOK {
				t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
			}
		})
	}
}

func TestRegisterAIRoutesAllowDeploymentLLMSurfacesWhenLLMAccessEnabled(t *testing.T) {
	t.Parallel()

	type testCase struct {
		name         string
		setup        func(*testing.T, aiRouteFixture)
		requestBody  string
		route        string
		expectedCode int
	}

	testCases := []testCase{
		{
			name:  "shared send route",
			route: RouteGetLLMResponse,
			requestBody: `{
				"chatId":null,
				"message":{"id":"user-1","role":"user","content":[{"type":"text","text":"Create a new section."}]},
				"engineConfigId":"engine-external",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"permissionMode":"minimal",
				"searchEnabled":false,
				"appGenerationByMessageId":{"user-1":"mcp_server"}
			}`,
			expectedCode: http.StatusOK,
		},
		{
			name: "managed hydrate route",
			setup: func(t *testing.T, fixture aiRouteFixture) {
				fixture.seedManagedHydrationRun(t)
			},
			route:        RouteGetLLMChat,
			requestBody:  `{"chatId":"chat-managed","projectConfigId":"project-alpha"}`,
			expectedCode: http.StatusOK,
		},
		{
			name: "managed stop route",
			setup: func(t *testing.T, fixture aiRouteFixture) {
				fixture.seedManagedRunningRun(t)
			},
			route:        RouteStopLLMChat,
			requestBody:  `{"chatId":"chat-managed-stop"}`,
			expectedCode: http.StatusOK,
		},
		{
			name: "external hydrate route",
			setup: func(t *testing.T, fixture aiRouteFixture) {
				fixture.seedHydrationRun(t)
			},
			route:        RouteGetExternalAgentChat,
			requestBody:  `{"chatId":"chat-external","projectConfigId":"project-alpha"}`,
			expectedCode: http.StatusOK,
		},
		{
			name: "external stop route",
			setup: func(t *testing.T, fixture aiRouteFixture) {
				run := fixture.seedRun("run-stop-deployment", agentruns.RunStatusRunning)
				controller := &aiRouteStubController{}
				if err := fixture.runtime.ActivateRun(run.ID, controller); err != nil {
					t.Fatalf("activate run: %v", err)
				}
			},
			route:        RouteStopExternalAgentRun,
			requestBody:  `{"runId":"run-stop-deployment"}`,
			expectedCode: http.StatusOK,
		},
		{
			name: "external approval route",
			setup: func(t *testing.T, fixture aiRouteFixture) {
				run := fixture.seedRun("run-approval-deployment", agentruns.RunStatusRunning)
				controller := &aiRouteStubController{}
				if err := fixture.runtime.ActivateRun(run.ID, controller); err != nil {
					t.Fatalf("activate run: %v", err)
				}
				if err := fixture.runtime.RegisterApproval(externalagents.ApprovalState{
					ApprovalID:      "approval-deployment",
					RunID:           run.ID,
					ProjectConfigID: "project-alpha",
					ChatID:          "chat-alpha",
				}); err != nil {
					t.Fatalf("register approval: %v", err)
				}
			},
			route:        RouteRespondExternalAgentApproval,
			requestBody:  `{"approvalId":"approval-deployment","approved":true}`,
			expectedCode: http.StatusOK,
		},
		{
			name: "external question route",
			setup: func(t *testing.T, fixture aiRouteFixture) {
				run := fixture.seedRun("run-question-deployment", agentruns.RunStatusRunning)
				controller := &aiRouteStubController{}
				if err := fixture.runtime.ActivateRun(run.ID, controller); err != nil {
					t.Fatalf("activate run: %v", err)
				}
				if err := fixture.runtime.RegisterQuestion(externalagents.QuestionState{
					ToolCallID:      "question-deployment",
					RunID:           run.ID,
					ProjectConfigID: "project-alpha",
					ChatID:          "chat-alpha",
				}); err != nil {
					t.Fatalf("register question: %v", err)
				}
			},
			route:        RouteRespondExternalAgentQuestion,
			requestBody:  `{"toolCallId":"question-deployment","answers":{"Language":"Go"}}`,
			expectedCode: http.StatusOK,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
			if testCase.setup != nil {
				testCase.setup(t, fixture)
			}
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode:   config.ModeShare,
				Policy: map[string]any{"allowLLM": true},
			})
			shareSession, _, err := deploymentRuntime.GetOrCreateSession("share-a")
			if err != nil {
				t.Fatalf("get or create share session: %v", err)
			}
			handler := newAIRouteTestHandlerWithTranscriptionDeployment(
				t,
				config.ModeShare,
				deploymentRuntime,
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
				"/api"+testCase.route,
				strings.NewReader(testCase.requestBody),
			)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set(modes.ShareSessionHeaderName, shareSession.ID)
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != testCase.expectedCode {
				t.Fatalf("expected %d, got %d with body %q", testCase.expectedCode, response.Code, response.Body.String())
			}
		})
	}
}

func TestRegisterAIRoutesBlockDeploymentLLMSurfacesWhenLLMAccessDisabled(t *testing.T) {
	t.Parallel()

	testCases := []struct {
		name        string
		route       string
		requestBody string
	}{
		{
			name:  "shared send route",
			route: RouteGetLLMResponse,
			requestBody: `{
				"chatId":null,
				"message":{"id":"user-1","role":"user","content":[{"type":"text","text":"Create a new section."}]},
				"engineConfigId":"engine-external",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"permissionMode":"minimal",
				"searchEnabled":false
			}`,
		},
		{
			name:        "managed hydrate route",
			route:       RouteGetLLMChat,
			requestBody: `{"chatId":"chat-managed","projectConfigId":"project-alpha"}`,
		},
		{
			name:        "managed stop route",
			route:       RouteStopLLMChat,
			requestBody: `{"chatId":"chat-managed-stop"}`,
		},
		{
			name:        "external hydrate route",
			route:       RouteGetExternalAgentChat,
			requestBody: `{"chatId":"chat-external","projectConfigId":"project-alpha"}`,
		},
		{
			name:        "external stop route",
			route:       RouteStopExternalAgentRun,
			requestBody: `{"runId":"run-stop-deployment"}`,
		},
		{
			name:        "external approval route",
			route:       RouteRespondExternalAgentApproval,
			requestBody: `{"approvalId":"approval-deployment","approved":true}`,
		},
		{
			name:        "external question route",
			route:       RouteRespondExternalAgentQuestion,
			requestBody: `{"toolCallId":"question-deployment","answers":{"Language":"Go"}}`,
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
			deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
				Mode:   config.ModeShare,
				Policy: map[string]any{"allowLLM": false},
			})
			shareSession, _, err := deploymentRuntime.GetOrCreateSession("share-a")
			if err != nil {
				t.Fatalf("get or create share session: %v", err)
			}
			handler := newAIRouteTestHandlerWithTranscriptionDeployment(
				t,
				config.ModeShare,
				deploymentRuntime,
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
				"/api"+testCase.route,
				strings.NewReader(testCase.requestBody),
			)
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set(modes.ShareSessionHeaderName, shareSession.ID)
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != http.StatusForbidden {
				t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
			}
			var payload errorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode error payload: %v", err)
			}
			if payload.Error.Code != "llm_access_forbidden" {
				t.Fatalf("expected llm_access_forbidden, got %#v", payload)
			}
		})
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
	if payload.AppGenerationByMessageID["user-managed"] != agentruns.ChatAppGenerationMessageModePlainChat {
		t.Fatalf("expected managed plain-chat provenance, got %#v", payload.AppGenerationByMessageID)
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

// The stop route should preserve the source-shaped alreadyStopped transport
// when the chat has historical runs but nothing is still running.
func TestRegisterAIRoutesStopManagedChatReturnsAlreadyStoppedWhenNoRunningRunRemains(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	fixture.seedManagedHydrationRun(t)
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteStopLLMChat,
		strings.NewReader(`{"chatId":"chat-managed"}`),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var payload managedchat.StopResult
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode already-stopped managed chat response: %v", err)
	}
	if !payload.AlreadyStopped {
		t.Fatalf("expected alreadyStopped response, got %#v", payload)
	}
	if payload.StoppedRunID != nil || payload.StoppedMessageID != nil {
		t.Fatalf("expected nil stop ids for alreadyStopped response, got %#v", payload)
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
	return newAIRouteTestHandlerWithTranscriptionDeployment(
		t,
		mode,
		nil,
		managed,
		send,
		service,
		runtime,
		profiles,
		sessions,
		sessionProvider,
		follows...,
	)
}

func newAIRouteTestHandlerWithTranscriptionDeployment(
	t *testing.T,
	mode config.Mode,
	deploymentRuntime *deployments.Runtime,
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
	if deploymentRuntime == nil && (mode == config.ModeShare || mode == config.ModeApp) {
		deploymentRuntime = newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
			Policy: map[string]any{"allowLLM": true},
		})
	}

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterAIRoutes(r, AIRouteDependencies{
				ModePolicy:            modes.NewPolicy(mode),
				Deployment:            deploymentRuntime,
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
	managedLive           *managedchat.LiveRuntime
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
	managedLiveRuntime := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{})
	managedService, err := managedchat.NewService(managedchat.ServiceOptions{
		ProjectState: projectRuntime,
		Runs:         store,
		Engines:      engineStore,
		LLM:          llmRuntime,
		Profiles:     agentProfileStore,
		Starter:      managedStarter,
		Live:         managedLiveRuntime,
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
		managedLive:           managedLiveRuntime,
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
		"appGenerationByMessageId": map[string]any{
			"user-1": agentruns.ChatAppGenerationMessageModeMCPServer,
		},
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
		"appGenerationByMessageId": map[string]any{
			"user-managed": agentruns.ChatAppGenerationMessageModePlainChat,
		},
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
