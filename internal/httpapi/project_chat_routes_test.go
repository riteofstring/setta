package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
	"time"

	"setta/internal/agentruns"
	"setta/internal/chatsections"
	"setta/internal/config"
	"setta/internal/externalagents"
	"setta/internal/managedchat"
	"setta/internal/modes"
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

func TestRegisterProjectRoutesChatSectionMutationsUseDeploymentOverlayWhenPolicyAllows(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			t.Run("settings_and_state_use_layout_policy", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": chatSectionRouteTestProject(t),
						},
					},
					Policy: map[string]any{
						"allowLayoutChanges": true,
						"allowLLM":           false,
					},
				})
				if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
					t.Fatalf("create deployment session: %v", err)
				}

				handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
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
				} {
					request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
					request.Header.Set("Content-Type", "application/json")
					request.Header.Set(modes.ShareSessionHeaderName, "share-a")
					response := httptest.NewRecorder()
					handler.ServeHTTP(response, request)
					if response.Code != http.StatusOK {
						t.Fatalf("expected 200 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
					}
				}

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay: %v", err)
				}
				overlayChat := decodeProjectRouteRawObject(t, overlay.Snapshot().Document.Projects["project-alpha"].Sections["chat-section"].SharedModifier)
				if got := overlayChat["managed"]; got != true {
					t.Fatalf("expected overlay managed=true, got %#v", got)
				}
				if got := overlayChat["permissionMode"]; got != "minimal" {
					t.Fatalf("expected overlay permissionMode minimal, got %#v", got)
				}
				if got := overlayChat["dictationMode"]; got != "browser" {
					t.Fatalf("expected overlay dictationMode browser, got %#v", got)
				}
				if got := overlayChat["inputText"]; got != "Draft input" {
					t.Fatalf("expected overlay inputText Draft input, got %#v", got)
				}

				baseChat := decodeProjectRouteRawObject(t, deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"].Sections["chat-section"].SharedModifier)
				if len(baseChat) != 0 {
					t.Fatalf("expected base chat shared modifier unchanged, got %#v", baseChat)
				}
			})

			t.Run("chat_id_uses_llm_policy", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": chatSectionRouteTestProject(t),
						},
					},
					Policy: map[string]any{
						"allowLayoutChanges": false,
						"allowLLM":           true,
					},
				})
				if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
					t.Fatalf("create deployment session: %v", err)
				}

				handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
				request := httptest.NewRequest(
					http.MethodPost,
					"/api"+RouteSetChatSectionChatID,
					strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"chat-section","chatId":"chat-1"}`),
				)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set(modes.ShareSessionHeaderName, "share-a")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				if response.Code != http.StatusOK {
					t.Fatalf("expected 200 for %s, got %d with body %q", RouteSetChatSectionChatID, response.Code, response.Body.String())
				}

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay: %v", err)
				}
				overlayChat := decodeProjectRouteRawObject(t, overlay.Snapshot().Document.Projects["project-alpha"].Sections["chat-section"].SharedModifier)
				if got := overlayChat["chatId"]; got != "chat-1" {
					t.Fatalf("expected overlay chatId chat-1, got %#v", got)
				}

				baseChat := decodeProjectRouteRawObject(t, deploymentRuntime.Base().Snapshot().Document.Projects["project-alpha"].Sections["chat-section"].SharedModifier)
				if len(baseChat) != 0 {
					t.Fatalf("expected base chat shared modifier unchanged, got %#v", baseChat)
				}
			})
		})
	}
}

func TestRegisterProjectRoutesChatSectionMutationsRejectDeploymentPolicyWhenDisallowed(t *testing.T) {
	t.Parallel()

	for _, mode := range []config.Mode{config.ModeShare, config.ModeApp} {
		t.Run(string(mode), func(t *testing.T) {
			t.Run("settings_and_state_reject_layout_policy", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": chatSectionRouteTestProject(t),
						},
					},
					Policy: map[string]any{
						"allowLayoutChanges": false,
						"allowLLM":           true,
					},
				})
				if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
					t.Fatalf("create deployment session: %v", err)
				}

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay before rejected chat mutations: %v", err)
				}
				before := overlay.Snapshot().Document.Projects["project-alpha"].Sections["chat-section"]

				handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
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
				} {
					request := httptest.NewRequest(http.MethodPost, "/api"+requestSpec.route, strings.NewReader(requestSpec.body))
					request.Header.Set("Content-Type", "application/json")
					request.Header.Set(modes.ShareSessionHeaderName, "share-a")
					response := httptest.NewRecorder()
					handler.ServeHTTP(response, request)
					if response.Code != http.StatusForbidden {
						t.Fatalf("expected 403 for %s, got %d with body %q", requestSpec.route, response.Code, response.Body.String())
					}
					if !strings.Contains(response.Body.String(), `"code":"layout_changes_forbidden"`) {
						t.Fatalf("expected layout_changes_forbidden body, got %q", response.Body.String())
					}
					if !strings.Contains(response.Body.String(), "Deployment policy disallows layout changes.") {
						t.Fatalf("expected deployment layout policy denial, got %q", response.Body.String())
					}
				}

				after := overlay.Snapshot().Document.Projects["project-alpha"].Sections["chat-section"]
				if !reflect.DeepEqual(after, before) {
					t.Fatalf("expected rejected chat settings/state mutations to leave overlay unchanged, got %#v", after)
				}
			})

			t.Run("chat_id_rejects_llm_policy", func(t *testing.T) {
				deploymentRuntime := newHTTPTestDeploymentRuntimeWithOptions(t, httpTestDeploymentRuntimeOptions{
					Mode: mode,
					Document: projectstate.Document{
						SchemaVersion:    projectstate.CurrentSchemaVersion,
						DefaultProjectID: "project-alpha",
						Projects: map[string]projectstate.Project{
							"project-alpha": chatSectionRouteTestProject(t),
						},
					},
					Policy: map[string]any{
						"allowLayoutChanges": true,
						"allowLLM":           false,
					},
				})
				if _, err := deploymentRuntime.CreateSessionWithID("share-a"); err != nil {
					t.Fatalf("create deployment session: %v", err)
				}

				overlay, err := deploymentRuntime.Overlay("share-a")
				if err != nil {
					t.Fatalf("deployment overlay before rejected chat id mutation: %v", err)
				}
				before := overlay.Snapshot().Document.Projects["project-alpha"].Sections["chat-section"]

				handler := newProjectRouteDeploymentTestHandler(t, mode, deploymentRuntime)
				request := httptest.NewRequest(
					http.MethodPost,
					"/api"+RouteSetChatSectionChatID,
					strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"chat-section","chatId":"chat-1"}`),
				)
				request.Header.Set("Content-Type", "application/json")
				request.Header.Set(modes.ShareSessionHeaderName, "share-a")
				response := httptest.NewRecorder()
				handler.ServeHTTP(response, request)
				if response.Code != http.StatusForbidden {
					t.Fatalf("expected 403 for %s, got %d with body %q", RouteSetChatSectionChatID, response.Code, response.Body.String())
				}
				if !strings.Contains(response.Body.String(), `"code":"llm_access_forbidden"`) {
					t.Fatalf("expected llm_access_forbidden body, got %q", response.Body.String())
				}
				if !strings.Contains(response.Body.String(), "Deployment policy disallows LLM access.") {
					t.Fatalf("expected deployment LLM policy denial, got %q", response.Body.String())
				}

				after := overlay.Snapshot().Document.Projects["project-alpha"].Sections["chat-section"]
				if !reflect.DeepEqual(after, before) {
					t.Fatalf("expected rejected chat id mutation to leave overlay unchanged, got %#v", after)
				}
			})
		})
	}
}

func TestRegisterProjectRoutesGetChatSectionChatIDReturnsExistingAndClearsMissing(t *testing.T) {
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

	runStore, err := agentruns.NewRunStore(t.TempDir())
	if err != nil {
		t.Fatalf("new run store: %v", err)
	}
	chatSectionService, err := chatsections.NewService(chatsections.ServiceOptions{
		ProjectState: projectRuntime,
		Runs:         runStore,
	})
	if err != nil {
		t.Fatalf("new chat section service: %v", err)
	}

	handler := newProjectRouteTestHandlerWithRenameService(
		t,
		config.ModeIDE,
		projectRuntime,
		t.TempDir(),
		nil,
		nil,
		nil,
		chatSectionService,
		nil,
	)

	existingChatID := "chat-live"
	if _, err := projectRuntime.SetChatSectionChatID(projectstate.ContextWithFrontendOpID(context.Background(), "chat-seed-op"), "project-alpha", "chat-section", &existingChatID); err != nil {
		t.Fatalf("seed existing chat id: %v", err)
	}
	if err := runStore.Save(agentruns.NewRun(nil, map[string]any{
		"runType":         managedchat.RunTypeManagedChat,
		"chatId":          existingChatID,
		"projectConfigId": "project-alpha",
	}, time.Unix(100, 0).UTC())); err != nil {
		t.Fatalf("save managed run: %v", err)
	}

	existingRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetChatSectionChatID,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"chat-section"}`),
	)
	existingRequest.Header.Set("Content-Type", "application/json")
	existingResponse := httptest.NewRecorder()
	handler.ServeHTTP(existingResponse, existingRequest)
	if existingResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for existing chat id, got %d with body %q", existingResponse.Code, existingResponse.Body.String())
	}
	var resolvedExisting *string
	if err := json.Unmarshal(existingResponse.Body.Bytes(), &resolvedExisting); err != nil {
		t.Fatalf("decode existing chat id response: %v", err)
	}
	if resolvedExisting == nil || *resolvedExisting != existingChatID {
		t.Fatalf("expected existing chat id %q, got %#v", existingChatID, resolvedExisting)
	}

	missingChatID := "chat-missing"
	if _, err := projectRuntime.SetChatSectionChatID(context.Background(), "project-alpha", "chat-section", &missingChatID); err != nil {
		t.Fatalf("seed missing chat id: %v", err)
	}
	if err := runStore.Save(agentruns.NewRun(nil, map[string]any{
		"runType":         externalagents.RunTypeExternalAgent,
		"chatId":          "chat-other",
		"projectConfigId": "project-alpha",
	}, time.Unix(101, 0).UTC())); err != nil {
		t.Fatalf("save external run: %v", err)
	}

	missingRequest := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetChatSectionChatID,
		strings.NewReader(`{"projectConfigId":"project-alpha","sectionId":"chat-section"}`),
	)
	missingRequest.Header.Set("Content-Type", "application/json")
	missingResponse := httptest.NewRecorder()
	handler.ServeHTTP(missingResponse, missingRequest)
	if missingResponse.Code != http.StatusOK {
		t.Fatalf("expected 200 for missing chat id, got %d with body %q", missingResponse.Code, missingResponse.Body.String())
	}
	var resolvedMissing *string
	if err := json.Unmarshal(missingResponse.Body.Bytes(), &resolvedMissing); err != nil {
		t.Fatalf("decode missing chat id response: %v", err)
	}
	if resolvedMissing != nil {
		t.Fatalf("expected nil for missing chat id, got %#v", resolvedMissing)
	}

	storedChatID, err := projectRuntime.ChatSectionChatID("project-alpha", "chat-section")
	if err != nil {
		t.Fatalf("read stored chat id: %v", err)
	}
	if storedChatID != nil {
		t.Fatalf("expected stored chat id cleared after missing lookup, got %#v", storedChatID)
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
