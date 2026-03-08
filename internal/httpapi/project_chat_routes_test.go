package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"

	"setta/internal/config"
	"setta/internal/projectstate"
)

func TestRegisterProjectRoutesChatSectionMutationsPersistAndTrackFrontendOpIDs(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": chatSectionRouteTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)

	for _, requestSpec := range []struct {
		route string
		body  string
	}{
		{
			route: RouteSetChatSectionSettings,
			body:  `{"projectConfigId":"project-alpha","sectionId":"chat-section","managed":true,"engineConfigId":"engine-config-1","transcriptionProfileId":"transcription-profile-1","agentProfileId":"agent-profile-1","thinking":true,"permissionMode":"minimal","searchEnabled":true,"dictationMode":"browser"}`,
		},
		{
			route: RouteSetChatSectionState,
			body:  `{"projectConfigId":"project-alpha","sectionId":"chat-section","frontendOpId":"chat-op-1","state":{"messages":[{"id":"message-1","type":"user","content":"hello"}],"inputText":"Draft input","waitingForResponse":true,"toolCallArguments":{"tool-call-1":"{\"query\":\"hello\"}"},"activeBranchId":"branch-1","branches":{"branch-1":{"messages":[{"id":"message-1","type":"user"}],"createdAt":42,"parentBranchId":"root-branch","branchFromMessageId":"message-1"}}}}`,
		},
		{
			route: RouteSetChatSectionChatID,
			body:  `{"projectConfigId":"project-alpha","sectionId":"chat-section","chatId":"chat-1"}`,
		},
	} {
		request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
		request.Header.Set("Content-Type", "application/json")
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		if response.Code != http.StatusOK {
			t.Fatalf("expected 200 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
		}
	}

	latestRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLatestProjectState,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	latestRequest.Header.Set("Content-Type", "application/json")
	latestResponse := httptest.NewRecorder()
	handler.ServeHTTP(latestResponse, latestRequest)
	if latestResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 latest-state response, got %d with body %q", latestResponse.Code, latestResponse.Body.String())
	}

	var payload ProjectStateSingleConfigWithCompletedOpIDs
	if err := json.Unmarshal(latestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode latest project payload: %v", err)
	}
	if !reflect.DeepEqual(payload.CompletedOpIDs, []string{"chat-op-1"}) {
		t.Fatalf("expected completed frontend op ids [chat-op-1], got %#v", payload.CompletedOpIDs)
	}

	chatSection := payload.ProjectState.Sections["chat-section"]
	chatSharedModifier := decodeProjectRouteRawObject(t, chatSection.SharedModifier)
	if got := chatSharedModifier["managed"]; got != true {
		t.Fatalf("expected managed=true, got %#v", got)
	}
	if got := chatSharedModifier["engineConfigId"]; got != "engine-config-1" {
		t.Fatalf("expected engineConfigId engine-config-1, got %#v", got)
	}
	if got := chatSharedModifier["permissionMode"]; got != "minimal" {
		t.Fatalf("expected permissionMode minimal, got %#v", got)
	}
	if got := chatSharedModifier["dictationMode"]; got != "browser" {
		t.Fatalf("expected dictationMode browser, got %#v", got)
	}
	if got := chatSharedModifier["inputText"]; got != "Draft input" {
		t.Fatalf("expected inputText Draft input, got %#v", got)
	}
	if got := chatSharedModifier["chatId"]; got != "chat-1" {
		t.Fatalf("expected chatId chat-1, got %#v", got)
	}

	toolCallArguments, ok := chatSharedModifier["toolCallArguments"].(map[string]any)
	if !ok || toolCallArguments["tool-call-1"] != "{\"query\":\"hello\"}" {
		t.Fatalf("expected toolCallArguments to persist, got %#v", chatSharedModifier["toolCallArguments"])
	}
	branches, ok := chatSharedModifier["branches"].(map[string]any)
	if !ok {
		t.Fatalf("expected branches object, got %#v", chatSharedModifier["branches"])
	}
	branchValue, ok := branches["branch-1"].(map[string]any)
	if !ok || branchValue["createdAt"] != float64(42) {
		t.Fatalf("expected branch-1 createdAt 42, got %#v", branches["branch-1"])
	}

	secondLatestRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetLatestProjectState,
		strings.NewReader(`{"projectConfigId":"project-alpha"}`),
	)
	secondLatestRequest.Header.Set("Content-Type", "application/json")
	secondLatestResponse := httptest.NewRecorder()
	handler.ServeHTTP(secondLatestResponse, secondLatestRequest)
	if secondLatestResponse.Code != http.StatusOK {
		t.Fatalf("expected second latest-state response 200, got %d with body %q", secondLatestResponse.Code, secondLatestResponse.Body.String())
	}
	if err := json.Unmarshal(secondLatestResponse.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode second latest project payload: %v", err)
	}
	if len(payload.CompletedOpIDs) != 0 {
		t.Fatalf("expected completed frontend op ids to clear, got %#v", payload.CompletedOpIDs)
	}
}

func TestRegisterProjectRoutesChatSectionMutationsRejectInvalidSectionAndSettings(t *testing.T) {
	t.Parallel()

	projectRuntime, err := projectstate.OpenOverlayRuntime(projectstate.Document{
		SchemaVersion:    projectstate.CurrentSchemaVersion,
		DefaultProjectID: "project-alpha",
		Projects: map[string]projectstate.Project{
			"project-alpha": chatSectionRouteTestProject(t),
		},
	})
	if err != nil {
		t.Fatalf("open overlay runtime: %v", err)
	}
	t.Cleanup(func() {
		if err := projectRuntime.Close(); err != nil {
			t.Fatalf("close overlay runtime: %v", err)
		}
	})

	handler := newProjectRouteTestHandler(t, config.ModeIDE, projectRuntime, t.TempDir(), nil, nil, nil)

	invalidSectionRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetChatSectionState,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"plain-section","state":{"messages":[],"inputText":"","waitingForResponse":false,"toolCallArguments":{},"activeBranchId":null,"branches":{}}}`),
	)
	invalidSectionRequest.Header.Set("Content-Type", "application/json")
	invalidSectionResponse := httptest.NewRecorder()
	handler.ServeHTTP(invalidSectionResponse, invalidSectionRequest)
	if invalidSectionResponse.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422 for non-chat section, got %d with body %q", invalidSectionResponse.Code, invalidSectionResponse.Body.String())
	}

	var invalidSectionPayload errorResponse
	if err := json.Unmarshal(invalidSectionResponse.Body.Bytes(), &invalidSectionPayload); err != nil {
		t.Fatalf("decode invalid section response: %v", err)
	}
	if invalidSectionPayload.Error.Code != "chat_section_required" {
		t.Fatalf("expected chat_section_required code, got %#v", invalidSectionPayload)
	}

	invalidSettingsRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteSetChatSectionSettings,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"chat-section","managed":false,"engineConfigId":null,"transcriptionProfileId":null,"agentProfileId":null,"thinking":false,"permissionMode":"invalid","searchEnabled":false,"dictationMode":"auto"}`),
	)
	invalidSettingsRequest.Header.Set("Content-Type", "application/json")
	invalidSettingsResponse := httptest.NewRecorder()
	handler.ServeHTTP(invalidSettingsResponse, invalidSettingsRequest)
	if invalidSettingsResponse.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 for invalid permission mode, got %d with body %q", invalidSettingsResponse.Code, invalidSettingsResponse.Body.String())
	}

	var invalidSettingsPayload errorResponse
	if err := json.Unmarshal(invalidSettingsResponse.Body.Bytes(), &invalidSettingsPayload); err != nil {
		t.Fatalf("decode invalid settings response: %v", err)
	}
	if invalidSettingsPayload.Error.Code != "chat_permission_mode_invalid" {
		t.Fatalf("expected chat_permission_mode_invalid code, got %#v", invalidSettingsPayload)
	}
}

func chatSectionRouteTestProject(t *testing.T) projectstate.Project {
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
				ID:      "chat-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "chat-impl", "type": "Chat"}),
			},
			"plain-impl": {
				ID:      "plain-impl",
				Kind:    projectstate.SectionKind("frontend"),
				Payload: mustProjectRouteRawJSON(t, map[string]any{"id": "plain-impl", "type": "TextBlock"}),
			},
		},
	}.Normalized()
	if err != nil {
		t.Fatalf("normalize chat section route project: %v", err)
	}
	return project
}
