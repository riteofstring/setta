package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"setta/internal/agentprofiles"
	"setta/internal/agentruns"
	appsubsystemchatmodes "setta/internal/appsubsystem/chatmodes"
	"setta/internal/auth"
	"setta/internal/chatmodes"
	"setta/internal/config"
	"setta/internal/deployments"
	"setta/internal/externalagentconfigs"
	"setta/internal/externalagents"
	"setta/internal/llmconfig"
	"setta/internal/managedchat"
	"setta/internal/modes"
	"setta/internal/projectstate"
	"setta/internal/transcriptionprofiles"
	"setta/internal/transcriptionsessions"

	"github.com/go-chi/chi/v5"
)

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
	if got := payload.ToolCallArguments["tool-call-managed"]; got != `{"task":"Managed reply"}` {
		t.Fatalf("expected managed toolCallArguments payload, got %#v", payload.ToolCallArguments)
	}
	if payload.AppGenerationByMessageID["user-managed"] != string(agentruns.ChatAppGenerationMessageModePlainChat) {
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
	executorErr                 error
	preflightStatus             *externalagentconfigs.Status
	managedStarter              *aiRouteStubManagedStarter
	appGenerationModesAvailable *bool
}

type aiRouteFixtureCore struct {
	root                  string
	store                 *agentruns.RunStore
	engineStore           *agentruns.EngineStore
	externalConfigStore   *externalagentconfigs.Store
	agentProfileStore     *agentprofiles.Store
	projectRuntime        *projectstate.Runtime
	llm                   *llmconfig.Runtime
	transcriptionStore    *transcriptionprofiles.Store
	transcriptionProfiles *transcriptionprofiles.Service
	transcriptionSessions *transcriptionsessions.Service
	sessions              aiRouteStaticSessionProvider
}

func testAIRouteAppGenerationModes(
	t *testing.T,
	available bool,
) chatmodes.AppGenerationModeResolver {
	t.Helper()

	resolver, err := chatmodes.NewAppGenerationModeRegistry(chatmodes.AppGenerationModeRegistryOptions{
		Available:     func() bool { return available },
		Contributions: appsubsystemchatmodes.BuildChatModeContributions(),
	})
	if err != nil {
		t.Fatalf("new app generation mode resolver: %v", err)
	}
	return resolver
}

func newAIRouteFixture(t *testing.T, options aiRouteFixtureOptions) aiRouteFixture {
	t.Helper()

	core := newAIRouteFixtureCore(t)
	configID := seedAIRouteFixtureConfigStores(t, core)
	follow := newAIRouteFixtureFollowService(t)
	managedRunRuntime := newAIRouteFixtureManagedRunRuntime(t, core)
	managedStarter := aiRouteFixtureManagedStarter(options)
	managedLiveRuntime := managedchat.NewLiveRuntime(managedchat.LiveRuntimeOptions{})
	managedService := newAIRouteFixtureManagedService(t, core, options, managedStarter, managedLiveRuntime, managedRunRuntime)
	runtime := newAIRouteFixtureExternalRuntime(t, core, follow)
	service := newAIRouteFixtureExternalService(t, core, runtime)
	preflightStatus := options.preflightStatus
	if preflightStatus == nil {
		preflightStatus = defaultAIRouteFixturePreflightStatus(configID)
	}
	send := newAIRouteFixtureSendService(t, core, options, runtime, preflightStatus)

	return aiRouteFixture{
		store:                 core.store,
		llm:                   core.llm,
		transcriptionStore:    core.transcriptionStore,
		transcriptionProfiles: core.transcriptionProfiles,
		transcriptionSessions: core.transcriptionSessions,
		sessions:              core.sessions,
		managedLive:           managedLiveRuntime,
		managed:               managedService,
		managedStarter:        managedStarter,
		runtime:               runtime,
		service:               service,
		send:                  send,
		follow:                follow,
	}
}

func newAIRouteFixtureCore(t *testing.T) aiRouteFixtureCore {
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

	return aiRouteFixtureCore{
		root:                  root,
		store:                 store,
		engineStore:           engineStore,
		externalConfigStore:   externalConfigStore,
		agentProfileStore:     agentProfileStore,
		projectRuntime:        projectRuntime,
		llm:                   llmRuntime,
		transcriptionStore:    transcriptionStore,
		transcriptionProfiles: transcriptionProfileService,
		transcriptionSessions: transcriptionSessionService,
		sessions:              newAIRouteFixtureSessionProvider(),
	}
}

func newAIRouteFixtureSessionProvider() aiRouteStaticSessionProvider {
	return aiRouteStaticSessionProvider{
		current: &auth.CurrentSession{
			Metadata: auth.SessionMetadata{ID: "session-route"},
		},
	}
}

func seedAIRouteFixtureConfigStores(t *testing.T, core aiRouteFixtureCore) string {
	t.Helper()

	commandPath := "/usr/local/bin/codex"
	configID := "external-config"
	if err := core.externalConfigStore.Write([]externalagentconfigs.Config{
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
	if err := core.engineStore.Write([]agentruns.EngineConfig{
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
	if err := core.agentProfileStore.Write([]agentprofiles.Profile{
		{
			ID:             "profile-alpha",
			Name:           "Alpha",
			EngineConfigID: &engineID,
		},
	}); err != nil {
		t.Fatalf("write profiles: %v", err)
	}
	return configID
}

func newAIRouteFixtureFollowService(t *testing.T) *externalagents.FollowService {
	t.Helper()

	follow, err := externalagents.NewFollowService(externalagents.FollowServiceOptions{
		Tools: aiRouteStaticFollowToolProvider{},
	})
	if err != nil {
		t.Fatalf("new follow service: %v", err)
	}
	return follow
}

func newAIRouteFixtureManagedRunRuntime(t *testing.T, core aiRouteFixtureCore) *agentruns.Runtime {
	t.Helper()

	managedRunService, err := agentruns.NewService(agentruns.ServiceOptions{
		ProjectState: core.projectRuntime,
		Engines:      core.engineStore,
		Runs:         core.store,
		LLM:          core.llm,
		TimeNow:      aiRouteFixtureNow,
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
	return managedRunRuntime
}

func aiRouteFixtureManagedStarter(options aiRouteFixtureOptions) *aiRouteStubManagedStarter {
	managedStarter := options.managedStarter
	if managedStarter == nil {
		managedStarter = &aiRouteStubManagedStarter{disabled: true}
	}
	return managedStarter
}

func newAIRouteFixtureManagedService(
	t *testing.T,
	core aiRouteFixtureCore,
	options aiRouteFixtureOptions,
	managedStarter *aiRouteStubManagedStarter,
	managedLiveRuntime *managedchat.LiveRuntime,
	managedRunRuntime *agentruns.Runtime,
) *managedchat.Service {
	t.Helper()

	managedService, err := managedchat.NewService(managedchat.ServiceOptions{
		ProjectState:       core.projectRuntime,
		Runs:               core.store,
		Engines:            core.engineStore,
		LLM:                core.llm,
		Profiles:           core.agentProfileStore,
		Starter:            managedStarter,
		Live:               managedLiveRuntime,
		Stopper:            managedRunRuntime,
		AppGenerationModes: testAIRouteAppGenerationModes(t, aiRouteFixtureAppGenerationModesAvailable(options)),
	})
	if err != nil {
		t.Fatalf("new managed chat service: %v", err)
	}
	return managedService
}

func newAIRouteFixtureExternalRuntime(
	t *testing.T,
	core aiRouteFixtureCore,
	follow *externalagents.FollowService,
) *externalagents.Runtime {
	t.Helper()

	runtime, err := externalagents.NewRuntime(externalagents.RuntimeOptions{
		Runs:    core.store,
		Follow:  follow,
		TimeNow: aiRouteFixtureNow,
	})
	if err != nil {
		t.Fatalf("new runtime: %v", err)
	}
	return runtime
}

func newAIRouteFixtureExternalService(
	t *testing.T,
	core aiRouteFixtureCore,
	runtime *externalagents.Runtime,
) *externalagents.Service {
	t.Helper()

	service, err := externalagents.NewService(externalagents.ServiceOptions{
		Runs: core.store,
		Live: runtime,
	})
	if err != nil {
		t.Fatalf("new service: %v", err)
	}
	return service
}

func defaultAIRouteFixturePreflightStatus(configID string) *externalagentconfigs.Status {
	return &externalagentconfigs.Status{
		ConfigID:  configID,
		Name:      "Codex app-server",
		ToolType:  externalagentconfigs.ToolTypeCodex,
		RunMode:   externalagentconfigs.RunModeAppServer,
		Supported: true,
		Available: true,
		Issues:    []string{},
	}
}

func newAIRouteFixtureSendService(
	t *testing.T,
	core aiRouteFixtureCore,
	options aiRouteFixtureOptions,
	runtime *externalagents.Runtime,
	preflightStatus *externalagentconfigs.Status,
) *externalagents.SendService {
	t.Helper()

	send, err := externalagents.NewSendService(externalagents.SendServiceOptions{
		ProjectState: core.projectRuntime,
		Engines:      core.engineStore,
		Runs:         core.store,
		Profiles:     core.agentProfileStore,
		Configs:      core.externalConfigStore,
		Runtime:      runtime,
		Preflight: aiRouteStubPreflightChecker{
			status: *preflightStatus,
		},
		Executor: &aiRouteStubExecutor{
			response: externalagents.StartResponse{Controller: &aiRouteStubController{}},
			err:      options.executorErr,
		},
		AppGenerationModes: testAIRouteAppGenerationModes(t, aiRouteFixtureAppGenerationModesAvailable(options)),
		TimeNow:            aiRouteFixtureNow,
	})
	if err != nil {
		t.Fatalf("new send service: %v", err)
	}
	return send
}

func aiRouteFixtureAppGenerationModesAvailable(options aiRouteFixtureOptions) bool {
	return options.appGenerationModesAvailable == nil || *options.appGenerationModesAvailable
}

func aiRouteFixtureNow() time.Time {
	return time.Date(2026, 3, 9, 9, 0, 0, 0, time.UTC)
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
		"toolCallArguments": map[string]any{
			"tool-call-managed": `{"task":"Managed reply"}`,
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

func boolPtr(value bool) *bool {
	return &value
}
