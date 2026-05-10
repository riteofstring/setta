package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	"setta/internal/auth"
	"setta/internal/config"
	"setta/internal/externalagentconfigs"
	"setta/internal/externalagents"
	"setta/internal/managedchat"
	"setta/internal/managedllm"
	"setta/internal/mcpx"
	"setta/internal/tools"
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
	if !ok || appGenerationByMessageID["user-1"] != string(agentruns.ChatAppGenerationMessageModePlainChat) {
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
	if appGenerationByMessageID["user-1"] != string(agentruns.ChatAppGenerationMessageModeMCPServer) {
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
	if !ok || appGenerationByMessageID["user-managed"] != string(agentruns.ChatAppGenerationMessageModePlainChat) {
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
	if appGenerationByMessageID["user-managed"] != string(agentruns.ChatAppGenerationMessageModePlainChat) {
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
	if !ok || len(appGenerationByMessageID) != 1 || appGenerationByMessageID["source-user"] != string(agentruns.ChatAppGenerationMessageModePromptBuilder) {
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
	scriptableRun := agentruns.NewRun(nil, map[string]any{
		"runType":         "scriptable_chat",
		"chatId":          "chat-managed-scriptable-conflict",
		"projectConfigId": "project-alpha",
		"messages":        []any{},
	}, time.Date(2026, 3, 8, 12, 2, 0, 0, time.UTC))
	if err := fixture.store.Save(scriptableRun); err != nil {
		t.Fatalf("save scriptable mismatch run: %v", err)
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
			name: "scriptable history mismatch",
			body: `{
				"chatId":"chat-managed-scriptable-conflict",
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

func TestRegisterAIRoutesReturnsManagedContinuationEngineMismatchForScriptableSource(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)

	scriptableRun := agentruns.NewRun(nil, map[string]any{
		"runType":         "scriptable_chat",
		"chatId":          "chat-scriptable",
		"projectConfigId": "project-alpha",
		"messages":        []any{},
	}, time.Date(2026, 3, 8, 12, 5, 0, 0, time.UTC))
	if err := fixture.store.Save(scriptableRun); err != nil {
		t.Fatalf("save scriptable continuation run: %v", err)
	}

	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLLMResponse,
		strings.NewReader(`{
			"chatId":null,
			"continueFromChatId":"chat-scriptable",
			"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Reuse chat"}]},
			"engineConfigId":"engine-managed",
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
	if payload.Error.Code != "chat_engine_mismatch" {
		t.Fatalf("expected chat_engine_mismatch, got %#v", payload)
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
		{
			name: "continue conflicts with branch edits",
			body: `{
				"chatId":null,
				"continueFromChatId":"chat-source",
				"message":{"id":"user-external","role":"user","content":[{"type":"text","text":"Branch continue conflict"}]},
				"engineConfigId":"engine-external",
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

func TestRegisterAIRoutesGetLLMResponseSchemaFailuresReturnValidationEnvelope(t *testing.T) {
	t.Parallel()

	fixture := newAIRouteFixture(t, aiRouteFixtureOptions{})
	handler := newAIRouteTestHandler(t, config.ModeIDE, fixture.managed, fixture.send, fixture.service, fixture.runtime)
	for _, testCase := range []struct {
		name           string
		body           string
		expectedDetail string
	}{
		{
			name:           "malformed_json",
			body:           `{"projectConfigId":`,
			expectedDetail: "unexpected end of JSON input",
		},
		{
			name: "unknown_field",
			body: `{
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
			}`,
			expectedDetail: "unexpectedField: Extra inputs are not permitted",
		},
		{
			name: "missing_message",
			body: `{
				"chatId":null,
				"engineConfigId":"engine-managed",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"permissionMode":"minimal",
				"searchEnabled":false
			}`,
			expectedDetail: "message: Field required",
		},
		{
			name: "missing_engine_config_id",
			body: `{
				"chatId":null,
				"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Create a managed project."}]},
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"permissionMode":"minimal",
				"searchEnabled":false
			}`,
			expectedDetail: "engineConfigId: Field required",
		},
		{
			name: "missing_project_config_id",
			body: `{
				"chatId":null,
				"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Create a managed project."}]},
				"engineConfigId":"engine-managed",
				"thinking":false,
				"sectionId":null,
				"allowUnscoped":true,
				"permissionMode":"minimal",
				"searchEnabled":false
			}`,
			expectedDetail: "projectConfigId: Field required",
		},
		{
			name: "missing_thinking",
			body: `{
				"chatId":null,
				"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Create a managed project."}]},
				"engineConfigId":"engine-managed",
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"permissionMode":"minimal",
				"searchEnabled":false
			}`,
			expectedDetail: "thinking: Field required",
		},
		{
			name: "message_missing_role_discriminator",
			body: `{
				"chatId":null,
				"message":{"id":"user-managed","content":[{"type":"text","text":"Create a managed project."}]},
				"engineConfigId":"engine-managed",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"permissionMode":"minimal",
				"searchEnabled":false
			}`,
			expectedDetail: "message: Unable to extract tag using discriminator 'role'",
		},
		{
			name: "message_unknown_role_discriminator_value",
			body: `{
				"chatId":null,
				"message":{"id":"user-managed","role":"banana","content":[{"type":"text","text":"Create a managed project."}]},
				"engineConfigId":"engine-managed",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"permissionMode":"minimal",
				"searchEnabled":false
			}`,
			expectedDetail: "message: Input tag 'banana' found using 'role' does not match any of the expected tags: <ChatRole.system: 'system'>, <ChatRole.assistant: 'assistant'>, <ChatRole.user: 'user'>, <ChatRole.tool: 'tool'>",
		},
		{
			name: "tool_message_missing_tool_call_id",
			body: `{
				"chatId":null,
				"message":{"id":"tool-managed","role":"tool","content":[]},
				"engineConfigId":"engine-managed",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"permissionMode":"minimal",
				"searchEnabled":false
			}`,
			expectedDetail: "message.tool.tool_call_id: Field required",
		},
		{
			name: "null_thinking",
			body: `{
				"chatId":null,
				"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Create a managed project."}]},
				"engineConfigId":"engine-managed",
				"thinking":null,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"permissionMode":"minimal",
				"searchEnabled":false
			}`,
			expectedDetail: "thinking: Input should be a valid boolean",
		},
		{
			name: "missing_permission_mode",
			body: `{
				"chatId":null,
				"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Create a managed project."}]},
				"engineConfigId":"engine-managed",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"searchEnabled":false
			}`,
			expectedDetail: "permissionMode: Field required",
		},
		{
			name: "null_permission_mode",
			body: `{
				"chatId":null,
				"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Create a managed project."}]},
				"engineConfigId":"engine-managed",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"permissionMode":null,
				"searchEnabled":false
			}`,
			expectedDetail: "permissionMode: Input should be 'minimal', 'yolo' or 'config_toml_custom'",
		},
		{
			name: "missing_search_enabled",
			body: `{
				"chatId":null,
				"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Create a managed project."}]},
				"engineConfigId":"engine-managed",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"permissionMode":"minimal"
			}`,
			expectedDetail: "searchEnabled: Field required",
		},
		{
			name: "null_search_enabled",
			body: `{
				"chatId":null,
				"message":{"id":"user-managed","role":"user","content":[{"type":"text","text":"Create a managed project."}]},
				"engineConfigId":"engine-managed",
				"thinking":false,
				"projectConfigId":"project-alpha",
				"sectionId":null,
				"allowUnscoped":true,
				"permissionMode":"minimal",
				"searchEnabled":null
			}`,
			expectedDetail: "searchEnabled: Input should be a valid boolean",
		},
	} {
		testCase := testCase
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(
				http.MethodPost,
				"/api"+RouteGetLLMResponse,
				strings.NewReader(testCase.body),
			)
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()

			handler.ServeHTTP(response, request)

			if response.Code != http.StatusUnprocessableEntity {
				t.Fatalf("expected 422, got %d with body %q", response.Code, response.Body.String())
			}
			var payload validationErrorResponse
			if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
				t.Fatalf("decode validation payload: %v", err)
			}
			if payload.StatusCode != 10422 {
				t.Fatalf("expected validation status code 10422, got %#v", payload)
			}
			if payload.Message != testCase.expectedDetail {
				t.Fatalf("expected validation detail %q, got %#v", testCase.expectedDetail, payload)
			}
			if payload.Data != nil {
				t.Fatalf("expected nil validation data, got %#v", payload.Data)
			}
		})
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
