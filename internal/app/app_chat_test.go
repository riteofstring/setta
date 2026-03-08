package app

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/httpapi"
	"setta/internal/observability"
	"setta/internal/projectstate"
)

func TestAppServesChatSectionMutationRoutes(t *testing.T) {
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
	defer server.Close()

	authCookie := newAppTestAuthCookie(t, app)

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
		request, err := http.NewRequest(http.MethodPost, server.URL+"/api"+requestSpec.route, strings.NewReader(requestSpec.body))
		if err != nil {
			t.Fatalf("new request for %s: %v", requestSpec.route, err)
		}
		request.Header.Set("Content-Type", "application/json")
		request.AddCookie(authCookie)

		response, err := http.DefaultClient.Do(request)
		if err != nil {
			t.Fatalf("post %s: %v", requestSpec.route, err)
		}
		response.Body.Close()
		if response.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 for %s, got %d", requestSpec.route, response.StatusCode)
		}
	}

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

	latestRequest, err := http.NewRequest(http.MethodPost, server.URL+"/api"+httpapi.RouteGetLatestProjectState, strings.NewReader(`{"projectConfigId":"project-alpha"}`))
	if err != nil {
		t.Fatalf("new latest state request: %v", err)
	}
	latestRequest.Header.Set("Content-Type", "application/json")
	latestRequest.AddCookie(authCookie)

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
	if len(latestPayload.CompletedOpIDs) != 1 || latestPayload.CompletedOpIDs[0] != "app-chat-op-1" {
		t.Fatalf("expected completed op ids [app-chat-op-1], got %#v", latestPayload.CompletedOpIDs)
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
