package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"
	"setta/internal/agentprofiles"
	"setta/internal/config"
	"setta/internal/modes"
)

func TestRegisterAgentProfileRoutesListsProfiles(t *testing.T) {
	t.Parallel()

	store := newAgentProfileRouteTestStore(t)
	if err := store.Write([]agentprofiles.Profile{
		newAgentProfileRouteTestProfile("profile-1", "Planner"),
		newAgentProfileRouteTestProfile("profile-2", "Reviewer"),
	}); err != nil {
		t.Fatalf("write profiles: %v", err)
	}

	handler := newAgentProfileRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetAgentProfiles, nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var profiles []agentprofiles.Profile
	if err := json.Unmarshal(response.Body.Bytes(), &profiles); err != nil {
		t.Fatalf("decode profiles: %v", err)
	}
	if len(profiles) != 2 {
		t.Fatalf("expected two profiles, got %#v", profiles)
	}
	if profiles[0].ID != "profile-1" || profiles[1].ID != "profile-2" {
		t.Fatalf("expected persisted profile order, got %#v", profiles)
	}
	if profiles[0].ToolAllowlist == nil {
		t.Fatalf("expected normalized tool allowlist, got %#v", profiles[0])
	}
}

func TestRegisterAgentProfileRoutesReturnsEmptyList(t *testing.T) {
	t.Parallel()

	store := newAgentProfileRouteTestStore(t)
	handler := newAgentProfileRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetAgentProfiles, nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var profiles []agentprofiles.Profile
	if err := json.Unmarshal(response.Body.Bytes(), &profiles); err != nil {
		t.Fatalf("decode profiles: %v", err)
	}
	if len(profiles) != 0 {
		t.Fatalf("expected empty profile list, got %#v", profiles)
	}
}

func TestRegisterAgentProfileRoutesGetsProfile(t *testing.T) {
	t.Parallel()

	store := newAgentProfileRouteTestStore(t)
	if err := store.Write([]agentprofiles.Profile{
		newAgentProfileRouteTestProfile("profile-1", "Planner"),
	}); err != nil {
		t.Fatalf("write profiles: %v", err)
	}

	handler := newAgentProfileRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetAgentProfile,
		strings.NewReader(`{"profileId":"profile-1"}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var profile agentprofiles.Profile
	if err := json.Unmarshal(response.Body.Bytes(), &profile); err != nil {
		t.Fatalf("decode profile: %v", err)
	}
	if profile.ID != "profile-1" || profile.Name != "Planner" {
		t.Fatalf("unexpected profile %#v", profile)
	}
}

func TestRegisterAgentProfileRoutesCreatesProfile(t *testing.T) {
	t.Parallel()

	store := newAgentProfileRouteTestStore(t)
	handler := newAgentProfileRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteCreateAgentProfile,
		strings.NewReader(`{"name":"Planner","description":"Planning profile","systemPrompt":"Plan tasks","enableBackgroundSummaryFill":true,"enableLlmChatTitles":true,"engineConfigId":"engine-1","toolAllowlist":["tool.a"],"memoryScope":"workspace"}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var created agentprofiles.Profile
	if err := json.Unmarshal(response.Body.Bytes(), &created); err != nil {
		t.Fatalf("decode created profile: %v", err)
	}
	if created.ID == "" {
		t.Fatalf("expected created profile id, got %#v", created)
	}
	if created.Name != "Planner" || created.SystemPrompt != "Plan tasks" {
		t.Fatalf("unexpected created profile %#v", created)
	}
	if created.ToolAllowlist == nil || len(created.ToolAllowlist) != 1 || created.ToolAllowlist[0] != "tool.a" {
		t.Fatalf("expected created tool allowlist to roundtrip, got %#v", created)
	}

	persisted, err := store.Get(created.ID)
	if err != nil {
		t.Fatalf("load persisted profile: %v", err)
	}
	if persisted.Name != "Planner" || persisted.Description != "Planning profile" {
		t.Fatalf("unexpected persisted profile %#v", persisted)
	}
}

func TestRegisterAgentProfileRoutesUpdatesProfile(t *testing.T) {
	t.Parallel()

	store := newAgentProfileRouteTestStore(t)
	if err := store.Write([]agentprofiles.Profile{
		newAgentProfileRouteTestProfile("profile-1", "Planner"),
	}); err != nil {
		t.Fatalf("write profiles: %v", err)
	}

	handler := newAgentProfileRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteUpdateAgentProfile,
		strings.NewReader(`{"profile":{"id":"profile-1","name":"Planner v2","description":"Updated profile","systemPrompt":"Plan better","enableBackgroundSummaryFill":true,"enableLlmChatTitles":true,"engineConfigId":"engine-2","toolAllowlist":["tool.b"],"memoryScope":"project"}}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	var updated agentprofiles.Profile
	if err := json.Unmarshal(response.Body.Bytes(), &updated); err != nil {
		t.Fatalf("decode updated profile: %v", err)
	}
	if updated.ID != "profile-1" || updated.Name != "Planner v2" {
		t.Fatalf("unexpected updated profile %#v", updated)
	}
	if updated.MemoryScope == nil || *updated.MemoryScope != "project" {
		t.Fatalf("expected updated memory scope, got %#v", updated)
	}

	persisted, err := store.Get("profile-1")
	if err != nil {
		t.Fatalf("load updated profile: %v", err)
	}
	if persisted.Name != "Planner v2" || persisted.SystemPrompt != "Plan better" {
		t.Fatalf("unexpected persisted updated profile %#v", persisted)
	}
}

func TestRegisterAgentProfileRoutesDeletesProfile(t *testing.T) {
	t.Parallel()

	store := newAgentProfileRouteTestStore(t)
	if err := store.Write([]agentprofiles.Profile{
		newAgentProfileRouteTestProfile("profile-1", "Planner"),
	}); err != nil {
		t.Fatalf("write profiles: %v", err)
	}

	handler := newAgentProfileRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteDeleteAgentProfile,
		strings.NewReader(`{"profileId":"profile-1"}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d with body %q", response.Code, response.Body.String())
	}
	profiles, err := store.List()
	if err != nil {
		t.Fatalf("list profiles after delete: %v", err)
	}
	if len(profiles) != 0 {
		t.Fatalf("expected no profiles after delete, got %#v", profiles)
	}
}

func TestRegisterAgentProfileRoutesReturnsNotFoundForMissingProfile(t *testing.T) {
	t.Parallel()

	store := newAgentProfileRouteTestStore(t)
	handler := newAgentProfileRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteUpdateAgentProfile,
		strings.NewReader(`{"profile":{"id":"missing-profile","name":"Missing"}}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "agent_profile_not_found" {
		t.Fatalf("expected agent_profile_not_found, got %#v", payload)
	}
}

func TestRegisterAgentProfileRoutesReturnsNotFoundForGettingMissingProfile(t *testing.T) {
	t.Parallel()

	store := newAgentProfileRouteTestStore(t)
	handler := newAgentProfileRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteGetAgentProfile,
		strings.NewReader(`{"profileId":"missing-profile"}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "agent_profile_not_found" {
		t.Fatalf("expected agent_profile_not_found, got %#v", payload)
	}
}

func TestRegisterAgentProfileRoutesReturnsNotFoundForDeletingMissingProfile(t *testing.T) {
	t.Parallel()

	store := newAgentProfileRouteTestStore(t)
	handler := newAgentProfileRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api"+RouteDeleteAgentProfile,
		strings.NewReader(`{"profileId":"missing-profile"}`),
	)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusNotFound {
		t.Fatalf("expected 404, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "agent_profile_not_found" {
		t.Fatalf("expected agent_profile_not_found, got %#v", payload)
	}
}

func TestRegisterAgentProfileRoutesRejectsInvalidJSON(t *testing.T) {
	t.Parallel()

	store := newAgentProfileRouteTestStore(t)
	handler := newAgentProfileRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteCreateAgentProfile, strings.NewReader(`{"name"`))
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

func TestRegisterAgentProfileRoutesRejectsMissingProfileIDOnGet(t *testing.T) {
	t.Parallel()

	store := newAgentProfileRouteTestStore(t)
	handler := newAgentProfileRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteGetAgentProfile, strings.NewReader(`{}`))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "profile_id_required" {
		t.Fatalf("expected profile_id_required, got %#v", payload)
	}
}

func TestRegisterAgentProfileRoutesRejectMissingProfilePayloads(t *testing.T) {
	t.Parallel()

	store := newAgentProfileRouteTestStore(t)
	handler := newAgentProfileRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteUpdateAgentProfile, strings.NewReader(`{}`))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "agent_profile_required" {
		t.Fatalf("expected agent_profile_required, got %#v", payload)
	}
}

func TestRegisterAgentProfileRoutesRejectMissingName(t *testing.T) {
	t.Parallel()

	store := newAgentProfileRouteTestStore(t)
	handler := newAgentProfileRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteCreateAgentProfile, strings.NewReader(`{"name":"   "}`))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "agent_profile_name_required" {
		t.Fatalf("expected agent_profile_name_required, got %#v", payload)
	}
}

func TestRegisterAgentProfileRoutesRejectMissingDeleteProfileID(t *testing.T) {
	t.Parallel()

	store := newAgentProfileRouteTestStore(t)
	handler := newAgentProfileRouteTestHandler(t, config.ModeIDE, store)
	request := httptest.NewRequest(http.MethodPost, "/api"+RouteDeleteAgentProfile, strings.NewReader(`{}`))
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "profile_id_required" {
		t.Fatalf("expected profile_id_required, got %#v", payload)
	}
}

func TestRegisterAgentProfileRoutesBlocksShareMode(t *testing.T) {
	t.Parallel()

	store := newAgentProfileRouteTestStore(t)
	handler := newAgentProfileRouteTestHandler(t, config.ModeShare, store)
	testCases := []struct {
		path string
		body string
	}{
		{path: RouteGetAgentProfile, body: `{"profileId":"profile-1"}`},
		{path: RouteCreateAgentProfile, body: `{"name":"Planner"}`},
		{path: RouteUpdateAgentProfile, body: `{"profile":{"id":"profile-1","name":"Planner"}}`},
		{path: RouteDeleteAgentProfile, body: `{"profileId":"profile-1"}`},
	}

	for _, testCase := range testCases {
		request := httptest.NewRequest(http.MethodPost, "/api"+testCase.path, strings.NewReader(testCase.body))
		response := httptest.NewRecorder()

		handler.ServeHTTP(response, request)

		if response.Code != http.StatusForbidden {
			t.Fatalf("expected 403 for %s, got %d with body %q", testCase.path, response.Code, response.Body.String())
		}
		var payload errorResponse
		if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
			t.Fatalf("decode error payload: %v", err)
		}
		if payload.Error.Code != "mode_forbidden" {
			t.Fatalf("expected mode_forbidden, got %#v", payload)
		}
	}
}

func newAgentProfileRouteTestHandler(t *testing.T, mode config.Mode, store *agentprofiles.Store) http.Handler {
	t.Helper()

	handler, err := NewHandler(Dependencies{
		Logger:     slog.New(slog.NewTextHandler(io.Discard, nil)),
		Info:       stubInfoService{mode: string(mode), info: RuntimeInfo{Mode: string(mode)}},
		ModePolicy: modes.NewPolicy(mode),
		Register: func(r chi.Router) {
			if err := RegisterAgentProfileRoutes(r, AgentProfileRouteDependencies{
				ModePolicy: modes.NewPolicy(mode),
				Profiles:   store,
			}); err != nil {
				t.Fatalf("register agent profile routes: %v", err)
			}
		},
	})
	if err != nil {
		t.Fatalf("new handler: %v", err)
	}
	return handler
}

func newAgentProfileRouteTestStore(t *testing.T) *agentprofiles.Store {
	t.Helper()

	store, err := agentprofiles.NewStore(t.TempDir())
	if err != nil {
		t.Fatalf("new agent profile store: %v", err)
	}
	return store
}

func newAgentProfileRouteTestProfile(profileID string, name string) agentprofiles.Profile {
	return agentprofiles.Profile{
		ID:           profileID,
		Name:         name,
		Description:  name + " profile",
		SystemPrompt: "Be helpful.",
	}
}
