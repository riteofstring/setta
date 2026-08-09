package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/managedchat"
	"setta/internal/observability"
	"setta/internal/projectstate"
)

func TestAppServesChatSectionMutationRoutes(t *testing.T) {
	harness := newAppChatRouteHarness(t)

	postAppChatMutationRoutes(t, harness)
	assertAppChatMutationPayload(t, harness.app)
	latestPayload := fetchAppChatLatestProjectState(t, harness)
	if len(latestPayload.CompletedOpIDs) != 1 || latestPayload.CompletedOpIDs[0] != "app-chat-op-1" {
		t.Fatalf("expected completed op ids [app-chat-op-1], got %#v", latestPayload.CompletedOpIDs)
	}
}

type appChatRouteHarness struct {
	app        *App
	serverURL  string
	authCookie *http.Cookie
}

func newAppChatRouteHarness(t *testing.T) appChatRouteHarness {
	t.Helper()

	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = appChatSectionTestProject(t)
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	t.Cleanup(server.Close)

	return appChatRouteHarness{
		app:        app,
		serverURL:  server.URL,
		authCookie: newAppTestAuthCookie(t, app),
	}
}

func postAppChatMutationRoutes(t *testing.T, harness appChatRouteHarness) {
	t.Helper()

	for _, requestSpec := range []struct {
		route string
		body  string
	}{
		{
			route: httpapi.RouteSetChatSectionSettings,
			body:  `{"projectConfigId":"project-alpha","sectionId":"chat-section","managed":true,"engineConfigId":"engine-config-1","transcriptionProfileId":"transcription-profile-1","agentProfileId":"agent-profile-1","thinking":true,"permissionMode":"yolo","searchEnabled":true,"dictationMode":"provider"}`,
		},
		{
			route: httpapi.RouteSetChatSectionState,
			body:  `{"projectConfigId":"project-alpha","sectionId":"chat-section","frontendOpId":"app-chat-op-1","state":{"messages":[{"id":"message-1","type":"user","content":"hello"}],"inputText":"Draft input","waitingForResponse":true,"toolCallArguments":{"tool-call-1":"{\"query\":\"hello\"}"},"activeBranchId":"branch-1","branches":{"branch-1":{"messages":[{"id":"message-1","type":"user"}],"createdAt":7,"parentBranchId":"root-branch","branchFromMessageId":"message-1"}}}}`,
		},
		{
			route: httpapi.RouteSetChatSectionChatID,
			body:  `{"projectConfigId":"project-alpha","sectionId":"chat-section","chatId":"chat-1"}`,
		},
	} {
		request, err := http.NewRequest(http.MethodPost, harness.serverURL+"/api"+requestSpec.route, strings.NewReader(requestSpec.body))
		if err != nil {
			t.Fatalf("new request for %s: %v", requestSpec.route, err)
		}
		request.Header.Set("Content-Type", "application/json")
		request.AddCookie(harness.authCookie)

		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatalf("post %s: %v", requestSpec.route, err)
		}
		response.Body.Close()
		if response.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 for %s, got %d", requestSpec.route, response.StatusCode)
		}
	}
}

func assertAppChatMutationPayload(t *testing.T, app *App) {
	t.Helper()

	project := app.ProjectStates().Main().Snapshot().Document.Projects["project-alpha"]
	payload, err := project.EffectiveSectionPayload("chat-section", "chat-variant")
	if err != nil {
		t.Fatalf("effectiveSectionPayload chat-section: %v", err)
	}
	if got := payload["permissionMode"]; got != "yolo" {
		t.Fatalf("expected permissionMode yolo, got %#v", got)
	}
	if got := payload["dictationMode"]; got != "provider" {
		t.Fatalf("expected dictationMode provider, got %#v", got)
	}
	if got := payload["chatId"]; got != "chat-1" {
		t.Fatalf("expected chatId chat-1, got %#v", got)
	}
	if got := payload["inputText"]; got != "Draft input" {
		t.Fatalf("expected inputText Draft input, got %#v", got)
	}
	if got := payload["waitingForResponse"]; got != true {
		t.Fatalf("expected waitingForResponse=true, got %#v", got)
	}
}

func fetchAppChatLatestProjectState(t *testing.T, harness appChatRouteHarness) httpapi.ProjectStateSingleConfigWithCompletedOpIDs {
	t.Helper()

	latestRequest, err := http.NewRequest(http.MethodPost, harness.serverURL+"/api"+httpapi.RouteGetLatestProjectState, strings.NewReader(`{"projectConfigId":"project-alpha"}`))
	if err != nil {
		t.Fatalf("new latest state request: %v", err)
	}
	latestRequest.Header.Set("Content-Type", "application/json")
	latestRequest.AddCookie(harness.authCookie)

	latestResponse, err := http.DefaultClient.Do(latestRequest)
	if err != nil {
		t.Fatalf("get latest project state: %v", err)
	}
	defer latestResponse.Body.Close()
	if latestResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(latestResponse.Body)
		t.Fatalf("expected latest state 200, got %d with body %q", latestResponse.StatusCode, string(body))
	}

	var latestPayload httpapi.ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.NewDecoder(latestResponse.Body).Decode(&latestPayload); err != nil {
		t.Fatalf("decode latest state payload: %v", err)
	}
	return latestPayload
}

func TestAppServesGetChatSectionChatIDRoute(t *testing.T) {
	cfg := testConfig(t)
	cfg.Server.Mode = config.ModeIDE
	prepareAppCurrentSession(t, cfg)

	app, err := New(cfg, observability.NewLogger(cfg.Server.LogLevel, io.Discard))
	if err != nil {
		t.Fatalf("new app: %v", err)
	}
	t.Cleanup(func() {
		if err := app.Shutdown(context.Background()); err != nil {
			t.Fatalf("shutdown app: %v", err)
		}
	})

	if _, err := app.ProjectStates().Main().Mutate(func(document projectstate.Document) (projectstate.Document, error) {
		document.DefaultProjectID = "project-alpha"
		document.Projects["project-alpha"] = appChatSectionTestProject(t)
		return document, nil
	}); err != nil {
		t.Fatalf("seed project runtime: %v", err)
	}

	runStore, err := agentruns.NewRunStore(cfg.Paths.SettaFilesRoot)
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	liveRun := agentruns.NewRun(nil, map[string]any{
		"runType":         managedchat.RunTypeManagedChat,
		"chatId":          "chat-live",
		"projectConfigId": "project-alpha",
	}, time.Unix(100, 0).UTC())
	if err := runStore.Save(liveRun); err != nil {
		t.Fatalf("save live run: %v", err)
	}
	liveChatID := "chat-live"
	if _, err := app.ProjectStates().Main().SetChatSectionChatID(context.Background(), "project-alpha", "chat-section", &liveChatID); err != nil {
		t.Fatalf("seed live chat id: %v", err)
	}

	server := httptest.NewServer(app.Handler())
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)

	request := func() *http.Response {
		t.Helper()

		httpRequest, err := http.NewRequest(
			http.MethodPost,
			server.URL+"/api"+httpapi.RouteGetChatSectionChatID,
			strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"chat-section"}`),
		)
		if err != nil {
			t.Fatalf("new request: %v", err)
		}
		httpRequest.Header.Set("Content-Type", "application/json")
		httpRequest.AddCookie(authCookie)

		response, err := http.DefaultClient.Do(httpRequest)
		if err != nil {
			t.Fatalf("post getChatSectionChatId: %v", err)
		}
		return response
	}

	liveResponse := request()
	defer liveResponse.Body.Close()
	if liveResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(liveResponse.Body)
		t.Fatalf("expected live response 200, got %d with body %q", liveResponse.StatusCode, string(body))
	}
	var livePayload *string
	if err := json.NewDecoder(liveResponse.Body).Decode(&livePayload); err != nil {
		t.Fatalf("decode live response: %v", err)
	}
	if livePayload == nil || *livePayload != liveChatID {
		t.Fatalf("expected live chat id %q, got %#v", liveChatID, livePayload)
	}

	if err := runStore.Delete(liveRun.ID); err != nil {
		t.Fatalf("delete live run: %v", err)
	}

	staleResponse := request()
	defer staleResponse.Body.Close()
	if staleResponse.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(staleResponse.Body)
		t.Fatalf("expected stale response 200, got %d with body %q", staleResponse.StatusCode, string(body))
	}
	var stalePayload *string
	if err := json.NewDecoder(staleResponse.Body).Decode(&stalePayload); err != nil {
		t.Fatalf("decode stale response: %v", err)
	}
	if stalePayload != nil {
		t.Fatalf("expected stale payload nil, got %#v", stalePayload)
	}

	storedChatID, err := app.ProjectStates().Main().ChatSectionChatID("project-alpha", "chat-section")
	if err != nil {
		t.Fatalf("read stored chat id: %v", err)
	}
	if storedChatID != nil {
		t.Fatalf("expected stored chat id cleared, got %#v", storedChatID)
	}
}

func appChatSectionTestProject(t *testing.T) projectstate.Project {
	t.Helper()

	project, err := projectstate.Project{
		ID:   "project-alpha",
		Name: "Alpha",
		SectionVariantMap: map[string]string{
			"chat-section":  "chat-variant",
			"plain-section": "plain-variant",
		},
		Sections: map[string]projectstate.Section{
			"chat-section": {
				ID:               "chat-section",
				Name:             "Chat Section",
				VariantIDs:       []string{"chat-variant"},
				DefaultVariantID: "chat-variant",
			},
			"plain-section": {
				ID:               "plain-section",
				Name:             "Plain Section",
				VariantIDs:       []string{"plain-variant"},
				DefaultVariantID: "plain-variant",
			},
		},
		SectionVariants: map[string]projectstate.SectionVariant{
			"chat-variant": {
				ID:     "chat-variant",
				ImplID: "chat-impl",
			},
			"plain-variant": {
				ID:     "plain-variant",
				ImplID: "plain-impl",
			},
		},
		SectionImpls: map[string]projectstate.SectionImpl{
			"chat-impl": {
				ID:   "chat-impl",
				Kind: projectstate.SectionKind("frontend"),
				Payload: mustRawJSONValue(t, map[string]any{
					"id":   "chat-impl",
					"type": "Chat",
				}),
			},
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustRawJSONValue(t, map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize app chat test project: %v", err)
	}
	return project
}
