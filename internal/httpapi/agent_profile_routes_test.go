package httpapi

import (
	"encoding/json"
	"io"
	"log/slog"
	"net/http"
	"net/http/httptest"
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

func TestRegisterAgentProfileRoutesBlocksShareMode(t *testing.T) {
	t.Parallel()

	store := newAgentProfileRouteTestStore(t)
	handler := newAgentProfileRouteTestHandler(t, config.ModeShare, store)
	request := httptest.NewRequest(http.MethodGet, "/api"+RouteGetAgentProfiles, nil)
	response := httptest.NewRecorder()

	handler.ServeHTTP(response, request)

	if response.Code != http.StatusForbidden {
		t.Fatalf("expected 403, got %d with body %q", response.Code, response.Body.String())
	}
	var payload errorResponse
	if err := json.Unmarshal(response.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode error payload: %v", err)
	}
	if payload.Error.Code != "mode_forbidden" {
		t.Fatalf("expected mode_forbidden, got %#v", payload)
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
